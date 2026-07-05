import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Event/list contact import: bulk-stage contacts (e.g. from a conference badge-scan CSV) into
// imported_contacts. Team-wide; all access gated on an authed session.

const COLS = "id, name, email, company, title, phone, category, event, notes, status, sf_contact_id, created_at";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { data, error } = await supabase
    .from("imported_contacts")
    .select(COLS)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const event: string = (body.event ?? "").toString().trim() || null as unknown as string;
  const category: string | null = (body.category ?? "").toString().trim() || null;
  const contacts: unknown = body.contacts;
  if (!Array.isArray(contacts) || contacts.length === 0) {
    return NextResponse.json({ error: "no contacts provided" }, { status: 400 });
  }

  const clean = (contacts as Record<string, unknown>[])
    .map((c) => ({
      name: (c.name ?? "").toString().trim() || null,
      email: (c.email ?? "").toString().trim().toLowerCase() || null,
      company: (c.company ?? "").toString().trim() || null,
      title: (c.title ?? "").toString().trim() || null,
      phone: (c.phone ?? "").toString().trim() || null,
      notes: (c.notes ?? "").toString().trim() || null,
      category,
      event,
      status: "new",
      created_by: user.email ?? user.id,
    }))
    // Require at least a name or an email to be a real row.
    .filter((c) => c.name || c.email)
    .slice(0, 2000);

  if (clean.length === 0) return NextResponse.json({ error: "no valid rows (need a name or email)" }, { status: 400 });

  const { data, error } = await supabase.from("imported_contacts").insert(clean).select(COLS);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ inserted: data?.length ?? 0, items: data ?? [] });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await supabase.from("imported_contacts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
