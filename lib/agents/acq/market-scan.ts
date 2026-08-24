import { createAdminClient } from "@/lib/supabase/admin";
import { leadingNum, streetTokens } from "@/lib/loopnet-company";
import Anthropic from "@anthropic-ai/sdk";

// Market scan (proactive sourcing). Complements the inbound mailbox scan: instead of waiting for a
// broker to forward a deal, this scrapes the listing platforms (LoopNet + Crexi) for ON-MARKET
// for-sale industrial in ERP's markets, screens each against the Buy Box, and feeds the SAME
// inbound_listings table tagged origin='discovered'. Reuses the Apify plumbing already used for the
// LoopNet vacancy sync (run-sync-get-dataset-items). Read-only; nothing is contacted or purchased.

const APIFY = "https://api.apify.com/v2";
const anthropic = new Anthropic();
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// Broker websites scraped directly (server-rendered pages → LLM extraction). JS-only sites are
// skipped-with-note until a browser scraper is wired. Extend this list to add brokers.
// js:true → render with a headless browser before extraction. proxy:true → the site blocks Vercel's
// datacenter IP (bot protection), so fetch through Apify residential proxies (needs APIFY token).
const BROKER_SITES: { name: string; url: string; js?: boolean; proxy?: boolean }[] = [
  { name: "NRG Realty Group", url: "https://www.nrgrealtygroup.com/property-listings/", proxy: true },
  { name: "Team LBR", url: "https://teamlbr.com/search-properties/", proxy: true },
  { name: "Ullian Realty", url: "https://ullianrealty.com/our-listings/", js: true }, // Space Coast — IDX/JS
  { name: "Moriah Brokerage", url: "https://moriahbrokerageservices.com/", js: true }, // Permian — IDX/JS
  // National platforms — big JS/SPA sites behind bot protection; scanned via residential proxy, filtered to our markets.
  { name: "Marcus & Millichap", url: "https://www.marcusmillichap.com/properties#pageNumber=1&stb=orderdate,DESC", js: true }, // JS SPA
  { name: "CBRE", url: "https://www.cbre.com/properties/properties-for-sale?propertytype=Industrial", proxy: true },
  { name: "JLL", url: "https://property.jll.com/search?tenureType=sale&propertyType=Industrial", proxy: true },
  { name: "Colliers", url: "https://www.colliers.com/en-us/properties?type=forsale&assetclass=Industrial", proxy: true },
  // Space Coast (FL) brokers.
  { name: "Jack Jeffcoat", url: "https://www.jackjeffcoat.com/commercial.listings" }, // largest Brevard inventory
  { name: "Space Coast CRE", url: "https://listings.spacecoastcre.com/i/featured-listings" },
  { name: "MaxLife Commercial", url: "https://maxlifedevelopment.com/commercial-listings?for=commercial-sale&q=Brevard+County" },
  { name: "JM Real Estate", url: "https://jmrealestate.com/listings/", proxy: true },
  { name: "ITG Realty", url: "https://www.itgrealty.com/commercial-properties/" },
  { name: "Scott Langston", url: "https://scottlangston.com/brevard-county-commercial-property-listings/" }, // industrial-focused
  { name: "Perrone Properties", url: "https://perroneproperties.com/property-search/", proxy: true },
  // Permian (TX) brokers.
  { name: "The Real Estate Ranch", url: "https://www.therealestateranch.com/listed-properties/industrial-properties/" }, // largest Permian industrial inventory
  { name: "VIP Realty (Midland)", url: "https://www.viprealestate.com/midland-commercial-real-estate.php", proxy: true },
  { name: "thisRealty", url: "https://thisrealty.com/available-for-sale/", proxy: true },
];

// For-sale industrial searches scoped to ERP's two markets. Override per-source input via env.
const LOOPNET_SEARCHES = [
  "https://www.loopnet.com/search/industrial-properties/midland-tx/for-sale/",
  "https://www.loopnet.com/search/industrial-properties/odessa-tx/for-sale/",
  "https://www.loopnet.com/search/industrial-properties/brevard-county-fl/for-sale/",
  "https://www.loopnet.com/search/industrial-properties/melbourne-fl/for-sale/",
  "https://www.loopnet.com/search/industrial-properties/palm-bay-fl/for-sale/",
  "https://www.loopnet.com/search/industrial-properties/titusville-fl/for-sale/",
  "https://www.loopnet.com/search/industrial-properties/cocoa-fl/for-sale/",
  "https://www.loopnet.com/search/industrial-properties/rockledge-fl/for-sale/",
];

// ERP's Texas market is the Permian Basin around Midland/Odessa — include the nearby towns so
// server-rendered broker listings there (Gardendale, Big Spring, Andrews…) aren't dropped.
const TX_CITIES = ["midland", "odessa", "gardendale", "big spring", "andrews", "stanton", "greenwood", "midkiff", "goldsmith", "notrees", "penwell", "west odessa"];
// ERP's Florida market is Brevard County / Space Coast as a whole — keep the full municipality list
// so county-wide LoopNet results (Merritt Island, Viera, West Melbourne, the beaches…) aren't dropped.
const FL_CITIES = [
  "brevard", "melbourne", "west melbourne", "melbourne beach", "palm bay", "titusville",
  "cocoa", "cocoa beach", "rockledge", "grant", "valkaria", "malabar", "sebastian",
  "merritt island", "cape canaveral", "satellite beach", "indialantic", "indian harbour beach",
  "viera", "suntree", "mims", "port st. john", "port st john", "palm shores", "micco",
  "barefoot bay", "sharpes", "june park", "space coast",
];

