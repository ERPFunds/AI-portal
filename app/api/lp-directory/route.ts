import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGraphToken } from "@/lib/agents/graph-token";
import { readExcelRows } from "@/lib/agents/excel-utils";
import { findCommitmentSchedule } from "@/lib/agents/sharepoint-files";

export const dynamic = "force-dynamic";

export interface LpRecord {
  investor: string;
  commitment: string;      // raw string e.g. "$500K", "$1M", "TBD"
  commitmentUsd: number;   // parsed numeric value in dollars
  commitType: string;      // "Soft Circle" | "Hard Commit" | "Signed Docs" | "Verbal" | "TBD" | ""
  contact: string;
  email: string;
  phone: string;
  date: string;
  notes: string;
  // Salesforce placeholders — populated when SF is connected
  sfLpType: string | null;       // "Institutional" | "Family Office" | "HNWI" | etc.
  sfCalled: number | null;       // capital called in dollars
  sfDistributions: number | null;
  sfCrmId: string | null;
}

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

/** Extract commit type and plain notes from a Notes cell like "Type: Soft Circle | Date: 2026-05-31 | some text" */
function parseNotesCell(raw: string): { commitType: string; date: string; notes: string } {
  const parts = raw.split("|").map(p => p.trim());
  let commitType = "";
  let date = "";
  const plainParts: string[] = [];
  for (const part of parts) {
    if (/^type:/i.test(part)) {
      commitType = part.replace(/^type:\s*/i, "").trim();
    } else if (/^date:/i.test(part)) {
      date = part.replace(/^date:\s*/i, "").trim();
    } else if (part) {
      plainParts.push(part);
    }
  }
  return { commitType, date, notes: plainParts.join(" · ") };
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Locate the commitment schedule file
  const scheduleInfo = await findCommitmentSchedule();
  if (scheduleInfo.error || !scheduleInfo.itemId) {
    return NextResponse.json({ error: scheduleInfo.error ?? "Commitment schedule not found" }, { status: 404 });
  }

  const token = await getGraphToken();
  if (!token) return NextResponse.json({ error: "SharePoint auth failed" }, { status: 500 });

  const siteId = process.env.SHAREPOINT_SITE_ID;
  if (!siteId) return NextResponse.json({ error: "SHAREPOINT_SITE_ID not configured" }, { status: 500 });

  const { headers: rawHeaders, rows: rawRows } = await readExcelRows(token, siteId, scheduleInfo.itemId);

  // The commitment schedule has title rows before the real headers.
  // Find the row containing "Investor".
  const allRows = [rawHeaders, ...rawRows];
  const headerRowIdx = allRows.findIndex(row =>
    row.some(cell => /^investor$/i.test(cell.trim()))
  );

  let headers: string[];
  let dataRows: string[][];
  if (headerRowIdx >= 0) {
    const raw = allRows[headerRowIdx];
    let lastNonEmpty = 0;
    raw.forEach((h, i) => { if (h.trim()) lastNonEmpty = i; });
    headers = raw.slice(0, lastNonEmpty + 1);
    dataRows = allRows.slice(headerRowIdx + 1).filter(r => r.some(c => c.trim()));
  } else {
    headers = rawHeaders;
    dataRows = rawRows;
  }

  // Map header names to indices (case-insensitive)
  const hLower = headers.map(h => h.toLowerCase().trim());
  const idx = (pat: RegExp) => hLower.findIndex(h => h && pat.test(h));

  const iInvestor   = idx(/investor|lp\s*name|^name$/);
  const iCommitment = idx(/commitment|amount|total/);
  const iContact    = idx(/contact|primary/);
  const iEmail      = idx(/email/);
  const iPhone      = idx(/phone/);
  const iAddress    = idx(/address/);
  const iNotes      = idx(/notes|comment/);

  const records = dataRows.map(row =>
    Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ""]))
  );

  const lps: LpRecord[] = records
    .map(r => {
      const investor   = (iInvestor   >= 0 ? r[headers[iInvestor]]   : "") ?? "";
      const commitment = (iCommitment >= 0 ? r[headers[iCommitment]] : "") ?? "";
      const contact    = (iContact    >= 0 ? r[headers[iContact]]    : "") ?? "";
      const email      = (iEmail      >= 0 ? r[headers[iEmail]]      : "") ?? "";
      const phone      = (iPhone      >= 0 ? r[headers[iPhone]]      : "") ?? "";
      const notesRaw   = (iNotes      >= 0 ? r[headers[iNotes]]      : "") ?? "";

      const { commitType, date, notes } = parseNotesCell(notesRaw);

      return {
        investor: investor.trim(),
        commitment: commitment.trim(),
        commitmentUsd: parseDollar(commitment),
        commitType,
        contact: contact.trim(),
        email: email.trim(),
        phone: phone.trim(),
        date,
        notes,
        // Salesforce fields — null until connected
        sfLpType: null,
        sfCalled: null,
        sfDistributions: null,
        sfCrmId: null,
      } satisfies LpRecord;
    })
    .filter(lp => lp.investor.length > 0);

  const totalCommittedUsd = lps.reduce((s, lp) => s + lp.commitmentUsd, 0);

  return NextResponse.json({
    lps,
    lpCount: lps.length,
    totalCommittedUsd,
    scheduleName: scheduleInfo.name,
    webUrl: scheduleInfo.webUrl,
    syncedAt: new Date().toISOString(),
  });
}
