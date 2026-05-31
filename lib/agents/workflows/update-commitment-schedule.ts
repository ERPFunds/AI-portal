import Anthropic from "@anthropic-ai/sdk";
import { getGraphToken } from "@/lib/agents/graph-token";
import { readExcelRows, appendExcelRows } from "@/lib/agents/excel-utils";
import { findCommitmentSchedule } from "@/lib/agents/sharepoint-files";

const anthropic = new Anthropic();

// ── Types ─────────────────────────────────────────────────────────────────────

interface CommitmentEntry {
  investor: string;       // LP / investor legal name
  commitment: string;     // "$500K", "$1M", "TBD"
  type: string;           // "Soft circle", "Hard commit", "Signed docs", etc.
  contact: string;        // Contact person name + title
  email: string;
  phone: string;
  address: string;
  date: string;           // Date of commitment (YYYY-MM-DD or readable)
  notes: string;
}

interface CommitmentSummary {
  totalCommitted: number;
  lpCount: number;
  entries: Array<{ investor: string; commitment: string }>;
  headers: string[];
}

// ── Dollar helpers ────────────────────────────────────────────────────────────

function parseDollarAmount(raw: string): number {
  const s = raw.replace(/[$,\s]/g, "").toUpperCase();
  if (!s || s === "TBD" || s === "N/A" || s === "") return 0;
  const num = parseFloat(s.replace(/[MBK]/g, ""));
  if (isNaN(num)) return 0;
  if (s.endsWith("B")) return num * 1_000_000_000;
  if (s.endsWith("M")) return num * 1_000_000;
  if (s.endsWith("K")) return num * 1_000;
  return num;
}

function formatDollars(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

// ── Read current commitments ──────────────────────────────────────────────────

async function readCurrentCommitments(
  token: string,
  siteId: string,
  itemId: string
): Promise<CommitmentSummary> {
  try {
    const { headers: rawHeaders, rows: rawRows } = await readExcelRows(token, siteId, itemId);

    // The commitment schedule has title rows at the top (company name, subtitle, etc.)
    // before the real column headers. Find the actual header row by looking for "Investor".
    const allRows = [rawHeaders, ...rawRows];
    const headerRowIdx = allRows.findIndex((row) =>
      row.some((cell) => /^investor$/i.test(cell.trim()))
    );

    let actualHeaders: string[];
    let dataRows: string[][];

    if (headerRowIdx >= 0) {
      // Trim trailing empty columns so we only work with real columns
      const raw = allRows[headerRowIdx];
      let lastNonEmpty = 0;
      raw.forEach((h, i) => { if (h.trim()) lastNonEmpty = i; });
      actualHeaders = raw.slice(0, lastNonEmpty + 1);
      dataRows = allRows.slice(headerRowIdx + 1);
    } else {
      // No "Investor" header found — fall back to raw (works for simple single-header sheets)
      actualHeaders = rawHeaders;
      dataRows = rawRows;
    }

    // Find the investor and commitment columns by common header names (case-insensitive)
    const investorKey = actualHeaders.find((h) => /investor|lp|name/i.test(h)) ?? "";
    const commitKey = actualHeaders.find((h) => /commitment|amount|total/i.test(h)) ?? "";

    const records = dataRows.map((row) =>
      Object.fromEntries(actualHeaders.map((h, i) => [h, row[i] ?? ""]))
    );

    const entries = records
      .map((r) => ({
        investor: r[investorKey] ?? "",
        commitment: r[commitKey] ?? "",
      }))
      .filter((e) => e.investor.trim() !== "");

    const totalCommitted = entries.reduce(
      (sum, e) => sum + parseDollarAmount(e.commitment),
      0
    );

    return { totalCommitted, lpCount: entries.length, entries, headers: actualHeaders };
  } catch {
    return { totalCommitted: 0, lpCount: 0, entries: [], headers: [] };
  }
}

// ── Web research: find LP contact info ────────────────────────────────────────

async function researchLpContact(investorName: string): Promise<Partial<CommitmentEntry>> {
  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 600,
      tools: [
        {
          type: "web_search_20250305" as "web_search_20250305",
          name: "web_search",
          max_uses: 2,
        } as unknown as Anthropic.Tool,
      ],
      messages: [
        {
          role: "user",
          content: `Search for the investment / LP relations contact at "${investorName}" — a potential limited partner investor. Find: contact person name + title, direct email, phone, and mailing address.

Return ONLY a JSON object, no prose:
{
  "contact": "First Last, Title — or empty string",
  "email": "email@domain.com or empty string",
  "phone": "phone number or empty string",
  "address": "Street, City, State ZIP or empty string"
}`,
        },
      ],
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return Object.fromEntries(
        Object.entries(parsed).filter(([, v]) => typeof v === "string" && (v as string).trim() !== "")
      ) as Partial<CommitmentEntry>;
    }
  } catch (err) {
    console.error(`[commitment-schedule] contact research failed for "${investorName}":`, err);
  }
  return {};
}

