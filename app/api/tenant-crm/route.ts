import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Tenant CRM — the companies at ERP properties: current tenants, prospects and prior
// tenants, each with its own contacts. Portal-managed, team-wide. RLS-locked → service-role.
//
// The ERP entity and property address options come from the properties table rather than a
// hard-coded list, so the dropdowns stay in step as the portfolio changes.

const DESCRIPTIONS = ["Tenant", "Prospect", "Prior Tenant"];
const CONTACT_TYPES = ["Billing", "Onsite", "Leasing", "All"];

const COLS = "id, name, description, erp_entity, property_address, website, linkedin_url, " +
  "notes, status, industry, market, owner, archived, created_by, created_at, updated_by, updated_at";
const CONTACT_COLS = "id, tenant_id, contact_name, contact_type, title, email, phone, " +
  "phone_office, phone_cell, address, linkedin_url, notes, is_primary, property_label";

function clean(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  const str = (v: unknown) => String(v ?? "").trim() || null;
  if (typeof body.name === "string") out.name = body.name.trim();
  if (body.description !== undefined) {
    out.description = DESCRIPTIONS.includes(String(body.description)) ? String(body.description) : "Tenant";
  }
  for (const k of ["erp_entity", "property_address", "website", "linkedin_url", "notes"]) {
    if (body[k] !== undefined) out[k] = str(body[k]);
  }
  if (body.archived !== undefined) out.archived = !!body.archived;
  return out;
}

function cleanContact(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  const str = (v: unknown) => String(v ?? "").trim() || null;
  if (typeof body.contact_name === "string") out.contact_name = body.contact_name.trim();
  if (body.contact_type !== undefined) {
    out.contact_type = CONTACT_TYPES.includes(String(body.contact_type)) ? String(body.contact_type) : "All";
  }
  for (const k of ["title", "email", "phone", "phone_office", "phone_cell", "address", "linkedin_url", "notes", "property_label"]) {
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

  const [{ data: items, error }, { data: contacts }, { data: props }] = await Promise.all([
    supabase.from("tenants").select(COLS).eq("archived", false).order("name"),
    supabase.from("tenant_contacts").select(CONTACT_COLS).order("is_primary", { ascending: false }).order("contact_name"),
    supabase.from("properties").select("entity, address").order("entity").order("address"),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byTenant = new Map<string, unknown[]>();
  for (const c of (contacts ?? []) as unknown as { tenant_id: string }[]) {
    const list = byTenant.get(c.tenant_id) ?? [];
    list.push(c);
    byTenant.set(c.tenant_id, list);
  }
  const withContacts = ((items ?? []) as unknown as { id: string }[])
    .map((t) => ({ ...t, contacts: byTenant.get(t.id) ?? [] }));

  // Addresses come from the portfolio. Entities come from the tenant records instead:
  // the tenant directory names them "ERP DST I", where properties.entity says "DST".
  // A canonical list keeps every ERP vehicle offerable even before a tenant uses it.
  const rows = (props ?? []) as unknown as { entity: string | null; address: string | null }[];
  const CANONICAL = ["ERP DST I", "ERP DST II", "ERP DST III", "ERP DST IV",
    "ERP Fund II", "ERP Fund III", "ERP Fund IV"];
  const used = ((items ?? []) as unknown as { erp_entity: string | null }[])
    .map((t) => t.erp_entity).filter(Boolean) as string[];
  const entities = [...new Set([...CANONICAL, ...used])];
  const addresses = rows
    .filter((r) => r.address)
    .map((r) => ({ address: r.address as string, entity: r.entity ?? "" }));

  return NextResponse.json({ items: withContacts, entities, addresses, descriptions: DESCRIPTIONS, contactTypes: CONTACT_TYPES });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createAdminClient();
  const body = await req.json().catch(() => ({}));
  const who = user.email ?? user.id;

  if (body.kind === "contact") {
    const tenant_id = String(body.tenant_id ?? "").trim();
    if (!tenant_id) return NextResponse.json({ error: "tenant_id required" }, { status: 400 });
    const row = cleanContact(body);
    if (!row.contact_name) return NextResponse.json({ error: "Contact name required" }, { status: 400 });
    const { data, error } = await supabase.from("tenant_contacts")
      .insert({ ...row, tenant_id, created_by: who }).select(CONTACT_COLS).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ contact: data });
  }

  const row = clean(body);
  if (!row.name) return NextResponse.json({ error: "Company name required" }, { status: 400 });
  const { data, error } = await supabase.from("tenants")
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
    const { data, error } = await supabase.from("tenant_contacts")
      .update({ ...cleanContact(body), updated_by: who }).eq("id", id).select(CONTACT_COLS).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ contact: data });
  }

  const { data, error } = await supabase.from("tenants")
    .update({ ...clean(body), updated_by: who, updated_at: new Date().toISOString() })
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

  const table = kind === "contact" ? "tenant_contacts" : "tenants";
  // Removing a company takes its contacts with it; they exist only in its context.
  if (table === "tenants") await supabase.from("tenant_contacts").delete().eq("tenant_id", id);
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
