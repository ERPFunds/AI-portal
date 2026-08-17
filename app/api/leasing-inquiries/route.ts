import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Live inbound leasing inquiries for the Inbound Leasing Inquiries tab. Table is RLS-locked, so
// reads/writes go through the service-role client; every request is gated on an authed user first.
const COLS =
  "id, source_mailbox, received_at, from_email, from_name, contact_name, contact_company, contact_email, contact_phone, inquiry_type, sf_needed, acreage_needed, needs_yard, needs_crane, office_needed, market, submarket, budget_psf, timeline, summary, status, matched_property_id, matched_address, match_note, raw_subject, preview, created_at";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin.from("leasing_inquiries").select(COLS)
    .neq("status", "dismissed").order("received_at", { ascending: false, nullsFirst: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status) patch.status = body.status === "new" ? "new" : "dismissed";

  const admin = createAdminClient();
  const { error } = await admin.from("leasing_inquiries").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
