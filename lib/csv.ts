// One CSV writer for every directory export.
//
// The exports all want the same thing — the rows currently on screen, opened in Excel — and
// the logic is fiddly enough (quote escaping, CRLF, the BOM) that having it in four places
// invites four slightly different bugs. Only the columns differ, so only the columns are
// passed in.

/** A column: its header, and how to read it off a row. */
export type CsvColumn<T> = [header: string, read: (row: T) => unknown];

const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/**
 * Build a CSV and hand it to the browser as a download.
 *
 * The leading BOM is load-bearing: without it Excel on Windows reads UTF-8 as the local
 * codepage and mangles every accented name. CRLF line endings for the same reason.
 */
export function downloadCsv<T>(name: string, columns: CsvColumn<T>[], rows: T[]): void {
  const header = columns.map(([h]) => esc(h)).join(",");
  const body = rows.map((r) => columns.map(([, read]) => esc(read(r))).join(","));
  const csv = [header, ...body].join("\r\n");

  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** The shared look for the "Export to Excel" button, so all four read as the same control. */
export const exportBtnCss = {
  border: "1px solid #d1d5db", background: "#fff", borderRadius: 8, padding: "9px 14px",
  fontWeight: 600, fontSize: 13.5, color: "#374151", whiteSpace: "nowrap",
} as const;
