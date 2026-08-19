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
// js:true → render with a headless browser (Apify) before extraction; otherwise a plain fetch is enough.
const BROKER_SITES: { name: string; url: string; js?: boolean }[] = [
  { name: "NRG Realty Group", url: "https://www.nrgrealtygroup.com/property-listings/" },
  { name: "Team LBR", url: "https://teamlbr.com/search-properties/" },
  { name: "Kirk Strahan Realty", url: "https://www.strahancommercialproperties.com/for-sale" }, // Permian — server-rendered
  { name: "Ullian Realty", url: "https://ullianrealty.com/our-listings/", js: true }, // Space Coast — IDX/JS
  { name: "Moriah Brokerage", url: "https://moriahbrokerageservices.com/", js: true }, // Permian — IDX/JS
  { name: "Marcus & Millichap", url: "https://www.marcusmillichap.com/properties#pageNumber=1&stb=orderdate,DESC", js: true }, // JS SPA
  // Space Coast (FL) brokers — server-rendered listing pages, free to scrape.
  { name: "Jack Jeffcoat", url: "https://www.jackjeffcoat.com/commercial.listings" }, // largest Brevard inventory
  { name: "Space Coast CRE", url: "https://listings.spacecoastcre.com/i/featured-listings" },
  { name: "MaxLife Commercial", url: "https://maxlifedevelopment.com/commercial-listings?for=commercial-sale&q=Brevard+County" },
  { name: "JM Real Estate", url: "https://jmrealestate.com/listings/" },
  { name: "ITG Realty", url: "https://www.itgrealty.com/commercial-properties/" },
  { name: "Scott Langston", url: "https://scottlangston.com/brevard-county-commercial-property-listings/" }, // industrial-focused
  { name: "Perrone Properties", url: "https://perroneproperties.com/property-search/" },
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

const TX_CITIES = ["midland", "odessa"];
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
// `drop` marks a listing we should auto-dismiss on insert (non-industrial — e.g. Shop/Office).
function screen(n: Norm, box: Box | undefined): { fit: string; score: number; reason: string; drop?: boolean } {
  const notes: string[] = [];
  const industrial = !n.propertyType || /industrial|warehouse|flex|manufactur|distribution|ios|storage|yard/i.test(n.propertyType);
  if (!industrial) return { fit: "no-fit", score: 15, reason: `${n.propertyType} — not industrial/flex`, drop: true };
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
  const fit = score >= 80 ? "fit" : score >= 55 ? "borderline" : "no-fit";
  return { fit, score, reason: `On-market ${n.state ?? ""} industrial for sale — ${notes.join("; ") || "in target market"}.` };
}

function dedupKey(state: string | null, address: string | null): string {
  return `${(state || "").toUpperCase()}|${(address || "").toLowerCase().replace(/[^a-z0-9]/g, "")}`;
}

export type MarketScanSummary = {
  ok: boolean;
  perSource: { source: string; found: number; kept: number; inserted: number; duplicates: number; skippedExisting: number; error?: string; skipped?: string }[];
};

// Dedup vs stored URLs, screen, and insert discovered listings. Shared by the platform + broker paths.
async function upsertNorms(
  admin: ReturnType<typeof createAdminClient>,
  boxBy: Record<string, Box>,
  norms: Norm[],
  meta: { referredBy: string; referralKind: string; channel: string },
): Promise<{ inserted: number; duplicates: number; skippedExisting: number }> {
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
    // Non-industrial (Shop/Office/etc.) → insert already dismissed so it never surfaces, but keep the
    // dedup record so re-scans don't reconsider it.
    let status = sc.drop ? "dismissed" : "new";
    if (!sc.drop && n.address) {
      const { data: dupe } = await admin.from("inbound_listings").select("id").eq("dedup_key", key).limit(1).maybeSingle();
      if (dupe?.id) { status = "duplicate"; duplicates++; }
    }
    const { error } = await admin.from("inbound_listings").insert({
      message_id: n.url, source_mailbox: "market-scan", received_at: new Date().toISOString(),
      origin: "discovered", listing_url: n.url,
      referred_by: meta.referredBy, referral_kind: meta.referralKind, channel: meta.channel,
      address: n.address, submarket: n.city || market, state: n.state,
      asking_price: n.price, sf: n.sf, broker: n.broker, broker_firm: n.broker,
      fit: sc.fit, score: sc.score, reason: sc.reason, dedup_key: key, status, raw_subject: n.title,
    });
    if (!error) inserted++;
    else console.error("[market-scan] insert failed:", error.message);
  }
  return { inserted, duplicates, skippedExisting };
}

// Fetch a broker page and strip it to visible text (best-effort; JS-only pages return little text).
async function fetchPageText(url: string): Promise<string> {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" }, cache: "no-store", signal: AbortSignal.timeout(20000) });
  if (!r.ok) return "";
  const html = await r.text();
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;|&amp;|&#\d+;/g, " ").replace(/\s+/g, " ").trim();
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
    await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 });
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

