import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGraphToken } from "@/lib/agents/graph-token";
import { readExcelRows, listWorksheetNames } from "@/lib/agents/excel-utils";
import { findCommitmentSchedule } from "@/lib/agents/sharepoint-files";
import { getLpLastInteractions } from "@/lib/db";
import { salesforceConfigured, fetchLpSalesforceData, applyLpEditToSalesforce, type LpSfFieldMap, type SfWriteResult } from "@/lib/agents/ir/salesforce";
import { getInteractions } from "@/lib/agents/ir/mailbox-interactions";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ── Weekly-static cache ─────────────────────────────────────────────────────────
// The enrichment (SharePoint schedule + Salesforce + 9-month mailbox scan) is heavy and
// times out on cold loads (which is why broker/last-interaction "disappear"). We persist the
// computed payload to `lp_directory_cache` and serve it instantly on every page load. The heavy
// scan only runs on an explicit refresh: the weekly cron or the "Sync with Salesforce" button.
type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

async function readLpCache(sb: SupabaseServer): Promise<{ data: Record<string, unknown>; updated_at: string } | null> {
  try {
    const { data } = await sb.from("lp_directory_cache").select("data, updated_at").eq("id", 1).maybeSingle();
    return (data as { data: Record<string, unknown>; updated_at: string } | null) ?? null;
  } catch { return null; }
}

async function writeLpCache(sb: SupabaseServer, payload: unknown): Promise<void> {
  try {
    await sb.from("lp_directory_cache").upsert({ id: 1, data: payload, updated_at: new Date().toISOString() });
  } catch { /* cache write is best-effort */ }
}

export interface LpRecord {
  investor: string;
  commitment: string;
  commitmentUsd: number;
  commitType: string;
  contact: string;
  email: string;
  phone: string;
  date: string;
  notes: string;
  group: string;
  lastInteraction: { date: string; note: string; source: "ir" | "sf" | "email" } | null;
  sfLpType: string | null;
  sfCalled: number | null;
  sfDistributions: number | null;
  sfCrmId: string | null;
  sfBrokerCompany: string | null;
  sfBrokerContact: string | null;
  sfAdvisorFirm: string | null;
  sfAdvisorContact: string | null;
  brokerFirm: string;
  brokerContact: string;
  resolvedEmail: string | null; // best-known email (schedule → SF contact → past correspondence)
  committedUsd?: number | null;  // hard-committed so far (portal-stored; blank for uncommitted targets)
  sfStage?: string | null;       // the LP Opportunity's Salesforce StageName
}

