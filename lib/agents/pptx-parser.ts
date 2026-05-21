import AdmZip from "adm-zip";

/**
 * Extracts readable text from a PPTX file (which is a ZIP containing XML slides).
 * Returns one block per slide with title + bullet text, up to ~8000 chars.
 */
export function extractPptxText(base64Content: string): string {
  try {
    const buffer = Buffer.from(base64Content, "base64");
    const zip = new AdmZip(buffer);

    // Find all slide XML files, sorted in slide order
    const slideEntries = zip
      .getEntries()
      .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
      .sort((a, b) => {
        const numA = parseInt(a.entryName.match(/\d+/)?.[0] ?? "0");
        const numB = parseInt(b.entryName.match(/\d+/)?.[0] ?? "0");
        return numA - numB;
      });

    if (slideEntries.length === 0) {
      return "[No slides found in PPTX file]";
    }

    const slideTexts = slideEntries.map((entry, i) => {
      const xml = entry.getData().toString("utf-8");

      // Extract text runs — <a:t> tags hold the actual text in OOXML
      const textRuns = [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)]
        .map((m) => m[1].trim())
        .filter((t) => t.length > 0);

      // Dedupe consecutive identical strings (common in OOXML due to formatting splits)
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
