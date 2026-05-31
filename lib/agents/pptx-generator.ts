/**
 * Converts deck-builder text output into a styled .pptx binary buffer
 * using pptxgenjs.
 *
 * Brand design — ERP Industrials:
 *   Dark navy background  #0D1B2A
 *   Gold accent           #C8922A
 *   Section blue          #1E3A5F
 *   Body text white       #FFFFFF
 *   Subtext               #B0BAC9
 */

import PptxGenJS from "pptxgenjs";

// ── Brand constants ────────────────────────────────────────────────────────────
const NAVY   = "0D1B2A";
const GOLD   = "C8922A";
const MID    = "1E3A5F";
const WHITE  = "FFFFFF";
const LGRAY  = "B0BAC9";
const DGRAY  = "2C3E50";

// ── Slide data types ───────────────────────────────────────────────────────────
export interface ParsedSlide {
  number: number;
  title: string;
  headline: string;
  bullets: string[];
  visual: string;
}

// ── Parser ─────────────────────────────────────────────────────────────────────

/**
 * Parse the structured text output from deck-builder into slide objects.
 *
 * Expected format:
 * ---
 * **[Slide N] — [Title]**
 * Headline: ...
 * • bullet
 * [Visual: ...]
 * ---
 */
export function parseDeckText(text: string): ParsedSlide[] {
  const slides: ParsedSlide[] = [];

  // Split on the slide header pattern
  const blocks = text.split(/(?=\*\*\[Slide\s*\d+\])/i);

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    // Slide number + title: **[Slide 3] — Title** (tolerates varied dashes, spacing, bold markers)
    const headerMatch = trimmed.match(/\*{1,2}\[Slide\s*(\d+)\][^\n]{0,6}[-—–]+\s*(.+?)\*{0,2}\s*$/m);
    if (!headerMatch) continue;

    const number = parseInt(headerMatch[1], 10);
    const title = headerMatch[2].trim();

    // Headline: first line that starts with "Headline:"
    const headlineMatch = trimmed.match(/Headline:\s*(.+)/i);
    const headline = headlineMatch ? headlineMatch[1].trim() : "";

    // Bullets: lines starting with •, -, or *
    const bullets: string[] = [];
    const bulletLines = trimmed.match(/^[•\-\*]\s+.+/gm) ?? [];
    for (const line of bulletLines) {
      bullets.push(line.replace(/^[•\-\*]\s+/, "").trim());
    }

    // Visual note
    const visualMatch = trimmed.match(/\[Visual:\s*([^\]]+)\]/i);
    const visual = visualMatch ? visualMatch[1].trim() : "";

    slides.push({ number, title, headline, bullets, visual });
  }

  return slides;
}

// ── Slide renderers ────────────────────────────────────────────────────────────

function addCoverSlide(
  pptx: InstanceType<typeof PptxGenJS>,
  title: string,
  projectContext: string
): void {
  const slide = pptx.addSlide();
  slide.background = { color: NAVY };

  // Gold top bar
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: "100%", h: 0.12,
    fill: { color: GOLD },
    line: { color: GOLD },
  });

  // Bottom accent bar
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 6.9, w: "100%", h: 0.1,
    fill: { color: MID },
    line: { color: MID },
  });

  // Company name
  slide.addText("ERP INDUSTRIALS", {
    x: 0.6, y: 0.5, w: 8.8, h: 0.5,
    fontSize: 11,
    bold: true,
    color: GOLD,
    fontFace: "Calibri",
    charSpacing: 3,
  });

  // Main title
  slide.addText(title, {
    x: 0.6, y: 1.6, w: 8.8, h: 2.4,
    fontSize: 36,
    bold: true,
    color: WHITE,
    fontFace: "Calibri",
    breakLine: false,
    wrap: true,
  });

  // Subtitle / project context
  if (projectContext) {
    slide.addText(projectContext, {
      x: 0.6, y: 4.1, w: 8.8, h: 0.5,
      fontSize: 16,
      color: LGRAY,
      fontFace: "Calibri",
    });
  }

  // Date
  const dateStr = new Date().toLocaleDateString("en-US", {
    month: "long", year: "numeric",
  });
  slide.addText(dateStr, {
    x: 0.6, y: 6.4, w: 4, h: 0.4,
    fontSize: 11,
    color: LGRAY,
    fontFace: "Calibri",
  });
}

function addSectionDividerSlide(
  pptx: InstanceType<typeof PptxGenJS>,
  sectionTitle: string
): void {
  const slide = pptx.addSlide();
  slide.background = { color: MID };

  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 3.1, w: 0.08, h: 1.2,
    fill: { color: GOLD },
    line: { color: GOLD },
  });

  slide.addText(sectionTitle, {
    x: 0.4, y: 3.0, w: 9.2, h: 1.4,
    fontSize: 28,
    bold: true,
    color: WHITE,
    fontFace: "Calibri",
  });
}