// ERP's priority Permian corridors — a TX listing on one of these roads gets a scoring bonus.
const PRIORITY_TX_ROADS = /\b(hwy\.?\s*191|highway\s*191|us[- ]?191|i[- ]?20|interstate\s*20|bus(?:iness)?\.?\s*(?:route\s*)?20|fm[-\s]?1788|hwy\.?\s*158|highway\s*158|murphy\s*st|industrial\s*ave)/i;

type Src = "LoopNet" | "Crexi" | "LinkedIn";
type Norm = {
  url: string;            // dedup / message_id key (may be a synthetic broker-page anchor)
  listingUrl?: string | null; // real per-property page to link to; null when we only have a general page
  dropReason?: string | null; // set by detail-page verification → force-dismiss on upsert
  address: string | null; city: string | null; state: "TX" | "FL" | null;
  price: number | null; sf: number | null; propertyType: string | null; broker: string | null; title: string | null;
  datePosted: string | null;
};

function apToken(): string | null {
  return process.env.APIFY_API_TOKEN || process.env.APIFY_TOKEN || process.env.APIFY_API || null;
}

const numOf = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") { const n = Number(v.replace(/[^0-9.]/g, "")); return Number.isFinite(n) && n > 0 ? n : null; }
  return null;
};
const strOf = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

function stateFrom(addr: string | null, city: string | null, st: unknown): "TX" | "FL" | null {
  const s = strOf(st)?.toUpperCase();
  if (s === "TX" || s === "FL") return s;
  const hay = `${addr ?? ""} ${city ?? ""}`.toLowerCase();
  if (/\btx\b|texas|midland|odessa/.test(hay)) return "TX";
  if (/\bfl\b|florida|melbourne|palm bay|titusville|brevard|cocoa|rockledge|merritt island|viera|malabar|cape canaveral|satellite beach|indialantic/.test(hay)) return "FL";
  return null;
}

function normalize(it: Record<string, unknown>, src: Src): Norm | null {
  const url = strOf(it.url) || strOf(it.listingUrl) || strOf(it.link) || strOf(it.detailUrl);
  if (!url) return null;
  const address = strOf(it.address) || strOf(it.addressLine1) || strOf(it.propertyAddress) || strOf(it.streetAddress);
  const city = strOf(it.city) || strOf((it.location as Record<string, unknown>)?.city);
  const state = stateFrom(address, city, it.state ?? (it.location as Record<string, unknown>)?.state);
  const price = numOf(it.price) ?? numOf(it.askingPrice) ?? numOf(it.salePrice) ?? numOf(it.priceValue);
  const sf = numOf(it.size) ?? numOf(it.buildingSize) ?? numOf(it.squareFeet) ?? numOf(it.buildingSizeSf) ?? numOf(it.sf);
  const propertyType = strOf(it.propertyType) || strOf(it.type) || strOf(it.assetType);
  const broker = strOf(it.brokerCompany) || strOf(it.broker) || strOf(it.brokerageName) || strOf(it.company);
  const title = strOf(it.title) || strOf(it.propertyName) || strOf(it.name);
  const datePosted = strOf(it.datePosted) || strOf(it.dateListed) || strOf(it.listedDate) || strOf(it.updatedAt) || strOf(it.postedAt) || null;
  return { url, listingUrl: url, address, city, state, price, sf, propertyType, broker, title, datePosted };
}

async function runActor(actor: string, input: unknown, token: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${APIFY}/acts/${actor}/run-sync-get-dataset-items?token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(150_000),
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`Apify HTTP ${res.status}: ${text.slice(0, 200)}`);
  let items: unknown; try { items = JSON.parse(text); } catch { items = null; }
  return Array.isArray(items) ? (items as Record<string, unknown>[]) : [];
}

type Box = { sf_min: number | null; sf_max: number | null; price_per_sf_min: number | null; price_per_sf_max: number | null; deal_size_min: number | null; deal_size_max: number | null };

const PRICE_FLOOR = 700_000; // discovered listings priced below this are auto-dismissed (houses / sub-scale)

// Broad "Industrial" match — every industrial sub-type counts, so a property marketed under a specific
// label (warehouse, flex, distribution, IOS, manufacturing, etc.) isn't squeezed out. Used everywhere
// we gate on asset type so the rule is identical across all sources.
const INDUSTRIAL_RE = /industrial|warehouse|flex|manufactur|distribution|logistics|\bios\b|outdoor storage|laydown|storage|\byard\b|shop|truck\s*terminal|terminal|cold\s*storage|refrigerat|r&d|business\s*park/i;

