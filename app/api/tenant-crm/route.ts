import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Tenant CRM: standalone tenant entity. Current vs Former is the `status` field; prospects are
// NOT here (that tab reads the live leasing_inquiries). Also returns the properties list (id +
// address) so the contact editor can scope a contact's role to a specific building.
// RLS-locked → service-role client.

const STATUSES = ["Current", "Former"];
const COLS = "id, name, status, industry, market, owner, notes, created_by, created_at, updated_by, updated_at";

function clean(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  if (typeof body.name === "string") out.name = body.name.trim();
  if (body.status != null) out.status = STATUSES.includes(String(body.status)) ? String(body.status) : "Current";
  if (body.industry != null) out.industry = String(body.industry).trim() || null;
  if (body.market != null) out.market = String(body.market).trim() || null;
  if (body.owner != null) out.owner = String(body.owner).trim() || null;
  if (body.notes != null) out.notes = String(body.notes).trim() || null;
  return out;
}

export async function GET() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createAdminClient();

  const [{ data: tenants, error: te }, { data: props }] = await Promise.all([
    supabase.from("tenants").select(COLS).order("name", { ascending: true }),
    supabase.from("properties").select("id, address").order("address", { ascending: true }),
  ]);
  if (te) return NextResponse.json({ error: te.message }, { status: 500 });

  const properties = ((props ?? []) as { id: unknown; address: unknown }[])
    .map((p) => ({ id: String(p.id), address: String(p.address ?? "") }))
    .filter((p) => p.address);
  return NextResponse.json({ tenants: tenants ?? [], properties });
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
  const { data, error } = await supabase
    .from("tenants")
    .insert({ ...row, created_by: by, updated_by: by })
    .select(COLS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tenant: data });
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

  const { data, error } = await supabase
    .from("tenants")
    .update({ ...row, updated_by: user.email ?? user.id, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(COLS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tenant: data });
}

export async function DELETE(req: NextRequest) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createAdminClient();

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await supabase.from("tenants").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
