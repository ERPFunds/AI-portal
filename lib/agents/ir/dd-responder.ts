import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getDocText } from "@/lib/agents/ir/markdown-store";
import { retrieveChunks, voyageConfigured } from "@/lib/agents/ir/embeddings";
import { getGraphToken } from "@/lib/agents/graph-token";
import { getIrQaGrounding } from "@/lib/agents/ir/ir-grounding";
import { stripMimecastNoise } from "@/lib/agents/ir/sanitize-email";

const client = new Anthropic();

/** Fetch a message's full plain-text body (the inbox list only carries a short preview). */
export async function getMessageBodyText(mailbox: string, messageId: string): Promise<string> {
  const t = await getGraphToken();
  if (!t) return "";
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}?$select=body`,
    { headers: { Authorization: `Bearer ${t}`, Prefer: 'outlook.body-content-type="text"' } }
  );
  if (!res.ok) return "";
  const d = await res.json();
  return stripMimecastNoise(d.body?.content || "").slice(0, 8000);
}

// Due-diligence answers are grounded ONLY on these fund-document KB folders.
const CATEGORIES = ["Investor Relations (SharePoint)", "Capital KB"];

export interface DdReply {
  draftSubject: string;
  draftHtml: string;
  attachments: { fileId: string; filename: string; mimeType: string | null }[];
  usedDocCount: number;
}

/**
 * Workflow 6 (corrected): answer an inbound due-diligence inquiry from the fund documents
 * and let the model pick which source files to attach. Returns an HTML draft + the resolved
 * attachment list (file_ids). The sweep saves this as an Outlook draft with attachments for review.
 */
// Structured-output schema — the API guarantees valid JSON matching this shape (unless the
// response is cut off by max_tokens, which the salvage below still handles).
const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["draftSubject", "draftHtml", "attach"],
  properties: {
    draftSubject: { type: "string" },
    draftHtml: { type: "string" },
    attach: { type: "array", items: { type: "string" } },
  },
} as const;

export async function buildDueDiligenceReply(params: { from: string; subject: string; body: string; contactName?: string; signAs?: string; threadContext?: string }): Promise<DdReply> {
  const signer = params.signAs || "Meghan Berry";
  const supabase = await createClient();
  const { data } = await supabase
    .from("uploaded_files")
    .select("file_id, filename, mime_type, category")
    .in("category", CATEGORIES)
    .order("created_at", { ascending: false });
  const docs = (data ?? []) as { file_id: string; filename: string; mime_type: string | null; category: string }[];

  const avail = docs.map((d) => ({ file_id: d.file_id, filename: d.filename, mime_type: d.mime_type }));
  const fileList = avail.map((a) => `- ${a.filename}`).join("\n");

  // Grounding: retrieve only the passages relevant to THIS inquiry (vector search) instead of
  // stuffing every fund document into the prompt. Falls back to full-doc stuffing if nothing is
  // embedded yet (e.g. before the backfill runs) or if retrieval errors.
  let sections: string[] = [];
  if (voyageConfigured()) {
    try {
      const chunks = await retrieveChunks(`${params.subject}\n\n${params.body}`, CATEGORIES, 12);
      const bySource = new Map<string, string[]>();
      for (const c of chunks) {
        if (!bySource.has(c.filename)) bySource.set(c.filename, []);
        bySource.get(c.filename)!.push(c.content);
      }
      sections = [...bySource.entries()].map(([fn, cs]) => `<document source="${fn}">\n${cs.join("\n---\n")}\n</document>`);
    } catch (e) {
      console.error("DD retrieval failed; falling back to full docs:", e);
    }
  }
  if (sections.length === 0) {
    for (const d of docs) {
      const text = await getDocText({ fileId: d.file_id, filename: d.filename, mimeType: d.mime_type, category: d.category });
      if (text) sections.push(`<document source="${d.filename}">\n${text}\n</document>`);
    }
  }

  const grounding = await getIrQaGrounding();

  const msg = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 16000,
    output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    system: [{ type: "text" as const, text:
`You are ERP Industrials' Investor Relations agent drafting a reply (from ${signer}'s office) to an investor/broker DUE-DILIGENCE inquiry. Answer from the fund documents provided, and follow the approved IR Q&A sources below for how ERP handles recurring questions.

- draftHtml: a warm, professional HTML email answering each due-diligence question, grounded in the documents, citing the source document name in parentheses. If something isn't in the documents, say it will be provided separately rather than guessing. NEVER invent or estimate figures — quote them exactly with their source.
- Address the greeting to the sender BY NAME using the provided recipient name (e.g. "Dear <first name>,"). Do NOT guess a name from the email handle — use the recipient name given, or the name in the email's signature; if neither is available, use a neutral greeting ("Hello,").
- Follow the IR Q&A Reference / approved Learned Q&A for standard handling (e.g. account/document/K-1/distribution questions route to Tracy Doyle, tdoyle@erpfunds.com). Investors have NO portal/app access — NEVER mention app.erpfunds.com, a portal, or logging in.
- attach: exact filenames (from the AVAILABLE FILES list) of the source documents relevant to these questions, to attach to the reply. Use exact strings from the list; [] if none apply.
- Sign off as "${signer}" only — do NOT add an "Investor Relations" title or department line under the name.
- The draft is saved for ${signer}'s review — they send it. Do not claim it has already been sent.${grounding}` }],
    messages: [{ role: "user", content:
`From: ${params.from}${params.contactName ? `\nRecipient name (address the reply to this person): ${params.contactName}` : ""}\nSubject: ${params.subject}\n\nInquiry:\n${params.body}${params.threadContext ? `\n\n=== PRIOR THREAD (same conversation, oldest first — context only, reply to the inquiry above) ===\n${params.threadContext}` : ""}\n\n=== AVAILABLE FILES (attach by exact filename) ===\n${fileList}\n\n=== FUND DOCUMENTS ===\n${sections.join("\n\n")}` }],
  });

  const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
  const m = text.match(/\{[\s\S]*\}/);
  let parsed: { draftSubject?: string; draftHtml?: string; attach?: string[] } = {};
  if (m) { try { parsed = JSON.parse(m[0]); } catch { /* keep defaults */ } }

  // Salvage: a very long questionnaire can truncate the JSON so it won't parse — recover the
  // draftHtml value (from `"draftHtml":"..."` to the end) so we never return an empty draft.
  if (!parsed.draftHtml) {
    const hm = text.match(/"draftHtml"\s*:\s*"([\s\S]*?)(?:"\s*,\s*"attach"|"\s*\}\s*$|$)/);
    if (hm && hm[1]) {
      parsed.draftHtml = hm[1].replace(/\\"/g, '"').replace(/\\n/g, "<br>").replace(/\\t/g, " ").replace(/\\\\/g, "\\");
    } else if (text.trim() && !text.trim().startsWith("{")) {
      parsed.draftHtml = text.trim(); // model answered as prose, not JSON
    }
  }

  const wanted = new Set((parsed.attach ?? []).map((s) => s.trim()));
  const attachments = avail
    .filter((a) => wanted.has(a.filename))
    .map((a) => ({ fileId: a.file_id, filename: a.filename, mimeType: a.mime_type }));

  return {
    draftSubject: parsed.draftSubject || `Re: ${params.subject}`,
    draftHtml: parsed.draftHtml || "",
    attachments,
    usedDocCount: sections.length,
  };
}
