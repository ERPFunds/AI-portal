import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TX_ROWS, FL_ROWS } from "@/lib/data/dealPipelineData";

export const dynamic = "force-dynamic";

// Editable Deal Pipeline mirror. The TX/FL workbook rows live in pipeline_rows (jsonb per row) so
// they can be edited in-app. On first read for a state the table self-seeds from the generated
// workbook data (TX_ROWS / FL_ROWS) — after that it's portal-managed and no longer synced to the
// SharePoint spreadsheets. RLS-locked table → service-role client, gated on an authed user.

async function seedIfEmpty(admin: ReturnType<typeof createAdminClient>, state: "TX" | "FL") {
  const { count } = await admin.from("pipeline_rows").select("id", { count: "exact", head: true }).eq("state", state);
  if (count && count > 0) return;
  const rows = (state === "TX" ? TX_ROWS : FL_ROWS).map((data, i) => ({ state, sort_order: i, data }));
  if (rows.length) await admin.from("pipeline_rows").insert(rows);
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const state = req.nextUrl.searchParams.get("state") === "FL" ? "FL" : "TX";
  const admin = createAdminClient();
  await seedIfEmpty(admin, state);
  const { data, error } = await admin.from("pipeline_rows").select("id, sort_order, data").eq("state", state).order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Dismissed inbound listings surface (read-only) in the pipeline's Archive band, so nothing removed
  // from Inbound is truly lost — it's reviewable in one place. Marked _src:'inbound' for the UI.
  const { data: dism } = await admin.from("inbound_listings")
    .select("id, address, submarket, asking_price, sf, broker_firm, broker, referred_by, channel, reason, listing_url, raw_subject, updated_at, dismissed_at, dismissed_by")
    .eq("state", state).eq("status", "dismissed")
    .order("updated_at", { ascending: false }).limit(200);
  // Hide auto-filtered junk (sub-$700K / land / non-industrial / off-market) from the Archive — those
  // are screener rejects, not decisions worth reviewing. The rows stay in the table (dedup intact); we
  // just don't surface them here. Meaningful dismissals (manual passes, forwarded emails) still show.
  const isJunk = (reason: string | null) => !!reason && /below the \$700|vacant land|not industrial|residential|per detail page/i.test(reason);
  const archived = (dism ?? []).filter((l) => !isJunk(l.reason)).map((l, i) => {
    const label = l.address || l.raw_subject || "Listing";
    const src = l.referred_by || l.channel || "";
    // Attribution: who dismissed it and when (person email, or "auto-screened" / "pre-audit").
    const who = l.dismissed_by === "screener" ? "auto-screened" : l.dismissed_by === "unknown (pre-audit)" ? "pre-audit" : l.dismissed_by || null;
    const when = l.dismissed_at ? String(l.dismissed_at).slice(0, 10) : null;
    const stamp = who ? `Dismissed by ${who}${when ? ` on ${when}` : ""}` : null;
    const notes = [stamp, l.reason].filter(Boolean).join(" · ");
    const data = state === "TX"
      ? { kind: "pipeline", status: "Archive", _src: "inbound", location: l.submarket || "", owner: l.broker_firm || l.broker || "", address: label, tenant: "", source: src, price: l.asking_price, pricePsf: null, yield: null, acreage: null, sqft: l.sf, yearBuilt: null, nextSteps: "", notes, listingUrl: l.listing_url }
      : { section: "Archive", _src: "inbound", name: label, status: "", source: src, propertyType: "Industrial", location: l.submarket || "", yearBuilt: null, units: null, occupancy: null, capRate: null, sqft: l.sf, acres: null, price: l.asking_price, psf: null, notes, listingUrl: l.listing_url };
    return { id: `inbound:${l.id}`, sort_order: 1_000_000 + i, data };
  });
  return NextResponse.json({ items: [...(data ?? []), ...archived] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const state = body.state === "FL" ? "FL" : "TX";
  const data = body.data ?? {};
  const admin = createAdminClient();
  const { data: maxRow } = await admin.from("pipeline_rows").select("sort_order").eq("state", state).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const sort_order = ((maxRow?.sort_order as number) ?? -1) + 1;
  const { data: row, error } = await admin.from("pipeline_rows").insert({ state, sort_order, data }).select("id, sort_order, data").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: row });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "");
  if (!id || !body.data) return NextResponse.json({ error: "id and data required" }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from("pipeline_rows").update({ data: body.data, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from("pipeline_rows").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