function addContentSlide(
  pptx: InstanceType<typeof PptxGenJS>,
  slide: ParsedSlide
): void {
  const pptSlide = pptx.addSlide();
  pptSlide.background = { color: NAVY };

  // Gold left accent bar
  pptSlide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 0.06, h: "100%",
    fill: { color: GOLD },
    line: { color: GOLD },
  });

  // Slide number badge
  pptSlide.addText(`${slide.number < 10 ? "0" + slide.number : slide.number}`, {
    x: 9.2, y: 6.6, w: 0.7, h: 0.3,
    fontSize: 9,
    color: LGRAY,
    fontFace: "Calibri",
    align: "right",
  });

  // Title
  pptSlide.addText(slide.title.toUpperCase(), {
    x: 0.3, y: 0.22, w: 9, h: 0.42,
    fontSize: 13,
    bold: true,
    color: GOLD,
    fontFace: "Calibri",
    charSpacing: 1.5,
  });

  // Divider line under title
  pptSlide.addShape(pptx.ShapeType.line, {
    x: 0.3, y: 0.74, w: 9, h: 0,
    line: { color: MID, width: 1 },
  });

  // Headline
  if (slide.headline) {
    pptSlide.addText(slide.headline, {
      x: 0.3, y: 0.88, w: 9, h: 0.7,
      fontSize: 15,
      bold: true,
      color: WHITE,
      fontFace: "Calibri",
      wrap: true,
    });
  }

  // Bullets
  if (slide.bullets.length > 0) {
    const bulletItems = slide.bullets.map((b) => ({
      text: b,
      options: { bullet: { code: "2022", color: GOLD }, color: WHITE, fontSize: 13 },
    }));

    pptSlide.addText(bulletItems, {
      x: 0.3, y: 1.68, w: 9, h: 4.2,
      fontFace: "Calibri",
      lineSpacingMultiple: 1.4,
      paraSpaceAfter: 6,
    });
  }

  // Visual note — bottom strip
  if (slide.visual) {
    pptSlide.addShape(pptx.ShapeType.rect, {
      x: 0.3, y: 6.35, w: 9.4, h: 0.35,
      fill: { color: MID },
      line: { color: MID },
    });
    pptSlide.addText(`📊  ${slide.visual}`, {
      x: 0.4, y: 6.38, w: 9.2, h: 0.28,
      fontSize: 9,
      color: LGRAY,
      fontFace: "Calibri",
      italic: true,
    });
  }
}

function addDisclaimerSlide(pptx: InstanceType<typeof PptxGenJS>): void {
  const slide = pptx.addSlide();
  slide.background = { color: DGRAY };

  slide.addText("IMPORTANT DISCLOSURES", {
    x: 0.5, y: 0.4, w: 9, h: 0.5,
    fontSize: 13,
    bold: true,
    color: GOLD,
    fontFace: "Calibri",
    charSpacing: 1.5,
  });

  const disclaimer =
    "This presentation has been prepared by ERP Industrials for informational purposes only. " +
    "It does not constitute an offer or solicitation to buy or sell any security. Past performance " +
    "is not indicative of future results. This document is confidential and intended solely for the " +
    "recipient. All financial data is subject to change without notice. Please refer to the Fund's " +
    "offering documents for complete risk disclosures.";

  slide.addText(disclaimer, {
    x: 0.5, y: 1.1, w: 9, h: 4,
    fontSize: 10,
    color: LGRAY,
    fontFace: "Calibri",
    lineSpacingMultiple: 1.6,
    wrap: true,
  });
}

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * Convert deck-builder text output into a styled .pptx binary buffer.
 *
 * @param slideText - The structured text from runDeckBuilder (slideContent)
 * @param projectContext - e.g. "Q2 LP Deck"
 * @returns A Buffer containing the .pptx file bytes
 */
export async function generatePptx(
  slideText: string,
  projectContext: string
): Promise<Buffer> {
  const pptx = new PptxGenJS();

  // Global settings
  pptx.layout = "LAYOUT_WIDE"; // 13.33" × 7.5"
  pptx.author = "ERP Industrials";
  pptx.company = "ERP Industrials";
  pptx.subject = projectContext;

  const parsedSlides = parseDeckText(slideText);
  console.log(`[pptx-generator] parsed ${parsedSlides.length} slides from deck text (${slideText.length} chars)`);
  if (parsedSlides.length === 0) {
    console.error("[pptx-generator] WARNING: 0 slides parsed — check Claude output format. First 300 chars:", slideText.slice(0, 300));
  }

  // 1. Cover slide
  const coverTitle = projectContext || "LP Investor Update";
  addCoverSlide(pptx, coverTitle, new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" }));

  // 2. Content slides
  // Insert section dividers before key sections (Executive Summary, Market Conditions, Appendix)
  const sectionBreaksBefore = new Set([2, 4, 9]);

  for (const slide of parsedSlides) {
    if (sectionBreaksBefore.has(slide.number) && slide.number > 1) {
      addSectionDividerSlide(pptx, slide.title);
    }
    addContentSlide(pptx, slide);
  }

  // 3. Disclaimer
  addDisclaimerSlide(pptx);

  // Write to buffer
  const arrayBuffer = await pptx.write({ outputType: "arraybuffer" }) as ArrayBuffer;
  return Buffer.from(arrayBuffer);
}
