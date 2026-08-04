/**
 * Fetches ERP's active LoopNet listings and matches them back to ERP's own properties.
 *
 * LoopNet blocks direct/browser fetches (PerimeterX 403), and its company page can't be
 * expanded by the scraper (it returns the page, not the listings). So the reliable path is:
 * run the memo23/loopnet-scraper-ppe Apify actor over LoopNet *search* URLs for ERP's markets,
 * then match the returned listings to ERP's properties by street address. A direct fetch is
 * still tried first (free) as a best-effort fallback.
 *
 * Actor + input are env-overridable (LOOPNET_APIFY_ACTOR / LOOPNET_APIFY_INPUT) so the search
 * scope can be tuned without a code change.
 */

export const COMPANY_URL = "https://www.loopnet.com/company/erp-industrials/9rvtzp4l/";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const LISTING_RE = /https?:\/\/www\.loopnet\.com\/Listing\/[^"'\s)\\]+/g;

// LoopNet search pages covering ERP's markets. The actor fans each of these out into the
// individual listings on it; we then keep the ones that match an ERP property by address.
const DEFAULT_SEARCH_URLS = [
  "https://www.loopnet.com/search/industrial-space/midland-tx/for-lease/",
  "https://www.loopnet.com/search/industrial-space/odessa-tx/for-lease/",
  "https://www.loopnet.com/search/industrial-space/melbourne-fl/for-lease/",
  "https://www.loopnet.com/search/industrial-space/palm-bay-fl/for-lease/",
]

export interface Listing {
  url: string
  streetNo: string | null
  address?: string
  city?: string
  brokerCompany?: string
}

export interface ApifyDebug { actor: string; items?: number; listings: number; chars: number; blocked: boolean }

// leading street number of a street address ("10800 State Highway 191" -> "10800")
export function leadingNum(s?: string | null): string | null {
  if (!s) return null
  const m = s.match(/^\s*#?\s*(\d{1,6})\b/)
  return m ? m[1] : null
}

export function extractListingUrls(text: string): string[] {
  const normalized = text.replace(/\\\//g, "/") // tolerate JSON-escaped slashes
  return [...new Set([...normalized.matchAll(LISTING_RE)].map((m) => m[0]))]
}

// Street-name tokens for fuzzy address matching — drop direction words + generic road words
// so "3401 E Highway 158" and "3401 E. State Highway 158" still line up on "158".
const STOP = new Set(['n', 's', 'e', 'w', 'north', 'south', 'east', 'west', 'state', 'hwy', 'highway', 'interstate', 'i', 'us', 'fm', 'county', 'road', 'rd', 'ave', 'avenue', 'st', 'street', 'blvd', 'dr', 'drive', 'ste', 'suite', 'unit', 'bldg', 'building', 'the', 'of', 'w.', 'e.', 'n.', 's.'])
export function streetTokens(addr?: string | null): Set<string> {
  if (!addr) return new Set()
  return new Set(
    addr.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t && !STOP.has(t))
  )
}

// Attempt 1 — direct server fetch (usually 403). URL-only listings.
async function fetchDirect(): Promise<{ listings: Listing[]; ok: boolean; status?: number; error?: string }> {
  try {
    const r = await fetch(COMPANY_URL, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
      cache: "no-store",
    })
    if (!r.ok) return { listings: [], ok: false, status: r.status }
    const html = await r.text()
    const listings = extractListingUrls(html).map(u => ({ url: u, streetNo: u.match(/\/Listing\/(\d+)-/)?.[1] ?? null }))
    return { listings, ok: true }
  } catch (e) {
    return { listings: [], ok: false, error: String(e) }
  }
}

// Attempt 2 — memo23/loopnet-scraper-ppe over market search URLs, parsed into structured listings.
async function fetchViaApify(): Promise<{ listings: Listing[]; ok: boolean; error?: string; debug?: ApifyDebug }> {
  const token = process.env.APIFY_API_TOKEN || process.env.APIFY_TOKEN || process.env.APIFY_API
  if (!token) return { listings: [], ok: false, error: "no APIFY_API_TOKEN configured" }

  const actor = process.env.LOOPNET_APIFY_ACTOR || "memo23~loopnet-scraper-ppe"
  let input: unknown
  if (process.env.LOOPNET_APIFY_INPUT) {
    try { input = JSON.parse(process.env.LOOPNET_APIFY_INPUT) }
    catch { return { listings: [], ok: false, error: "LOOPNET_APIFY_INPUT is not valid JSON" } }
  } else {
    input = { startUrls: DEFAULT_SEARCH_URLS.map(u => ({ url: u })), maxItems: 200, includeListingDetails: false }
  }

  try {
    const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${token}`
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(110_000),
    })
    const bodyText = await res.text().catch(() => "")
    if (!res.ok) return { listings: [], ok: false, error: `Apify HTTP ${res.status}: ${bodyText}`.slice(0, 300) }

    let items: any
    try { items = JSON.parse(bodyText) } catch { items = null }
    const arr = Array.isArray(items) ? items : []
    const listings: Listing[] = []
    for (const it of arr) {
      const u = it?.listingUrl || it?.url || it?.link
      if (typeof u !== "string" || !/loopnet\.com\/Listing\//i.test(u)) continue
      const address = it?.address ?? it?.addressLine1 ?? it?.propertyAddress
      listings.push({
        url: u,
        streetNo: leadingNum(typeof address === "string" ? address : undefined) ?? (u.match(/\/Listing\/(\d+)-/)?.[1] ?? null),
        address: typeof address === "string" ? address : undefined,
        city: typeof it?.city === "string" ? it.city : undefined,
        brokerCompany: typeof it?.brokerCompany === "string" ? it.brokerCompany : undefined,
      })
    }
    const debug: ApifyDebug = {
      actor, items: arr.length, listings: listings.length, chars: bodyText.length,
      blocked: /captcha|pardon our interruption|access to this page has been denied|perimeterx/i.test(bodyText),
    }
    console.log("[loopnet-sync] apify:", JSON.stringify(debug))
    return { listings, ok: true, debug }
  } catch (e) {
    return { listings: [], ok: false, error: String(e) }
  }
}

export interface CompanyListingResult {
  listings: Listing[]
  via: "direct" | "apify" | "none"
  blocked?: boolean
  directStatus?: number
  apifyError?: string
  apifyDebug?: ApifyDebug
  reason?: string
}

export async function getCompanyListings(): Promise<CompanyListingResult> {
  const direct = await fetchDirect()
  if (direct.ok && direct.listings.length > 0) return { listings: direct.listings, via: "direct" }

  const apify = await fetchViaApify()
  if (apify.listings.length > 0) return { listings: apify.listings, via: "apify", apifyDebug: apify.debug }

  return {
    listings: [], via: "none", blocked: true,
    directStatus: direct.status, apifyError: apify.error, apifyDebug: apify.debug,
    reason: apify.error?.includes("APIFY_API_TOKEN")
      ? "No Apify token is configured to scrape LoopNet."
      : "The scraper reached LoopNet but returned no listings for ERP's markets.",
  }
}

// The numeric LoopNet listing id, from either URL form:
//   /Listing/10800-State-Highway-191-Midland-TX/15743121/  ->  15743121
//   /Listing/15743121/                                     ->  15743121
export function listingId(url?: string | null): string | null {
  if (!url) return null
  const m = url.replace(/[?#].*$/, "").match(/(\d+)\/?$/)
  return m ? m[1] : null
}

// Match scraped listings to ERP properties by street number AND a shared street-NAME token
// (the street number is excluded from that test, so "12200 Hwy 191" won't match "12200 W I-20").
// Only returns an update when the matched listing is a genuinely different listing id than what's
// stored (or the property had no link) — so re-saving the same listing in a shorter URL form is a no-op.
export function computeLinkUpdates(
  props: { id: number; address: string; loopnetUrl: string | null }[],
  listings: Listing[],
): { id: number; address: string; from: string | null; to: string }[] {
  const byStreet: Record<string, Listing[]> = {}
  for (const l of listings) { if (l.streetNo) (byStreet[l.streetNo] ||= []).push(l) }

  const out: { id: number; address: string; from: string | null; to: string }[] = []
  for (const p of props) {
    const sn = leadingNum(p.address)
    if (!sn) continue
    const cands = byStreet[sn]
    if (!cands) continue
    const pTok = streetTokens(p.address); pTok.delete(sn)
    // Require a shared street-name token beyond the street number; a listing with no address
    // (URL-only) can't be safely disambiguated, so it's skipped rather than risk a wrong match.
    const match = cands.find(l => {
      const lt = streetTokens(l.address); lt.delete(sn)
      if (lt.size === 0) return false
      for (const t of lt) if (pTok.has(t)) return true
      return false
    })
    if (!match) continue
    const newId = listingId(match.url)
    if (newId && newId !== listingId(p.loopnetUrl)) out.push({ id: p.id, address: p.address, from: p.loopnetUrl, to: match.url })
  }
  return out
}
