import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// DST vendor accounts — broker dealers, the brokerages that sit under them, and the other
// operational providers for DST/1031 offerings (QIs, title/escrow, property managers,
// lenders, legal). Portal-managed, team-wide. RLS-locked → service-role client.
//
// A brokerage points at its broker dealer through parent_id; that affiliation is what
// tells the team which desk a brokerage is listed under. Contacts live in their own table
// so each person can carry a title, both phone numbers, an address and a LinkedIn profile.

const VENDOR_TYPES = [
  "Broker Dealer", "Brokerage", "RIA", "Advisor",
  "Qualified Intermediary", "Title/Escrow", "Property Manager", "Lender",
  "Legal/Counsel", "Insurance", "Inspection/Appraisal", "Other",
];

const COLS = "id, name, description, vendor_type, parent_id, website, notes, next_steps, " +
  "contact, email, phone, status, offerings, archived, created_by, created_at, updated_by, updated_at";
const CONTACT_COLS = "id, vendor_id, name, title, email, phone_office, phone_cell, address, linkedin_url, notes, is_primary";

function clean(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  const str = (v: unknown) => String(v ?? "").trim() || null;
  if (typeof body.name === "string") out.name = body.name.trim();
  if (body.description !== undefined) out.description = str(body.description);
  if (body.vendor_type !== undefined) {
    out.vendor_type = VENDOR_TYPES.includes(String(body.vendor_type)) ? String(body.vendor_type) : "Other";
  }
  // Empty string clears the affiliation; a non-uuid is ignored rather than written.
  if (body.parent_id !== undefined) {
    const p = String(body.parent_id ?? "").trim();
    out.parent_id = /^[0-9a-f-]{36}$/i.test(p) ? p : null;
  }
  if (body.website !== undefined) out.website = str(body.website);
  if (body.notes !== undefined) out.notes = str(body.notes);
  if (body.next_steps !== undefined) out.next_steps = str(body.next_steps);
  if (body.archived !== undefined) out.archived = !!body.archived;
  return out;
}

function cleanContact(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  const str = (v: unknown) => String(v ?? "").trim() || null;
  if (typeof body.name === "string") out.name = body.name.trim();
  for (const k of ["title", "email", "phone_office", "phone_cell", "address", "linkedin_url", "notes"]) {
    if (body[k] !== undefined) out[k] = str(body[k]);
  }
  if (body.is_primary !== undefined) out.is_primary = !!body.is_primary;
  return out;
}

async function requireUser() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  return user;
}

export async function GET() {
  if (!(await requireUser())) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createAdminClient();

  const [{ data: items, error }, { data: contacts }] = await Promise.all([
    supabase.from("dst_vendors").select(COLS).eq("archived", false).order("name"),
    supabase.from("dst_vendor_contacts").select(CONTACT_COLS).order("is_primary", { ascending: false }).order("name"),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Group contacts onto their account so the list can render them without a second call.
  const byVendor = new Map<string, unknown[]>();
  for (const c of (contacts ?? []) as unknown as { vendor_id: string }[]) {
    const list = byVendor.get(c.vendor_id) ?? [];
    list.push(c);
    byVendor.set(c.vendor_id, list);
  }
  const withContacts = ((items ?? []) as unknown as { id: string }[]).map((v) => ({ ...v, contacts: byVendor.get(v.id) ?? [] }));

  return NextResponse.json({ items: withContacts, types: VENDOR_TYPES });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createAdminClient();
  const body = await req.json().catch(() => ({}));
  const who = user.email ?? user.id;

  if (body.kind === "contact") {
    const vendor_id = String(body.vendor_id ?? "").trim();
    if (!vendor_id) return NextResponse.json({ error: "vendor_id required" }, { status: 400 });
    const row = cleanContact(body);
    if (!row.name) return NextResponse.json({ error: "Contact name required" }, { status: 400 });
    const { data, error } = await supabase.from("dst_vendor_contacts")
      .insert({ ...row, vendor_id, created_by: who, updated_by: who }).select(CONTACT_COLS).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ contact: data });
  }

  const row = clean(body);
  if (!row.name) return NextResponse.json({ error: "Account name required" }, { status: 400 });
  const { data, error } = await supabase.from("dst_vendors")
    .insert({ ...row, created_by: who, updated_by: who }).select(COLS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: { ...(data as object), contacts: [] } });
}

export async function PATCH(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createAdminClient();
  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const who = user.email ?? user.id;

  if (body.kind === "contact") {
    const { data, error } = await supabase.from("dst_vendor_contacts")
      .update({ ...cleanContact(body), updated_by: who, updated_at: new Date().toISOString() })
      .eq("id", id).select(CONTACT_COLS).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ contact: data });
  }

  // An account cannot be its own parent, which would hide it from the affiliation tree.
  const row = clean(body);
  if (row.parent_id === id) row.parent_id = null;
  const { data, error } = await supabase.from("dst_vendors")
    .update({ ...row, updated_by: who, updated_at: new Date().toISOString() })
    .eq("id", id).select(COLS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function DELETE(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createAdminClient();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const kind = searchParams.get("kind");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  if (kind === "contact") {
    const { error } = await supabase.from("dst_vendor_contacts").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Brokerages under a deleted broker dealer keep their own records; only the link goes,
  // which the parent_id foreign key handles on its own.
  const { error } = await supabase.from("dst_vendors").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
