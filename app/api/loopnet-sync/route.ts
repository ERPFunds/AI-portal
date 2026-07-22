import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const COMPANY_URL = "https://www.loopnet.com/company/erp-industrials/9rvtzp4l/";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const LISTING_RE = /https?:\/\/www\.loopnet\.com\/Listing\/[^"'\s)\\]+/g;

function extractListingUrls(text: string): string[] {
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

// Manual "Refresh LoopNet listings" — triggered by a logged-in user from the
// Properties or Vacancies tab. Auto-refreshes each vacancy's loopnetUrl from
// ERP's LoopNet company page (fixes stale links, adds newly listed vacancies).
export async function POST() {
  // require an authenticated portal user
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let via: "direct" | "apify" = "direct";
  let result = await fetchDirect();

  // If the direct fetch was blocked / returned nothing, fall back to the scraper.
  if (!result.ok || result.urls.length === 0) {
    const apify = await fetchViaApify();
    if (apify.urls.length > 0) { result = { urls: apify.urls, ok: true }; via = "apify"; }
    else if (!result.ok) {
      // Both paths failed — report the more actionable error.
      return NextResponse.json({
        ok: false,
        blocked: true,
        via: "none",
        directStatus: result.status,
        apifyError: apify.error,
        reason: apify.error?.includes("APIFY_API_TOKEN")
          ? "LoopNet blocked the direct request and no Apify token is configured to scrape it."
          : "LoopNet blocked the request and the scraper could not retrieve the page.",
      });
    }
  }

  const urls = result.urls;
  if (urls.length === 0) return NextResponse.json({ ok: false, blocked: true, via, reason: "no listings parsed (bot-blocked)" });

  const byStreet: Record<string, string> = {};
  for (const u of urls) { const m = u.match(/\/Listing\/(\d+)-/); if (m && !byStreet[m[1]]) byStreet[m[1]] = u; }

  let admin;
  try { admin = createAdminClient(); }
  catch { return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY not set in environment" }); }

  const { data: props, error } = await admin
    .from("properties")
    .select('id, address, type, units, "loopnetUrl"')
    .or("type.eq.vacant,units.not.is.null");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const updated: { address: string; to: string }[] = [];
  for (const p of props ?? []) {
    const sm = (p.address as string).match(/^\s*(\d+)/);
    if (!sm) continue;
    const found = byStreet[sm[1]];
    if (found && found !== p.loopnetUrl) {
      await admin.from("properties").update({ loopnetUrl: found, updated_at: new Date().toISOString() }).eq("id", p.id);
      updated.push({ address: p.address, to: found });
    }
  }
  return NextResponse.json({ ok: true, via, listingsOnCompanyPage: urls.length, updatedCount: updated.length, updated });
}
