import Anthropic from "@anthropic-ai/sdk";
import { getGraphToken } from "@/lib/agents/graph-token";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBytes } from "@/lib/agents/ir/markdown-store";

// Inbound Listings scanner. Reads the acquisition principals' mailboxes (Meghan, Brennan, William)
// for emails where brokers or others are forwarding a property listing, extracts a structured
// listing with Claude, screens it against each market's Buy Box, dedupes, and upserts into
// inbound_listings. Read-only on mail — nothing is moved, modified, or replied to.

const GRAPH = "https://graph.microsoft.com/v1.0";
const anthropic = new Anthropic();

// mparad@ is included so listings a colleague (e.g. Meghan) forwards TO Michele — which land in her
// inbox, not the sender's scanned received-mail — are still captured.
export const SCAN_MAILBOXES = ["mberry@erpfunds.com", "bberry@erpfunds.com", "wmeyer@erpfunds.com", "mparad@erpfunds.com"];

// Signals that an email might be a forwarded listing — used to pre-filter before the (costlier) LLM pass.
const LISTING_HINT =
  /\b(for lease|for sale|available|availabilit|listing|offering memorandum|\bOM\b|flyer|marketing package|sq\.?\s?ft|\bsf\b|acre|cap rate|\bNNN\b|price|\$\/sf|psf|crexi|loopnet|industrial|warehouse|\bIOS\b|yard|off[- ]market)\b/i;

// Known deal sources from the Deal Pipeline "Source" column — brokers/firms who regularly bring ERP
// deals. Any email from one of these is ALWAYS deep-scanned (attachments + LLM), even if the subject
// has no listing keywords, so an "details attached" note from a known broker isn't filtered out.
const KNOWN_SOURCES = [
  "formation", "ullian", "lbr", "moriah", "invest texas", "lafrance", "brasher", "nrg", "loopnet",
  "crexi", "cbre", "salmon", "northmarq", "sorrells", "matthews", "marcus millichap", "caleb lawson", "aj brown",
];
const isKnownSource = (from: string, name: string): boolean => {
  const hay = `${from} ${name}`.toLowerCase();
  return KNOWN_SOURCES.some((t) => hay.includes(t));
};

