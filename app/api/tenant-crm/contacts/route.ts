import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// A tenant's contacts, each with a function/role scoped to a property (a multi-site tenant can
// have a different billing/facilities contact per building). RLS-locked → service-role client.

const ROLES = ["Primary", "Billing/AP", "Facilities", "Lease Signatory", "Operations", "Emergency", "Other"];
const COLS = "id, tenant_id, property_id, property_label, contact_name, role, email, phone, is_primary, notes, created_at, updated_at";

function clean(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  if (typeof body.contact_name === "string") out.contact_name = body.contact_name.trim();
  if (body.role != null) out.role = ROLES.includes(String(body.role)) ? String(body.role) : "Other";
  if (body.property_id != null) out.property_id = String(body.property_id).trim() || null;
  if (body.property_label != null) out.property_label = String(body.property_label).trim() || null;
  if (body.email != null) out.email = String(body.email).trim() || null;
  if (body.phone != null) out.phone = String(body.phone).trim() || null;
  if (body.is_primary != null) out.is_primary = !!body.is_primary;
  if (body.notes != null) out.notes = String(body.notes).trim() || null;
  return out;
}

export async function GET(req: NextRequest) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createAdminClient();

  const tenantId = req.nextUrl.searchParams.get("tenant_id");
  if (!tenantId) return NextResponse.json({ error: "tenant_id required" }, { status: 400 });

  const { data, error } = await supabase
    .from("tenant_contacts")
    .select(COLS)
    .eq("tenant_id", tenantId)
    .order("is_primary", { ascending: false })
    .order("property_label", { ascending: true, nullsFirst: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contacts: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createAdminClient();

  const body = await req.json().catch(() => ({}));
  const tenantId = String(body.tenant_id ?? "").trim();
  if (!tenantId) return NextResponse.json({ error: "tenant_id required" }, { status: 400 });
  const row = clean(body);
  if (!row.contact_name) return NextResponse.json({ error: "contact_name required" }, { status: 400 });

  const { data, error } = await supabase
    .from("tenant_contacts")
    .insert({ ...row, tenant_id: tenantId, created_by: user.email ?? user.id })
    .select(COLS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contact: data });
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
    .from("tenant_contacts")
    .update({ ...row, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(COLS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contact: data });
}

export async function DELETE(req: NextRequest) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createAdminClient();

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await supabase.from("tenant_contacts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