// ── Column mapper ─────────────────────────────────────────────────────────────
// (no longer needed — Claude now returns values in column order directly)

// ── Main workflow ─────────────────────────────────────────────────────────────

export async function runUpdateCommitmentSchedule(params: {
  ask: string;
  projectContext: string;
  attachmentContent?: string;
}): Promise<{ summary: string; outputType: string; omContent?: string; xlsUrl?: string }> {
  const { ask, attachmentContent } = params;

  // 1. Find the file
  const scheduleInfo = await findCommitmentSchedule();
  if (scheduleInfo.error || !scheduleInfo.itemId) {
    return {
      summary: `Could not locate the Commitment Schedule: ${scheduleInfo.error ?? "File not found"}`,
      outputType: "error",
    };
  }

  let token: string | null;
  try {
    token = await getGraphToken();
  } catch (err) {
    return { summary: `Auth failed: ${String(err)}`, outputType: "error" };
  }
  if (!token) return { summary: "AZURE credentials not configured.", outputType: "error" };

  const siteId = process.env.SHAREPOINT_SITE_ID!;

  // 2. Read current state + headers
  const current = await readCurrentCommitments(token, siteId, scheduleInfo.itemId);
  const headers = current.headers.length > 0
    ? current.headers
    : ["#", "Investor", "Commitment", "Type", "Contact", "Email", "Phone", "Address", "Date", "Notes"];

  console.log(`[commitment] file="${scheduleInfo.name}" lpCount=${current.lpCount} headers=[${headers.join(", ")}]`);

  const headerStr = `Columns in this file: ${headers.join(" | ")}`;

  // 3. Extract new commitment entries from the request
  const context = [
    `Request: ${ask}`,
    attachmentContent ? `\nAttachment:\n${attachmentContent.slice(0, 4000)}` : "",
    `\nCurrent LP count: ${current.lpCount}, Total committed: ${formatDollars(current.totalCommitted)}`,
    `\n${headerStr}`,
  ]
    .filter(Boolean)
    .join("\n");

  const today = new Date().toISOString().split("T")[0];

  // ── Step 3a: Extract named fields from the request ────────────────────────
  const extractMsg = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `You are tracking LP commitments for ERP Funds IV. Extract every new investor commitment mentioned in the text below.

${context}

For "type" use one of: Soft Circle / Hard Commit / Signed Docs / Verbal / TBD
For "date" use the date mentioned or today's date (${today}) if none given.
If a contact person is explicitly mentioned, include them in "contact". Otherwise leave contact/email/phone/address blank — they will be looked up.

Return ONLY a valid JSON array (no prose):
[
  {
    "investor": "Full legal name",
    "commitment": "$XM or $XK or TBD",
    "type": "Soft Circle / Hard Commit / Signed Docs / Verbal / TBD",
    "contact": "Name + title if mentioned, else empty string",
    "email": "if mentioned, else empty string",
    "phone": "if mentioned, else empty string",
    "address": "if mentioned, else empty string",
    "date": "${today}",
    "notes": "Any additional context"
  }
]

If no new commitment is mentioned, return [].`,
      },
    ],
  });

  const extractText = extractMsg.content[0].type === "text" ? extractMsg.content[0].text : "[]";
  let entries: CommitmentEntry[] = [];
  try {
    // Match array-of-objects pattern to avoid grabbing prose brackets
    const jsonMatch = extractText.match(/(\[\s*\{[\s\S]*\}\s*\])/);
    if (jsonMatch) {
      entries = JSON.parse(jsonMatch[1]);
    } else {
      const flatMatch = extractText.match(/\[[\s\S]*\]/);
      if (flatMatch) entries = JSON.parse(flatMatch[0]);
    }
  } catch { /* leave empty */ }

  console.log(`[commitment] entries extracted: ${entries.length} — ${JSON.stringify(entries.map(e => e.investor))}`);

  if (entries.length === 0) {
    return {
      summary: `No new commitment entries found. Current raise: ${formatDollars(current.totalCommitted)} from ${current.lpCount} LPs.`,
      outputType: "info",
    };
  }

  // 4. Web-research contact info for entries where contact is missing
  const needsResearch = entries.map((e) => !e.contact || e.contact.trim() === "");
  const contactResults = await Promise.all(
    entries.map((e, i) => needsResearch[i] ? researchLpContact(e.investor) : Promise.resolve({}))
  );

  entries = entries.map((e, i) => {
    const r = contactResults[i] as Partial<CommitmentEntry>;
    return {
      ...e,
      contact: r.contact || e.contact || "",
      email: r.email || e.email || "",
      phone: r.phone || e.phone || "",
      address: r.address || e.address || "",
    };
  });

  // 5. Build column-ordered rows in code — deterministic, no LLM mapping needed.
  //    Pattern-match each entry field to the actual column headers we read from the file.
  const hLower = headers.map((h) => h.toLowerCase().trim());
  const colIdx = (pattern: RegExp): number => hLower.findIndex((h) => h && pattern.test(h));

  const iInvestor   = colIdx(/investor|lp\s+name|^name$/i);
  const iContact    = colIdx(/contact|primary\s+contact/i);
  const iCommitment = colIdx(/commitment|total\s+commitment|amount/i);
  const iNotes      = colIdx(/notes|comment/i);
  // Row-number column: look for "#", "no.", or empty header at position 0 when data rows use it
  const iRowNum     = hLower.findIndex((h, i) => i < 2 && /^#$|^no\.?$|^num/i.test(h));

  console.log(`[commitment] column map: investor=${iInvestor} contact=${iContact} commitment=${iCommitment} notes=${iNotes} rowNum=${iRowNum}`);

  let newRows: string[][] = entries.map((e, idx) => {
    const row = new Array(headers.length).fill("");
    if (iRowNum >= 0)      row[iRowNum]      = String(current.lpCount + idx + 1);
    if (iInvestor >= 0)    row[iInvestor]    = e.investor;
    if (iContact >= 0)     row[iContact]     = e.contact || "";
    if (iCommitment >= 0)  row[iCommitment]  = e.commitment;
    if (iNotes >= 0) {
      const parts = [
        e.type   ? `Type: ${e.type}`   : "",
        e.date   ? `Date: ${e.date}`   : "",
        e.notes  || "",
      ].filter(Boolean);
      row[iNotes] = parts.join(" | ");
    }
    return row;
  });

  console.log(`[commitment] writing ${newRows.length} row(s): ${JSON.stringify(newRows)}`);
  const appendResult = await appendExcelRows(token, siteId, scheduleInfo.itemId, newRows);
  console.log(`[commitment] appendResult: success=${appendResult.success} msg="${appendResult.message}"`);

  // 6. Totals
  const newAmount = entries.reduce((sum, e) => sum + parseDollarAmount(e.commitment), 0);
  const newTotal = current.totalCommitted + newAmount;
  const newLpCount = current.lpCount + entries.length;

  const entryList = entries
    .map((e) => {
      const contactLine = e.contact ? ` · ${e.contact}` : "";
      const emailLine = e.email ? ` · ${e.email}` : "";
      const typeLine = e.type ? ` (${e.type})` : "";
      const notesLine = e.notes ? `\n  _${e.notes}_` : "";
      return `• **${e.investor}** — ${e.commitment}${typeLine}${contactLine}${emailLine}${notesLine}`;
    })
    .join("\n");

  const xlsNote = appendResult.success
    ? `✅ Added to ${scheduleInfo.name}`
    : `⚠️ Excel update failed: ${appendResult.message}`;

  const raiseSummary = `**Raise status after update:** ${formatDollars(newTotal)} committed across ${newLpCount} LPs`;

  const summary = `Commitment Schedule updated — ${entries.length} new LP record(s).\n\n${entryList}\n\n${raiseSummary}\n\n${xlsNote}`;

  return {
    summary,
    outputType: "commitment",
    omContent: `${entryList}\n\n${raiseSummary}`,
    xlsUrl: scheduleInfo.webUrl,
  };
}

