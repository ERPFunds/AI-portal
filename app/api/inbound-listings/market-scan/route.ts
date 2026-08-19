import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runMarketScan } from "@/lib/agents/acq/market-scan";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Manual "Scan market" trigger — principal-gated. Scrapes LoopNet + Crexi for on-market for-sale
// industrial in ERP's markets and upserts fit-screened rows into inbound_listings (origin=discovered).
const PRINCIPALS = ["mparad@erpfunds.com", "mberry@erpfunds.com", "wmeyer@erpfunds.com", "bberry@erpfunds.com"];

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!PRINCIPALS.includes((user.email ?? "").toLowerCase())) {
    return NextResponse.json({ error: "Restricted to acquisition principals" }, { status: 403 });
  }
  const src = req.nextUrl.searchParams.get("source");
  const only = src === "platforms" || src === "brokers" ? src : undefined;
  try {
    return NextResponse.json(await runMarketScan(only));
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 502 });
  }
}
