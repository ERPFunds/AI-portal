/**
 * Shared utilities for reading from and writing to SharePoint Excel files
 * via the Microsoft Graph workbook API.
 *
 * All three deal-pipeline files live in the same SharePoint library folder:
 *   ERP Deal Pipelines/
 *
 * Filenames are set as constants below (update if files are renamed).
 */

import { getGraphToken } from "@/lib/agents/graph-token";

// ── File name constants ────────────────────────────────────────────────────────
export const EXCEL_FILES = {
  permianPipeline: "ERP Permian Pipeline & Market Analysis (v.10.28.25).xlsx",
  brevardPipeline: "ERP Brevard Pipeline & Comp Summary (7.16.20).xlsx",
  buyerList: "Buyer List for Portfolio Exit.xlsx",
} as const;

export const EXCEL_FOLDER = "ERP Deal Pipelines";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExcelReadResult {
  headers: string[];
  rows: string[][];
  /** Convenience: rows as objects keyed by header */
  records: Record<string, string>[];
}

export interface ExcelAppendResult {
  success: boolean;
  message: string;
  webUrl?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert a 0-based column index to an Excel column letter (0 → A, 25 → Z, 26 → AA …) */
function colLetter(index: number): string {
  let result = "";
  let n = index;
  while (n >= 0) {
    result = String.fromCharCode((n % 26) + 65) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

/** Returns the Graph API base URL for a specific file in the SharePoint site drive */
function fileBaseUrl(siteId: string, itemId: string): string {
  return `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${itemId}/workbook`;
}

// ── Core API calls ─────────────────────────────────────────────────────────────

/**
 * Fetch all worksheet names sorted by position.
 */
export async function listWorksheetNames(
  token: string,
  siteId: string,
  itemId: string
): Promise<string[]> {
  const url = `${fileBaseUrl(siteId, itemId)}/worksheets?$select=id,name,position`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return [];
  const data = await res.json();
  const sheets: Array<{ id: string; name: string; position: number }> = data.value ?? [];
  sheets.sort((a, b) => a.position - b.position);
  return sheets.map((s) => s.name);
}

/**
 * Returns the URL-encoded worksheet id for the sheet at the given 0-based index.
 * Falls back to "Sheet1" if enumeration fails.
 */
async function getWorksheetId(
  token: string,
  siteId: string,
  itemId: string,
  worksheetIndex = 0
): Promise<string> {
  const url = `${fileBaseUrl(siteId, itemId)}/worksheets?$select=id,name,position`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return "Sheet1";
  const data = await res.json();
  const sheets: Array<{ id: string; name: string; position: number }> = data.value ?? [];
  if (sheets.length === 0) return "Sheet1";
  sheets.sort((a, b) => a.position - b.position);
  const sheet = sheets[worksheetIndex] ?? sheets[0];
  return encodeURIComponent(sheet.name);
}

/** @deprecated use getWorksheetId(…, 0) */
async function getFirstWorksheetId(
  token: string,
  siteId: string,
  itemId: string
): Promise<string> {
  return getWorksheetId(token, siteId, itemId, 0);
}

/**
 * Look up a file's item ID (and webUrl) by folder + filename.
 * Returns null if the file is not found.
 */
export async function getExcelItemId(
  token: string,
  siteId: string,
  filename: string,
  folder: string = EXCEL_FOLDER
): Promise<{ itemId: string; webUrl: string } | null> {
  const encodedPath = folder
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  const encodedFile = encodeURIComponent(filename);
  const url = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodedPath}/${encodedFile}`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;

  const data = await res.json();
  return { itemId: data.id, webUrl: data.webUrl ?? "" };
}

/**
 * Read all used rows from the specified worksheet (0-based index, default 0).
 * Returns headers (row 0) and data rows separately.
 */
export async function readExcelRows(
  token: string,
  siteId: string,
  itemId: string,
  worksheetIndex = 0
): Promise<ExcelReadResult> {
  const sheetId = await getWorksheetId(token, siteId, itemId, worksheetIndex);
  const url = `${fileBaseUrl(siteId, itemId)}/worksheets/${sheetId}/usedRange`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  const rangeData = res.ok ? await res.json() : { values: [] };

  const values: string[][] = (rangeData.values ?? []).map((row: unknown[]) =>
    row.map((cell) => String(cell ?? ""))
  );

  if (values.length === 0) return { headers: [], rows: [], records: [] };

  // Find the actual header row: skip title/blank rows (fewer than 3 non-empty cells)
  // and use the first row that looks like real column headers (≥ 3 non-empty cells).
  // This handles spreadsheets with title blocks at the top (e.g. Commitment Schedule,
  // Permian Pipeline) without breaking simple single-header sheets.
  const MIN_HEADER_COLS = 3;
  let headerIdx = 0;
  for (let i = 0; i < Math.min(values.length, 12); i++) {
    const nonEmpty = values[i].filter((c) => c.trim() !== "").length;
    if (nonEmpty >= MIN_HEADER_COLS) {
      headerIdx = i;
      break;
    }
  }

  // Trim trailing empty columns from the header row to avoid phantom-cell inflation
  const rawHeaderRow = values[headerIdx];
  let lastNonEmpty = 0;
  rawHeaderRow.forEach((h, i) => { if (h.trim()) lastNonEmpty = i; });
  const headers = rawHeaderRow.slice(0, lastNonEmpty + 1);

  const rows = values
    .slice(headerIdx + 1)
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => r.slice(0, headers.length)); // trim data rows to header width

  const records = rows.map((row) =>
    Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ""]))
  );

  return { headers, rows, records };
}

/**
 * Append one or more rows to the specified worksheet (0-based index, default 0).
 * Rows must match the column count of the existing data.
 */
export async function appendExcelRows(
  token: string,
  siteId: string,
  itemId: string,
  newRows: (string | number)[][],
  worksheetIndex = 0
): Promise<ExcelAppendResult> {
  // 1. Get current used range to find dimensions
  const sheetId = await getWorksheetId(token, siteId, itemId, worksheetIndex);
  const usedUrl = `${fileBaseUrl(siteId, itemId)}/worksheets/${sheetId}/usedRange`;
  const usedRes = await fetch(usedUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!usedRes.ok) {
    return { success: false, message: `Could not read used range: ${await usedRes.text()}` };
  }
  const usedData = await usedRes.json();
  const existingRowCount: number = usedData.rowCount ?? 1;
  const existingColCount: number = usedData.columnCount ?? newRows[0]?.length ?? 1;

  // 2. Open a persistent session
  const sessionRes = await fetch(`${fileBaseUrl(siteId, itemId)}/createSession`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ persistChanges: true }),
  });
  if (!sessionRes.ok) {
    return { success: false, message: `Could not open Excel session: ${await sessionRes.text()}` };
  }
  const { id: sessionId } = await sessionRes.json();

  const closeSession = () =>
    fetch(`${fileBaseUrl(siteId, itemId)}/closeSession`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "workbook-session-id": sessionId },
    }).catch(() => {});

  // 3. Calculate the address range for the new rows
  const firstNewRow = existingRowCount + 1; // 1-based
  const lastNewRow = firstNewRow + newRows.length - 1;
  // Use the column count from the data being written, NOT from the usedRange.
  // usedRange.columnCount can be inflated by phantom cells from previous bad writes.
  const colCount = newRows[0]?.length ?? existingColCount;
  const lastCol = colLetter(colCount - 1);
  const rangeAddress = `A${firstNewRow}:${lastCol}${lastNewRow}`;

  // Pad / trim each row to match column count
  const paddedRows = newRows.map((row) => {
    const padded = [...row.map(String)];
    while (padded.length < colCount) padded.push("");
    return padded.slice(0, colCount);
  });

  // 4. PATCH the range
  const patchRes = await fetch(
    `${fileBaseUrl(siteId, itemId)}/worksheets/${sheetId}/range(address='${rangeAddress}')`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "workbook-session-id": sessionId,
      },
      body: JSON.stringify({ values: paddedRows }),
    }
  );

  await closeSession();

  if (!patchRes.ok) {
    return { success: false, message: `Row write failed: ${await patchRes.text()}` };
  }

  return { success: true, message: `Appended ${newRows.length} row(s) at row ${firstNewRow}` };
}

// ── High-level helper used by workflows ────────────────────────────────────────

/**
 * Full read-or-append operation with auth + site ID handled internally.
 * Pass `mode: "read"` to read rows, `mode: "append"` to add rows.
 */
export async function withExcelFile(
  filename: string,
  mode: "read",
  rows?: undefined,
  worksheetIndex?: number
): Promise<ExcelReadResult & { webUrl: string; error?: string }>;

export async function withExcelFile(
  filename: string,
  mode: "append",
  rows: (string | number)[][],
  worksheetIndex?: number
): Promise<ExcelAppendResult>;

export async function withExcelFile(
  filename: string,
  mode: "read" | "append",
  rows?: (string | number)[][],
  worksheetIndex = 0
): Promise<(ExcelReadResult & { webUrl: string; error?: string }) | ExcelAppendResult> {
  let token: string | null;
  try {
    token = await getGraphToken();
  } catch (err) {
    const msg = `Auth failed: ${String(err)}`;
    return mode === "read"
      ? { headers: [], rows: [], records: [], webUrl: "", error: msg }
      : { success: false, message: msg };
  }

  if (!token) {
    const msg = "SharePoint not configured — AZURE credentials not set.";
    return mode === "read"
      ? { headers: [], rows: [], records: [], webUrl: "", error: msg }
      : { success: false, message: msg };
  }

  const siteId = process.env.SHAREPOINT_SITE_ID;
  if (!siteId) {
    const msg = "SHAREPOINT_SITE_ID not set.";
    return mode === "read"
      ? { headers: [], rows: [], records: [], webUrl: "", error: msg }
      : { success: false, message: msg };
  }

  const fileInfo = await getExcelItemId(token, siteId, filename);
  if (!fileInfo) {
    const msg = `File not found in SharePoint: ${EXCEL_FOLDER}/${filename}`;
    return mode === "read"
      ? { headers: [], rows: [], records: [], webUrl: "", error: msg }
      : { success: false, message: msg };
  }

  if (mode === "read") {
    const result = await readExcelRows(token, siteId, fileInfo.itemId, worksheetIndex);
    return { ...result, webUrl: fileInfo.webUrl };
  } else {
    const appendResult = await appendExcelRows(token, siteId, fileInfo.itemId, rows ?? [], worksheetIndex);
    return { ...appendResult, webUrl: fileInfo.webUrl };
  }
}
