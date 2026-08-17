import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TX_ROWS, FL_ROWS } from "@/lib/data/dealPipelineData";

export const dynamic = "force-dynamic";

// Editable Deal Pipeline mirror. The TX/FL workbook rows live in pipeline_rows (jsonb per row) so
// they can be edited in-app. On first read for a state the table self-seeds from the generated
// workbook data (TX_ROWS / FL_ROWS) — after that it's portal-managed and no longer synced to the
// SharePoint spreadsheets. RLS-locked table → service-role client, gated on an authed user.

async function seedIfEmpty(admin: ReturnType<typeof createAdminClient>, state: "TX" | "FL") {
  const { count } = await admin.from("pipeline_rows").select("id", { count: "exact", head: true }).eq("state", state);
  if (count && count > 0) return;
  const rows = (state === "TX" ? TX_ROWS : FL_ROWS).map((data, i) => ({ state, sort_order: i, data }));
  if (rows.length) await admin.from("pipeline_rows").insert(rows);
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const state = req.nextUrl.searchParams.get("state") === "FL" ? "FL" : "TX";
  const admin = createAdminClient();
  await seedIfEmpty(admin, state);
  const { data, error } = await admin.from("pipeline_rows").select("id, sort_order, data").eq("state", state).order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const state = body.state === "FL" ? "FL" : "TX";
  const data = body.data ?? {};
  const admin = createAdminClient();
  const { data: maxRow } = await admin.from("pipeline_rows").select("sort_order").eq("state", state).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const sort_order = ((maxRow?.sort_order as number) ?? -1) + 1;
  const { data: row, error } = await admin.from("pipeline_rows").insert({ state, sort_order, data }).select("id, sort_order, data").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: row });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "");
  if (!id || !body.data) return NextResponse.json({ error: "id and data required" }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from("pipeline_rows").update({ data: body.data, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from("pipeline_rows").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
