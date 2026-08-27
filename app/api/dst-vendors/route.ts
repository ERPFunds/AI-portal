import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// DST service vendors — the operational providers for DST/1031 offerings:
// Qualified Intermediaries, title/escrow, property managers, lenders, legal, etc.
// Portal-managed, team-wide. RLS-locked → service-role client.

const VENDOR_TYPES = [
  "Qualified Intermediary", "Title/Escrow", "Property Manager", "Lender",
  "Legal/Counsel", "Insurance", "Inspection/Appraisal", "Other",
];
const VENDOR_STATUSES = ["Preferred", "Active", "Inactive"];

const COLS = "id, name, vendor_type, contact, email, phone, status, offerings, website, notes, created_by, created_at, updated_by, updated_at";

function clean(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  if (typeof body.name === "string") out.name = body.name.trim();
  if (body.vendor_type != null) out.vendor_type = VENDOR_TYPES.includes(String(body.vendor_type)) ? String(body.vendor_type) : "Other";
  if (body.contact != null) out.contact = String(body.contact).trim() || null;
  if (body.email != null) out.email = String(body.email).trim() || null;
  if (body.phone != null) out.phone = String(body.phone).trim() || null;
  if (body.status != null) out.status = VENDOR_STATUSES.includes(String(body.status)) ? String(body.status) : "Active";
  if (body.offerings != null) out.offerings = String(body.offerings).trim() || null;
  if (body.website != null) out.website = String(body.website).trim() || null;
  if (body.notes != null) out.notes = String(body.notes).trim() || null;
  return out;
}

export async function GET() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("dst_vendors")
    .select(COLS)
    .order("name", { ascending: true });
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
  const { data, error } = await supabase
    .from("dst_vendors")
    .insert({ ...row, created_by: by, updated_by: by })
    .select(COLS)
    .single();
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

  const { data, error } = await supabase
    .from("dst_vendors")
    .update({ ...row, updated_by: user.email ?? user.id, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(COLS)
    .single();
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
  const { error } = await supabase.from("dst_vendors").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
