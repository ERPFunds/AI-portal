/**
 * Strip Mimecast CyberGraph tracking noise from email bodies/previews.
 *
 * Mimecast injects an invisible tracking banner into inbound mail: a long
 * `mimecastcybergraph.com` image-processing URL (often wrapped in [...]), a
 * `report.mimecastcybergraph.com` "report this email" magic link (wrapped in <...>),
 * and a `CGBANNERINDICATOR` marker. None of it is content — it pollutes the preview,
 * the drafter context, and any Q&A mined from the thread. We remove it so drafts and
 * previews reflect only what the sender actually wrote.
 *
 * Scoped to the CyberGraph domain + marker on purpose, so legitimately rewritten links
 * (e.g. protect-us.mimecast.com URL protection) are left intact.
 */
export function stripMimecastNoise(text: string): string {
  if (!text) return text;
  let t = text;
  // The banner marker, on its own or trailing.
  t = t.replace(/\s*CGBANNERINDICATOR\s*/gi, "\n");
  // Bracketed CyberGraph banner image URL: [https://image-...mimecastcybergraph.com/...==]
  t = t.replace(/\[?\s*https?:\/\/[^\s\]<>]*mimecastcybergraph\.com[^\s\]<>]*\s*\]?/gi, "");
  // Angle-bracketed CyberGraph report/magic link: <https://report.mimecastcybergraph.com/...>
  t = t.replace(/<\s*https?:\/\/[^\s<>]*mimecastcybergraph\.com[^\s<>]*\s*>/gi, "");
  // Any remaining bare CyberGraph URL.
  t = t.replace(/https?:\/\/[^\s<>\]]*mimecastcybergraph\.com[^\s<>\]]*/gi, "");
  // Tidy whitespace the removals leave behind.
  t = t.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return t;
}
