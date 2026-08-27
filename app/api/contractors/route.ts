import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Property contractors directory. Portal-managed, team-wide. RLS-locked → service-role client.
const TRADES = ["General Contractor", "Electrical", "Plumbing", "HVAC", "Roofing", "Concrete/Paving", "Landscaping", "Fire/Life-Safety", "Environmental", "Other"];
const STATUSES = ["Preferred", "Active", "Inactive"];
const COLS = "id, name, trade, contact, email, phone, status, markets, license_no, insurance_expiry, notes, created_by, created_at, updated_by, updated_at";

function clean(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  if (typeof body.name === "string") out.name = body.name.trim();
  if (body.trade != null) out.trade = TRADES.includes(String(body.trade)) ? String(body.trade) : "Other";
  if (body.contact != null) out.contact = String(body.contact).trim() || null;
  if (body.email != null) out.email = String(body.email).trim() || null;
  if (body.phone != null) out.phone = String(body.phone).trim() || null;
  if (body.status != null) out.status = STATUSES.includes(String(body.status)) ? String(body.status) : "Active";
  if (body.markets != null) out.markets = String(body.markets).trim() || null;
  if (body.license_no != null) out.license_no = String(body.license_no).trim() || null;
  if (body.insurance_expiry != null) out.insurance_expiry = String(body.insurance_expiry).slice(0, 10) || null;
  if (body.notes != null) out.notes = String(body.notes).trim() || null;
  return out;
}

export async function GET() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("contractors").select(COLS).order("name", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createAdminClient();
  const body = await req.json().catch(() => ({}));
  const row = clean(body);
  if (!row.name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const by = user.email ?? user.id;
  const { data, error } = await supabase.from("contractors").insert({ ...row, created_by: by, updated_by: by }).select(COLS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function PATCH(req: NextRequest) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createAdminClient();
  const body = await req.json().catch(() => ({}));
  const id = body.id;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const row = clean(body);
  delete (row as { id?: unknown }).id;
  const { data, error } = await supabase.from("contractors").update({ ...row, updated_by: user.email ?? user.id, updated_at: new Date().toISOString() }).eq("id", id).select(COLS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function DELETE(req: NextRequest) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createAdminClient();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await supabase.from("contractors").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