type BrokerListing = { address: string | null; city: string | null; state: string | null; price: number | null; sf: number | null; propertyType: string | null; listingUrl: string | null; title: string | null };
const BROKER_SCHEMA = {
  type: "object", additionalProperties: false, required: ["listings"],
  properties: { listings: { type: "array", items: {
    type: "object", additionalProperties: false,
    required: ["address", "city", "state", "price", "sf", "propertyType", "listingUrl", "title"],
    properties: {
      address: { anyOf: [{ type: "string" }, { type: "null" }] },
      city: { anyOf: [{ type: "string" }, { type: "null" }] },
      state: { anyOf: [{ type: "string", enum: ["TX", "FL", "Other"] }, { type: "null" }] },
      price: { anyOf: [{ type: "number" }, { type: "null" }] },
      sf: { anyOf: [{ type: "integer" }, { type: "null" }] },
      propertyType: { anyOf: [{ type: "string" }, { type: "null" }] },
      listingUrl: { anyOf: [{ type: "string" }, { type: "null" }] },
      title: { anyOf: [{ type: "string" }, { type: "null" }] },
    },
  } } },
} as const;

async function extractBrokerListings(broker: string, text: string): Promise<BrokerListing[]> {
  try {
    const msg = await anthropic.messages.create({
      model: "claude-opus-4-8", max_tokens: 3000,
      output_config: { format: { type: "json_schema", schema: BROKER_SCHEMA } },
      system: [{ type: "text" as const, text: `Extract every for-sale/for-lease property listing shown on this ${broker} listings page: street address, city, US state (TX/FL/Other), asking price USD, building SF, property type, the listing's detail URL if present, and a short title. Only what's on the page; null when absent.` }],
      messages: [{ role: "user", content: `Page text:\n${text}` }],
    });
    const t = msg.content[0]?.type === "text" ? msg.content[0].text : "";
    return (JSON.parse(t).listings ?? []) as BrokerListing[];
  } catch (e) { console.error("[market-scan] broker extract failed:", String(e).slice(0, 150)); return []; }
}

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

    const r = await upsertNorms(admin, boxBy, norms, { referredBy: `Discovered on ${s.source}`, referralKind: s.source, channel: s.source });
    perSource.push({ source: s.source, found: items.length, kept: norms.length - r.skippedExisting, inserted: r.inserted, duplicates: r.duplicates, skippedExisting: r.skippedExisting });
  }

  // ── Broker websites — LLM extraction. Server-rendered pages use a plain fetch; JS/IDX sites
  //    (site.js) render in a headless browser first, falling back to a plain fetch when no token. ──
  for (const site of BROKER_SITES) {
    try {
      // Cheapest path first: plain fetch (server-rendered). For JS/IDX sites, escalate to a
      // self-hosted headless browser (free), then to Apify render (paid) only as a last resort.
      let text = await fetchPageText(site.url);
      if (text.length < 400 && site.js) { const t = await fetchRenderedTextLocal(site.url); if (t.length >= 400) text = t; }
      if (text.length < 400 && site.js && token) { try { const t = await fetchRenderedText(site.url, token); if (t.length >= 400) text = t; } catch { /* ignore */ } }
      if (text.length < 400) {
        const why = site.js ? "JS/IDX site — render produced no listings (content likely in a cross-origin frame)" : "no server-rendered listings";
        perSource.push({ source: `Broker: ${site.name}`, found: 0, kept: 0, inserted: 0, duplicates: 0, skippedExisting: 0, skipped: why });
        continue;
      }
      const found = await extractBrokerListings(site.name, text.slice(0, 16000));
      const norms: Norm[] = [];
      for (const f of found) {
        const state = (f.state === "TX" || f.state === "FL") ? f.state : stateFrom(f.address, f.city, f.state);
        if (!state) continue;
        const url = f.listingUrl && /^https?:/i.test(f.listingUrl) ? f.listingUrl : `${site.url}#${encodeURIComponent((f.address ?? f.title ?? "").slice(0, 60))}`;
        const n: Norm = { url, address: f.address, city: f.city, state, price: f.price, sf: f.sf, propertyType: f.propertyType, broker: site.name, title: f.title, datePosted: null };
        const cityL = (n.city || n.address || "").toLowerCase();
        const inMarket = n.state === "TX" ? TX_CITIES.some((c) => cityL.includes(c)) : FL_CITIES.some((c) => cityL.includes(c));
        if (!inMarket) continue;
        if (n.propertyType && !/industrial|warehouse|flex|manufactur|distribution|ios|storage|shop|yard/i.test(n.propertyType)) continue;
        if (isErpListing(n)) continue;
        norms.push(n);
      }
      const r = await upsertNorms(admin, boxBy, norms, { referredBy: `Listed on ${site.name}`, referralKind: "Broker", channel: "Broker site" });
      perSource.push({ source: `Broker: ${site.name}`, found: found.length, kept: norms.length - r.skippedExisting, inserted: r.inserted, duplicates: r.duplicates, skippedExisting: r.skippedExisting });
    } catch (e) {
      perSource.push({ source: `Broker: ${site.name}`, found: 0, kept: 0, inserted: 0, duplicates: 0, skippedExisting: 0, error: String(e).slice(0, 200) });
    }
  }

  return { ok: true, perSource };
}
