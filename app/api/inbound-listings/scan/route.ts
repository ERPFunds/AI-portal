import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runInboundScan } from "@/lib/agents/acq/inbound-scan";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Manual "Scan inboxes" trigger. Principal-gated. Reads Meghan / Brennan / William's mailboxes for
// forwarded listings and upserts them into inbound_listings. Read-only on mail.
const PRINCIPALS = ["mparad@erpfunds.com", "mberry@erpfunds.com", "wmeyer@erpfunds.com", "bberry@erpfunds.com"];

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!PRINCIPALS.includes((user.email ?? "").toLowerCase())) {
    return NextResponse.json({ error: "Restricted to acquisition principals" }, { status: 403 });
  }

  const days = Number(req.nextUrl.searchParams.get("days")) || 90;
  try {
    const summary = await runInboundScan({ days });
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 502 });
  }
}
