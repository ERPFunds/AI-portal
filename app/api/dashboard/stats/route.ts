import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgentRunStats } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();

  // Activity feed via the Supabase client (the working DB path). The `recent_activity` RPC unions
  // the real event tables (IR inbox, Q&A, KB uploads/syncs, capital-raise, saved searches).
  const { data: recentRuns } = await supabase.rpc("recent_activity", { limit_n: 40 });

  // Per-agent run counts (best-effort; empty if the legacy pg path isn't connected).
  let agentStats: Record<string, { runs: number; last: string | null }> = {};
  try { agentStats = await getAgentRunStats(7); } catch { agentStats = {}; }

  return NextResponse.json({ agentStats, recentRuns: recentRuns ?? [] });
}
