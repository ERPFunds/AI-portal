import Anthropic from "@anthropic-ai/sdk";
import { getGraphToken } from "@/lib/agents/graph-token";
import { withExcelFile, EXCEL_FILES } from "@/lib/agents/excel-utils";
import type { ResearchBundle } from "@/lib/agents/research";

const anthropic = new Anthropic();

interface FundRow {
  date: string;
  fundName: string;
  manager: string;
  assetClass: string;
  geography: string;
  fundSize: string;
  targetIrr: string;
  targetEM: string;
  status: string;
  notes: string;
}

// The Excel file lives at this path in the SharePoint drive root
const XLS_FOLDER = "ERP Funds IV";
const XLS_FILENAME = "Competitive Intel.xlsx";
const TABLE_NAME = "CompetitiveIntel";

async function appendRowsToExcel(
  rows: FundRow[]
): Promise<{ success: boolean; message: string; webUrl?: string }> {
  let token: string | null;
  try {
    token = await getGraphToken();
  } catch (err) {
    return { success: false, message: `Auth failed: ${String(err)}` };
  }

  if (!token) {
    return { success: false, message: "SharePoint not configured — AZURE credentials not set." };
  }

  const siteId = process.env.SHAREPOINT_SITE_ID;
  if (!siteId) {
    return { success: false, message: "SHAREPOINT_SITE_ID not set." };
  }

  // Locate the Excel file
  const fileUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodeURIComponent(XLS_FOLDER)}/${encodeURIComponent(XLS_FILENAME)}`;
  const fileRes = await fetch(fileUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!fileRes.ok) {
    return {
      success: false,
      message: `Excel file not found at "${XLS_FOLDER}/${XLS_FILENAME}". Please create it with a table named "${TABLE_NAME}" and columns: Date, Fund Name, Manager, Asset Class, Geography, Fund Size, Target IRR, Target EM, Status, Notes.`,
    };
  }

  const fileData = await fileRes.json();
  const itemId: string = fileData.id;
  const webUrl: string = fileData.webUrl ?? "";

  // Open a persistent workbook session
  const sessionRes = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${itemId}/workbook/createSession`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ persistChanges: true }),
    }
  );

  if (!sessionRes.ok) {
    return { success: false, message: `Could not open Excel session: ${await sessionRes.text()}` };
  }

  const { id: sessionId } = await sessionRes.json();

  const closeSession = () =>
    fetch(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${itemId}/workbook/closeSession`,
      { method: "POST", headers: { Authorization: `Bearer ${token!}`, "workbook-session-id": sessionId } }
    ).catch(() => {});

  // Append rows to the named table
  const rowValues = rows.map((r) => [
    r.date,
    r.fundName,
    r.manager,
    r.assetClass,
    r.geography,
    r.fundSize,
    r.targetIrr,
    r.targetEM,
    r.status,
    r.notes,
  ]);

  const appendRes = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${itemId}/workbook/tables/${TABLE_NAME}/rows`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "workbook-session-id": sessionId,
      },
      body: JSON.stringify({ values: rowValues }),
    }
  );

  await closeSession();

  if (!appendRes.ok) {
    return { success: false, message: `Row append failed: ${await appendRes.text()}` };
  }

  return {
    success: true,
    message: `Added ${rows.length} row(s) to ${XLS_FILENAME}`,
    webUrl,
  };
}

