import { parseOfficeAsync } from "officeparser";

/**
 * Download a file stored in the Anthropic Files API and return its extracted text.
 * Handles docx/pdf/xlsx/pptx (officeparser) and plain text. Cached in-process (30 min)
 * so repeated reads (e.g. the fund Q&A agent) don't re-download/parse every request.
 */
const cache = new Map<string, { text: string; at: number }>();
const TTL_MS = 30 * 60_000;

export async function getAnthropicFileText(
  fileId: string,
  filename: string,
  mimeType: string | null,
  maxChars = 15000
): Promise<string> {
  const hit = cache.get(fileId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.text;

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return hit?.text ?? "";

  try {
    const resp = await fetch(`https://api.anthropic.com/v1/files/${fileId}/content`, {
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "files-api-2025-04-14",
      },
    });
    if (!resp.ok) return hit?.text ?? "";
    const buf = Buffer.from(await resp.arrayBuffer());

    let text: string;
    if (/text|markdown|json/.test(mimeType ?? "") || /\.(txt|md|csv|json)$/i.test(filename)) {
      text = buf.toString("utf-8");
    } else {
      text = await parseOfficeAsync(buf); // docx / pdf / xlsx / pptx
    }
    const out = (text || "").replace(/\n{3,}/g, "\n\n").trim().slice(0, maxChars);
    cache.set(fileId, { text: out, at: Date.now() });
    return out;
  } catch {
    return hit?.text ?? "";
  }
}
