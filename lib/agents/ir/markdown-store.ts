import { createClient } from "@/lib/supabase/server";
import AdmZip from "adm-zip";
import * as XLSX from "xlsx";
import { getAnthropicFileBytes } from "@/lib/agents/ir/file-text";

// Workflow 7: extract uploaded/synced documents to text/markdown ONCE and store in Supabase,
// so the Q&A / DD agents (Workflow 6) read pre-extracted text instead of re-parsing every call.

const STORE_MAX = 200_000; // store up to ~200k chars of extracted text per doc

export async function getStoredMarkdown(fileId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("document_markdown").select("markdown").eq("file_id", fileId).maybeSingle();
  return (data?.markdown as string) ?? null;
}

const MAX_PARSE_BYTES = 60_000_000; // skip parsing files larger than ~60 MB (avoid serverless OOM)

function decodeXml(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, "&");
}

// DOCX: pull text runs from word/document.xml, one line per paragraph.
function extractDocx(buf: Buffer): string {
  const xml = new AdmZip(buf).getEntry("word/document.xml")?.getData().toString("utf-8") ?? "";
  return xml.split(/<\/w:p>/).map((p) =>
    [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => decodeXml(m[1])).join("")
  ).filter((l) => l.trim()).join("\n");
}

// PPTX: pull text runs from each ppt/slides/slideN.xml, in slide order.
function extractPptx(buf: Buffer): string {
  const zip = new AdmZip(buf);
  const slides = zip.getEntries()
    .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
    .sort((a, b) => (parseInt(a.entryName.match(/(\d+)/)?.[1] ?? "0") - parseInt(b.entryName.match(/(\d+)/)?.[1] ?? "0")));
  const out: string[] = [];
  for (const e of slides) {
    const xml = e.getData().toString("utf-8");
    const runs = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)].map((m) => decodeXml(m[1]));
    if (runs.join("").trim()) out.push(runs.join(" "));
  }
  return out.join("\n\n");
}

// XLSX/XLS: every sheet flattened to CSV.
function extractXlsx(buf: Buffer): string {
  const wb = XLSX.read(buf, { type: "buffer" });
  return wb.SheetNames.map((n) => `# ${n}\n${XLSX.utils.sheet_to_csv(wb.Sheets[n])}`).join("\n\n");
}

// PDF: unpdf (serverless-friendly pdf.js build).
async function extractPdf(buf: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const r = await extractText(pdf, { mergePages: true });
  return Array.isArray(r.text) ? r.text.join("\n") : (r.text ?? "");
}

export async function parseBytes(buf: Buffer, filename: string, mimeType: string | null): Promise<string> {
  const mt = mimeType ?? "";
  const name = filename.toLowerCase();
  if (/html/.test(mt) || /\.html?$/i.test(name)) {
    return decodeXml(buf.toString("utf-8").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  }
  if (/text|markdown|json/.test(mt) || /\.(txt|md|csv|json)$/i.test(name)) return buf.toString("utf-8");
  if (buf.length > MAX_PARSE_BYTES) return ""; // too large to parse safely in serverless
  if (/pdf/.test(mt) || name.endsWith(".pdf")) return await extractPdf(buf);
  if (/spreadsheet|excel/.test(mt) || /\.(xlsx|xls)$/i.test(name)) return extractXlsx(buf);
  if (/wordprocessing/.test(mt) || name.endsWith(".docx")) return extractDocx(buf);
  if (/presentation/.test(mt) || name.endsWith(".pptx")) return extractPptx(buf);
  return "";
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