// Strip Outlook/security boilerplate that pollutes previews & extraction (first-time-sender banner,
// external-mail caution) so it doesn't leak into the stored preview or confuse the extractor.
function cleanText(s: string): string {
  return (s || "")
    .replace(/You don't often get email from[^.]*\.?\s*Learn why this is important\.?/gi, " ")
    .replace(/Learn why this is important\.?/gi, " ")
    .replace(/CAUTION:\s*This message originated from outside[^\n]*/gi, " ")
    .replace(/Do not click links or open attachments unless you recognize the sender[^\n]*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// First http(s) URL that looks like a property listing (Crexi/LoopNet/OM/flyer), for the tab's link-out.
const URL_RE = /https?:\/\/[^\s"'<>)\]]+/gi;
function pickListingUrl(...texts: string[]): string | null {
  for (const t of texts) {
    const urls = (t || "").match(URL_RE);
    if (!urls) continue;
    const hit = urls.find((u) => /crexi|loopnet|listing|offering|property|marketing|\.pdf/i.test(u));
    if (hit) return hit.replace(/[.,);]+$/, "");
  }
  return null;
}

type Msg = { id: string; from: string; fromName: string; subject: string; preview: string; received: string; webLink: string };

async function readMailboxSince(t: string, mailbox: string, sinceIso: string, max: number): Promise<Msg[]> {
  const h = { Authorization: `Bearer ${t}`, Prefer: 'outlook.body-content-type="text"' };

  const excluded = new Set<string>();
  for (const wk of ["deleteditems", "junkemail", "drafts", "sentitems"]) {
    try {
      const r = await fetch(`${GRAPH}/users/${encodeURIComponent(mailbox)}/mailFolders/${wk}?$select=id`, { headers: h });
      if (r.ok) { const d = await r.json(); if (d.id) excluded.add(d.id as string); }
    } catch { /* best-effort exclusion */ }
  }

  const out: Msg[] = [];
  let url: string | null =
    `${GRAPH}/users/${encodeURIComponent(mailbox)}/messages` +
    `?$select=id,subject,from,bodyPreview,receivedDateTime,parentFolderId,webLink` +
    `&$filter=${encodeURIComponent(`receivedDateTime ge ${sinceIso}`)}` +
    `&$orderby=receivedDateTime desc&$top=50`;
  while (url && out.length < max) {
    const res: Response = await fetch(url, { headers: h });
    if (!res.ok) throw new Error(`Graph /messages ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    for (const m of (data.value || []) as Record<string, unknown>[]) {
      if (m.parentFolderId && excluded.has(m.parentFolderId as string)) continue;
      const fromObj = (m.from as { emailAddress?: { address?: string; name?: string } })?.emailAddress;
      out.push({
        id: (m.id as string) || "",
        from: fromObj?.address || "",
        fromName: fromObj?.name || "",
        subject: (m.subject as string) || "",
        preview: (m.bodyPreview as string) || "",
        received: (m.receivedDateTime as string) || "",
        webLink: (m.webLink as string) || "",
      });
      if (out.length >= max) break;
    }
    url = (data["@odata.nextLink"] as string) || null;
  }
  return out;
}

// Pull text from a message's PDF/OM/flyer/spreadsheet attachments (bounded), so the extractor
// reads the actual listing package — not just the covering email. Best-effort; never throws.
const ATTACH_OK = /\.(pdf|docx|xlsx|xls|pptx|txt|md|csv)$/i;
async function readAttachmentsText(token: string, mailbox: string, messageId: string): Promise<{ text: string; names: string[] }> {
  try {
    const h = { Authorization: `Bearer ${token}` };
    const r = await fetch(
      `${GRAPH}/users/${encodeURIComponent(mailbox)}/messages/${messageId}/attachments?$select=id,name,contentType,size,isInline`,
      { headers: h }
    );
    if (!r.ok) return { text: "", names: [] };
    const d = await r.json();
    const atts = ((d.value || []) as Record<string, unknown>[]).filter(
      (a) => String(a["@odata.type"] || "").includes("fileAttachment") && !a.isInline
    );
    const names: string[] = [];
    let out = "";
    for (const a of atts.slice(0, 5)) {
      const name = String(a.name || "");
      const ct = String(a.contentType || "");
      const size = Number(a.size || 0);
      if (!ATTACH_OK.test(name) && !/pdf|word|excel|spreadsheet|presentation|text|csv/i.test(ct)) continue;
      names.push(name); // surface the attachment name even if we don't parse its bytes
      if (size > 8_000_000) continue;
      try {
        const vr = await fetch(
          `${GRAPH}/users/${encodeURIComponent(mailbox)}/messages/${messageId}/attachments/${a.id}/$value`,
          { headers: h }
        );
        if (!vr.ok) continue;
        const buf = Buffer.from(await vr.arrayBuffer());
        const text = await parseBytes(buf, name, ct || null);
        if (text) out += `\n[attachment: ${name}] ${cleanText(text).slice(0, 1500)}`;
      } catch { /* skip a bad attachment */ }
      if (out.length > 3000) break;
    }
    return { text: out.slice(0, 3000), names };
  } catch {
    return { text: "", names: [] };
  }
}

const EXTRACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "isListing", "state", "address", "submarket", "channel", "referralKind", "broker", "brokerFirm", "askingPrice", "sf", "inPlaceNoi", "capPct", "fit", "score", "reason", "listingUrl"],
        properties: {
          index: { type: "integer", description: "the email's index from the digest" },
          isListing: { type: "boolean", description: "true only if this email is forwarding/presenting a specific property available to acquire (broker availability, OM, Crexi/LoopNet link, off-market offer). Newsletters, market reports, tenant/leasing, IR, and internal admin are false." },
          state: { anyOf: [{ type: "string", enum: ["TX", "FL", "Other"] }, { type: "null" }] },
          address: { anyOf: [{ type: "string" }, { type: "null" }] },
          submarket: { anyOf: [{ type: "string" }, { type: "null" }] },
          channel: { type: "string", enum: ["Broker email", "Crexi", "LoopNet", "OM attachment"] },
          referralKind: { type: "string", enum: ["Broker", "Investor/LP", "Colleague", "Crexi", "LoopNet", "Direct/Cold"] },
          broker: { anyOf: [{ type: "string" }, { type: "null" }], description: "listing broker name if identifiable" },
          brokerFirm: { anyOf: [{ type: "string" }, { type: "null" }] },
          askingPrice: { anyOf: [{ type: "number" }, { type: "null" }] },
          sf: { anyOf: [{ type: "integer" }, { type: "null" }] },
          inPlaceNoi: { anyOf: [{ type: "number" }, { type: "null" }] },
          capPct: { anyOf: [{ type: "number" }, { type: "null" }] },
          fit: { type: "string", enum: ["fit", "borderline", "no-fit"] },
          score: { type: "integer", description: "0-100 first-pass quick score vs the Buy Box" },
          reason: { type: "string", description: "one line JUSTIFYING the score: name the specific Buy Box factors it meets or misses — market, asset type, size vs band, $/SF vs band, yield/cap vs target, deal size. e.g. '42k SF above the 25k core and 5.4% cap below target, but in-market and $76/SF within band.'" },
          listingUrl: { anyOf: [{ type: "string" }, { type: "null" }], description: "the property's Crexi/LoopNet/broker listing URL, from the email body or an attachment, if present" },
        },
      },
    },
  },
} as const;

type Extracted = {
  index: number; isListing: boolean; state: string | null; address: string | null; submarket: string | null;
  channel: string; referralKind: string; broker: string | null; brokerFirm: string | null;
  askingPrice: number | null; sf: number | null; inPlaceNoi: number | null; capPct: number | null;
  fit: string; score: number; reason: string; listingUrl: string | null;
};

function buyBoxText(rows: { market: string | null; markets: string | null; asset_class: string | null; sf_min: number | null; sf_max: number | null; price_per_sf_min: number | null; price_per_sf_max: number | null; cap_rate_floor: number | null; deal_size_min: number | null; deal_size_max: number | null; notes: string | null }[]): string {
  if (!rows.length) return "TX (Permian): single-tenant NNN industrial/flex, 5k-25k SF, $50-185/SF, <= $3M, target ~10% stabilized yield. FL (Space Coast): industrial/IOS, 15k-120k SF, $50-120/SF, cap >= 6.5%, <= $8M.";
  return rows.map(b => {
    const parts = [
      b.markets, b.asset_class,
      b.sf_min || b.sf_max ? `SF ${b.sf_min ?? "?"}-${b.sf_max ?? "?"}` : null,
      b.price_per_sf_min || b.price_per_sf_max ? `$${b.price_per_sf_min ?? "?"}-${b.price_per_sf_max ?? "?"}/SF` : null,
      b.cap_rate_floor != null ? `cap >= ${b.cap_rate_floor}%` : null,
      (b.deal_size_min != null || b.deal_size_max != null) ? `deal size $${b.deal_size_min ? (b.deal_size_min / 1e6).toFixed(1) + 'M' : '0'}–${b.deal_size_max ? (b.deal_size_max / 1e6).toFixed(1) + 'M' : '∞'}` : null,
      b.notes,
    ].filter(Boolean);
    return `${b.market}: ${parts.join(" · ")}`;
  }).join("\n");
}

function dedupKey(state: string | null, address: string | null): string {
  return `${(state || "").toUpperCase()}|${(address || "").toLowerCase().replace(/[^a-z0-9]/g, "")}`;
}

export type ScanSummary = {
  ok: boolean;
  perMailbox: { mailbox: string; scanned: number; candidates: number; error?: string }[];
  extracted: number;
  inserted: number;
  duplicates: number;
  skippedExisting: number;
};

export async function runInboundScan(opts?: { days?: number; maxPerMailbox?: number; mailboxes?: string[] }): Promise<ScanSummary> {
  const days = Math.min(Math.max(opts?.days ?? 90, 1), 400); // default: look back 90 days
  const maxPerMailbox = Math.min(Math.max(opts?.maxPerMailbox ?? 250, 20), 800);
  const mailboxes = opts?.mailboxes ?? SCAN_MAILBOXES;

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString().split(".")[0] + "Z";

  const admin = createAdminClient();
  const token = await getGraphToken();
  if (!token) throw new Error("AZURE credentials not configured");
  const { data: boxes } = await admin.from("buy_box").select("market, markets, asset_class, sf_min, sf_max, price_per_sf_min, price_per_sf_max, cap_rate_floor, deal_size_min, deal_size_max, notes");
  const bbText = buyBoxText((boxes as never[]) ?? []);

  // Read each mailbox and keep only listing-signal candidates.
  const perMailbox: ScanSummary["perMailbox"] = [];
  const candidates: (Msg & { mailbox: string })[] = [];
  for (const mailbox of mailboxes) {
    try {
      const msgs = await readMailboxSince(token, mailbox, sinceIso, maxPerMailbox);
      const hits = msgs.filter(m => LISTING_HINT.test(`${m.subject} ${m.preview}`) || isKnownSource(m.from, m.fromName));
      hits.forEach(m => candidates.push({ ...m, mailbox }));
      perMailbox.push({ mailbox, scanned: msgs.length, candidates: hits.length });
    } catch (e) {
      perMailbox.push({ mailbox, scanned: 0, candidates: 0, error: String(e).slice(0, 200) });
    }
  }

  // Idempotency: drop candidates already stored.
  let skippedExisting = 0;
  const ids = candidates.map(c => c.id).filter(Boolean);
  const seen = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await admin.from("inbound_listings").select("message_id").in("message_id", ids.slice(i, i + 200));
    (data ?? []).forEach((r: { message_id: string }) => seen.add(r.message_id));
  }
  const fresh = candidates.filter(c => c.id && !seen.has(c.id));
  skippedExisting = candidates.length - fresh.length;

  // LLM extraction in batches.
  let extracted = 0, inserted = 0, duplicates = 0;
  let attnFetched = 0;
  const ATTN_CAP = 40; // bound attachment fetches per scan (keeps within the serverless time limit)
  const BATCH = 15;
  for (let i = 0; i < fresh.length; i += BATCH) {
    const batch = fresh.slice(i, i + BATCH);
    // Read PDF/OM/flyer attachment text for each candidate (bounded), so the extractor sees the package.
    const attInfo: { text: string; names: string[] }[] = [];
    for (const m of batch) {
      if (attnFetched >= ATTN_CAP) { attInfo.push({ text: "", names: [] }); continue; }
      attnFetched++;
      attInfo.push(await readAttachmentsText(token, m.mailbox, m.id));
    }
    const digest = batch
      .map((m, j) => `${j}. <${m.from}> "${m.subject}" :: ${cleanText(m.preview).slice(0, 240)}${attInfo[j].text ? " " + attInfo[j].text : ""}`)
      .join("\n");

    let items: Extracted[] = [];
    try {
      const msg = await anthropic.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 4000,
        output_config: { format: { type: "json_schema", schema: EXTRACT_SCHEMA } },
        system: [{ type: "text" as const, text:
`You screen an acquisition team's inbound email for a private-equity industrial real estate firm (ERP — Permian Basin, TX and Brevard/Space Coast, FL). For each email in the digest, decide if it is a broker or other party FORWARDING/PRESENTING a specific property available to acquire (broker availability, offering memorandum, Crexi/LoopNet listing, off-market offer). Set isListing=false for market reports, newsletters, investor relations, closing logistics on an existing deal, and internal admin. CRITICAL: a prospective tenant or their broker SEEKING to lease/rent space (a storage or laydown yard, warehouse, flex, IOS) is a leasing INQUIRY (demand), not a for-sale listing — isListing=false even if it mentions a target submarket that fits ERP's geography. Also isListing=false for NON-industrial asset classes — retail, office, multifamily/apartments, hospitality, restaurant/QSR, or raw land — since ERP acquires only industrial / flex / warehouse / IOS product.

For each listing, extract what is stated (null when absent): US state (TX/FL/Other), street address, submarket, listing broker + firm, asking price (USD), building SF, in-place NOI, and cap rate %. Pick the channel it arrived through and the referral relationship of the SENDER to ERP (Broker if from a brokerage; Colleague if from an @erpfunds.com address; Investor/LP; Crexi or LoopNet for those platform auto-alerts; or Direct/Cold otherwise).

Then screen each listing against the Buy Box below and tag fit / borderline / no-fit with a 0-100 quick score. The reason must EXPLAIN that score by naming which Buy Box criteria it meets or misses (market, asset type, size, $/SF, yield/cap, deal size) — so a reader understands why it landed where it did. Be evidence-based; do not invent details not present in the email.

Buy Box:
${bbText}` }],
        messages: [{ role: "user", content: `Emails (subject + preview + any attachment text):\n${digest}\n\nReturn one item per email, echoing its index.` }],
      });
      const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
      items = (JSON.parse(text).items ?? []) as Extracted[];
    } catch (e) {
      console.error("[inbound-scan] extraction failed for batch:", String(e).slice(0, 200));
      continue;
    }

    for (const it of items) {
      if (!it.isListing) continue;
      const m = batch[it.index];
      if (!m) continue;
      extracted++;
      const att = attInfo[it.index] ?? { text: "", names: [] };
      const listingUrl = it.listingUrl || pickListingUrl(m.preview, att.text);
      const state = it.state === "TX" || it.state === "FL" ? it.state : null;
      const key = dedupKey(state, it.address);
      let status = "new";
      if (key.replace(/[A-Z|]/g, "")) {
        const { data: dupe } = await admin.from("inbound_listings").select("id").eq("dedup_key", key).limit(1).maybeSingle();
        if (dupe?.id) { status = "duplicate"; duplicates++; }
      }
      const { error } = await admin.from("inbound_listings").insert({
        message_id: m.id,
        source_mailbox: m.mailbox,
        received_at: m.received || null,
        from_email: m.from,
        from_name: m.fromName,
        referred_by: m.fromName ? `${m.fromName}${m.from ? ` · ${m.from}` : ""}` : m.from,
        referral_kind: it.referralKind,
        channel: it.channel,
        address: it.address,
        submarket: it.submarket,
        state,
        asking_price: it.askingPrice,
        sf: it.sf,
        in_place_noi: it.inPlaceNoi,
        cap_pct: it.capPct,
        broker: it.broker,
        broker_firm: it.brokerFirm,
        fit: it.fit,
        score: it.score,
        reason: it.reason,
        dedup_key: key,
        status,
        raw_subject: m.subject,
        preview: cleanText(m.preview).slice(0, 300),
        source_url: m.webLink || null,
        listing_url: listingUrl,
        attachments: att.names.length ? att.names : null,
      });
      if (!error) inserted++;
      else console.error("[inbound-scan] insert failed:", error.message);
    }
  }

  return { ok: true, perMailbox, extracted, inserted, duplicates, skippedExisting };
}
