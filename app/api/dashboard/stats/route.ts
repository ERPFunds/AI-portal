import { NextResponse } from "next/server";
import { getAgentRunStats, getRecentAgentRuns } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const [agentStats, recentRuns] = await Promise.all([
    getAgentRunStats(7),
    getRecentAgentRuns(40),
  ]);

  return NextResponse.json({ agentStats, recentRuns });
}