// Deterministic Buy-Box screen for a discovered listing (no LLM — the fields are already structured).
// `drop` marks a listing we should auto-dismiss on insert (non-industrial — e.g. Shop/Office, or sub-floor price).
function screen(n: Norm, box: Box | undefined): { fit: string; score: number; reason: string; drop?: boolean } {
  const notes: string[] = [];
  const typeHay = `${n.propertyType ?? ""} ${n.title ?? ""}`;
  // Residential (apartments / condos / houses) is never in scope — auto-dismiss in both markets.
  if (/\b(apartment|apartments|multi[-\s]?family|multifamily|condo|condos|condominium|duplex|triplex|fourplex|town\s?home|town\s?house|single[-\s]?family|\bsfr\b|residential|mobile\s*home|manufactured\s*home)\b/i.test(typeHay)) {
    return { fit: "no-fit", score: 10, reason: `${n.propertyType || "Residential"} — residential, not industrial`, drop: true };
  }
  // Vacant land / lots are auto-dismissed in TX only (FL keeps land / development parcels in-scope).
  // IOS / laydown yards are always kept — those are industrial use, not raw land.
  if (n.state === "TX" && /\b(land|lot|lots|acreage|vacant|unimproved|undeveloped|raw\s+land)\b/i.test(typeHay) && !/\b(ios|yard|laydown|building|warehouse|shop)\b/i.test(typeHay)) {
    return { fit: "no-fit", score: 12, reason: `${n.propertyType || "Land"} — vacant land, not a building (TX)`, drop: true };
  }
  const industrial = !n.propertyType || INDUSTRIAL_RE.test(n.propertyType);
  if (!industrial) return { fit: "no-fit", score: 15, reason: `${n.propertyType} — not industrial`, drop: true };
  // Sub-$700K in these markets is almost always a house or a sub-scale parcel — auto-dismiss.
  if (n.price != null && n.price < PRICE_FLOOR) return { fit: "no-fit", score: 10, reason: `$${(n.price / 1e6).toFixed(2)}M — below the $${(PRICE_FLOOR / 1000)}K minimum`, drop: true };
  let pts = 40; // in-market industrial for-sale
  const psf = n.price && n.sf ? n.price / n.sf : null;
  if (n.sf == null) {
    // Missing square footage is not the listing's fault — treat as neutral (grant the band credit),
    // never a penalty. A broker forward often omits SF; we confirm it on a closer look.
    pts += 25; notes.push("SF not listed — not penalized");
  } else if (box?.sf_min && box?.sf_max) {
    if (n.sf >= box.sf_min && n.sf <= box.sf_max) { pts += 25; notes.push(`${n.sf.toLocaleString()} SF in ${box.sf_min / 1000}k–${box.sf_max / 1000}k band`); }
    else notes.push(`${n.sf.toLocaleString()} SF outside ${box.sf_min / 1000}k–${box.sf_max / 1000}k`);
  }
  if (box?.price_per_sf_min && box?.price_per_sf_max && psf != null) {
    if (psf >= box.price_per_sf_min && psf <= box.price_per_sf_max) { pts += 20; notes.push(`$${Math.round(psf)}/SF in band`); }
    else notes.push(`$${Math.round(psf)}/SF outside $${box.price_per_sf_min}–${box.price_per_sf_max}`);
  }
  if ((box?.deal_size_min || box?.deal_size_max) && n.price != null) {
    const okMin = !box?.deal_size_min || n.price >= box.deal_size_min;
    const okMax = !box?.deal_size_max || n.price <= box.deal_size_max;
    if (okMin && okMax) { pts += 15; notes.push(`$${(n.price / 1e6).toFixed(2)}M within deal-size band`); }
    else notes.push(`$${(n.price / 1e6).toFixed(2)}M ${!okMin ? 'below $' + (box.deal_size_min! / 1e6).toFixed(1) + 'M floor' : 'above deal-size cap'}`);
  }
  if (n.sf == null && n.price == null) notes.push("size & price not listed — needs a look to confirm");
  if (n.state === "TX" && PRIORITY_TX_ROADS.test(`${n.address ?? ""} ${n.title ?? ""}`)) { pts += 12; notes.push("on a priority ERP corridor"); }
  const score = Math.min(100, pts);
  const fit = score >= 70 ? "fit" : score >= 55 ? "borderline" : "no-fit";
  return { fit, score, reason: `On-market ${n.state ?? ""} industrial for sale — ${notes.join("; ") || "in target market"}.` };
}

function dedupKey(state: string | null, address: string | null): string {
  return `${(state || "").toUpperCase()}|${(address || "").toLowerCase().replace(/[^a-z0-9]/g, "")}`;
}

export type MarketScanSummary = {
  ok: boolean;
  perSource: { source: string; found: number; kept: number; inserted: number; updated: number; duplicates: number; skippedExisting: number; error?: string; skipped?: string }[];
};

