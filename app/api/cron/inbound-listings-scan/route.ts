import { NextResponse } from "next/server";
import { runInboundScan } from "@/lib/agents/acq/inbound-scan";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Scheduled inbound-listing scan (see vercel.json). Runs the same read-only mailbox sweep as the
// manual trigger, using the service-role client for writes. Vercel authenticates cron requests.
export async function GET() {
  try {
    const summary = await runInboundScan({ months: 2 });
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 300) }, { status: 502 });
  }
}
