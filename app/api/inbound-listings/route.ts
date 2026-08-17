import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Live inbound listings for the Inbound Listings tab. Reads/writes go through the service-role client
// (the table is RLS-locked); every request is gated on an authenticated portal user first.

const COLS =
  "id, source_mailbox, received_at, origin, listing_url, source_url, attachments, referred_by, referral_kind, channel, address, submarket, state, asking_price, sf, in_place_noi, cap_pct, broker, broker_firm, fit, score, reason, dedup_key, status, raw_subject, preview, created_at";

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

// Promote a listing into the Deal Pipeline (Sourcing). { id } — dedupes by deal_name; marks the
// inbound row 'imported'. deal_pipeline is user-RLS'd so it's written with the user client; the
// RLS-locked inbound_listings read/update goes through the service-role client.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: row } = await admin.from("inbound_listings").select("*").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Listing not found" }, { status: 404 });

  const dealName = String(row.address || row.raw_subject || "Inbound listing").trim();
  const market = row.state === "TX" ? "Permian Basin" : row.state === "FL" ? "Brevard / Space Coast" : "Other";
  const capPct = row.cap_pct ?? (row.in_place_noi && row.asking_price ? (row.in_place_noi / row.asking_price) * 100 : null);
  const psf = row.asking_price && row.sf ? Math.round(row.asking_price / row.sf) : null;
  const notes =
    `Auto-added from inbound listing (${row.channel ?? "email"}${row.referred_by ? `, forwarded by ${row.referred_by}` : ""}). ` +
    `${capPct != null ? `In-place cap ${capPct.toFixed(1)}% · ` : ""}${psf != null ? `$${psf}/SF · ` : ""}${row.sf != null ? `${Number(row.sf).toLocaleString("en-US")} SF. ` : ""}` +
    `${row.reason ?? ""}`.trim();

  // Dedupe against existing pipeline deals (case-insensitive on deal_name).
  const { data: existing } = await supabase.from("deal_pipeline").select("deal_name");
  const have = new Set((existing ?? []).map((r) => String(r.deal_name).trim().toLowerCase()));
  if (have.has(dealName.toLowerCase())) {
    await admin.from("inbound_listings").update({ status: "imported", updated_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ ok: true, added: 0, duplicate: true, deal_name: dealName });
  }

  const { data: deal, error } = await supabase
    .from("deal_pipeline")
    .insert({ deal_name: dealName, market, stage: "Sourcing", purchase_price: row.asking_price, next_action: "Screen & underwrite inbound listing", notes, created_by: user.email ?? user.id })
    .select("id, deal_name")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("inbound_listings").update({ status: "imported", updated_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ ok: true, added: 1, deal_name: dealName, deal });
}