// Dedup vs stored URLs, screen, and insert discovered listings. Shared by the platform + broker paths.
async function upsertNorms(
  admin: ReturnType<typeof createAdminClient>,
  boxBy: Record<string, Box>,
  norms: Norm[],
  meta: { referredBy: string; referralKind: string; channel: string },
): Promise<{ inserted: number; updated: number; duplicates: number; skippedExisting: number }> {
  // Look up existing rows by message_id AND by dedup_key (address) so a re-scan refreshes the same
  // listing in place instead of inserting a duplicate or skipping it.
  const urls = norms.map((n) => n.url);
  const keys = [...new Set(norms.map((n) => dedupKey(n.state, n.address)).filter(Boolean))];
  const byMsg = new Map<string, { id: string; status: string }>();
  const byKey = new Map<string, { id: string; status: string }>();
  for (let i = 0; i < urls.length; i += 200) {
    const { data } = await admin.from("inbound_listings").select("id, message_id, dedup_key, status").in("message_id", urls.slice(i, i + 200));
    (data ?? []).forEach((r: { id: string; message_id: string; dedup_key: string | null; status: string }) => { byMsg.set(r.message_id, { id: r.id, status: r.status }); if (r.dedup_key) byKey.set(r.dedup_key, { id: r.id, status: r.status }); });
  }
  for (let i = 0; i < keys.length; i += 200) {
    const { data } = await admin.from("inbound_listings").select("id, dedup_key, status").in("dedup_key", keys.slice(i, i + 200));
    (data ?? []).forEach((r: { id: string; dedup_key: string; status: string }) => { if (!byKey.has(r.dedup_key)) byKey.set(r.dedup_key, { id: r.id, status: r.status }); });
  }

  let inserted = 0, updated = 0;
  for (const n of norms) {
    const market = n.state === "TX" ? "Permian Basin" : "Brevard / Space Coast";
    // A detail-page verification failure (non-industrial / not-for-sale) force-dismisses the listing,
    // overriding the buy-box screen — this also dismisses the row in place on a re-scan.
    const sc = n.dropReason ? { fit: "no-fit", score: 8, reason: n.dropReason, drop: true } : screen(n, boxBy[n.state!]);
    const key = dedupKey(n.state, n.address);
    const fields = {
      listing_url: n.listingUrl ?? null,
      referred_by: meta.referredBy, referral_kind: meta.referralKind, channel: meta.channel,
      address: n.address, submarket: n.city || market, state: n.state,
      asking_price: n.price, sf: n.sf, broker: n.broker, broker_firm: n.broker,
      fit: sc.fit, score: sc.score, reason: sc.reason, raw_subject: n.title,
      updated_at: new Date().toISOString(),
    };
    const existing = byMsg.get(n.url) ?? (key ? byKey.get(key) : undefined);
    if (existing) {
      // Refresh in place. Preserve a user/system disposition (dismissed / imported / moved); a still-"new"
      // row (or a legacy "duplicate") is re-evaluated and flips to dismissed when the fresh screen drops it.
      const mutable = existing.status === "new" || existing.status === "duplicate";
      const status = mutable ? (sc.drop ? "dismissed" : "new") : existing.status;
      // Audit only when THIS screen dismisses a mutable row; never overwrite an existing (person) dismissal.
      const audit = mutable && status === "dismissed" ? { dismissed_at: fields.updated_at, dismissed_by: "screener" } : {};
      const { error } = await admin.from("inbound_listings").update({ ...fields, status, ...audit }).eq("id", existing.id);
      if (!error) updated++; else console.error("[market-scan] update failed:", error.message);
      continue;
    }
    const status = sc.drop ? "dismissed" : "new";
    const { data: ins, error } = await admin.from("inbound_listings").insert({
      message_id: n.url, source_mailbox: "market-scan", received_at: new Date().toISOString(),
      origin: "discovered", dedup_key: key, status, ...fields,
      ...(status === "dismissed" ? { dismissed_at: fields.updated_at, dismissed_by: "screener" } : {}),
    }).select("id").single();
    if (!error && ins) {
      inserted++;
      // Track within this batch so a second listing at the same address updates rather than duplicates.
      byMsg.set(n.url, { id: ins.id, status });
      if (key) byKey.set(key, { id: ins.id, status });
    } else if (error) console.error("[market-scan] insert failed:", error.message);
  }
  return { inserted, updated, duplicates: 0, skippedExisting: 0 };
}

// Resolve an href to an absolute URL, but only if it points to a real *per-property* detail page:
// a different page than `base`, not a mailto/tel/js link, a same-page fragment, or the site's
// homepage / a shallow nav page (which the extractor sometimes grabs by mistake). Null otherwise.
function detailHref(href: string, base: string): string | null {
  if (!href || /^(mailto:|tel:|javascript:|#)/i.test(href)) return null;
  try {
    const u = new URL(href, base); if (!/^https?:$/.test(u.protocol)) return null;
    if (/idxbroker\.com$/i.test(u.hostname)) return null; // IDX detail pages are signup-gated — not linkable
    const b = new URL(base);
    if (u.origin + u.pathname === b.origin + b.pathname) return null; // same page, only fragment/query differs
    const segs = u.pathname.split("/").filter(Boolean);
    // Homepage ("/") or a single shallow segment (e.g. /contact, /for-sale) is not a property page.
    if (segs.length === 0) return null;
    if (segs.length === 1 && segs[0].length < 12 && !/\d/.test(segs[0])) return null;
    return u.toString();
  } catch { return null; }
}

// Verify a listing's detail page — the index/card often hides the real property type and status
// (e.g. a "retail frontage" land parcel listed under Industrial, or an IDX page showing "unknown").
// Returns a classification, or null when we couldn't fetch/parse (caller keeps the listing on doubt).
const DETAIL_SCHEMA = {
  type: "object", additionalProperties: false, required: ["category", "forSale"],
  properties: {
    category: { type: "string", enum: ["industrial", "ios", "land", "retail", "office", "residential", "other", "unknown"] },
    forSale: { type: "boolean", description: "false ONLY if the page explicitly shows the listing is Sold / Under Contract / Pending / Leased / Expired / Off-Market. If no status is shown, or it's ambiguous, return true (it's on the broker's for-sale listings, so assume active)." },
  },
} as const;
async function verifyDetail(url: string): Promise<{ category: string; forSale: boolean } | null> {
  let text = "";
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(8000) });
    if (r.status === 404 || r.status === 410) return { category: "unknown", forSale: false }; // page gone → not active
    if (!r.ok) return null;
    text = (await r.text())
      .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ").replace(/&nbsp;|&amp;|&#\d+;/g, " ").replace(/\s+/g, " ").trim().slice(0, 8000);
  } catch { return null; }
  if (text.length < 200) return null;
  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001", max_tokens: 200,
      output_config: { format: { type: "json_schema", schema: DETAIL_SCHEMA } },
      system: [{ type: "text" as const, text: `Classify this commercial real-estate listing DETAIL page by what the property actually IS, ignoring incidental mentions. category: "industrial" (warehouse/flex/manufacturing/distribution building), "ios" (industrial outdoor storage / laydown yard), "land" (vacant land, a lot, or a development parcel with NO building — even if zoned commercial/industrial/MF or marketed as "retail frontage"), "retail", "office", "residential" (apartments/condos/houses/multifamily), "other", or "unknown". forSale: return FALSE only if the page explicitly shows the listing is Sold / Under Contract / Pending / Leased / Expired / Off-Market. If no explicit status is shown, or it's ambiguous, return TRUE — it's on the broker's for-sale listings, so assume active. Do NOT infer "not for sale" from a missing status.` }],
      messages: [{ role: "user", content: text }],
    });
    const t = msg.content[0]?.type === "text" ? msg.content[0].text : "{}";
    const p = JSON.parse(t);
    return { category: String(p.category ?? "unknown"), forSale: p.forSale !== false };
  } catch { return null; }
}

