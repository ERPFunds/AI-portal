/**
 * pptx-injector.ts
 *
 * Opens an existing .pptx as a ZIP (using adm-zip) and either updates text
 * content in existing slides or appends brand-new slides cloned from a
 * template slide — without rebuilding the file from scratch.
 *
 * This preserves every shape, image, chart, and layout from the master deck.
 * Only the <a:p> paragraph elements inside targeted <p:txBody> shapes are
 * replaced; every other byte of the file is carried forward untouched.
 */

import AdmZip from "adm-zip";
import type { ParsedSlide } from "./pptx-generator";

// ── XML text helpers ───────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Build a single <a:p> element with one text run.
 * Run properties are minimal so they inherit from the slide's theme/layout.
 */
function makePara(
  text: string,
  opts: { bold?: boolean; italic?: boolean; sz?: number; bullet?: boolean } = {}
): string {
  const { bold = false, italic = false, sz = 1400, bullet = false } = opts;
  const rPrParts = [`lang="en-US"`, `sz="${sz}"`, `dirty="0"`];
  if (bold) rPrParts.push('b="1"');
  if (italic) rPrParts.push('i="1"');

  const run = `<a:r><a:rPr ${rPrParts.join(" ")}/><a:t>${escapeXml(text)}</a:t></a:r>`;
  const pPr = bullet ? `<a:pPr><a:buChar char="•"/></a:pPr>` : "";
  return `<a:p>${pPr}${run}</a:p>`;
}

/**
 * Replace the <a:p> content inside a <p:txBody> while preserving the
 * <a:bodyPr> and <a:lstStyle> elements (which carry positioning & theme refs).
 */
function setTxBodyParas(txBody: string, parasXml: string): string {
  const bodyPr =
    txBody.match(/<a:bodyPr[\s\S]*?(?:\/\s*>|>[\s\S]*?<\/a:bodyPr>)/)?.[0] ??
    "<a:bodyPr/>";
  const lstStyle =
    txBody.match(/<a:lstStyle[\s\S]*?(?:\/\s*>|>[\s\S]*?<\/a:lstStyle>)/)?.[0] ??
    "<a:lstStyle/>";
  return `<p:txBody>${bodyPr}${lstStyle}${parasXml}</p:txBody>`;
}

// ── Slide XML updater ──────────────────────────────────────────────────────────

/**
 * Rewrite the text of a slide XML in place.
 *
 * Detection order for each role:
 *  1. Title  → shape with <p:ph type="title"> or <p:ph type="ctrTitle">
 *  2. Body   → shape with <p:ph type="body"> or <p:ph idx="1">
 *  3. Fallback (no placeholder attrs found) → 1st txBody = title, 2nd = body
 *
 * All other shapes (images, charts, decorative text, logos) are untouched.
 */
export function updateSlideXml(slideXml: string, slide: ParsedSlide): string {
  // ── Build replacement paragraph sets ──────────────────────────────────────
  const titleParas = makePara(slide.title.toUpperCase(), { bold: true, sz: 1600 });

  const bodyParas: string[] = [];
  if (slide.headline) {
    bodyParas.push(makePara(slide.headline, { bold: true, sz: 1600 }));
    bodyParas.push(makePara("", { sz: 1200 })); // blank spacer
  }
  for (const b of slide.bullets) {
    bodyParas.push(makePara(b, { sz: 1300, bullet: true }));
  }
  if (slide.visual) {
    bodyParas.push(makePara("", { sz: 900 }));
    bodyParas.push(makePara(`📊 ${slide.visual}`, { italic: true, sz: 900 }));
  }
  const bodyContent = bodyParas.join("");

  let titleDone = false;
  let bodyDone = false;

  // ── Pass 1: placeholder-based detection ───────────────────────────────────
  let result = slideXml.replace(/<p:sp>[\s\S]*?<\/p:sp>/g, (spBlock) => {
    if (!spBlock.includes("<p:txBody>")) return spBlock;

    const isTitle =
      /<p:ph\b[^>]*\btype="(?:title|ctrTitle)"/.test(spBlock);
    const isBody =
      /<p:ph\b[^>]*\btype="body"/.test(spBlock) ||
      /<p:ph\b[^>]*\bidx="1"/.test(spBlock);

    if (isTitle && !titleDone) {
      titleDone = true;
      return spBlock.replace(
        /<p:txBody>[\s\S]*?<\/p:txBody>/,
        (tb) => setTxBodyParas(tb, titleParas)
      );
    }
    if (isBody && !bodyDone) {
      bodyDone = true;
      return spBlock.replace(
        /<p:txBody>[\s\S]*?<\/p:txBody>/,
        (tb) => setTxBodyParas(tb, bodyContent)
      );
    }
    return spBlock;
  });

  // ── Pass 2: positional fallback (no placeholder markers in this layout) ───
  if (!titleDone || !bodyDone) {
    let pos = 0;
    result = result.replace(/<p:txBody>[\s\S]*?<\/p:txBody>/g, (tb) => {
      pos++;
      if (pos === 1 && !titleDone) {
        titleDone = true;
        return setTxBodyParas(tb, titleParas);
      }
      if (pos === 2 && !bodyDone) {
        bodyDone = true;
        return setTxBodyParas(tb, bodyContent);
      }
      return tb;
    });
  }

  return result;
}

// ── ZIP / slide-list helpers ───────────────────────────────────────────────────

/** Return slide entry names sorted by their embedded slide number. */
function getSortedSlideNames(zip: AdmZip): string[] {
  return zip
    .getEntries()
    .map((e) => e.entryName)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => slideNumFrom(a) - slideNumFrom(b));
}

