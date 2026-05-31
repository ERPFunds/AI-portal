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
  brevardPipeline: "ERP Brevard Pipeline & Market Analysis.xlsx", // update when filename confirmed
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
 * Returns the id of the first worksheet in a workbook.
 * Falls back to the literal name "Sheet1" if enumeration fails.
 */
async function getFirstWorksheetId(
  token: string,
  siteId: string,
  itemId: string
): Promise<string> {
  const url = `${fileBaseUrl(siteId, itemId)}/worksheets?$select=id,name,position`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return "Sheet1";
  const data = await res.json();
  const sheets: Array<{ id: string; name: string; position: number }> = data.value ?? [];
  if (sheets.length === 0) return "Sheet1";
  // Sort by position ascending, take the first
  sheets.sort((a, b) => a.position - b.position);
  // Use the sheet name (cleaner in URLs than the GUID which contains braces)
  return encodeURIComponent(sheets[0].name);
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
 * Read all used rows from the first worksheet.
 * Returns headers (row 0) and data rows separately.
 */
export async function readExcelRows(
  token: string,
  siteId: string,
  itemId: string
): Promise<ExcelReadResult> {
  const sheetId = await getFirstWorksheetId(token, siteId, itemId);
  const url = `${fileBaseUrl(siteId, itemId)}/worksheets/${sheetId}/usedRange`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  const rangeData = res.ok ? await res.json() : { values: [] };

  const values: string[][] = (rangeData.values ?? []).map((row: unknown[]) =>
    row.map((cell) => String(cell ?? ""))
  );

  if (values.length === 0) return { headers: [], rows: [], records: [] };

  const headers = values[0];
  const rows = values.slice(1).filter((r) => r.some((c) => c.trim() !== ""));
  const records = rows.map((row) =>
    Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ""]))
  );

  return { headers, rows, records };
}

/**
 * Append one or more rows to the first worksheet after the last used row.
 * Rows must match the column count of the existing data.
 */
export async function appendExcelRows(
  token: string,
  siteId: string,
  itemId: string,
  newRows: (string | number)[][]
): Promise<ExcelAppendResult> {
  // 1. Get current used range to find dimensions
  const sheetId = await getFirstWorksheetId(token, siteId, itemId);
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
  mode: "read"
): Promise<ExcelReadResult & { webUrl: string; error?: string }>;

export async function withExcelFile(
  filename: string,
  mode: "append",
  rows: (string | number)[][]
): Promise<ExcelAppendResult>;

export async function withExcelFile(
  filename: string,
  mode: "read" | "append",
  rows?: (string | number)[][]
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
    const result = await readExcelRows(token, siteId, fileInfo.itemId);
    return { ...result, webUrl: fileInfo.webUrl };
  } else {
    const appendResult = await appendExcelRows(token, siteId, fileInfo.itemId, rows ?? []);
    return { ...appendResult, webUrl: fileInfo.webUrl };
  }
}
