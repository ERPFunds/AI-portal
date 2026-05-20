/**
 * U.S. Census Bureau API macro fetcher
 * API key: process.env.CENSUS_API_KEY  (free — https://api.census.gov/data/key_signup.html)
 *
 * Endpoints used:
 *   Building Permits Survey (BPS) — monthly, county level
 *   https://api.census.gov/data/timeseries/bps
 *
 *   Population Estimates Program (PEP) — annual
 *   https://api.census.gov/data/2023/pep/population
 *
 * Brevard County, FL FIPS: state=12, county=009
 * Midland County, TX FIPS:  state=48, county=329
 * Ector County, TX FIPS:    state=48, county=135  (Odessa)
 */

import type { FredRow } from "./fred";

const CENSUS_BASE = "https://api.census.gov/data";

// Census API returns arrays: first row = headers, subsequent rows = data
type CensusTable = string[][];

async function fetchCensus(url: string): Promise<CensusTable> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      console.warn(`[census] HTTP ${res.status} — ${url}`);
      return [];
    }
    const data = await res.json() as CensusTable;
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn("[census] fetch error:", err);
    return [];
  }
}

function colIndex(headers: string[], name: string): number {
  return headers.findIndex(h => h.toUpperCase() === name.toUpperCase());
}

function parseNum(v: string | undefined): number | null {
  if (!v || v === "-" || v === "N" || v === "null") return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function delta(cur: number, prev: number): { text: string; dir: "up" | "down" | "neutral" } {
  const d = cur - prev;
  const sign = d > 0 ? "+" : "";
  const dir: "up" | "down" | "neutral" = d > 0 ? "up" : d < 0 ? "down" : "neutral";
  return { text: `${sign}${Math.round(d).toLocaleString()}`, dir };
}

/**
 * Building Permits Survey — last 14 months for a county
 * Returns rows for total permits and total permit value
 */
async function fetchBPS(
  state: string,
  county: string,
  apiKey: string
): Promise<FredRow[]> {
  // Build a range covering the last ~14 months
  const now = new Date();
  const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const startDate = new Date(now.getFullYear() - 1, now.getMonth() - 2, 1);
  const start = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}`;

  const url =
    `${CENSUS_BASE}/timeseries/bps` +
    `?get=NAME,PERMIT,VALUNIT1` +
    `&for=county:${county}` +
    `&in=state:${state}` +
    `&time=from+${start}+to+${end}` +
    `&key=${apiKey}`;

  const table = await fetchCensus(url);
  if (table.length < 3) return []; // need headers + at least 2 data rows

  const headers = table[0];
  const iPermit = colIndex(headers, "PERMIT");
  const iVal    = colIndex(headers, "VALUNIT1");
  const iTime   = colIndex(headers, "time");

  if (iPermit === -1 || iTime === -1) return [];

  // Sort data rows descending by time so [0] = most recent
  const rows = table.slice(1).sort((a, b) => (b[iTime] > a[iTime] ? 1 : -1));
  if (rows.length < 2) return [];

  const results: FredRow[] = [];

  // Total permits
  const curPermit  = parseNum(rows[0]?.[iPermit]);
  const prevPermit = parseNum(rows[1]?.[iPermit]);
  const yagoPermit = parseNum(rows[12]?.[iPermit] ?? rows[rows.length - 1]?.[iPermit]);

  if (curPermit !== null) {
    const mom = prevPermit !== null ? delta(curPermit, prevPermit) : null;
    const yoy = yagoPermit !== null ? delta(curPermit, yagoPermit) : null;
    results.push({
      indicator: "Brevard County building permits",
      latest: Math.round(curPermit).toLocaleString(),
      wow:     mom?.text ?? "—",
      wow_dir: mom?.dir  ?? "neutral",
      yoy:     yoy?.text ?? "—",
      yoy_dir: yoy?.dir  ?? "neutral",
      trend:   mom?.dir  ?? "neutral",
    });
  }

  // Permit value ($000s → $M)
  if (iVal !== -1) {
    const curVal  = parseNum(rows[0]?.[iVal]);
    const prevVal = parseNum(rows[1]?.[iVal]);
    const yagoVal = parseNum(rows[12]?.[iVal] ?? rows[rows.length - 1]?.[iVal]);

    if (curVal !== null) {
      const valM = curVal / 1000; // convert $000s to $M
      const momV = prevVal !== null ? (() => {
        const d = valM - prevVal / 1000;
        return { text: `${d >= 0 ? "+" : ""}$${d.toFixed(1)}M`, dir: (d > 0 ? "up" : d < 0 ? "down" : "neutral") as "up" | "down" | "neutral" };
      })() : null;
      const yoyV = yagoVal !== null ? (() => {
        const d = valM - yagoVal / 1000;
        return { text: `${d >= 0 ? "+" : ""}$${d.toFixed(1)}M`, dir: (d > 0 ? "up" : d < 0 ? "down" : "neutral") as "up" | "down" | "neutral" };
      })() : null;
      results.push({
        indicator: "Brevard permit value",
        latest: `$${valM.toFixed(1)}M`,
        wow:     momV?.text ?? "—",
        wow_dir: momV?.dir  ?? "neutral",
        yoy:     yoyV?.text ?? "—",
        yoy_dir: yoyV?.dir  ?? "neutral",
        trend:   momV?.dir  ?? "neutral",
      });
    }
  }

  return results;
}

/**
 * Population Estimates — most recent vintage vs prior year
 */
async function fetchPopulation(
  state: string,
  county: string,
  countyName: string,
  apiKey: string
): Promise<FredRow | null> {
  // Try the latest available vintage (2023 is the most recent released as of 2026)
  for (const vintage of ["2023", "2022"]) {
    const url =
      `${CENSUS_BASE}/${vintage}/pep/population` +
      `?get=NAME,POP_2022,POP_2021` +
      `&for=county:${county}` +
      `&in=state:${state}` +
      `&key=${apiKey}`;

    const table = await fetchCensus(url);
    if (table.length < 2) continue;

    const headers = table[0];
    const dataRow  = table[1];

    // Try any POP_* columns
    const popCols = headers
      .map((h, i) => ({ h, i }))
      .filter(({ h }) => /^POP_\d{4}$/.test(h))
      .sort((a, b) => b.h.localeCompare(a.h)); // descending year

    if (popCols.length < 2) continue;

    const curPop  = parseNum(dataRow[popCols[0].i]);
    const prevPop = parseNum(dataRow[popCols[1].i]);
    if (curPop === null) continue;

    const yoyPct = prevPop ? ((curPop - prevPop) / prevPop) * 100 : null;
    const yoyStr = yoyPct !== null
      ? `${yoyPct >= 0 ? "+" : ""}${yoyPct.toFixed(1)}%`
      : "—";
    const dir: "up" | "down" | "neutral" =
      yoyPct !== null ? (yoyPct > 0 ? "up" : yoyPct < 0 ? "down" : "neutral") : "neutral";

    return {
      indicator: `${countyName} population`,
      latest: `${(curPop / 1000).toFixed(1)}k`,
      wow: "—",
      wow_dir: "neutral",
      yoy: yoyStr,
      yoy_dir: dir,
      trend: dir,
    };
  }
  return null;
}

/**
 * Fetch Census macro rows for a given market.
 * Currently focused on Brevard (BPS + population).
 * Returns null if no CENSUS_API_KEY is configured.
 */
export async function fetchCensusMacro(market: string): Promise<FredRow[] | null> {
  const apiKey =
    process.env.CENSUS_API_KEY ||
    process.env.CENSUS_KEY     ||
    process.env.CENSUS_API;

  if (!apiKey) {
    console.warn("[census] No Census API key found (tried CENSUS_API_KEY, CENSUS_KEY, CENSUS_API) — skipping");
    return null;
  }

  const mkt = market.toLowerCase();

  if (mkt === "brevard") {
    const [bpsRows, popRow] = await Promise.all([
      fetchBPS("12", "009", apiKey),
      fetchPopulation("12", "009", "Brevard County", apiKey),
    ]);
    const rows = [...bpsRows, ...(popRow ? [popRow] : [])];
    console.log(`[census] fetched ${rows.length} rows for Brevard`);
    return rows.length > 0 ? rows : null;
  }

  if (mkt === "permian") {
    // Midland + Ector (Odessa) counties — permits as construction activity signal
    const [midland, ector] = await Promise.all([
      fetchBPS("48", "329", apiKey),
      fetchBPS("48", "135", apiKey),
    ]);
    // Rename for clarity
    const rows = [
      ...midland.map(r => ({ ...r, indicator: r.indicator.replace("Brevard County", "Midland County") })),
      ...ector.map(r => ({ ...r, indicator: r.indicator.replace("Brevard County", "Ector County (Odessa)") })),
    ];
    console.log(`[census] fetched ${rows.length} rows for Permian`);
    return rows.length > 0 ? rows : null;
  }

  return null;
}