interface LpUpdateBody {
  investor: string;
  commitment?: string;
  commitType?: string;
  contact?: string;
  email?: string;
  phone?: string;
  notes?: string;
  date?: string;
  brokerFirm?: string;
  brokerContact?: string;
  committed?: string;
  stage?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDollar(raw: string): number {
  const s = raw.replace(/[$,\s]/g, "").toUpperCase();
  if (!s || s === "TBD" || s === "N/A") return 0;
  const num = parseFloat(s.replace(/[MBK]/g, ""));
  if (isNaN(num)) return 0;
  if (s.endsWith("B")) return num * 1_000_000_000;
  if (s.endsWith("M")) return num * 1_000_000;
  if (s.endsWith("K")) return num * 1_000;
  return num;
}

function parseNotesCell(raw: string): { commitType: string; date: string; brokerFirm: string; brokerContact: string; notes: string } {
  const parts = raw.split("|").map(p => p.trim());
  let commitType = "";
  let date = "";
  let brokerFirm = "";
  let brokerContact = "";
  const plainParts: string[] = [];
  for (const part of parts) {
    if (/^type:/i.test(part))  commitType = part.replace(/^type:\s*/i, "").trim();
    else if (/^date:/i.test(part)) date = part.replace(/^date:\s*/i, "").trim();
    else if (/^broker:/i.test(part)) brokerFirm = part.replace(/^broker:\s*/i, "").trim();
    else if (/^rep:/i.test(part)) brokerContact = part.replace(/^rep:\s*/i, "").trim();
    else if (part) plainParts.push(part);
  }
  return { commitType, date, brokerFirm, brokerContact, notes: plainParts.join(" · ") };
}

function packNotesCell(commitType: string, date: string, brokerFirm: string, brokerContact: string, notes: string): string {
  return [
    commitType    ? `Type: ${commitType}`     : "",
    date          ? `Date: ${date}`           : "",
    brokerFirm    ? `Broker: ${brokerFirm}`   : "",
    brokerContact ? `Rep: ${brokerContact}`   : "",
    notes         || "",
  ].filter(Boolean).join(" | ");
}

function colLetter(index: number): string {
  let result = "";
  let n = index;
  while (n >= 0) {
    result = String.fromCharCode((n % 26) + 65) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

/** Shared: locate commitment schedule + auth, return token/siteId/scheduleInfo */
async function getScheduleContext() {
  const scheduleInfo = await findCommitmentSchedule();
  if (scheduleInfo.error || !scheduleInfo.itemId) throw new Error(scheduleInfo.error ?? "Commitment schedule not found");
  const token = await getGraphToken();
  if (!token) throw new Error("SharePoint auth failed");
  const siteId = process.env.SHAREPOINT_SITE_ID;
  if (!siteId) throw new Error("SHAREPOINT_SITE_ID not configured");
  return { scheduleInfo, token, siteId };
}

/** Parse header + column indices from raw values[][] */
function parseHeaders(values: string[][]) {
  const headerRowIdx = values.findIndex(row => row.some(cell => /^investor$/i.test(cell.trim())));
  if (headerRowIdx === -1) throw new Error("Header row not found in commitment schedule");
  const raw = values[headerRowIdx];
  let lastNonEmpty = 0;
  raw.forEach((h, i) => { if (h.trim()) lastNonEmpty = i; });
  const headers = raw.slice(0, lastNonEmpty + 1);
  const hLower = headers.map(h => h.toLowerCase().trim());
  const idx = (pat: RegExp) => hLower.findIndex(h => h && pat.test(h));
  return {
    headerRowIdx,
    headers,
    iInvestor:   idx(/investor|lp\s*name|^name$/),
    iCommitment: idx(/commitment|amount|total/),
    iContact:    idx(/contact|primary/),
    iEmail:      idx(/email/),
    iPhone:      idx(/phone/),
    iNotes:      idx(/notes|comment/),
  };
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const supabase = await createClient();

  // Auth: an interactive user session, OR the weekly cron (Bearer CRON_SECRET).
  const isCron = !!process.env.CRON_SECRET &&
    req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCron) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // The cron and the "Sync with Salesforce" button (?refresh=1) force the heavy recompute.
  // Every other page load is served instantly from the cached snapshot.
  const refresh = isCron || req.nextUrl.searchParams.get("refresh") === "1";
  if (!refresh) {
    const cached = await readLpCache(supabase);
    if (cached) return NextResponse.json({ ...cached.data, cachedAt: cached.updated_at, fromCache: true });
  }

  try {
    const { scheduleInfo, token, siteId } = await getScheduleContext();
    const { headers: rawHeaders, rows: rawRows } = await readExcelRows(token, siteId, scheduleInfo.itemId);

    const allRows = [rawHeaders, ...rawRows];
    const { headerRowIdx, headers, iInvestor, iCommitment, iContact, iEmail, iPhone, iNotes } =
      parseHeaders(allRows);

    const dataRows = allRows.slice(headerRowIdx + 1).filter(r => r.some(c => c.trim()));

    // TEMP: dump the spreadsheet's real columns + a couple sample rows to see whether a
    // status/closed column exists that we could read instead of the hand-entered Notes Type.
    console.log("[lp-xls-cols]", JSON.stringify({
      headers: rawHeaders,
      sampleRows: dataRows.filter(r => (r[iInvestor] ?? "").trim() && (r[iCommitment] ?? "").trim()).slice(0, 3),
    }).slice(0, 1500));

    // Walk rows — section-header rows (non-empty investor name, empty commitment +
    // contact + email + phone) become group labels for the LPs that follow them.
    let currentGroup = "All";
    const lps: LpRecord[] = [];

    for (const row of dataRows) {
      const g = (i: number) => (i >= 0 ? row[i] ?? "" : "").trim();
      const investorName = g(iInvestor);
      if (!investorName) continue;

      // Skip subtotal / summary rows (e.g. "Total 1st Close", "Total ERP Funds IV") — they're
      // sums, not LPs. "ERP GP IV" (the GP entity) is intentionally kept.
      if (/^\s*(grand\s+|sub\s*)?total\b/i.test(investorName)) continue;

      const commitment = g(iCommitment);
      const contact    = g(iContact);
      const email      = g(iEmail);
      const phone      = g(iPhone);

      // A row with only an investor name (no commitment / contact / email / phone)
      // is a section-header — use it as the group label for subsequent rows.
      const isSectionHeader = !commitment && !contact && !email && !phone;
      if (isSectionHeader) {
        currentGroup = investorName;
        continue;
      }

      const { commitType, date, brokerFirm, brokerContact, notes } = parseNotesCell(g(iNotes));
      lps.push({
        investor: investorName,
        commitment,
        commitmentUsd: parseDollar(commitment),
        commitType,
        contact, email, phone,
        date, notes,
        group: currentGroup,
        lastInteraction: null,
        sfLpType: null, sfCalled: null, sfDistributions: null, sfCrmId: null,
        sfBrokerCompany: null, sfBrokerContact: null,
        sfAdvisorFirm: null, sfAdvisorContact: null,
        brokerFirm, brokerContact,
        resolvedEmail: email && email.trim() ? email.trim() : null,
      });
    }

    // Merge duplicate LP rows (same investor name — e.g. a trust listed twice) into one,
    // summing their commitments; fill blanks from the duplicate.
    {
      const byInvestor = new Map<string, LpRecord>();
      for (const lp of lps) {
        const key = lp.investor.toLowerCase().trim();
        const ex = byInvestor.get(key);
        if (!ex) { byInvestor.set(key, lp); continue; }
        ex.commitmentUsd += lp.commitmentUsd;
        ex.commitment = ex.commitmentUsd > 0 ? `$${Math.round(ex.commitmentUsd).toLocaleString("en-US")}` : (ex.commitment || lp.commitment);
        ex.contact = ex.contact || lp.contact;
        ex.email = ex.email || lp.email;
        ex.phone = ex.phone || lp.phone;
        ex.commitType = ex.commitType || lp.commitType;
        ex.date = ex.date || lp.date;
        ex.brokerFirm = ex.brokerFirm || lp.brokerFirm;
        ex.brokerContact = ex.brokerContact || lp.brokerContact;
        ex.resolvedEmail = ex.resolvedEmail || lp.resolvedEmail;
        ex.notes = ex.notes || lp.notes;
      }
      const merged = [...byInvestor.values()];
      lps.length = 0;
      lps.push(...merged);
    }

    // Enrich with last interaction from IR agent logs (non-fatal if DB unavailable)
    const interactions = await getLpLastInteractions().catch(() => ({} as Record<string, import("@/lib/db").LpLastInteraction>));
    for (const lp of lps) {
      const match = interactions[lp.investor.toLowerCase().trim()];
      if (match) lp.lastInteraction = { date: match.date, note: match.note, source: "ir" };
    }

    // Kick off the mailbox scan NOW so it runs in parallel with the Salesforce queries below
    // (both are the slow parts). We await it in the Last-Interaction step.
    const interactionsPromise: Promise<import("@/lib/agents/ir/mailbox-interactions").InteractionMaps> =
      getInteractions().catch(() => ({ byEmail: {}, byName: {} }));

    // Enrich with Salesforce (LP Type / Called / Distributions / CRM Id), matched by email.
    // Non-fatal: any SF failure leaves the columns null, exactly as before.
    let sfFieldMap: LpSfFieldMap | null = null;
    let sfMatched = 0;
    let dstCount = 0;
    let sfError: string | null = null;
    const lpEmails = new Map<LpRecord, string[]>();
    if (salesforceConfigured()) {
      try {
        const { byName, fieldMap, matched, dstInvestors } = await fetchLpSalesforceData(lps.map((lp) => ({ investor: lp.investor, contact: lp.contact })));
        sfFieldMap = fieldMap;
        sfMatched = matched;
        for (const lp of lps) {
          const sf = byName[lp.investor.toLowerCase().trim()];
          if (!sf) continue;
          lp.sfCrmId = sf.crmId;
          lp.sfLpType = sf.lpType;
          lp.sfCalled = sf.called;
          lp.sfDistributions = sf.distributions;
          lp.sfBrokerCompany = sf.brokerCompany;
          lp.sfBrokerContact = sf.brokerContact;
          lp.sfAdvisorFirm = sf.advisorFirm;
          lp.sfAdvisorContact = sf.advisorContact;
          lp.sfStage = sf.stage;
          if (!lp.resolvedEmail && sf.contactEmail) lp.resolvedEmail = sf.contactEmail;
          const emails = [sf.contactEmail, sf.advisorEmail, lp.email]
            .map((e) => (e || "").toLowerCase().trim())
            .filter(Boolean);
          if (emails.length) lpEmails.set(lp, Array.from(new Set(emails)));
        }
        // DST/1031 investors live in Salesforce (with a broker/advisor) but are NOT in the Fund IV
        // commitment schedule — append them as their own rows so their broker data shows here too.
        dstCount = dstInvestors.length;
        for (const d of dstInvestors) {
          lps.push({
            investor: d.investor,
            commitment: d.commitment,
            commitmentUsd: d.commitmentUsd,
            commitType: "",
            contact: d.directContact || "", email: d.directEmail || "", phone: "",
            date: "", notes: "",
            group: "DST / 1031",
            lastInteraction: null,
            sfStage: d.stage,
            sfLpType: d.stage, sfCalled: null, sfDistributions: null, sfCrmId: d.crmId,
            sfBrokerCompany: null, sfBrokerContact: null,
            sfAdvisorFirm: d.advisorFirm, sfAdvisorContact: d.advisorContact,
            brokerFirm: "", brokerContact: "",
            // Prefer the investor's OWN email; fall back to the broker/advisor rep's email so the
            // Email button still works (you're then reaching the investor via their broker).
            resolvedEmail: d.directEmail || d.advisorEmail || null,
          });
        }
      } catch (e) {
        sfError = String(e).slice(0, 200);
      }
    }

    // Last Interaction: most-recent email in the IR mailboxes with the LP. Two signals:
    //  • EMAIL — the LP's direct/broker email; NOT de-conflicted (a broker email legitimately maps
    //    to every LP that broker represents).
    //  • NAME — entity-name token overlap (≥2 significant tokens) or an exact contact/rep name;
    //    DE-CONFLICTED so each email goes to its single best-matching LP (entity match beats a bare
    //    contact match). This is what sends e.g. a "Diane Brown" email to the Brown trust that bears
    //    her name rather than an unrelated trust she merely administers.
    type Interaction = import("@/lib/agents/ir/mailbox-interactions").Interaction;
    try {
      const { byEmail, byName } = await interactionsPromise;
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
      const STOP = new Set(["the", "and", "of", "for", "trust", "trustee", "trustees", "family", "revocable", "irrevocable", "living", "dated", "estate", "llc", "lp", "llp", "inc", "co", "company", "corp", "corporation", "partnership", "partners", "fund", "funds", "properties", "property", "associates", "holdings", "group", "investments", "investment", "capital", "ira", "fbo", "custodian", "roth", "sep", "account"]);
      const toks = (s: string) => new Set(norm(s).split(" ").filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w)));
      const keyOf = (it: Interaction) => `${it.date}|${(it.counterpartyEmail || it.counterparty || "").toLowerCase()}|${it.subject}`;
      const newer = (a: Interaction, b: Interaction) => new Date(a.date).getTime() > new Date(b.date).getTime();

      // Unique interactions + precomputed counterparty tokens.
      const uniq = new Map<string, { key: string; it: Interaction; toks: Set<string>; cpNorm: string }>();
      for (const it of [...Object.values(byEmail), ...Object.values(byName)]) {
        const key = keyOf(it);
        if (!uniq.has(key)) uniq.set(key, { key, it, toks: toks(it.counterparty || ""), cpNorm: norm(it.counterparty || "") });
      }
      const interactions = [...uniq.values()];

      const emailsFor = (lp: LpRecord) => new Set([
        ...(lpEmails.get(lp) ?? []),
        (lp.email || "").toLowerCase().trim(),
        (lp.resolvedEmail || "").toLowerCase().trim(),
      ].filter(Boolean));

      // 1) EMAIL matches (per LP; not de-conflicted).
      const emailBest = new Map<number, Interaction>();
      lps.forEach((lp, idx) => {
        for (const e of emailsFor(lp)) {
          const it = byEmail[e];
          if (it) { const ex = emailBest.get(idx); if (!ex || newer(it, ex)) emailBest.set(idx, it); }
        }
      });

      // 2) NAME matches (de-conflicted): each interaction → its single best LP.
      const claim = new Map<string, { idx: number; score: number }>();
      lps.forEach((lp, idx) => {
        const entToks = toks(lp.investor || "");
        const contactNorms = [lp.contact, lp.sfBrokerContact].map((n) => norm(n || "")).filter((n) => n.split(" ").length >= 2);
        for (const rec of interactions) {
          let strength = 0, shared = 0, maxLen = 0;
          for (const t of rec.toks) if (entToks.has(t)) { shared++; if (t.length > maxLen) maxLen = t.length; }
          if (shared >= 2 && maxLen >= 4) strength = 2;              // entity-name overlap
          else if (contactNorms.includes(rec.cpNorm)) strength = 1;  // exact contact/rep name
          if (!strength) continue;
          const score = strength * 100 + shared;
          const cur = claim.get(rec.key);
          if (!cur || score > cur.score) claim.set(rec.key, { idx, score });
        }
      });
      const nameBest = new Map<number, Interaction>();
      for (const rec of interactions) {
        const c = claim.get(rec.key);
        if (!c) continue;
        const ex = nameBest.get(c.idx);
        if (!ex || newer(rec.it, ex)) nameBest.set(c.idx, rec.it);
      }

      // 3) Combine — most recent of the LP's email match and its won name match; override IR-log if newer.
      const laLog: string[] = [];
      lps.forEach((lp, idx) => {
        const cands = [emailBest.get(idx), nameBest.get(idx)].filter(Boolean) as Interaction[];
        let best: Interaction | null = null;
        for (const c of cands) if (!best || newer(c, best)) best = c;
        const curMs = lp.lastInteraction ? new Date(lp.lastInteraction.date).getTime() : 0;
        if (best && new Date(best.date).getTime() > curMs) {
          const dir = best.direction === "sent" ? "Sent to" : "From";
          const who = best.counterparty ? ` ${best.counterparty}` : "";
          const subj = best.subject ? ` · ${best.subject}` : "";
          const prev = best.preview ? ` — ${best.preview.slice(0, 140)}` : "";
          lp.lastInteraction = { date: best.date, note: `${dir}${who}${subj}${prev} (${best.mailbox})`, source: "email" };
          if (!lp.resolvedEmail && best.counterpartyEmail) lp.resolvedEmail = best.counterpartyEmail;
          if (laLog.length < 15) laLog.push(`${lp.investor} <= ${best.direction} ${best.counterparty}`);
        }
      });
      console.log("[lp-lastint]", JSON.stringify({ withInt: lps.filter((l) => l.lastInteraction).length, samples: laLog }).slice(0, 1800));
    } catch { /* non-fatal: mailbox scan unavailable leaves lastInteraction as-is */ }

    // Committed amounts (portal-stored). Blank for uncommitted Fund IV targets; DST/1031 rows are
    // closed deals so their commitment IS the committed amount.
    try {
      const { data: committedRows } = await supabase.from("lp_committed").select("investor_key, committed_usd");
      const committedMap = new Map<string, number>();
      for (const r of (committedRows ?? []) as { investor_key: string; committed_usd: number }[]) {
        committedMap.set(r.investor_key, Number(r.committed_usd));
      }
      for (const lp of lps) {
        const override = committedMap.get(lp.investor.toLowerCase().trim());
        lp.committedUsd = override != null ? override : (lp.group === "DST / 1031" && lp.commitmentUsd > 0 ? lp.commitmentUsd : null);
      }
    } catch { /* non-fatal: no committed overlay */ }

    // Collect ordered unique groups (preserves sheet order)
    const groups: string[] = [];
    for (const lp of lps) {
      if (!groups.includes(lp.group)) groups.push(lp.group);
    }

    console.log("[lp-broker-result]", JSON.stringify({
      sfMatched, sfError,
      withBroker: lps.filter((l) => l.sfBrokerCompany || l.sfBrokerContact).length,
      samples: lps.filter((l) => l.sfBrokerCompany || l.sfBrokerContact).slice(0, 5).map((l) => ({ n: l.investor, f: l.sfBrokerCompany, c: l.sfBrokerContact })),
    }));
    const payload = {
      lps, lpCount: lps.length,
      totalCommittedUsd: lps.filter((lp) => lp.group !== "DST / 1031").reduce((s, lp) => s + lp.commitmentUsd, 0),
      dstCount,
      groups,
      scheduleName: scheduleInfo.name,
      webUrl: scheduleInfo.webUrl,
      syncedAt: new Date().toISOString(),
      sfConfigured: salesforceConfigured(),
      sfMatched,
      sfFieldMap,
      sfError,
    };
    await writeLpCache(supabase, payload);
    return NextResponse.json(payload);
  } catch (err) {
    // Refresh failed (e.g. scan timed out) — fall back to the last good snapshot so the
    // directory (and its broker/last-interaction columns) never goes blank.
    const cached = await readLpCache(supabase);
    if (cached) {
      return NextResponse.json({ ...cached.data, cachedAt: cached.updated_at, fromCache: true, refreshError: String(err).slice(0, 300) });
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: LpUpdateBody = await req.json();
  if (!body.investor) return NextResponse.json({ error: "investor is required" }, { status: 400 });

  // Salesforce is the system of record for LP edits — we deliberately do NOT write back to the
  // SharePoint commitment schedule. Update the cached snapshot in place so the edit shows
  // immediately, then push it to Salesforce.
  let contactName = (body.contact ?? "").trim();
  try {
    const cached = await readLpCache(supabase);
    const data = cached?.data as ({ lps?: LpRecord[] } & Record<string, unknown>) | undefined;
    const target = data?.lps?.find((l) => l.investor.trim().toLowerCase() === body.investor.trim().toLowerCase());
    if (data && target) {
      if (!contactName) contactName = (target.contact || "").trim();
      if (body.commitment   !== undefined) { target.commitment = body.commitment; target.commitmentUsd = parseDollar(body.commitment); }
      if (body.commitType   !== undefined) target.commitType   = body.commitType;
      if (body.contact      !== undefined) target.contact      = body.contact;
      if (body.email        !== undefined) target.email        = body.email;
      if (body.phone        !== undefined) target.phone        = body.phone;
      if (body.notes        !== undefined) target.notes        = body.notes;
      if (body.date         !== undefined) target.date         = body.date;
      if (body.brokerFirm   !== undefined) target.brokerFirm   = body.brokerFirm;
      if (body.brokerContact!== undefined) target.brokerContact= body.brokerContact;
      if (body.committed    !== undefined) target.committedUsd  = body.committed.trim() ? parseDollar(body.committed) : null;
      if (body.stage        !== undefined) target.sfStage       = body.stage || null;
      await writeLpCache(supabase, data);
    }
  } catch { /* cache update is best-effort */ }

  // Persist the committed amount in the durable store (survives the weekly rebuild).
  if (body.committed !== undefined) {
    const key = body.investor.trim().toLowerCase();
    const usd = body.committed.trim() ? parseDollar(body.committed) : 0;
    try {
      if (usd > 0) {
        await supabase.from("lp_committed").upsert(
          { investor_key: key, investor: body.investor.trim(), committed_usd: usd, updated_by: user.email ?? user.id, updated_at: new Date().toISOString() },
          { onConflict: "investor_key" }
        );
      } else {
        await supabase.from("lp_committed").delete().eq("investor_key", key);
      }
    } catch { /* non-fatal */ }
  }

  // Write the edit to Salesforce (non-fatal; per-field report returned).
  let salesforce: SfWriteResult[] = [];
  try {
    salesforce = await applyLpEditToSalesforce({
      investor: body.investor,
      contact: contactName,
      edits: {
        email: body.email,
        phone: body.phone,
        notes: body.notes,
        commitmentUsd: body.commitment !== undefined ? parseDollar(body.commitment) : undefined,
        committedUsd: body.committed !== undefined && body.committed.trim() ? parseDollar(body.committed) : undefined,
        stage: body.stage,
        brokerFirm: body.brokerFirm,
        brokerContact: body.brokerContact,
      },
    });
  } catch (e) { salesforce = [{ field: "salesforce", status: "error", detail: String(e).slice(0, 200) }]; }

  return NextResponse.json({ success: true, investor: body.investor, salesforce });
}