// ── Read-only summary for deck-builder / lp-ready-summary ────────────────────

export async function readCommitmentStatus(): Promise<{
  totalCommitted: number;
  formattedTotal: string;
  lpCount: number;
  scheduleName: string;
  webUrl: string;
  error?: string;
}> {
  const scheduleInfo = await findCommitmentSchedule();
  if (scheduleInfo.error || !scheduleInfo.itemId) {
    return { totalCommitted: 0, formattedTotal: "unknown", lpCount: 0, scheduleName: "", webUrl: "", error: scheduleInfo.error };
  }

  let token: string | null;
  try {
    token = await getGraphToken();
  } catch (err) {
    return { totalCommitted: 0, formattedTotal: "unknown", lpCount: 0, scheduleName: "", webUrl: "", error: String(err) };
  }
  if (!token) return { totalCommitted: 0, formattedTotal: "unknown", lpCount: 0, scheduleName: "", webUrl: "", error: "No token" };

  const siteId = process.env.SHAREPOINT_SITE_ID!;
  const current = await readCurrentCommitments(token, siteId, scheduleInfo.itemId);

  return {
    totalCommitted: current.totalCommitted,
    formattedTotal: formatDollars(current.totalCommitted),
    lpCount: current.lpCount,
    scheduleName: scheduleInfo.name,
    webUrl: scheduleInfo.webUrl,
  };
}