// Fetch a broker page and reduce it to text for the extractor. Two things matter for accuracy:
// keep block boundaries as newlines (so each listing's fields stay grouped, not merged into one soup),
// and inline each link's destination as "text [https://…]" so the extractor can attach a real
// per-property detail URL to each listing. JS-only pages still return little text.
// Reduce raw HTML to listing-friendly text: inline detail-page links as "text [url]" and keep block
// boundaries as newlines so each listing stays visually grouped for the extractor.
function htmlToText(html: string, baseUrl: string): string {
  let h = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  h = h.replace(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, inner) => {
    const text = String(inner).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const abs = detailHref(String(href), baseUrl);
    return abs ? ` ${text} [${abs}] ` : ` ${text} `;
  });
  h = h.replace(/<\/(div|li|tr|p|h[1-6]|article|section|td)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n");
  return h
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;|&amp;|&#\d+;/g, " ")
    .replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").replace(/[ \t]*\n[ \t]*/g, "\n").trim();
}

async function fetchPageText(url: string): Promise<string> {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" }, cache: "no-store", signal: AbortSignal.timeout(20000) });
  if (!r.ok) return "";
  return htmlToText(await r.text(), url);
}

// Fetch a bot-protected page through Apify residential proxies (real browser) — for sites that block
// Vercel's datacenter IP. Returns listing-friendly text, or "" if unavailable/misconfigured.
async function fetchViaApifyProxy(url: string, token: string): Promise<string> {
  const actor = process.env.BROKER_PROXY_APIFY_ACTOR || "apify~website-content-crawler";
  const input = process.env.BROKER_PROXY_APIFY_INPUT
    ? { ...JSON.parse(process.env.BROKER_PROXY_APIFY_INPUT), startUrls: [{ url }] }
    : {
        startUrls: [{ url }],
        crawlerType: "playwright:firefox",
        maxCrawlPages: 1, maxCrawlDepth: 0,
        saveHtml: true, saveMarkdown: false,
        proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] },
      };
  try {
    const items = await runActor(actor, input, token);
    const it = items[0] as Record<string, unknown> | undefined;
    const html = strOf(it?.html);
    if (html) return htmlToText(html, url);
    return (strOf(it?.text) || strOf(it?.markdown) || "").replace(/\s+/g, " ").trim();
  } catch (e) { console.error("[market-scan] proxy fetch failed:", String(e).slice(0, 150)); return ""; }
}

// Render a JS/IDX broker page in a headless browser (Apify) and return its text.
// Uses the website-content-crawler actor, which executes the page's scripts before extracting.
async function fetchRenderedText(url: string, token: string): Promise<string> {
  const actor = process.env.BROKER_RENDER_APIFY_ACTOR || "apify~website-content-crawler";
  const input = process.env.BROKER_RENDER_APIFY_INPUT
    ? { ...JSON.parse(process.env.BROKER_RENDER_APIFY_INPUT), startUrls: [{ url }] }
    : {
        startUrls: [{ url }],
        crawlerType: "playwright:firefox", // execute page JS
        maxCrawlPages: 1, maxCrawlDepth: 0,
        saveMarkdown: true, saveHtml: false,
        proxyConfiguration: { useApifyProxy: true },
        readableTextCharThreshold: 50,
      };
  const items = await runActor(actor, input, token);
  const it = items[0] as Record<string, unknown> | undefined;
  const txt = strOf(it?.text) || strOf(it?.markdown) || "";
  return txt.replace(/\s+/g, " ").trim();
}

