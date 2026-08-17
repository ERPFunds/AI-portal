import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Live inbound listings for the Inbound Listings tab. Reads/writes go through the service-role client
// (the table is RLS-locked); every request is gated on an authenticated portal user first.

const COLS =
  "id, source_mailbox, received_at, referred_by, referral_kind, channel, address, submarket, state, asking_price, sf, in_place_noi, cap_pct, broker, broker_firm, fit, score, reason, dedup_key, status, raw_subject, created_at";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const admin = createAdminClient();
  const market = req.nextUrl.searchParams.get("market");
  let q = admin.from("inbound_listings").select(COLS).neq("status", "dismissed").order("received_at", { ascending: false, nullsFirst: false });
  if (market === "TX" || market === "FL") q = q.eq("state", market);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

// Dismiss a listing (hide it from the tab). { id, status? }
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const status = body.status === "new" ? "new" : "dismissed";

  const admin = createAdminClient();
  const { error } = await admin.from("inbound_listings").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
