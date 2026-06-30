import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getDocText } from "@/lib/agents/ir/markdown-store";

const client = new Anthropic();

// Workflow 6: answer investor questions grounded ONLY on the fund-document KB folders.
const CATEGORIES = ["Investor Relations (SharePoint)", "Capital KB"];

export interface FundQaResult {
  answer: string;
  sources: string[]; // filenames actually provided as context
  docCount: number;
}

export async function answerFundQuestion(question: string): Promise<FundQaResult> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("uploaded_files")
    .select("file_id, filename, mime_type, category")
    .in("category", CATEGORIES)
    .order("created_at", { ascending: false });
  const docs = (data ?? []) as { file_id: string; filename: string; mime_type: string | null; category: string }[];
  if (docs.length === 0) {
    return { answer: "No fund documents are loaded yet in the Investor Relations or Capital knowledge bases. Sync them from SharePoint first.", sources: [], docCount: 0 };
  }

  const sections: string[] = [];
  const used: string[] = [];
  for (const d of docs) {
    const text = await getDocText({ fileId: d.file_id, filename: d.filename, mimeType: d.mime_type, category: d.category });
    if (!text) continue;
    used.push(d.filename);
    sections.push(`<document source="${d.filename}" library="${d.category}">\n${text}\n</document>`);
  }
  if (sections.length === 0) {
    return { answer: "The fund documents couldn't be read right now — please try again shortly.", sources: [], docCount: docs.length };
  }

  const msg = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 1500,
    system: [{ type: "text" as const, text:
`You are ERP Industrials' Investor Relations Q&A agent. Answer the user's question using ONLY the fund documents provided (PPMs, executive summaries, fund updates, schedules, LP materials).

Rules:
- Cite the source document name in parentheses after each fact, e.g. "(ERP 1031 Industrial Portfolio IV DST - PPM)".
- If the answer is not in the documents, say so plainly and suggest contacting investors@erpfunds.com. Do NOT guess or use outside knowledge.
- Never invent or estimate figures. Quote numbers exactly as written, with their source.
- Be concise, accurate, and professional — this may inform an investor-facing reply.` }],
    messages: [{ role: "user", content: `Fund documents:\n\n${sections.join("\n\n")}\n\n---\nQuestion: ${question}` }],
  });

  const answer = msg.content[0]?.type === "text" ? msg.content[0].text : "";
  return { answer, sources: used, docCount: used.length };
}
