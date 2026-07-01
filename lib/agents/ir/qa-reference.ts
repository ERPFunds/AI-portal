import { createClient } from "@/lib/supabase/server";
import { parseOfficeAsync } from "officeparser";

/**
 * The IR Q&A reference is a document the team maintains in the SOP/KB section
 * (Anthropic Files + uploaded_files). The drafter reads its TEXT on every draft,
 * so replies always follow the current approved answers. Override the source
 * category with IR_QA_DOC_CATEGORY.
 */
// Match the Q&A reference by its distinctive FILENAME rather than a fixed folder — the doc lives
// under "Agent Working Guides → Agent 2 - Investor Relations" and may be re-foldered. Override the
// pattern with IR_QA_DOC_FILENAME_LIKE if the doc is renamed.
const QA_DOC_FILENAME_LIKE = process.env.IR_QA_DOC_FILENAME_LIKE || "%Q%A Reference%";
const TTL_MS = 10 * 60_000;
const MAX_CHARS = 12000;

let cache: { text: string; fileId: string; at: number } | null = null;

export async function getIrQaReferenceText(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("uploaded_files")
    .select("file_id, filename, mime_type, created_at")
    .ilike("filename", QA_DOC_FILENAME_LIKE)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as { file_id: string; filename: string; mime_type: string | null }[];
  if (rows.length === 0) return cache?.text ?? "";

  // Prefer a file that looks like the Q&A reference; else the most recent in the category.
  const pick = rows.find((r) => /q\s*&?\s*a|reference|faq/i.test(r.filename)) ?? rows[0];
  if (cache && cache.fileId === pick.file_id && Date.now() - cache.at < TTL_MS) return cache.text;

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return cache?.text ?? "";

  try {
    const resp = await fetch(`https://api.anthropic.com/v1/files/${pick.file_id}/content`, {
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "files-api-2025-04-14",
      },
    });
    if (!resp.ok) return cache?.text ?? "";
    const buf = Buffer.from(await resp.arrayBuffer());

    let text: string;
    if (/text|markdown/.test(pick.mime_type ?? "") || /\.(txt|md|csv)$/i.test(pick.filename)) {
      text = buf.toString("utf-8");
    } else {
      // officeparser handles docx / pdf / xlsx / pptx
      text = await parseOfficeAsync(buf);
    }
    const out = (text || "").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_CHARS);
    cache = { text: out, fileId: pick.file_id, at: Date.now() };
    return out;
  } catch {
    return cache?.text ?? "";
  }
}