// Render a JS/IDX page with a self-hosted headless Chromium — no external service, no per-run cost.
// Uses @sparticuz/chromium + puppeteer-core (dynamically imported so a cold path stays light).
// Returns "" on any failure so callers fall back to the Apify render. Also pulls same-origin iframe
// text, since IDX widgets often inject listings into an embedded frame.
async function fetchRenderedTextLocal(url: string): Promise<string> {
  let browser: Awaited<ReturnType<typeof import("puppeteer-core").default.launch>> | null = null;
  try {
    const chromium = (await import("@sparticuz/chromium")).default;
    const puppeteer = (await import("puppeteer-core")).default;
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
    const page = await browser.newPage();
    await page.setUserAgent(UA);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 20000 });
    await new Promise((r) => setTimeout(r, 2500)); // let IDX widgets inject listings
    const txt: string = await page.evaluate(() => {
      const parts = [document.body?.innerText || ""];
      for (const f of Array.from(document.querySelectorAll("iframe"))) {
        try { const d = (f as HTMLIFrameElement).contentDocument; if (d?.body) parts.push(d.body.innerText); } catch { /* cross-origin frame — unreadable */ }
      }
      return parts.join("\n");
    });
    return String(txt).replace(/\s+/g, " ").trim();
  } catch (e) {
    console.error("[market-scan] self-hosted render failed:", String(e).slice(0, 200));
    return "";
  } finally {
    try { await browser?.close(); } catch { /* ignore */ }
  }
}

type BrokerListing = { address: string | null; city: string | null; state: string | null; price: number | null; sf: number | null; propertyType: string | null; listingUrl: string | null; title: string | null; status: string | null };
const BROKER_SCHEMA = {
  type: "object", additionalProperties: false, required: ["listings"],
  properties: { listings: { type: "array", items: {
    type: "object", additionalProperties: false,
    required: ["address", "city", "state", "price", "sf", "propertyType", "listingUrl", "title", "status"],
    properties: {
      address: { anyOf: [{ type: "string" }, { type: "null" }] },
      city: { anyOf: [{ type: "string" }, { type: "null" }] },
      state: { anyOf: [{ type: "string", enum: ["TX", "FL", "Other"] }, { type: "null" }] },
      price: { anyOf: [{ type: "number" }, { type: "null" }] },
      sf: { anyOf: [{ type: "integer" }, { type: "null" }] },
      propertyType: { anyOf: [{ type: "string" }, { type: "null" }] },
      listingUrl: { anyOf: [{ type: "string" }, { type: "null" }] },
      title: { anyOf: [{ type: "string" }, { type: "null" }] },
      status: { anyOf: [{ type: "string" }, { type: "null" }], description: "availability label shown, e.g. Active, Sold, Under Contract, Leased, Expired" },
    },
  } } },
} as const;

async function extractBrokerListings(broker: string, text: string): Promise<BrokerListing[]> {
  // One retry — a transient rate-limit/timeout shouldn't silently zero out a whole broker.
  for (let attempt = 0; attempt < 2; attempt++) {
  try {
    const msg = await anthropic.messages.create({
      model: "claude-opus-4-8", max_tokens: 16000,
      output_config: { format: { type: "json_schema", schema: BROKER_SCHEMA } },
      system: [{ type: "text" as const, text: `Extract every for-sale property listing shown on this ${broker} listings page: street address, city, US state (TX/FL/Other), asking price USD, building SF, property type, the listing's detail URL, a short title, and its status. Only what's on the page; use null when a field is absent — never guess or carry a value over from a neighboring listing.

IMPORTANT: capture a listing even when only its address and/or a per-property detail link (e.g. a [https://…/listing-slug/] URL) is shown — set price, SF, and type to null in that case. Do NOT omit a listing just because its price / SF / type is not on this index page; a distinct property address or its own detail-page link is enough to count it as a listing.

status: the availability label shown for the listing. ONLY include listings that are currently ACTIVE / for sale — SKIP entirely any labeled Sold, Under Contract, Pending, Leased, Expired, or Off-Market (do not output them at all). For the active ones you keep, copy the status label verbatim (null if none shown).

propertyType: ALWAYS classify (never leave null — infer from the listing name/details). Use "Land" for vacant/undeveloped land, lots, or acreage with no building (even if zoned commercial/industrial). Use "IOS" for industrial outdoor storage or laydown yards. Use "Industrial"/"Warehouse"/"Flex"/"Shop" for industrial buildings. Use "Multifamily" for apartment/condo complexes or anything with a unit count / "beds" (e.g. a named community like "Puerto Del Rio"), and "Office"/"Retail"/"Hospitality" as applicable. When unsure but it is clearly a residential community, use "Multifamily".

CRITICAL — each listing's fields must come from that listing's own block. The text is grouped roughly one listing per line/section; do not attach one listing's price or SF to a different listing. If a listing shows no price, set price to null (do NOT reuse another listing's price).

listingUrl: use the URL in square brackets [https://…] whose path matches THIS listing (its street address or a slug of it, e.g. .../1911-kermit-hwy...). Ignore site-wide links — homepage, phone, "view all", or navigation. If the listing has no matching per-property bracketed URL, set listingUrl to null.` }],
      messages: [{ role: "user", content: `Page text:\n${text}` }],
    });
    const t = msg.content[0]?.type === "text" ? msg.content[0].text : "";
    return (JSON.parse(t).listings ?? []) as BrokerListing[];
  } catch (e) { console.error(`[market-scan] broker extract failed (${broker}, attempt ${attempt + 1}):`, String(e).slice(0, 150)); }
  }
  return [];
}

