/**
 * Launch Library 2 API — Cape Canaveral launch cadence
 * Endpoint: https://ll.thespacedevs.com/2.2.0/
 * No API key required (free tier: 15 req/hour anonymous)
 *
 * Provides two macro indicators for Brevard/Space Coast brief:
 *   - Canaveral launches (trailing 30 days) vs prior 30d and year-ago 30d
 *   - Launch manifest (upcoming 90-day pipeline count)
 *
 * High launch cadence → more aerospace workers → tighter Brevard industrial market
 */

import type { FredRow } from "./fred";

const LL_BASE = "https://ll.thespacedevs.com/2.2.0";

// Cape Canaveral location name as used in Launch Library
const CANAVERAL_LOCATION = "Cape Canaveral";

interface LLLaunch {
  id: string;
  name: string;
  net: string; // ISO date string
  status?: { abbrev: string; name: string };
  launch_service_provider?: { name: string; abbrev: string };
  pad?: { location?: { name: string } };
}

interface LLResponse {
  count: number;
  results: LLLaunch[];
}

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

async function fetchLaunches(params: Record<string, string>): Promise<LLResponse | null> {
  const qs = new URLSearchParams({ format: "json", limit: "100", ...params }).toString();
  try {
    const res = await fetch(`${LL_BASE}/launch/?${qs}`, {
      signal: AbortSignal.timeout(12000),
      headers: { "User-Agent": "ERP-Funds-Research-Bot/1.0" },
    });
    if (!res.ok) {
      console.warn(`[launches] HTTP ${res.status}`);
      return null;
    }
    return await res.json() as LLResponse;
  } catch (err) {
    console.warn("[launches] fetch error:", err);
    return null;
  }
}

async function fetchUpcoming(params: Record<string, string>): Promise<LLResponse | null> {
  const qs = new URLSearchParams({ format: "json", limit: "100", ...params }).toString();
  try {
    const res = await fetch(`${LL_BASE}/launch/upcoming/?${qs}`, {
      signal: AbortSignal.timeout(12000),
      headers: { "User-Agent": "ERP-Funds-Research-Bot/1.0" },
    });
    if (!res.ok) {
      console.warn(`[launches] upcoming HTTP ${res.status}`);
      return null;
    }
    return await res.json() as LLResponse;
  } catch (err) {
    console.warn("[launches] upcoming fetch error:", err);
    return null;
  }
}

function countCanaveral(data: LLResponse | null): number {
  if (!data) return 0;
  return data.results.filter(
    (l) => l.pad?.location?.name?.toLowerCase().includes("canaveral") ||
           l.pad?.location?.name?.toLowerCase().includes("kennedy")
  ).length;
}

/**
 * Fetch Cape Canaveral launch cadence rows for Brevard brief.
 * Returns null if the API is unreachable.
 */
export async function fetchLaunchData(): Promise<FredRow[] | null> {
  const now = new Date();

  // Window boundaries
  const d30ago  = new Date(now); d30ago.setDate(now.getDate() - 30);
  const d60ago  = new Date(now); d60ago.setDate(now.getDate() - 60);
  const d365ago = new Date(now); d365ago.setFullYear(now.getFullYear() - 1);
  const d395ago = new Date(now); d395ago.setFullYear(now.getFullYear() - 1); d395ago.setDate(d395ago.getDate() - 30);
  const d90fwd  = new Date(now); d90fwd.setDate(now.getDate() + 90);

  // Fetch in parallel: current 30d, prior 30d, year-ago 30d, upcoming 90d
  const [cur30, prev30, yago30, upcoming90] = await Promise.all([
    fetchLaunches({
      net__gte: isoDate(d30ago),
      net__lte: isoDate(now),
      "status__abbrev__in": "Success,Partial Failure",
    }),
    fetchLaunches({
      net__gte: isoDate(d60ago),
      net__lte: isoDate(d30ago),
      "status__abbrev__in": "Success,Partial Failure",
    }),
    fetchLaunches({
      net__gte: isoDate(d395ago),
      net__lte: isoDate(d365ago),
      "status__abbrev__in": "Success,Partial Failure",
    }),
    fetchUpcoming({
      net__gte: isoDate(now),
      net__lte: isoDate(d90fwd),
    }),
  ]);

  // If all failed, return null
  if (!cur30 && !upcoming90) return null;

  const rows: FredRow[] = [];

  // ── Trailing 30-day launch count ──────────────────────────────────────────
  const curCount  = countCanaveral(cur30);
  const prevCount = countCanaveral(prev30);
  const yagoCount = countCanaveral(yago30);

  const momDelta = curCount - prevCount;
  const yoyDelta = curCount - yagoCount;

  rows.push({
    indicator: "Canaveral launches (30d)",
    latest:    `${curCount}`,
    wow:       prev30  ? `${momDelta >= 0 ? "+" : ""}${momDelta}` : "—",
    wow_dir:   prev30  ? (momDelta > 0 ? "up" : momDelta < 0 ? "down" : "neutral") : "neutral",
    yoy:       yago30  ? `${yoyDelta >= 0 ? "+" : ""}${yoyDelta}` : "—",
    yoy_dir:   yago30  ? (yoyDelta > 0 ? "up" : yoyDelta < 0 ? "down" : "neutral") : "neutral",
    trend:     momDelta > 0 ? "up" : momDelta < 0 ? "down" : "neutral",
  });

  // ── Upcoming 90-day manifest ──────────────────────────────────────────────
  if (upcoming90) {
    const upcoming = countCanaveral(upcoming90);

    // Get top providers for context
    const providers = upcoming90.results
      .filter(l =>
        l.pad?.location?.name?.toLowerCase().includes("canaveral") ||
        l.pad?.location?.name?.toLowerCase().includes("kennedy")
      )
      .map(l => l.launch_service_provider?.abbrev ?? "")
      .filter(Boolean);

    const providerCounts = providers.reduce<Record<string, number>>((acc, p) => {
      acc[p] = (acc[p] ?? 0) + 1;
      return acc;
    }, {});

    const providerStr = Object.entries(providerCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");

    rows.push({
      indicator: `Launch manifest 90d${providerStr ? ` (${providerStr})` : ""}`,
      latest:    `${upcoming}`,
      wow:       "—",
      wow_dir:   "neutral",
      yoy:       "—",
      yoy_dir:   "neutral",
      trend:     upcoming >= 8 ? "up" : upcoming <= 3 ? "down" : "neutral",
    });
  }

  console.log(`[launches] ${rows.length} rows — ${rows[0]?.latest ?? 0} launches in last 30d`);
  return rows.length > 0 ? rows : null;
}
