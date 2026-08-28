// House formatting for every drafted/sent IR email: Arial 10pt. Applied at the draft-create and
// send chokepoints so both the IR-inbox drafts and the LP-directory emails render consistently.
export const ARIAL_10 = "font-family: Arial, Helvetica, sans-serif; font-size: 10pt;";

// The model often writes punctuation as HTML entity CODES (&mdash; &rsquo; &ldquo; …). Those show up
// as literal "&mdash;"/"&rsquo;" strange characters when the draft is reviewed/edited. Replace them
// with the real Unicode character (renders identically in HTML, but can never display as an entity
// code). We intentionally do NOT touch &amp; / &lt; / &gt; — those must stay encoded in HTML.
const PUNCT_ENTITIES: [RegExp, string][] = [
  [/&mdash;/g, "—"], [/&ndash;/g, "–"],
  [/&rsquo;|&#8217;|&#x2019;/g, "’"], [/&lsquo;|&#8216;|&#x2018;/g, "‘"],
  [/&ldquo;|&#8220;|&#x201C;/gi, "“"], [/&rdquo;|&#8221;|&#x201D;/gi, "”"],
  [/&hellip;|&#8230;/g, "…"], [/&nbsp;|&#160;|&#xA0;/gi, " "],
  [/&#39;|&#x27;/g, "'"], [/&quot;/g, '"'], [/&apos;/g, "'"],
  [/&trade;/g, "™"], [/&reg;/g, "®"], [/&copy;/g, "©"], [/&deg;/g, "°"],
];
export function decodePunctuationEntities(s: string): string {
  let out = s || "";
  for (const [re, ch] of PUNCT_ENTITIES) out = out.replace(re, ch);
  return out;
}

/** Wrap an HTML fragment so it renders in Arial 10pt, with punctuation entity codes normalized. */
export function wrapArial(html: string): string {
  return `<div style="${ARIAL_10}">${decodePunctuationEntities(html || "")}</div>`;
}

/** Convert a plain-text body to Arial 10pt HTML — blank lines become paragraphs, single newlines <br>. */
export function textToArialHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const paras = (text || "")
    .split(/\n{2,}/)
    .map((p) => esc(p).replace(/\n/g, "<br>"))
    .map((p) => `<p style="margin:0 0 10px;">${p}</p>`)
    .join("");
  return `<div style="${ARIAL_10}">${paras}</div>`;
}
