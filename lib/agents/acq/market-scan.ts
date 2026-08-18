import { createAdminClient } from "@/lib/supabase/admin";
import { leadingNum, streetTokens } from "@/lib/loopnet-company";

// Market scan (proactive sourcing). Complements the inbound mailbox scan: instead of waiting for a
// broker to forward a deal, this scrapes the listing platforms (LoopNet + Crexi) for ON-MARKET
// for-sale industrial in ERP's markets, screens each against the Buy Box, and feeds the SAME
// inbound_listings table tagged origin='discovered'. Reuses the Apify plumbing already used for the
// LoopNet vacancy sync (run-sync-get-dataset-items). Read-only; nothing is contacted or purchased.

const APIFY = "https://api.apify.com/v2";

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

const TX_CITIES = ["midland", "odessa"];
const FL_CITIES = ["melbourne", "palm bay", "titusville", "cocoa", "rockledge", "grant", "malabar", "sebastian"];

// ERP's priority Permian corridors — a TX listing on one of these roads gets a scoring bonus.
const PRIORITY_TX_ROADS = /\b(hwy\.?\s*191|highway\s*191|us[- ]?191|i[- ]?20|interstate\s*20|bus(?:iness)?\.?\s*(?:route\s*)?20|fm[-\s]?1788|hwy\.?\s*158|highway\s*158|murphy\s*st|industrial\s*ave)/i;

type Src = "LoopNet" | "Crexi" | "LinkedIn";
type Norm = {
  url: string; address: string | null; city: string | null; state: "TX" | "FL" | null;
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
  if (/\bfl\b|florida|melbourne|palm bay|titusville|brevard/.test(hay)) return "FL";
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
  return { url, address, city, state, price, sf, propertyType, broker, title, datePosted };
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

// Deterministic Buy-Box screen for a discovered listing (no LLM — the fields are already structured).
function screen(n: Norm, box: Box | undefined): { fit: string; score: number; reason: string } {
  const notes: string[] = [];
  const industrial = !n.propertyType || /industrial|warehouse|flex|manufactur|distribution|ios|storage/i.test(n.propertyType);
  if (!industrial) return { fit: "no-fit", score: 15, reason: `${n.propertyType} — not industrial/flex` };
  let pts = 40; // in-market industrial for-sale
  const psf = n.price && n.sf ? n.price / n.sf : null;
  if (box?.sf_min && box?.sf_max && n.sf != null) {
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
  const fit = score >= 80 ? "fit" : score >= 55 ? "borderline" : "no-fit";
  return { fit, score, reason: `On-market ${n.state ?? ""} industrial for sale — ${notes.join("; ") || "in target market"}.` };
}

function dedupKey(state: string | null, address: string | null): string {
  return `${(state || "").toUpperCase()}|${(address || "").toLowerCase().replace(/[^a-z0-9]/g, "")}`;
}

export type MarketScanSummary = {
  ok: boolean;
  perSource: { source: Src; found: number; kept: number; inserted: number; duplicates: number; skippedExisting: number; error?: string; skipped?: string }[];
};

export async function runMarketScan(): Promise<MarketScanSummary> {
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
  for (const s of sources) {
    if (!token) { perSource.push({ source: s.source, found: 0, kept: 0, inserted: 0, duplicates: 0, skippedExisting: 0, skipped: "no APIFY token configured" }); continue; }
    if (!s.actor) { perSource.push({ source: s.source, found: 0, kept: 0, inserted: 0, duplicates: 0, skippedExisting: 0, skipped: `${s.source} actor not configured (set ${s.source.toUpperCase()}_APIFY_ACTOR + ${s.source.toUpperCase()}_APIFY_INPUT)` }); continue; }

    let items: Record<string, unknown>[];
    try { items = await runActor(s.actor, s.input, token); }
    catch (e) { perSource.push({ source: s.source, found: 0, kept: 0, inserted: 0, duplicates: 0, skippedExisting: 0, error: String(e).slice(0, 200) }); continue; }

    // Normalize + keep only in-market industrial with a resolvable state.
    const norms: Norm[] = [];
    for (const it of items) {
      const n = normalize(it, s.source);
      if (!n || !n.state) continue;
      const cityL = (n.city || n.address || "").toLowerCase();
      const inMarket = n.state === "TX" ? TX_CITIES.some((c) => cityL.includes(c)) : FL_CITIES.some((c) => cityL.includes(c));
      if (!inMarket) continue;
      if (n.propertyType && !/industrial|warehouse|flex|manufactur|distribution|ios|storage|shop|yard/i.test(n.propertyType)) continue; // industrial only — skip retail/office/etc.
      if (isErpListing(n)) continue; // don't surface ERP's own listings
      if (n.datePosted) { const t = Date.parse(n.datePosted); if (!Number.isNaN(t) && t < cutoff) continue; } // older than ~1 month
      norms.push(n);
    }

    // Idempotency: drop URLs already stored.
    const urls = norms.map((n) => n.url);
    const seen = new Set<string>();
    for (let i = 0; i < urls.length; i += 200) {
      const { data } = await admin.from("inbound_listings").select("message_id").in("message_id", urls.slice(i, i + 200));
      (data ?? []).forEach((r: { message_id: string }) => seen.add(r.message_id));
    }
    const fresh = norms.filter((n) => !seen.has(n.url));
    const skippedExisting = norms.length - fresh.length;

    let inserted = 0, duplicates = 0;
    for (const n of fresh) {
      const market = n.state === "TX" ? "Permian Basin" : "Brevard / Space Coast";
      const sc = screen(n, boxBy[n.state!]);
      const key = dedupKey(n.state, n.address);
      let status = "new";
      if (n.address) {
        const { data: dupe } = await admin.from("inbound_listings").select("id").eq("dedup_key", key).limit(1).maybeSingle();
        if (dupe?.id) { status = "duplicate"; duplicates++; }
      }
      const { error } = await admin.from("inbound_listings").insert({
        message_id: n.url,
        source_mailbox: "market-scan",
        received_at: new Date().toISOString(),
        origin: "discovered",
        listing_url: n.url,
        referred_by: `Discovered on ${s.source}`,
        referral_kind: s.source,
        channel: s.source,
        address: n.address,
        submarket: n.city || market,
        state: n.state,
        asking_price: n.price,
        sf: n.sf,
        broker: n.broker,
        broker_firm: n.broker,
        fit: sc.fit,
        score: sc.score,
        reason: sc.reason,
        dedup_key: key,
        status,
        raw_subject: n.title,
      });
      if (!error) inserted++;
      else console.error("[market-scan] insert failed:", error.message);
    }

    perSource.push({ source: s.source, found: items.length, kept: fresh.length, inserted, duplicates, skippedExisting });
  }

  return { ok: true, perSource };
}
