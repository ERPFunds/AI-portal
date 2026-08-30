import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// The "Other" directory — non-investor relationships (lenders, law firms, vendors) that come in
// alongside investor exports. Portal-owned. RLS-locked → service-role client.

const CATEGORIES = ["Lender", "Law Firm", "Vendor", "Other"];
const COLS = "id, name_key, name, match_key, category, contact, title, email, phone, phone_cell, address, owner, notes, created_at, updated_at";

const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const str = (v: unknown) => { const t = String(v ?? "").trim(); return t || null; };

function clean(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  if (typeof body.name === "string") out.name = body.name.trim();
  if (body.category != null) out.category = CATEGORIES.includes(String(body.category)) ? String(body.category) : "Other";
  if (body.contact != null) out.contact = str(body.contact);
  if (body.title != null) out.title = str(body.title);
  if (body.email != null) out.email = str(body.email);
  if (body.phone != null) out.phone = str(body.phone);
  if (body.phone_cell != null) out.phone_cell = str(body.phone_cell);
  if (body.address != null) out.address = str(body.address);
  if (body.owner != null) out.owner = str(body.owner);
  if (body.notes != null) out.notes = str(body.notes);
  return out;
}

export async function GET() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createAdminClient();

  const { data, error } = await supabase.from("crm_other").select(COLS)
    .order("name", { ascending: true }).order("contact", { ascending: true, nullsFirst: true });
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

  const email = String(body.email ?? "").trim();
  const contact = String(body.contact ?? "").trim();
  const by = user.email ?? user.id;
  const { data, error } = await supabase.from("crm_other").upsert({
    ...row,
    name_key: norm(String(row.name)),
    match_key: email ? `e:${email.toLowerCase()}` : `n:${norm(contact || String(row.name))}`,
    created_by: by, updated_by: by,
  }, { onConflict: "name_key,match_key" }).select(COLS).single();
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

  const { data, error } = await supabase.from("crm_other")
    .update({ ...row, updated_by: user.email ?? user.id, updated_at: new Date().toISOString() })
    .eq("id", id).select(COLS).single();
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
  const { error } = await supabase.from("crm_other").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
