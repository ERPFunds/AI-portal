import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getDocText } from "@/lib/agents/ir/markdown-store";

const client = new Anthropic();

// Draft investor-facing Fund IV content grounded ONLY on the fund-document KB folders.
const CATEGORIES = ["Investor Relations (SharePoint)", "Capital KB"];

export interface FundDraftResult {
  draft: string;
  sources: string[]; // filenames actually provided as context
  docCount: number;
}

export interface FundDraftInput {
  instruction: string;   // what to write (audience, purpose)
  sectionTitles: string[]; // exact headings the draft must use, in order
}

export async function draftFundContent({ instruction, sectionTitles }: FundDraftInput): Promise<FundDraftResult> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("uploaded_files")
    .select("file_id, filename, mime_type, category")
    .in("category", CATEGORIES)
    .order("created_at", { ascending: false });
  const docs = (data ?? []) as { file_id: string; filename: string; mime_type: string | null; category: string }[];
  if (docs.length === 0) {
    return { draft: "No fund documents are loaded yet in the Investor Relations or Capital knowledge bases. Sync them from SharePoint first.", sources: [], docCount: 0 };
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
    return { draft: "The fund documents couldn't be read right now — please try again shortly.", sources: [], docCount: docs.length };
  }

  const headings = sectionTitles.filter((t) => t && t.trim());

  const msg = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 2000,
    system: [{ type: "text" as const, text:
`You draft investor-facing email content for ERP Industrials' Fund IV, grounded ONLY on the fund documents provided (PPMs, executive summaries, fund updates, schedules, LP materials).

Rules:
- Structure the draft using these EXACT section headings, in order, each on its own line followed by that section's content:
${headings.map((h) => `  ${h}`).join("\n")}
- Use only facts, figures, and terms found in the documents. Quote numbers exactly as written.
- Cite the source document name in parentheses after a specific figure or claim, e.g. "(ERP 1031 Industrial Portfolio IV DST - PPM)".
- Where a specific detail is required but NOT in the documents (a date, dollar amount, name, contact, or event specifics), insert a clearly marked placeholder such as [DATE], [AMOUNT], or [CONTACT] — never invent or estimate it.
- Tone: professional, warm, and appropriate for an accredited-investor audience. Concise and skimmable.
- Do not add a preamble or sign-off outside the requested sections.` }],
    messages: [{ role: "user", content: `Fund documents:\n\n${sections.join("\n\n")}\n\n---\n${instruction}` }],
  });

  const draft = msg.content[0]?.type === "text" ? msg.content[0].text : "";
  return { draft, sources: used, docCount: used.length };
}
