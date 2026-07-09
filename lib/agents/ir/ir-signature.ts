// Email signatures for the IR leads, appended deterministically to every draft so the formatting
// (address, phone, email) is always exact rather than left to the model. Each draft closes with
// "Best," followed by the signer's block. Unknown signers fall back to just their name.

const SIGNATURE_LINES: Record<string, string[]> = {
  "Meghan Berry": [
    "Meghan J. Berry",
    "ERP Funds",
    "400 W. Illinois Ave., Ste. 1630",
    "Midland, TX 79701",
    "Office: (432) 684-7539",
    "Cell: (860) 966-4787",
    "Email: mberry@erpfunds.com",
  ],
};

function linesFor(signer: string): string[] {
  return SIGNATURE_LINES[signer] ?? [signer];
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** "Best," + the signer's block, as HTML (line breaks via <br>). */
export function signatureHtml(signer: string): string {
  return `Best,<br><br>${linesFor(signer).map(esc).join("<br>")}`;
}

/** "Best," + the signer's block, as plain text. */
export function signatureText(signer: string): string {
  return `Best,\n\n${linesFor(signer).join("\n")}`;
}

/** Append the HTML signature to a draft body (the model is told not to sign off itself). */
export function appendSignatureHtml(html: string, signer: string): string {
  return `${(html || "").trimEnd()}<br><br>${signatureHtml(signer)}`;
}

/** Append the plain-text signature to a draft body. */
export function appendSignatureText(text: string, signer: string): string {
  return `${(text || "").trimEnd()}\n\n${signatureText(signer)}`;
}
