import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getAnthropicFileText } from "@/lib/agents/ir/file-text";
import { getGraphToken } from "@/lib/agents/graph-token";

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
  return (d.body?.content || "").slice(0, 8000);
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
export async function buildDueDiligenceReply(params: { from: string; subject: string; body: string }): Promise<DdReply> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("uploaded_files")
    .select("file_id, filename, mime_type, category")
    .in("category", CATEGORIES)
    .order("created_at", { ascending: false });
  const docs = (data ?? []) as { file_id: string; filename: string; mime_type: string | null; category: string }[];

  const sections: string[] = [];
  const avail: { file_id: string; filename: string; mime_type: string | null }[] = [];
  for (const d of docs) {
    avail.push({ file_id: d.file_id, filename: d.filename, mime_type: d.mime_type });
    const text = await getAnthropicFileText(d.file_id, d.filename, d.mime_type);
    if (text) sections.push(`<document source="${d.filename}">\n${text}\n</document>`);
  }
  const fileList = avail.map((a) => `- ${a.filename}`).join("\n");

  const msg = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 2000,
    system: [{ type: "text" as const, text:
`You are ERP Industrials' Investor Relations agent drafting a reply (from Meghan Berry's office) to an investor/broker DUE-DILIGENCE inquiry. Use ONLY the fund documents provided.

Return ONLY a JSON object: { "draftSubject": string, "draftHtml": string, "attach": string[] }.
- draftHtml: a warm, professional HTML email answering each due-diligence question, grounded in the documents, citing the source document name in parentheses. If something isn't in the documents, say it will be provided separately rather than guessing. NEVER invent or estimate figures — quote them exactly with their source.
- attach: exact filenames (from the AVAILABLE FILES list) of the source documents relevant to these questions, to attach to the reply. Use exact strings from the list; [] if none apply.
- The draft is saved for Meghan's review — she sends it. Do not claim it has already been sent.` }],
    messages: [{ role: "user", content:
`From: ${params.from}\nSubject: ${params.subject}\n\nInquiry:\n${params.body}\n\n=== AVAILABLE FILES (attach by exact filename) ===\n${fileList}\n\n=== FUND DOCUMENTS ===\n${sections.join("\n\n")}` }],
  });

  const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
  const m = text.match(/\{[\s\S]*\}/);
  let parsed: { draftSubject?: string; draftHtml?: string; attach?: string[] } = {};
  if (m) { try { parsed = JSON.parse(m[0]); } catch { /* keep defaults */ } }

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
