/**
 * BLS (Bureau of Labor Statistics) macro fetcher
 * API key: process.env.BLS_API_KEY  (free — register at https://data.bls.gov/registrationEngine/)
 *
 * Uses BLS Public Data API v2 (POST, up to 50 series per request)
 * Endpoint: https://api.bls.gov/publicAPI/v2/timeseries/data/
 *
 * Series used (SAE — State and Metro Area Employment Statistics):
 *   SMU48332600500000001  Midland TX MSA, Natural Resources & Mining, all employees (thousands SA)
 *   SMU48362200500000001  Odessa TX MSA,  Natural Resources & Mining, all employees (thousands SA)
 *
 * Series ID format: SMU + state(2) + MSA-FIPS(5) + supersector(2) + industry(6) + data-type(2)
 *   Natural Resources & Mining supersector = 05, industry = 000000, all-employees = 01
 */

import type { FredRow } from "./fred";

const BLS_BASE = "https://api.bls.gov/publicAPI/v2/timeseries/data/";

interface BlsDataPoint {
  year: string;
  period: string;   // "M01"–"M12"
  periodName: string;
  value: string;
  footnotes: unknown[];
}

interface BlsSeries {
  seriesID: string;
  data: BlsDataPoint[];
}

interface BlsResponse {
  status: string;
  Results?: { series: BlsSeries[] };
  message?: string[];
}

/** Convert BLS period ("M03") + year to a comparable integer for sorting */
function periodKey(year: string, period: string): number {
  const m = parseInt(period.replace("M", ""), 10);
  return parseInt(year, 10) * 100 + m;
}

function parseVal(v: string): number | null {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function fmtDelta(delta: number, suffix = "k"): { text: string; dir: "up" | "down" | "neutral" } {
  const sign = delta > 0 ? "+" : "";
  const dir: "up" | "down" | "neutral" = delta > 0 ? "up" : delta < 0 ? "down" : "neutral";
  return { text: `${sign}${delta.toFixed(1)}${suffix}`, dir };
}

const PERMIAN_SERIES: { id: string; label: string }[] = [
  { id: "SMU48332600500000001", label: "Midland MSA mining jobs" },
  { id: "SMU48362200500000001", label: "Odessa MSA mining jobs"  },
];

const BREVARD_SERIES: { id: string; label: string }[] = [
  // Melbourne-Titusville-Palm Bay FL MSA (FIPS 27260), Aerospace & manufacturing adjacent
  { id: "SMU12272600500000001", label: "Space Coast mining/mfg jobs" },
];

async function fetchBlsSeries(
  seriesDefs: { id: string; label: string }[],
  apiKey: string
): Promise<FredRow[]> {
  const currentYear = new Date().getFullYear();
  const startYear = (currentYear - 2).toString();
  const endYear = currentYear.toString();

  const body = JSON.stringify({
    seriesid: seriesDefs.map((s) => s.id),
    startyear: startYear,
    endyear: endYear,
    registrationkey: apiKey,
  });

  try {
    const res = await fetch(BLS_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn(`[bls] HTTP ${res.status}`);
      return [];
    }

    const json: BlsResponse = await res.json();

    if (json.status !== "REQUEST_SUCCEEDED") {
      console.warn("[bls] API error:", json.message?.join(", "));
      return [];
    }

    const rows: FredRow[] = [];

    for (const seriesDef of seriesDefs) {
      const series = json.Results?.series.find((s) => s.seriesID === seriesDef.id);
      if (!series || series.data.length === 0) continue;

      // Sort descending by period so [0] = most recent
      const sorted = [...series.data].sort(
        (a, b) => periodKey(b.year, b.period) - periodKey(a.year, a.period)
      );

      const cur = parseVal(sorted[0]?.value);
      if (cur === null) continue;

      const prev  = parseVal(sorted[1]?.value ?? "");   // prior month
      const yago  = parseVal(sorted[12]?.value ?? "");  // ~12 months ago

      const mom  = prev  !== null ? fmtDelta(cur - prev)  : null;
      const yoy  = yago  !== null ? fmtDelta(cur - yago)  : null;

      rows.push({
        indicator: seriesDef.label,
        latest:    `${cur.toFixed(1)}k`,
        wow:       mom?.text  ?? "—",
        wow_dir:   mom?.dir   ?? "neutral",
        yoy:       yoy?.text  ?? "—",
        yoy_dir:   yoy?.dir   ?? "neutral",
        trend:     mom?.dir   ?? "neutral",
      });
    }

    console.log(`[bls] fetched ${rows.length}/${seriesDefs.length} series`);
    return rows;
  } catch (err) {
    console.warn("[bls] fetch error:", err);
    return [];
  }
}

/**
 * Fetch BLS employment rows for a given market.
 * Returns null if no BLS_API_KEY is configured.
 */
export async function fetchBlsMacro(market: string): Promise<FredRow[] | null> {
  const apiKey =
    process.env.BLS_API_KEY ||
    process.env.BLS_KEY    ||
    process.env.BLS_API;

  if (!apiKey) {
    console.warn("[bls] No BLS API key found — tried BLS_API_KEY, BLS_KEY, BLS_API — skipping");
    return null;
  }
  console.log(`[bls] Key found (${apiKey.slice(0, 4)}***), fetching ${seriesDefs.length} series for ${market}`);

  const seriesDefs =
    market.toLowerCase() === "brevard" ? BREVARD_SERIES : PERMIAN_SERIES;

  const rows = await fetchBlsSeries(seriesDefs, apiKey);
  return rows.length > 0 ? rows : null;
}
