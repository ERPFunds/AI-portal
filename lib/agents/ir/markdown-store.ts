import { createClient } from "@/lib/supabase/server";
import { parseOfficeAsync } from "officeparser";
import { getAnthropicFileBytes } from "@/lib/agents/ir/file-text";

// Workflow 7: extract uploaded/synced documents to text/markdown ONCE and store in Supabase,
// so the Q&A / DD agents (Workflow 6) read pre-extracted text instead of re-parsing every call.

const STORE_MAX = 200_000; // store up to ~200k chars of extracted text per doc

export async function getStoredMarkdown(fileId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("document_markdown").select("markdown").eq("file_id", fileId).maybeSingle();
  return (data?.markdown as string) ?? null;
}

async function parseBytes(buf: Buffer, filename: string, mimeType: string | null): Promise<string> {
  if (/text|markdown|json/.test(mimeType ?? "") || /\.(txt|md|csv|json)$/i.test(filename)) {
    return buf.toString("utf-8");
  }
  return await parseOfficeAsync(buf); // docx / pdf / xlsx / pptx
}

/** Extract a document to text and upsert it into document_markdown. Returns the stored text. */
export async function extractAndStoreMarkdown(p: {
  fileId: string;
  filename: string;
  mimeType: string | null;
  category?: string | null;
  docType?: string | null;
  bytes?: Buffer | null;
}): Promise<string> {
  const buf = p.bytes ?? (await getAnthropicFileBytes(p.fileId));
  if (!buf) return "";
  let text = "";
  try { text = await parseBytes(buf, p.filename, p.mimeType); } catch { text = ""; }
  const markdown = (text || "").replace(/\n{3,}/g, "\n\n").trim().slice(0, STORE_MAX);
  if (!markdown) return "";

  const supabase = await createClient();
  await supabase.from("document_markdown").upsert(
    {
      file_id: p.fileId,
      filename: p.filename,
      category: p.category ?? null,
      doc_type: p.docType ?? null,
      markdown,
      char_count: markdown.length,
      extracted_at: new Date().toISOString(),
    },
    { onConflict: "file_id" }
  );
  return markdown;
}

/**
 * Read a document's text for an agent: use the stored markdown if present, else extract it
 * now (and store it for next time). `maxChars` caps what's returned for prompt context.
 */
export async function getDocText(
  p: { fileId: string; filename: string; mimeType: string | null; category?: string | null },
  maxChars = 15000
): Promise<string> {
  const stored = await getStoredMarkdown(p.fileId);
  const text = stored ?? (await extractAndStoreMarkdown(p));
  return text.slice(0, maxChars);
}
