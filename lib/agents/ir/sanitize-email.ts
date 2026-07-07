/**
 * Strip ALL Mimecast URLs + tracking noise from email bodies/previews.
 *
 * Mimecast injects noise into inbound mail: CyberGraph tracking banners
 * (`mimecastcybergraph.com` image + `report...` magic link, plus a `CGBANNERINDICATOR`
 * marker) and URL-protection rewrites (`protect-us.mimecast.com`, `*.mimecastprotect.com`,
 * etc.). None of it is content — it pollutes the preview, the drafter context, and any Q&A
 * mined from the thread. We remove every Mimecast URL so drafts and previews reflect only
 * what the sender actually wrote.
 */
export function stripMimecastNoise(text: string): string {
  if (!text) return text;
  let t = text;
  // The CyberGraph banner marker, on its own or trailing.
  t = t.replace(/\s*CGBANNERINDICATOR\s*/gi, "\n");
  // Bracketed Mimecast URL: [https://...mimecast...==]
  t = t.replace(/\[?\s*https?:\/\/[^\s\]<>]*mimecast[^\s\]<>]*\s*\]?/gi, "");
  // Angle-bracketed Mimecast URL: <https://...mimecast...>
  t = t.replace(/<\s*https?:\/\/[^\s<>]*mimecast[^\s<>]*\s*>/gi, "");
  // Any remaining bare Mimecast URL.
  t = t.replace(/https?:\/\/[^\s<>\]]*mimecast[^\s<>\]]*/gi, "");
  // Tidy whitespace the removals leave behind.
  t = t.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return t;
}
