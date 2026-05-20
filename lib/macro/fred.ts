/**
 * FRED (Federal Reserve Economic Data) macro fetcher
 * API key: process.env.FRED_API_KEY  (free — register at https://fred.stlouisfed.org/docs/api/api_key.html)
 *
 * Series used (Permian):
 *   DCOILWTICO  – WTI crude spot, Cushing OK (daily, EIA via FRED)
 *   OILRIGS     – Total US active oil rigs (weekly, Baker Hughes via EIA)
 *
 * Employment series (monthly, BLS via FRED — FIPS-based SAE format):
 *   SMU48332600500000001SA  – Midland TX MSA, Natural Resources & Mining
 *   SMU48362200500000001SA  – Odessa TX MSA, Natural Resources & Mining
 *
 * Brevard / Space Coast:
 *   FLUR          – Florida unemployment rate (monthly, BLS via FRED)
 *   SMU12278700500000001SA  – Melbourne-Titusville-Palm Bay FL MSA, Natural Resources & Mining
 *
 * Adding EIA key later will unlock: Permian rig count, DUC inventory, production data.
 */

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

export interface FredRow {
  indicator: string;
  latest: string;
  wow: string;
  wow_dir: "up" | "down" | "neutral";
  yoy: string;
  yoy_dir: "up" | "down" | "neutral";
  trend: "up" | "down" | "neutral";
}

interface SeriesDef {
  id: string;
  label: string;
  format: "price" | "integer" | "percent" | "number";
  prefix?: string;
  suffix?: string;
  /** how many observations to fetch (daily=400, weekly=60, monthly=26) */
  limit: number;
  /** approximate lookback index for WoW (7d=7 for daily, 1 for weekly/monthly) */
  wowOffset: number;
  /** approximate lookback index for YoY (365d=365 for daily, 52 for weekly, 12 for monthly) */
  yoyOffset: number;
}

const PERMIAN_SERIES: SeriesDef[] = [
  {
    id: "DCOILWTICO",
    label: "WTI spot (Cushing)",
    format: "price",
    prefix: "$",
    suffix: "",
    limit: 400,
    wowOffset: 7,
    yoyOffset: 365,
  },
  {
    id: "OILRIGS",
    label: "US active oil rigs",
    format: "integer",
    limit: 60,
    wowOffset: 1,
    yoyOffset: 52,
  },
  {
    id: "SMU48332600500000001SA",
    label: "Midland MSA mining jobs",
    format: "number",
    suffix: "k",
    limit: 26,
    wowOffset: 1,
    yoyOffset: 12,
  },
  {
    id: "SMU48362200500000001SA",
    label: "Odessa MSA mining jobs",
    format: "number",
    suffix: "k",
    limit: 26,
    wowOffset: 1,
    yoyOffset: 12,
  },
];

const BREVARD_SERIES: SeriesDef[] = [
  {
    id: "FLUR",
    label: "Florida unemployment rate",
    format: "percent",
    suffix: "%",
    limit: 26,
    wowOffset: 1,
    yoyOffset: 12,
  },
  {
    id: "SMU12278700500000001SA",
    label: "Space Coast mining/mfg jobs",
    format: "number",
    suffix: "k",
    limit: 26,
    wowOffset: 1,
    yoyOffset: 12,
  },
];

/** Parse FRED value string; returns null for missing (".") */
function parseVal(v: string): number | null {
  if (!v || v === ".") return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

/** Find the first non-null value starting at or after index `from` in descending-sorted obs */
function firstValid(obs: { value: string }[], from: number): { val: number; idx: number } | null {
  for (let i = from; i < obs.length; i++) {
    const v = parseVal(obs[i].value);
    if (v !== null) return { val: v, idx: i };
  }
  return null;
}

function formatVal(val: number, def: SeriesDef): string {
  if (def.format === "price") return `${def.prefix ?? ""}${val.toFixed(2)}`;
  if (def.format === "percent") return `${val.toFixed(1)}${def.suffix ?? ""}`;
  if (def.format === "integer") return `${Math.round(val).toLocaleString()}`;
  if (def.format === "number") return `${val.toFixed(1)}${def.suffix ?? ""}`;
  return `${val}`;
}

function formatDelta(delta: number, def: SeriesDef): { text: string; dir: "up" | "down" | "neutral" } {
  const sign = delta > 0 ? "+" : "";
  const dir: "up" | "down" | "neutral" = delta > 0 ? "up" : delta < 0 ? "down" : "neutral";
  let text: string;
  if (def.format === "price") text = `${sign}${def.prefix ?? ""}${Math.abs(delta).toFixed(2)}`;
  else if (def.format === "percent") text = `${sign}${delta.toFixed(2)}pp`;
  else if (def.format === "integer") text = `${sign}${Math.round(delta).toLocaleString()}`;
  else text = `${sign}${delta.toFixed(1)}${def.suffix ?? ""}`;
  return { text, dir };
}

async function fetchSeries(def: SeriesDef, apiKey: string): Promise<FredRow | null> {
  try {
    const url = `${FRED_BASE}?series_id=${def.id}&api_key=${apiKey}&sort_order=desc&limit=${def.limit}&file_type=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      console.warn(`[fred] ${def.id} HTTP ${res.status}`);
      return null;
    }
    const json = await res.json() as { observations: { date: string; value: string }[] };
    const obs = json.observations ?? [];
    if (obs.length === 0) return null;

    const current = firstValid(obs, 0);
    if (!current) return null;

    // WoW: look for a valid observation around wowOffset positions back
    const wow = firstValid(obs, Math.max(1, def.wowOffset - 2));
    // YoY: look for a valid observation around yoyOffset positions back
    const yoy = firstValid(obs, Math.max(1, def.yoyOffset - 5));

    const latestStr = formatVal(current.val, def);

    const wowDelta = wow ? formatDelta(current.val - wow.val, def) : null;
    const yoyDelta = yoy ? formatDelta(current.val - yoy.val, def) : null;

    return {
      indicator: def.label,
      latest: latestStr,
      wow: wowDelta?.text ?? "—",
      wow_dir: wowDelta?.dir ?? "neutral",
      yoy: yoyDelta?.text ?? "—",
      yoy_dir: yoyDelta?.dir ?? "neutral",
      trend: wowDelta?.dir ?? "neutral",
    };
  } catch (err) {
    console.warn(`[fred] ${def.id} fetch error:`, err);
    return null;
  }
}

/**
 * Fetch real-time macro rows for injection into the weekly brief.
 * Returns whatever series succeed; silently skips failures.
 * Returns null if no FRED_API_KEY is configured.
 */
export async function fetchFredMacro(market: string): Promise<FredRow[] | null> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    console.warn("[fred] FRED_API_KEY not set — skipping macro pre-fetch");
    return null;
  }

  const seriesDefs =
    market.toLowerCase() === "brevard" ? BREVARD_SERIES : PERMIAN_SERIES;

  const results = await Promise.allSettled(
    seriesDefs.map((def) => fetchSeries(def, apiKey))
  );

  const rows: FredRow[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value !== null) {
      rows.push(r.value);
    }
  }

  console.log(`[fred] fetched ${rows.length}/${seriesDefs.length} series for ${market}`);
  return rows.length > 0 ? rows : null;
}