export async function runCompetitiveIntelXls(params: {
  ask: string;
  projectContext: string;
  research: ResearchBundle | null;
  attachmentContent?: string;
}): Promise<{ summary: string; outputType: string; omContent?: string; xlsUrl?: string }> {
  const { ask, projectContext, research, attachmentContent } = params;

  const contextBlocks = [
    `Request: ${ask}`,
    research?.findings ? `\nResearch findings:\n${research.findings}` : "",
    attachmentContent ? `\nAttachment content:\n${attachmentContent.slice(0, 6000)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  // Extract structured fund rows
  const msg = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `You are a competitive intelligence analyst for ERP Industrials, a Permian Basin industrial CRE fund (Fund IV currently raising).

Extract every distinct competitor fund mentioned in the text below. Return a JSON array — one object per fund. Use today's date (${new Date().toISOString().split("T")[0]}) for "date" if not specified.

${contextBlocks}

Return ONLY a valid JSON array, no prose or markdown:
[
  {
    "date": "YYYY-MM-DD",
    "fundName": "Full fund name",
    "manager": "Firm or manager",
    "assetClass": "e.g. Industrial / IOS / Logistics / Cold Storage",
    "geography": "Market, region, or National",
    "fundSize": "$XB / $XM / unknown",
    "targetIrr": "XX% / unknown",
    "targetEM": "X.Xx / unknown",
    "status": "Raising / Closed / Open-end / unknown",
    "notes": "Key details or source URL"
  }
]

If no fund data is present, return [].`,
      },
    ],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "[]";
  let rows: FundRow[] = [];

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) rows = JSON.parse(jsonMatch[0]);
  } catch {
    /* leave empty */
  }

  if (rows.length === 0) {
    return {
      summary: `No structured fund data found in "${projectContext}". Please include fund name, size, or other details in the email body or attach a source document.`,
      outputType: "error",
    };
  }

  // ── Write to Competitive Intel Excel ─────────────────────────────────────
  const xlsResult = await appendRowsToExcel(rows);

  // ── Also add named fund managers to the Buyer List ────────────────────────
  // Competitor funds with a known manager are also prospective portfolio buyers.
  const namedRows = rows.filter((r) => r.manager && r.manager.toLowerCase() !== "unknown");

  let buyerNote = "";
  if (namedRows.length > 0) {
    // Read existing buyer names to skip duplicates
    const existingData = await withExcelFile(EXCEL_FILES.buyerList, "read");
    const existingNames = new Set(
      existingData.records.map((r) =>
        (r["NAME"] ?? r["name"] ?? "").toLowerCase().trim()
      )
    );

    const newBuyerRows = namedRows
      .filter((r) => !existingNames.has(r.manager.toLowerCase().trim()))
      .map((r) => [
        r.manager,                                              // NAME
        "",                                                     // Contact
        "",                                                     // Email
        "",                                                     // Phone
        "",                                                     // Address
        "",                                                     // WEBSITE
        `Competitive intel — Fund: ${r.fundName}; ${r.assetClass}; ${r.geography}; Size: ${r.fundSize}; IRR: ${r.targetIrr}`,
      ]);

    if (newBuyerRows.length > 0) {
      const buyerResult = await withExcelFile(EXCEL_FILES.buyerList, "append", newBuyerRows);
      buyerNote = buyerResult.success
        ? `\n✅ ${newBuyerRows.length} manager(s) added to Buyer List: ${newBuyerRows.map((r) => r[0]).join(", ")}`
        : `\n⚠️ Buyer List update failed: ${buyerResult.message}`;
    } else {
      buyerNote = `\n📋 All ${namedRows.length} manager(s) already in Buyer List — skipped.`;
    }
  }

  const rowSummary = rows
    .map(
      (r) =>
        `• **${r.fundName}** (${r.manager}) — ${r.fundSize}, IRR: ${r.targetIrr}, EM: ${r.targetEM}, Status: ${r.status}`
    )
    .join("\n");

  const xlsNote = xlsResult.success
    ? `✅ ${xlsResult.message}`
    : `⚠️ Competitive Intel Excel update failed: ${xlsResult.message}`;

  const summary = `Competitive Intel — ${rows.length} fund record(s) logged for "${projectContext}".\n\n${rowSummary}\n\n${xlsNote}${buyerNote}`;

  return {
    summary,
    outputType: "competitive-intel",
    omContent: rowSummary,
    xlsUrl: xlsResult.webUrl,
  };
}
