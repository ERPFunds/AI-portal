import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Buy Box — the firm's stored acquisition screening criteria. Single record (the "Primary" box).
// The Inbound Listing Intake workflow screens broker/Crexi/LoopNet listings against this. Auth-gated.

const COLS = "id, name, markets, asset_class, sf_min, sf_max, price_per_sf_min, price_per_sf_max, cap_rate_floor, deal_size_min, deal_size_max, notes, updated_by, updated_at";

function int(v: unknown): number | null {
  if (v === "" || v == null) return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(0, n) : null;
}
function num(v: unknown): number | null {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, n) : null;
}

function clean(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  if (body.name != null) out.name = String(body.name).trim() || "Primary";
  if (body.markets != null) out.markets = String(body.markets).trim() || null;
  if (body.asset_class != null) out.asset_class = String(body.asset_class).trim() || null;
  if ("sf_min" in body) out.sf_min = int(body.sf_min);
  if ("sf_max" in body) out.sf_max = int(body.sf_max);
  if ("price_per_sf_min" in body) out.price_per_sf_min = num(body.price_per_sf_min);
  if ("price_per_sf_max" in body) out.price_per_sf_max = num(body.price_per_sf_max);
  if ("cap_rate_floor" in body) out.cap_rate_floor = num(body.cap_rate_floor);
  if ("deal_size_min" in body) out.deal_size_min = num(body.deal_size_min);
  if ("deal_size_max" in body) out.deal_size_max = num(body.deal_size_max);
  if (body.notes != null) out.notes = String(body.notes).trim() || null;
  return out;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { data, error } = await supabase
    .from("buy_box")
    .select(COLS)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data ?? null });
}

// Upsert the single Buy Box: update the latest row if one exists, else insert.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const row = clean(body);

  const { data: existing } = await supabase
    .from("buy_box")
    .select("id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    const { data, error } = await supabase
      .from("buy_box")
      .update({ ...row, updated_by: user.email ?? user.id, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select(COLS)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ item: data });
  }

  const { data, error } = await supabase
    .from("buy_box")
    .insert({ name: "Primary", ...row, updated_by: user.email ?? user.id })
    .select(COLS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
