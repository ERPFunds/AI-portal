import AdmZip from "adm-zip";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

/**
 * Extracts readable text from a PPTX file (ZIP + XML, slide-by-slide).
 */
export function extractPptxText(base64Content: string): string {
  try {
    const buffer = Buffer.from(base64Content, "base64");
    const zip = new AdmZip(buffer);

    const slideEntries = zip
      .getEntries()
      .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
      .sort((a, b) => {
        const numA = parseInt(a.entryName.match(/\d+/)?.[0] ?? "0");
        const numB = parseInt(b.entryName.match(/\d+/)?.[0] ?? "0");
        return numA - numB;
      });

    if (slideEntries.length === 0) return "[No slides found in PPTX file]";

    const slideTexts = slideEntries.map((entry, i) => {
      const xml = entry.getData().toString("utf-8");
      const textRuns = [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)]
        .map((m) => m[1].trim())
        .filter((t) => t.length > 0);
      const deduped = textRuns.filter((t, idx) => t !== textRuns[idx - 1]);
      return deduped.length > 0
        ? `--- Slide ${i + 1} ---\n${deduped.join("\n")}`
        : `--- Slide ${i + 1} --- (no text)`;
    });

    return slideTexts.join("\n\n").slice(0, 8000);
  } catch (err) {
    return `[Could not parse PPTX: ${String(err)}]`;
  }
}

/**
 * Extracts text from an old binary .ppt file using officeparser.
 * Writes to /tmp (writable in Vercel serverless) then deletes.
 */
export async function extractPptText(base64Content: string): Promise<string> {
  const tmpFile = path.join(os.tmpdir(), `ppt_${Date.now()}_${Math.random().toString(36).slice(2)}.ppt`);
  try {
    const buffer = Buffer.from(base64Content, "base64");
    fs.writeFileSync(tmpFile, buffer);

    // Dynamic import — officeparser is a CommonJS module
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const officeParser = require("officeparser");
    const text: string = await officeParser.parseOfficeAsync(tmpFile);
    return (text ?? "").trim().slice(0, 8000) || "[No text content found in .ppt file]";
  } catch (err) {
    return `[Could not parse .ppt file: ${String(err)}]`;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

/**
 * Generic office file extractor using officeparser.
 * Handles: .xlsx, .xls, .pdf, .docx, .doc, .ods, .odp, .odt
 * Writes to /tmp (writable in Vercel serverless) then deletes.
 */
export async function extractOfficeFile(base64Content: string, filename: string): Promise<string> {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "bin";
  const tmpFile = path.join(os.tmpdir(), `office_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`);
  try {
    const buffer = Buffer.from(base64Content, "base64");
    fs.writeFileSync(tmpFile, buffer);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const officeParser = require("officeparser");
    const text: string = await officeParser.parseOfficeAsync(tmpFile);
    return (text ?? "").trim().slice(0, 8000) || `[No text content found in ${filename}]`;
  } catch (err) {
    return `[Could not parse ${filename}: ${String(err)}]`;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}