// `only` limits the scan to one group: "platforms" (LoopNet/Crexi/LinkedIn via Apify) or "brokers"
// (broker websites). Omit to run both. Splitting lets the UI scan them independently so neither blocks.
export async function runMarketScan(only?: "platforms" | "brokers"): Promise<MarketScanSummary> {
  const token = apToken();
  const admin = createAdminClient();
  const { data: boxes } = await admin.from("buy_box").select("market, sf_min, sf_max, price_per_sf_min, price_per_sf_max, deal_size_min, deal_size_max");
  const boxBy: Record<string, Box> = {};
  for (const b of (boxes ?? []) as (Box & { market: string })[]) boxBy[b.market] = b;

  // ERP's own properties — exclude them from market results (we source acquisitions, not our own listings).
  const { data: props } = await admin.from("properties").select("address");
  const erpProps = ((props ?? []) as { address: string }[]).map((p) => ({ num: leadingNum(p.address), tokens: streetTokens(p.address) }));
  const isErpListing = (n: Norm): boolean => {
    if (/\berp\b|erp industrials|erp funds/i.test(`${n.broker ?? ""} ${n.title ?? ""}`)) return true;
    const num = leadingNum(n.address);
    const toks = streetTokens(n.address);
    if (!num || toks.size === 0) return false;
    return erpProps.some((p) => p.num === num && [...toks].some((t) => p.tokens.has(t)));
  };
  const cutoff = Date.now() - 31 * 24 * 3600 * 1000; // market research: only the last ~1 month

  const sources: { source: Src; actor: string | null; input: unknown }[] = [
    {
      source: "LoopNet",
      actor: process.env.LOOPNET_APIFY_ACTOR || "memo23~loopnet-scraper-ppe",
      input: process.env.MARKET_SCAN_LOOPNET_INPUT
        ? JSON.parse(process.env.MARKET_SCAN_LOOPNET_INPUT)
        : { startUrls: LOOPNET_SEARCHES.map((u) => ({ url: u })), maxItems: 120, includeListingDetails: true },
    },
    {
      source: "Crexi",
      actor: process.env.CREXI_APIFY_ACTOR || null, // set CREXI_APIFY_ACTOR (+ CREXI_APIFY_INPUT) to enable
      input: process.env.CREXI_APIFY_INPUT ? JSON.parse(process.env.CREXI_APIFY_INPUT) : null,
    },
    {
      source: "LinkedIn",
      actor: process.env.LINKEDIN_APIFY_ACTOR || null, // set LINKEDIN_APIFY_ACTOR (+ LINKEDIN_APIFY_INPUT) to enable
      input: process.env.LINKEDIN_APIFY_INPUT ? JSON.parse(process.env.LINKEDIN_APIFY_INPUT) : null,
    },
  ];

  const perSource: MarketScanSummary["perSource"] = [];
  for (const s of only === "brokers" ? [] : sources) {
    if (!token) { perSource.push({ source: s.source, found: 0, kept: 0, inserted: 0, updated: 0, duplicates: 0, skippedExisting: 0, skipped: "no APIFY token configured" }); continue; }
    if (!s.actor) { perSource.push({ source: s.source, found: 0, kept: 0, inserted: 0, updated: 0, duplicates: 0, skippedExisting: 0, skipped: `${s.source} actor not configured (set ${s.source.toUpperCase()}_APIFY_ACTOR + ${s.source.toUpperCase()}_APIFY_INPUT)` }); continue; }

    let items: Record<string, unknown>[];
    try { items = await runActor(s.actor, s.input, token); }
    catch (e) { perSource.push({ source: s.source, found: 0, kept: 0, inserted: 0, updated: 0, duplicates: 0, skippedExisting: 0, error: String(e).slice(0, 200) }); continue; }

    // Normalize + keep only in-market industrial with a resolvable state.
    const norms: Norm[] = [];
    for (const it of items) {
      const n = normalize(it, s.source);
      if (!n || !n.state) continue;
      const cityL = (n.city || n.address || "").toLowerCase();
      const inMarket = n.state === "TX" ? TX_CITIES.some((c) => cityL.includes(c)) : FL_CITIES.some((c) => cityL.includes(c));
      if (!inMarket) continue;
      if (n.propertyType && !INDUSTRIAL_RE.test(n.propertyType)) continue; // industrial only — skip retail/office/etc.
      if (isErpListing(n)) continue; // don't surface ERP's own listings
      if (n.datePosted) { const t = Date.parse(n.datePosted); if (!Number.isNaN(t) && t < cutoff) continue; } // older than ~1 month
      norms.push(n);
    }

    const r = await upsertNorms(admin, boxBy, norms, { referredBy: `Discovered on ${s.source}`, referralKind: s.source, channel: s.source });
    perSource.push({ source: s.source, found: items.length, kept: norms.length, inserted: r.inserted, updated: r.updated, duplicates: r.duplicates, skippedExisting: r.skippedExisting });
  }

  // ── Broker websites — LLM extraction. Server-rendered pages use a plain fetch; JS/IDX sites
  //    (site.js) render in a headless browser first, falling back to a plain fetch when no token.
  //    Run them concurrently so the whole list finishes well inside the function time limit — the old
  //    sequential loop timed out before reaching the brokers at the end (e.g. The Real Estate Ranch). ──
  type PS = MarketScanSummary["perSource"][number];
  const zero = { found: 0, kept: 0, inserted: 0, updated: 0, duplicates: 0, skippedExisting: 0 };
  const processBroker = async (site: (typeof BROKER_SITES)[number]): Promise<PS> => {
    try {
      // Cheapest path first: plain fetch (server-rendered). JS/IDX sites try the free self-hosted
      // browser only — the paid Apify render was dropped: it added up to 150s per site (which pushed
      // the whole scan past the time limit) for sites that mostly yield nothing anyway.
      let text = await fetchPageText(site.url);
      // Bot-protected sites (proxy:true) block Vercel's IP — go straight to residential proxy when a token exists.
      if (text.length < 400 && site.proxy && token) { const t = await fetchViaApifyProxy(site.url, token); if (t.length >= 400) text = t; }
      if (text.length < 400) { const t = await fetchRenderedTextLocal(site.url); if (t.length >= 400) text = t; } // otherwise try the free headless browser
      if (text.length < 400) {
        const why = site.proxy && !token ? "site blocks our server — needs APIFY residential proxy (token not set)" : `fetched only ${text.length} chars — site blocks our server or renders via JS`;
        return { source: `Broker: ${site.name}`, ...zero, skipped: why };
      }
      const found = await extractBrokerListings(site.name, text.slice(0, 80000));
      if (found.length === 0) {
        return { source: `Broker: ${site.name}`, ...zero, skipped: `fetched ${text.length} chars but extractor found 0 listings` };
      }
      const norms: Norm[] = [];
      for (const f of found) {
        // Skip anything not actively for sale — these pages list Sold / Under Contract / Leased /
        // Expired alongside active listings, and we only want live opportunities.
        if (f.status && /\b(sold|under\s*contract|pending|leased|expired|off[-\s]?market|closed|withdrawn)\b/i.test(f.status)) continue;
        const state = (f.state === "TX" || f.state === "FL") ? f.state : stateFrom(f.address, f.city, f.state);
        if (!state) continue;
        // A real per-property detail URL if the extractor found one; else null (don't link to the
        // broker's homepage/listings page). `url` still needs a unique value for dedup / message_id.
        const detailUrl = f.listingUrl ? detailHref(f.listingUrl, site.url) : null;
        const url = detailUrl ?? `${site.url}#${encodeURIComponent((f.address ?? f.title ?? "").slice(0, 60))}`;
        const n: Norm = { url, listingUrl: detailUrl, address: f.address, city: f.city, state, price: f.price, sf: f.sf, propertyType: f.propertyType, broker: site.name, title: f.title, datePosted: null };
        const cityL = (n.city || n.address || "").toLowerCase();
        const inMarket = n.state === "TX" ? TX_CITIES.some((c) => cityL.includes(c)) : FL_CITIES.some((c) => cityL.includes(c));
        if (!inMarket) continue;
        if (n.propertyType && !INDUSTRIAL_RE.test(n.propertyType)) continue;
        if (isErpListing(n)) continue;
        norms.push(n);
      }
      // Verify each listing's detail page (type + active status) — the index page often hides the
      // truth (retail/land parcels listed under Industrial, IDX pages showing "unknown"). Runs in
      // parallel; disqualified listings are marked dropReason so upsert dismisses them (in place on a
      // re-scan too). A null result (couldn't fetch/parse) keeps the listing.
      const withUrl = norms.filter((n) => n.listingUrl);
      if (withUrl.length) {
        const vs = await pool(withUrl, 6, (n) => verifyDetail(n.listingUrl!));
        withUrl.forEach((n, i) => {
          const v = vs[i]; if (!v) return;
          if (!v.forSale) n.dropReason = "no longer for sale (per detail page)";
          else if (["retail", "office", "residential"].includes(v.category)) n.dropReason = `${v.category} — not industrial (per detail page)`;
          else if (v.category === "land" && n.state === "TX") n.dropReason = "vacant land — not a building (per detail page, TX)";
        });
      }
      const r = await upsertNorms(admin, boxBy, norms, { referredBy: `Listed on ${site.name}`, referralKind: "Broker", channel: "Broker site" });
      return { source: `Broker: ${site.name}`, found: found.length, kept: norms.length, inserted: r.inserted, updated: r.updated, duplicates: r.duplicates, skippedExisting: r.skippedExisting };
    } catch (e) {
      return { source: `Broker: ${site.name}`, ...zero, error: String(e).slice(0, 200) };
    }
  };
  // Plain-fetch sites run with high concurrency (I/O + API bound). Headless-browser (js) sites run at
  // low concurrency to avoid launching many Chromium instances at once.
  if (only !== "platforms") {
    const plainSites = BROKER_SITES.filter((s) => !s.js);
    const jsSites = BROKER_SITES.filter((s) => s.js);
    const plainResults = await pool(plainSites, 4, processBroker);
    const jsResults = await pool(jsSites, 2, processBroker);
    perSource.push(...plainResults, ...jsResults);
  }

  return { ok: true, perSource };
}

// Run `fn` over `items` with at most `limit` in flight at once; preserves input order in the result.
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i]); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
