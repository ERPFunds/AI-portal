import { NextRequest, NextResponse } from "next/server";
import { runLeasingScan } from "@/lib/agents/acq/leasing-scan";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Scheduled leasing-inquiry scan (see vercel.json). Same read-only mailbox sweep as the manual
// trigger. Gated on CRON_SECRET; Vercel adds the matching Authorization header to cron invocations.
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await runLeasingScan({ days: 30 }));
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 300) }, { status: 502 });
  }
}
