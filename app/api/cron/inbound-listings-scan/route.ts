import { NextRequest, NextResponse } from "next/server";
import { runInboundScan } from "@/lib/agents/acq/inbound-scan";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Scheduled inbound-listing scan (see vercel.json). Runs the same read-only mailbox sweep as the
// manual trigger, using the service-role client for writes. Gated on CRON_SECRET — Vercel adds the
// matching Authorization header to scheduled invocations.
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runInboundScan({ days: 90 });
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 300) }, { status: 502 });
  }
}
