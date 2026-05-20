/**
 * EIA (U.S. Energy Information Administration) macro fetcher
 * API key: process.env.EIA_API_KEY  (free — register at https://www.eia.gov/opendata/)
 *
 * Endpoints used:
 *   Drilling Productivity Report (monthly, by region):
 *   https://api.eia.gov/v2/drilling-productivity-report/data/
 *     fields: rig-count, drilled-wells, completed-wells, oil-production, gas-production
 *
 * Permian-specific: region = "permian"
 * Data is monthly — WoW column in the brief becomes MoM for these rows.
 */

import type { FredRow } from "./fred";

const EIA_BASE = "https://api.eia.gov/v2";

interface DprRecord {
  period: string; // "2026-03"
  region: string;
  "rig-count"?: string;
  "drilled-wells"?: string;
  "completed-wells"?: string;
  "oil-production"?: string;
  "gas-production"?: string;
}

function parseNum(v: string | undefined): number | null {
  if (!v || v === "" || v === "null") return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function fmtDelta(delta: number, format: "integer" | "decimal" | "mbbl"): { text: string; dir: "up" | "down" | "neutral" } {
  const sign = delta > 0 ? "+" : "";
  const dir: "up" | "down" | "neutral" = delta > 0 ? "up" : delta < 0 ? "down" : "neutral";
  let text: string;
  if (format === "integer") text = `${sign}${Math.round(delta).toLocaleString()}`;
  else if (format === "mbbl") text = `${sign}${delta.toFixed(0)}k bbl/d`;
  else text = `${sign}${delta.toFixed(1)}`;
  return { text, dir };
}

function toRow(
  label: string,
  current: number,
  prev: number | null,
  yearAgo: number | null,
  latestStr: string,
  format: "integer" | "decimal" | "mbbl"
): FredRow {
  const mom = prev !== null ? fmtDelta(current - prev, format) : null;
  const yoy = yearAgo !== null ? fmtDelta(current - yearAgo, format) : null;
  return {
    indicator: label,
    latest: latestStr,
    wow: mom?.text ?? "—",
    wow_dir: mom?.dir ?? "neutral",
    yoy: yoy?.text ?? "—",
    yoy_dir: yoy?.dir ?? "neutral",
    trend: mom?.dir ?? "neutral",
  };
}

async function fetchPermianDpr(apiKey: string): Promise<FredRow[]> {
  try {
    // Build URL manually — URLSearchParams percent-encodes [ and ] which breaks EIA v2 facet params
    const url =
      `${EIA_BASE}/drilling-productivity-report/data/` +
      `?api_key=${encodeURIComponent(apiKey)}` +
      `&frequency=monthly` +
      `&facets[region][]=permian` +
      `&data[0]=rig-count` +
      `&data[1]=drilled-wells` +
      `&data[2]=completed-wells` +
      `&data[3]=oil-production` +
      `&sort[0][column]=period` +
      `&sort[0][direction]=desc` +
      `&length=14`;

    console.log("[eia] Fetching DPR URL (key hidden):", url.replace(encodeURIComponent(apiKey), "***"));
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[eia] DPR HTTP ${res.status}:`, body.slice(0, 200));
      return [];
    }

    const json = await res.json() as { response?: { data?: DprRecord[] } };
    const records: DprRecord[] = json.response?.data ?? [];

    if (records.length === 0) return [];

    // records are sorted desc by period — [0]=current, [1]=prev month, [12]=year ago
    const cur = records[0];
    const prev = records[1] ?? null;
    const yago = records[12] ?? records[records.length - 1] ?? null;

    const rows: FredRow[] = [];

    // Permian rig count
    const rigCur = parseNum(cur["rig-count"]);
    if (rigCur !== null) {
      rows.push(toRow(
        "Permian rig count",
        rigCur,
        parseNum(prev?.["rig-count"] ?? undefined),
        parseNum(yago?.["rig-count"] ?? undefined),
        Math.round(rigCur).toLocaleString(),
        "integer"
      ));
    }

    // Permian oil production (thousand bbl/d)
    const oilCur = parseNum(cur["oil-production"]);
    if (oilCur !== null) {
      rows.push(toRow(
        "Permian oil production",
        oilCur,
        parseNum(prev?.["oil-production"] ?? undefined),
        parseNum(yago?.["oil-production"] ?? undefined),
        `${Math.round(oilCur).toLocaleString()} Mbbl/d`,
        "integer"
      ));
    }

    // Drilled - completed as a proxy for DUC flow (positive = backlog building)
    const drilledCur = parseNum(cur["drilled-wells"]);
    const completedCur = parseNum(cur["completed-wells"]);
    if (drilledCur !== null && completedCur !== null) {
      const ducFlow = drilledCur - completedCur;
      const ducFlowPrev =
        prev?.["drilled-wells"] && prev?.["completed-wells"]
          ? parseNum(prev["drilled-wells"])! - parseNum(prev["completed-wells"])!
          : null;
      const ducFlowYago =
        yago?.["drilled-wells"] && yago?.["completed-wells"]
          ? parseNum(yago["drilled-wells"])! - parseNum(yago["completed-wells"])!
          : null;
      const dir: "up" | "down" | "neutral" = ducFlow > 0 ? "up" : ducFlow < 0 ? "down" : "neutral";
      rows.push({
        indicator: "DUC net flow (drilled − completed)",
        latest: `${ducFlow > 0 ? "+" : ""}${Math.round(ducFlow)} wells`,
        wow: ducFlowPrev !== null ? `${(ducFlow - ducFlowPrev) > 0 ? "+" : ""}${Math.round(ducFlow - ducFlowPrev)}` : "—",
        wow_dir: ducFlowPrev !== null ? (ducFlow - ducFlowPrev > 0 ? "up" : ducFlow - ducFlowPrev < 0 ? "down" : "neutral") : "neutral",
        yoy: ducFlowYago !== null ? `${(ducFlow - ducFlowYago) > 0 ? "+" : ""}${Math.round(ducFlow - ducFlowYago)}` : "—",
        yoy_dir: ducFlowYago !== null ? (ducFlow - ducFlowYago > 0 ? "up" : ducFlow - ducFlowYago < 0 ? "down" : "neutral") : "neutral",
        trend: dir,
      });
    }

    return rows;
  } catch (err) {
    console.warn("[eia] DPR fetch error:", err);
    return [];
  }
}

/**
 * Fetch EIA macro rows for a given market.
 * Currently Permian-only (Brevard has no relevant EIA series).
 * Returns null if no EIA_API_KEY is configured.
 */
export async function fetchEiaMacro(market: string): Promise<FredRow[] | null> {
  const apiKey =
    process.env.EIA_API_KEY ||
    process.env.EIA_KEY ||
    process.env.EIA_API;

  if (!apiKey) {
    console.warn("[eia] No EIA API key found — tried EIA_API_KEY, EIA_KEY, EIA_API — skipping");
    return null;
  }

  if (market.toLowerCase() !== "permian") {
    return null;
  }

  console.log(`[eia] Key found (${apiKey.slice(0, 4)}***), fetching Permian DPR...`);
  const rows = await fetchPermianDpr(apiKey);
  console.log(`[eia] Got ${rows.length} rows`);
  return rows.length > 0 ? rows : null;
}
