/**
 * Fetches ERP Industrials' active LoopNet listing URLs from their company page.
 *
 * Direct server fetch first (fast + free), then an Apify browser-scraper fallback
 * when LoopNet's bot protection (PerimeterX) blocks the datacenter IP with a 403.
 *
 * Shared by the manual refresh (POST /api/loopnet-sync) and the weekly cron
 * (GET /api/cron/loopnet-sync) so both behave identically.
 */

export const COMPANY_URL = "https://www.loopnet.com/company/erp-industrials/9rvtzp4l/";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const LISTING_RE = /https?:\/\/www\.loopnet\.com\/Listing\/[^"'\s)\\]+/g;

export function extractListingUrls(text: string): string[] {
  // Also tolerate JSON-escaped slashes (\/) that some scrapers emit.
  const normalized = text.replace(/\\\//g, "/");
  return [...new Set([...normalized.matchAll(LISTING_RE)].map((m) => m[0]))];
}

// Attempt 1 — direct server fetch. Fast + free, but LoopNet's bot protection
// (PerimeterX) returns 403 to datacenter IPs, so this usually fails in prod.
async function fetchDirect(): Promise<{ urls: string[]; ok: boolean; status?: number; error?: string }> {
  try {
    const r = await fetch(COMPANY_URL, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
      cache: "no-store",
    });
    if (!r.ok) return { urls: [], ok: false, status: r.status };
    const html = await r.text();
    return { urls: extractListingUrls(html), ok: true };
  } catch (e) {
    return { urls: [], ok: false, error: String(e) };
  }
}

// Attempt 2 — route through Apify's browser-based scraper, which renders JS and
// uses proxies to get past the bot wall. Actor + input are env-overridable so a
// different/dedicated LoopNet actor can be swapped in without a code change.
async function fetchViaApify(): Promise<{ urls: string[]; ok: boolean; error?: string }> {
  const token = process.env.APIFY_API_TOKEN || process.env.APIFY_TOKEN || process.env.APIFY_API;
  if (!token) return { urls: [], ok: false, error: "no APIFY_API_TOKEN configured" };

  const actor = process.env.LOOPNET_APIFY_ACTOR || "apify~rag-web-browser";
  let input: unknown;
  if (process.env.LOOPNET_APIFY_INPUT) {
    try { input = JSON.parse(process.env.LOOPNET_APIFY_INPUT); }
    catch { return { urls: [], ok: false, error: "LOOPNET_APIFY_INPUT is not valid JSON" }; }
  } else {
    // Default input for apify/rag-web-browser: scrape the single company URL with a
    // real browser and return both markdown + HTML so listing links are captured.
    input = {
      query: COMPANY_URL,
      maxResults: 1,
      outputFormats: ["markdown", "html"],
      scrapingTool: "browser-playwright",
      requestTimeoutSecs: 60,
    };
  }

  try {
    const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${token}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(100_000),
    });
    if (!res.ok) return { urls: [], ok: false, error: `Apify HTTP ${res.status}: ${await res.text().catch(() => "")}`.slice(0, 300) };
    const items = await res.json();
    // Scan the whole returned dataset (whatever its shape) for listing URLs.
    return { urls: extractListingUrls(JSON.stringify(items)), ok: true };
  } catch (e) {
    return { urls: [], ok: false, error: String(e) };
  }
}

export interface CompanyListingResult {
  urls: string[];
  via: "direct" | "apify" | "none";
  blocked?: boolean;
  directStatus?: number;
  apifyError?: string;
  reason?: string;
}

// Tries the direct fetch, then the Apify fallback. Returns the listing URLs plus
// which path produced them, or a blocked result with diagnostics if both fail.
export async function getCompanyListingUrls(): Promise<CompanyListingResult> {
  let via: "direct" | "apify" = "direct";
  let urls: string[] = [];

  const direct = await fetchDirect();
  if (direct.ok && direct.urls.length > 0) {
    urls = direct.urls;
  } else {
    const apify = await fetchViaApify();
    if (apify.urls.length > 0) { urls = apify.urls; via = "apify"; }
    else {
      return {
        urls: [], via: "none", blocked: true,
        directStatus: direct.status, apifyError: apify.error,
        reason: apify.error?.includes("APIFY_API_TOKEN")
          ? "LoopNet blocked the direct request and no Apify token is configured to scrape it."
          : "LoopNet blocked the request and the scraper could not retrieve the page.",
      };
    }
  }

  if (urls.length === 0) return { urls: [], via, blocked: true, reason: "no listings parsed (bot-blocked)" };
  return { urls, via };
}
