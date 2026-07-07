/**
 * Clean Mimecast noise from email bodies/previews.
 *
 * Two kinds of Mimecast interference in inbound mail, handled differently:
 *   1. CyberGraph tracking banners (`mimecastcybergraph.com` image + `report...` magic link,
 *      plus a `CGBANNERINDICATOR` marker) — pure tracking, not real links → DELETED.
 *   2. URL-protection rewrites (`protect-us.mimecast.com`, `*.mimecastprotect.com`, etc.) that
 *      wrap a link the sender actually included → UNWRAPPED back to the original destination
 *      so the real link survives (falls back to deletion only when the original isn't recoverable).
 */

/**
 * Recover the original URL from a Mimecast URL-protection link. Mimecast encodes the target
 * either as a full URL query param (`url`/`u`/`q`) or, in the common `/s/<token>?domain=` form,
 * as just the domain. Returns "" when nothing is recoverable (opaque token-only links).
 */
function unwrapMimecastUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const key of ["url", "u", "q", "target"]) {
      const v = u.searchParams.get(key);
      if (v) {
        const dec = decodeURIComponent(v);
        if (/^https?:\/\//i.test(dec)) return dec;
      }
    }
    const domain = u.searchParams.get("domain");
    if (domain) return `https://${decodeURIComponent(domain).replace(/^https?:\/\//i, "")}`;
  } catch {
    /* not a parseable URL */
  }
  return "";
}

export function stripMimecastNoise(text: string): string {
  if (!text) return text;
  let t = text;
  // The CyberGraph banner marker, on its own or trailing.
  t = t.replace(/\s*CGBANNERINDICATOR\s*/gi, "\n");
  // Delete CyberGraph tracking URLs (banner image + report magic link) — pure noise, not real links.
  t = t.replace(/\[?\s*https?:\/\/[^\s\]<>]*mimecastcybergraph\.com[^\s\]<>]*\s*\]?/gi, "");
  t = t.replace(/<\s*https?:\/\/[^\s<>]*mimecastcybergraph\.com[^\s<>]*\s*>/gi, "");
  t = t.replace(/https?:\/\/[^\s<>\]]*mimecastcybergraph\.com[^\s<>\]]*/gi, "");
  // Unwrap any remaining Mimecast URL (URL protection) back to its original destination.
  // Replace just the URL token in place so surrounding text/brackets are preserved; if the
  // original can't be recovered, drop the URL.
  t = t.replace(/https?:\/\/[^\s<>\])]*mimecast[^\s<>\])]*/gi, (m) => unwrapMimecastUrl(m));
  // Remove now-empty [] / <> wrappers left where a URL was dropped.
  t = t.replace(/\[\s*\]|<\s*>/g, "");
  // Tidy whitespace the removals leave behind.
  t = t.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return t;
}
