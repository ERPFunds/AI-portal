import { NextRequest, NextResponse } from "next/server";
import { runMarketScan } from "@/lib/agents/acq/market-scan";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Scheduled market scan (see vercel.json) — weekly proactive sourcing sweep of LoopNet + Crexi.
// Gated on CRON_SECRET; Vercel adds the matching Authorization header to scheduled invocations.
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await runMarketScan());
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 300) }, { status: 502 });
  }
}
