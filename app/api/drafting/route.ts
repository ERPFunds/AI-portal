import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { ApifyClient } from "apify-client";
import { createClient } from "@/lib/supabase/server";
import { getSkill, DEFAULT_MAX_TOKENS } from "@/lib/data/draftingSkills";
import { getGraphToken } from "@/lib/agents/graph-token";
import { parseBytes } from "@/lib/agents/ir/markdown-store";

export const maxDuration = 300;

const anthropic = new Anthropic();

function sse(enc: TextEncoder, payload: object) {
  return enc.encode("data: " + JSON.stringify(payload) + "\n\n");
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const docType: string = body.docType ?? "freeform";
  const prompt: string = body.prompt ?? "";
  const sources: string[] = body.sources ?? [];
  const kbFileIds: string[] = body.kbFileIds ?? [];
  const attachmentText: string = body.attachmentText ?? "";
  const attachmentName: string = body.attachmentName ?? "";
  const newsletterNarrative: string = body.newsletterNarrative ?? "";
  const newsletterSubject: string = body.newsletterSubject ?? "";
  // Live SharePoint research files the user picked (id + name from /api/drafting/research-files).
  const researchFiles: { id: string; name: string }[] = Array.isArray(body.researchFiles)
    ? body.researchFiles.filter((f: unknown): f is { id: string; name: string } =>
        !!f && typeof (f as { id?: unknown }).id === "string")
    : [];
  const outline: string[] = Array.isArray(body.outline) ? body.outline.filter((o: unknown) => typeof o === "string" && o.trim()) : [];

  if (!prompt.trim()) return NextResponse.json({ error: "prompt required" }, { status: 400 });

  const enc = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      try {
        let context = "";

        // ── KB grounding ────────────────────────────────────────────────────────
        if (sources.includes("kb")) {
          const query = supabase
            .from("document_markdown")
            .select("filename, category, markdown");

          const { data: docs } = kbFileIds.length > 0
            ? await query.in("file_id", kbFileIds)
            : await query.order("extracted_at", { ascending: false }).limit(8);

          if (docs?.length) {
            context += "\n\n--- Knowledge Base Documents ---\n";
            for (const doc of docs) {
              const excerpt = (doc.markdown as string | null)?.slice(0, 16000) ?? "";
              if (excerpt) {
                context += `\n[${doc.filename}${doc.category ? ` | ${doc.category}` : ""}]\n${excerpt}\n`;
              }
            }
          }
        }

        // ── Newsletter grounding: the app's own market briefs (Permian/Brevard), not live news ──
        if (sources.includes("newsletter")) {
          const { data: briefs } = await supabase
            .from("briefs")
            .select("agent_name, subject, narrative, sent_at")
            .order("sent_at", { ascending: false })
            .limit(8);

          if (briefs?.length) {
            context += "\n\n--- Recent ERP Market Briefs (newsletters) ---\n";
            for (const b of briefs) {
              const narr = (b.narrative as string | null)?.slice(0, 10000) ?? "";
              if (narr) {
                const when = b.sent_at ? new Date(b.sent_at as string).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
                context += `\n[${b.subject || b.agent_name}${when ? ` | ${when}` : ""}]\n${narr}\n`;
              }
            }
          }
        }

        // ── Live news via Apify ─────────────────────────────────────────────────
        if (sources.includes("news") && process.env.APIFY_API_TOKEN) {
          try {
            const apify = new ApifyClient({ token: process.env.APIFY_API_TOKEN });
            const run = await apify.actor("apify/google-news-scraper").call({
              queries: [prompt.slice(0, 200)],
              maxResultsPerQuery: 10,
              dateFilter: "week",
            });
            const { items } = await apify.dataset(run.defaultDatasetId).listItems();
            if (items.length) {
              context += "\n\n--- Recent News Articles ---\n";
              for (const item of (items as Record<string, string>[]).slice(0, 10)) {
                context += `\n- ${item.title} (${item.source ?? ""}${item.publishedAt ? ", " + item.publishedAt : ""})\n`;
              }
            }
          } catch {
            // Apify optional — skip silently
          }
        }

        // ── Research files (live from SharePoint) ────────────────────────────────
        // Download each picked file from the ERPAgentOutput site drive and extract its text now,
        // so the freshest research grounds the draft without waiting for a KB sync.
        if (researchFiles.length) {
          const siteId = process.env.SHAREPOINT_SITE_ID;
          let token: string | null = null;
          try { token = await getGraphToken(); } catch { /* skip research grounding if auth fails */ }
          if (token && siteId) {
            const auth = { Authorization: `Bearer ${token}` };
            let header = false;
            for (const f of researchFiles.slice(0, 12)) {
              try {
                const res = await fetch(
                  `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${encodeURIComponent(f.id)}/content`,
                  { headers: auth }
                );
                if (!res.ok) continue;
                const buf = Buffer.from(await res.arrayBuffer());
                const text = (await parseBytes(buf, f.name, null)).slice(0, 16000);
                if (!text.trim()) continue;
                if (!header) { context += "\n\n--- Research Files (SharePoint) ---\n"; header = true; }
                context += `\n[${f.name}]\n${text}\n`;
              } catch { /* one bad file shouldn't kill the draft */ }
            }
          }
        }

        // ── Base newsletter ──────────────────────────────────────────────────────
        if (newsletterNarrative) {
          const header = newsletterSubject ? `--- Newsletter: ${newsletterSubject} ---` : "--- Base Newsletter ---";
          context += `\n\n${header}\n${newsletterNarrative}`;
        }

        // ── Attached file ───────────────────────────────────────────────────────
        if (attachmentText) {
          const header = attachmentName ? `--- Attached File: ${attachmentName} ---` : "--- Attached File ---";
          context += `\n\n${header}\n${attachmentText}`;
        }

        const skill = getSkill(docType);
        let systemText = skill.systemPrompt;
        if (skill.checklist?.length) {
          systemText += `\n\nBefore finishing, make sure the draft includes: ${skill.checklist.join("; ")}.`;
        }

        // Outline scaffold — the sections the user kept in the picker, in order.
        const outlineText = outline.length
          ? `\n\nOrganize the writing under these sections, in this order (use them as headings):\n${outline.map((o) => `- ${o}`).join("\n")}`
          : "";
        const fullPrompt = `${prompt}${outlineText}${context ? `\n${context}` : ""}`;

        const stream = anthropic.messages.stream({
          model: "claude-opus-4-5",
          max_tokens: skill.maxTokens ?? DEFAULT_MAX_TOKENS,
          system: systemText,
          messages: [{ role: "user", content: fullPrompt }],
        });

        for await (const chunk of stream) {
          if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
            controller.enqueue(sse(enc, { type: "text", text: chunk.delta.text }));
          }
        }

        controller.enqueue(sse(enc, { type: "done" }));
      } catch (err) {
        controller.enqueue(sse(enc, { type: "error", message: String(err) }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
