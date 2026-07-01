import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGraphToken } from "@/lib/agents/graph-token";
import { readExcelRows, listWorksheetNames } from "@/lib/agents/excel-utils";
import { findCommitmentSchedule } from "@/lib/agents/sharepoint-files";
import { getLpLastInteractions } from "@/lib/db";
import { salesforceConfigured, fetchLpSalesforceData, type LpSfFieldMap } from "@/lib/agents/ir/salesforce";
import { getInteractions } from "@/lib/agents/ir/mailbox-interactions";

export const dynamic = "force-dynamic";

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

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

    // Enrich with Salesforce (LP Type / Called / Distributions / CRM Id), matched by email.
    // Non-fatal: any SF failure leaves the columns null, exactly as before.
    let sfFieldMap: LpSfFieldMap | null = null;
    let sfMatched = 0;
    let sfError: string | null = null;
    const lpEmails = new Map<LpRecord, string[]>();
    if (salesforceConfigured()) {
      try {
        const { byName, fieldMap, matched } = await fetchLpSalesforceData(lps.map((lp) => ({ investor: lp.investor, contact: lp.contact })));
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
          const emails = [sf.contactEmail, sf.advisorEmail, lp.email]
            .map((e) => (e || "").toLowerCase().trim())
            .filter(Boolean);
          if (emails.length) lpEmails.set(lp, Array.from(new Set(emails)));
        }
      } catch (e) {
        sfError = String(e).slice(0, 200);
      }
    }

    // Last Interaction: most recent email in the IR mailboxes (mberry/wmeyer/team) with the LP.
    // SF Contact.Email is empty for these LPs, so we match by the LP's REAL primary-contact name
    // (the schedule contact + the SF primary contact) against the sender/recipient display names.
    // We deliberately do NOT match on the entity/trust name or the fuzzy broker rep — those
    // cross-attributed unrelated people (e.g. a shared first name). Overrides IR-log when newer.
    type Interaction = import("@/lib/agents/ir/mailbox-interactions").Interaction;
    try {
      const { byEmail, byName } = await getInteractions();
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
      const isFullName = (n: string) => n.split(" ").filter((w) => w.length >= 2).length >= 2;
      const laLog: string[] = [];
      for (const lp of lps) {
        const emails = lpEmails.get(lp) ?? ([lp.email?.toLowerCase().trim()].filter(Boolean) as string[]);
        const names = [lp.contact, lp.sfBrokerContact].map((n) => norm(n || "")).filter(isFullName);
        let best: Interaction | null = null;
        let via = "";
        const consider = (it: Interaction | undefined, tag: string) => {
          if (it && (!best || new Date(it.date).getTime() > new Date(best.date).getTime())) { best = it; via = tag; }
        };
        for (const e of emails) consider(byEmail[e], "email");
        for (const n of new Set(names)) consider(byName[n], n);
        if (best && (!lp.lastInteraction || new Date((best as Interaction).date).getTime() > new Date(lp.lastInteraction.date).getTime())) {
          const b = best as Interaction;
          const dir = b.direction === "sent" ? "Sent to" : "From";
          const who = b.counterparty ? ` ${b.counterparty}` : "";
          const subj = b.subject ? ` · ${b.subject}` : "";
          const prev = b.preview ? ` — ${b.preview.slice(0, 140)}` : "";
          lp.lastInteraction = { date: b.date, note: `${dir}${who}${subj}${prev} (${b.mailbox})`, source: "email" };
          if (laLog.length < 15) laLog.push(`${lp.investor} <=[${via}]= ${b.direction} ${b.counterparty}`);
        }
      }
      console.log("[lp-lastint]", JSON.stringify({ samples: laLog }).slice(0, 1800));
    } catch { /* non-fatal: mailbox scan unavailable leaves lastInteraction as-is */ }

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
    return NextResponse.json({
      lps, lpCount: lps.length,
      totalCommittedUsd: lps.reduce((s, lp) => s + lp.commitmentUsd, 0),
      groups,
      scheduleName: scheduleInfo.name,
      webUrl: scheduleInfo.webUrl,
      syncedAt: new Date().toISOString(),
      sfConfigured: salesforceConfigured(),
      sfMatched,
      sfFieldMap,
      sfError,
    });
  } catch (err) {
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

  try {
    const { scheduleInfo, token, siteId } = await getScheduleContext();
    const base = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${scheduleInfo.itemId}/workbook`;

    // Get first worksheet id
    const sheetNames = await listWorksheetNames(token, siteId, scheduleInfo.itemId);
    const sheetId = encodeURIComponent(sheetNames[0] ?? "Sheet1");

    // Read raw usedRange (we need the address to compute absolute Excel row numbers)
    const usedRes = await fetch(`${base}/worksheets/${sheetId}/usedRange`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!usedRes.ok) throw new Error(`Could not read usedRange: ${await usedRes.text()}`);
    const usedData = await usedRes.json();

    const values: string[][] = (usedData.values ?? []).map((row: unknown[]) =>
      row.map(c => String(c ?? ""))
    );

    // Parse start row from address like "Sheet1!A2:K30" → 2
    const address: string = usedData.address ?? "";
    const startRow = parseInt(address.match(/[A-Z]+(\d+):/)?.[1] ?? "1");

    const { headerRowIdx, headers, iInvestor, iCommitment, iContact, iEmail, iPhone, iNotes } =
      parseHeaders(values);

    // Find the investor's row within data rows
    const dataValues = values.slice(headerRowIdx + 1);
    const rowIdx = dataValues.findIndex(row =>
      String(row[iInvestor] ?? "").trim().toLowerCase() === body.investor.trim().toLowerCase()
    );
    if (rowIdx === -1)
      return NextResponse.json({ error: `LP "${body.investor}" not found in schedule` }, { status: 404 });

    // Build the updated row (copy current, patch changed fields)
    const currentRow = dataValues[rowIdx].slice();
    while (currentRow.length < headers.length) currentRow.push("");

    if (iCommitment >= 0 && body.commitment !== undefined) currentRow[iCommitment] = body.commitment;
    if (iContact    >= 0 && body.contact    !== undefined) currentRow[iContact]    = body.contact;
    if (iEmail      >= 0 && body.email      !== undefined) currentRow[iEmail]      = body.email;
    if (iPhone      >= 0 && body.phone      !== undefined) currentRow[iPhone]      = body.phone;
    if (iNotes >= 0) {
      const current = parseNotesCell(dataValues[rowIdx][iNotes] ?? "");
      currentRow[iNotes] = packNotesCell(
        body.commitType    ?? current.commitType,
        body.date          ?? current.date,
        body.brokerFirm    ?? current.brokerFirm,
        body.brokerContact ?? current.brokerContact,
        body.notes         ?? current.notes,
      );
    }

    // Open workbook session
    const sessionRes = await fetch(`${base}/createSession`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ persistChanges: true }),
    });
    if (!sessionRes.ok) throw new Error(`Session open failed: ${await sessionRes.text()}`);
    const { id: sessionId } = await sessionRes.json();
    const closeSession = () =>
      fetch(`${base}/closeSession`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "workbook-session-id": sessionId },
      }).catch(() => {});

    // Calculate the exact Excel row number and PATCH it
    const excelRow = startRow + headerRowIdx + 1 + rowIdx;
    const lastCol = colLetter(headers.length - 1);
    const rangeAddr = `A${excelRow}:${lastCol}${excelRow}`;

    const patchRes = await fetch(
      `${base}/worksheets/${sheetId}/range(address='${rangeAddr}')`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "workbook-session-id": sessionId,
        },
        body: JSON.stringify({ values: [currentRow.slice(0, headers.length)] }),
      }
    );

    await closeSession();

    if (!patchRes.ok) throw new Error(`Excel write failed: ${await patchRes.text()}`);

    return NextResponse.json({ success: true, investor: body.investor, excelRow });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
