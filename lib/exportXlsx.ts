// Client-side Excel export. SheetJS is dynamically imported so it only loads when a user
// actually clicks Export, keeping it out of the initial page bundle.
export async function downloadXlsx(
  sheets: { name: string; rows: Record<string, unknown>[] }[],
  filename: string,
) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{}])
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31)) // Excel sheet names cap at 31 chars
  }
  XLSX.writeFile(wb, filename)
}

// Build ordered {Header: value} rows from raw records using a [key, Header] column map.
export function shapeRows(
  rows: Record<string, unknown>[],
  cols: [string, string][],
): Record<string, unknown>[] {
  return rows.map((r) => Object.fromEntries(cols.map(([k, h]) => [h, r[k] ?? ''])))
}
