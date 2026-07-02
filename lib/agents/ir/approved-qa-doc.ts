import Anthropic, { toFile } from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const anthropic = new Anthropic();

// Auto-generated, always-current doc of APPROVED Learned Q&A. Lives on the SOPs page
// (a live file) AND in the document_markdown layer. Regenerated whenever an entry is
// approved/edited/rejected. Filed under the "Agent Working Guides" SOP folder, in an
// "Agent 2 - Investor Relations" subfolder (project_tag), alongside the other agent guides.
const DOC_CATEGORY = process.env.LEARNED_QA_DOC_CATEGORY || "Agent Working Guides";
const DOC_SUBFOLDER = process.env.LEARNED_QA_DOC_SUBFOLDER || "Agent 2 - Investor Relations";
const DOC_NAME = "Approved Learned Q&A (auto-generated).md";

function buildMarkdown(rows: { question: string; answer: string; category: string | null }[]): string {
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  if (rows.length === 0) {
    return `# Approved IR Learned Q&A\n\n_Auto-generated from the Learned Q&A review page. No approved entries yet. (updated ${stamp} UTC)_\n`;
  }
  const byCat = new Map<string, { question: string; answer: string }[]>();
  for (const r of rows) {
    const c = (r.category || "general").trim();
    if (!byCat.has(c)) byCat.set(c, []);
    byCat.get(c)!.push({ question: r.question, answer: r.answer });
  }
  let out = `# Approved IR Learned Q&A\n\n_Auto-generated from approved entries on the Learned Q&A review page — ${rows.length} entr${rows.length === 1 ? "y" : "ies"}, updated ${stamp} UTC._\n`;
  for (const [cat, items] of byCat) {
    out += `\n## ${cat}\n\n`;
    for (const it of items) out += `**Q: ${it.question}**\n\n${it.answer}\n\n`;
  }
  return out;
}

/** Rebuild the approved-Q&A doc: replace the prior auto-generated file + refresh markdown layer. */
export async function regenerateApprovedQaDoc(): Promise<{ ok: boolean; count: number; fileId?: string; error?: string }> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("ir_qa")
      .select("question, answer, category")
      .eq("status", "approved")
      .order("category", { ascending: true })
      .order("created_at", { ascending: true });
    const rows = (data ?? []) as { question: string; answer: string; category: string | null }[];
    const md = buildMarkdown(rows);

    // Remove the prior auto-generated doc (Anthropic file + uploaded_files + markdown rows).
    // Match by filename only so a prior copy under an old category is also cleaned up.
    const { data: prior } = await supabase
      .from("uploaded_files")
      .select("file_id")
      .eq("filename", DOC_NAME);
    for (const p of (prior ?? []) as { file_id: string }[]) {
      try { await (anthropic.beta as any).files.delete(p.file_id); } catch { /* may be gone */ }
      await supabase.from("uploaded_files").delete().eq("file_id", p.file_id);
      await supabase.from("document_markdown").delete().eq("file_id", p.file_id);
    }

    // Upload the fresh markdown as a live file under the SOP category.
    const uploaded = await (anthropic.beta as any).files.upload({
      file: await toFile(Buffer.from(md, "utf-8"), DOC_NAME, { type: "text/markdown" }),
    });
    await supabase.from("uploaded_files").insert({
      file_id: uploaded.id,
      filename: DOC_NAME,
      size_bytes: md.length,
      mime_type: "text/markdown",
      category: DOC_CATEGORY,
      project_tag: DOC_SUBFOLDER,
      uploaded_by: "learned-qa-auto",
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });
    await supabase.from("document_markdown").upsert(
      { file_id: uploaded.id, filename: DOC_NAME, category: DOC_CATEGORY, doc_type: "learned-qa", markdown: md, char_count: md.length, extracted_at: new Date().toISOString() },
      { onConflict: "file_id" }
    );

    return { ok: true, count: rows.length, fileId: uploaded.id };
  } catch (e) {
    return { ok: false, count: 0, error: String(e).slice(0, 200) };
  }
}
