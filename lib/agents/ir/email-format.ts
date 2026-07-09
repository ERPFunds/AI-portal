// House formatting for every drafted/sent IR email: Arial 10pt. Applied at the draft-create and
// send chokepoints so both the IR-inbox drafts and the LP-directory emails render consistently.
export const ARIAL_10 = "font-family: Arial, Helvetica, sans-serif; font-size: 10pt;";

/** Wrap an HTML fragment so it renders in Arial 10pt. Idempotent-safe enough for our chokepoints. */
export function wrapArial(html: string): string {
  return `<div style="${ARIAL_10}">${html || ""}</div>`;
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