function slideNumFrom(name: string): number {
  return parseInt(name.match(/(\d+)/)![1]);
}

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * Modify an existing .pptx buffer using structured slide data from the
 * deck-builder workflow.
 *
 * Rules:
 *  • slides 1..existingCount  → existing slides updated in-place (text only)
 *  • slides > existingCount   → cloned from the last content template slide
 *                               and appended with correct presentation XML refs
 *
 * @param masterBuffer  Raw bytes of the human-uploaded master .pptx
 * @param parsedSlides  Parsed slide objects from deck-builder / parseDeckText
 * @returns Modified .pptx as a Buffer
 */
export function injectSlidesIntoPptx(
  masterBuffer: Buffer,
  parsedSlides: ParsedSlide[]
): Buffer {
  const zip = new AdmZip(masterBuffer);
  const existingNames = getSortedSlideNames(zip);
  const existingCount = existingNames.length;

  // ── 1. Update existing slides (in-place text replacement) ─────────────────
  for (const slide of parsedSlides) {
    if (slide.number < 1 || slide.number > existingCount) continue;
    const entryName = existingNames[slide.number - 1];
    const entry = zip.getEntry(entryName);
    if (!entry) continue;
    const updated = updateSlideXml(entry.getData().toString("utf8"), slide);
    zip.updateFile(entryName, Buffer.from(updated, "utf8"));
  }

  // ── 2. Append new slides ───────────────────────────────────────────────────
  const newSlides = parsedSlides.filter((s) => s.number > existingCount);
  if (newSlides.length === 0) return zip.toBuffer();

  // Pick a template: second-to-last slide avoids disclaimer/appendix finals.
  const templateName =
    existingNames[Math.max(0, existingCount - 2)] ?? existingNames[existingCount - 1];
  const templateSlideNum = slideNumFrom(templateName);
  const templateXml = zip.getEntry(templateName)!.getData().toString("utf8");

  // From the template's rels, keep ONLY the slideLayout reference (drop chart/image refs)
  const templateRelName = `ppt/slides/_rels/slide${templateSlideNum}.xml.rels`;
  const templateRelRaw = zip.getEntry(templateRelName)?.getData().toString("utf8") ?? "";
  const layoutRef =
    templateRelRaw.match(/<Relationship[^>]*Type="[^"]*slideLayout[^"]*"[^>]*\/>/)?.[0] ?? "";
  const cleanRelXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n` +
    (layoutRef ? `  ${layoutRef}\n` : "") +
    `</Relationships>`;

  // Read presentation-level XML files we need to patch
  const presEntry = zip.getEntry("ppt/presentation.xml");
  let presXml = presEntry?.getData().toString("utf8") ?? "";

  const presRelEntry = zip.getEntry("ppt/_rels/presentation.xml.rels");
  let presRelXml = presRelEntry?.getData().toString("utf8") ?? "";

  const ctEntry = zip.getEntry("[Content_Types].xml");
  let ctXml = ctEntry?.getData().toString("utf8") ?? "";

  // Determine starting IDs so new entries don't collide
  const maxId = [...presXml.matchAll(/\bid="(\d+)"/gi)].reduce(
    (m, mm) => Math.max(m, parseInt(mm[1])),
    255
  );
  let nextId = maxId + 1;

  const maxRId = [...presRelXml.matchAll(/\bId="rId(\d+)"/g)].reduce(
    (m, mm) => Math.max(m, parseInt(mm[1])),
    0
  );
  let nextRId = maxRId + 1;

  // Use slide numbers after the existing highest file number (not slide.number)
  // to avoid any accidental collision with existing slide file names.
  const maxFileNum = Math.max(...existingNames.map(slideNumFrom));
  let nextFileNum = maxFileNum + 1;

  for (const slide of newSlides) {
    const fileNum = nextFileNum++;
    const slidePath = `ppt/slides/slide${fileNum}.xml`;
    const slideRelPath = `ppt/slides/_rels/slide${fileNum}.xml.rels`;

    // Clone template + inject content
    const newXml = updateSlideXml(templateXml, slide);
    zip.addFile(slidePath, Buffer.from(newXml, "utf8"));
    zip.addFile(slideRelPath, Buffer.from(cleanRelXml, "utf8"));

    const rId = `rId${nextRId++}`;

    // presentation.xml — add sldId before </p:sldIdLst>
    presXml = presXml.replace(
      /(<\/p:sldIdLst>)/,
      `    <p:sldId id="${nextId++}" r:id="${rId}"/>\n  $1`
    );

    // presentation rels — add slide relationship
    presRelXml = presRelXml.replace(
      /(<\/Relationships>)/,
      `  <Relationship Id="${rId}" ` +
        `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" ` +
        `Target="slides/slide${fileNum}.xml"/>\n$1`
    );

    // [Content_Types].xml — add Override for new slide
    ctXml = ctXml.replace(
      /(<\/Types>)/,
      `  <Override PartName="/ppt/slides/slide${fileNum}.xml" ` +
        `ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>\n$1`
    );
  }

  // Write back patched XML
  if (presEntry) zip.updateFile("ppt/presentation.xml", Buffer.from(presXml, "utf8"));
  if (presRelEntry)
    zip.updateFile("ppt/_rels/presentation.xml.rels", Buffer.from(presRelXml, "utf8"));
  if (ctEntry) zip.updateFile("[Content_Types].xml", Buffer.from(ctXml, "utf8"));

  return zip.toBuffer();
}
