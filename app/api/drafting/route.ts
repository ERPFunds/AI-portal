import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { ApifyClient } from "apify-client";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 120;

const anthropic = new Anthropic();

const SYSTEM_PROMPTS: Record<string, string> = {
  freeform: `You are a research and writing assistant for ERP Industrials, a private equity industrial real estate fund manager focused on Permian Basin (West Texas) and Brevard County / Space Coast (Florida) markets. Help with research, writing, and analysis. Be specific, data-driven, and actionable. Write and stop — do not ask follow-up questions or offer options.`,

  "om-section": `You are a professional OM (Offering Memorandum) writer for ERP Industrials. Write polished, institutional-quality OM sections for industrial properties. Use industry-standard CRE language with concrete data points. Be specific about market fundamentals, demand drivers, and investment thesis. Write and stop — do not ask follow-up questions.`,

  "lp-memo": `You are a fund communications writer for ERP Industrials preparing LP memos and investor updates. Tone: professional, confident, transparent. Focus on fund performance, market positioning, deal pipeline, and strategic context. Write for a sophisticated LP audience. Write and stop — do not ask follow-up questions.`,

  "deal-summary": `You are a deal analyst for ERP Industrials. Write clear, concise deal summaries covering: property description, location/submarket, pricing ($/SF, cap rate, price/acre), tenant/occupancy, investment highlights, risks, and ERP's thesis. Use a structured section format. Write and stop — do not ask follow-up questions.`,

  "email-draft": `You are an IR/communications assistant for ERP Industrials. Draft professional emails. LP emails: formal and warm. Broker emails: direct and professional. Internal emails: concise. Write only the email body (include Subject: line at top). Write and stop — do not ask follow-up questions.`,

  "market-brief": `You are a CRE market analyst for ERP Industrials. Write concise market briefs covering industrial fundamentals: vacancy, absorption, asking rents, notable transactions, development pipeline, and demand drivers. Focus on Permian Basin and/or Brevard County / Space Coast. Write and stop — do not ask follow-up questions.`,
};

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
  const attachmentText: string = body.attachmentText ?? "";
  const attachmentName: string = body.attachmentName ?? "";

  if (!prompt.trim()) return NextResponse.json({ error: "prompt required" }, { status: 400 });

  const enc = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      try {
        let context = "";

        // ── KB grounding ────────────────────────────────────────────────────────
        if (sources.includes("kb")) {
          const { data: docs } = await supabase
            .from("document_markdown")
            .select("filename, category, markdown")
            .order("extracted_at", { ascending: false })
            .limit(6);

          if (docs?.length) {
            context += "\n\n--- Knowledge Base Documents ---\n";
            for (const doc of docs) {
              const excerpt = (doc.markdown as string | null)?.slice(0, 8000) ?? "";
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
            .limit(6);

          if (briefs?.length) {
            context += "\n\n--- Recent ERP Market Briefs (newsletters) ---\n";
            for (const b of briefs) {
              const narr = (b.narrative as string | null)?.slice(0, 6000) ?? "";
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

        // ── Attached file ───────────────────────────────────────────────────────
        if (attachmentText) {
          const header = attachmentName ? `--- Attached File: ${attachmentName} ---` : "--- Attached File ---";
          context += `\n\n${header}\n${attachmentText}`;
        }

        const systemText = SYSTEM_PROMPTS[docType] ?? SYSTEM_PROMPTS.freeform;
        const fullPrompt = context ? `${prompt}\n${context}` : prompt;

        const stream = anthropic.messages.stream({
          model: "claude-opus-4-5",
          max_tokens: 4000,
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
