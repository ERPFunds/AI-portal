import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Deal Pipeline: portal-managed active acquisition deals (LOI → closing). Auth-gated; team-wide.

const STAGES = ["Sourcing", "LOI", "Under Contract", "Due Diligence", "IC Approval", "Closing", "Closed"];

const COLS = "id, deal_name, entity, market, stage, owner, purchase_price, budget, costs_to_date, next_action, next_action_due, dd_deadline, closing_date, notes, created_at, updated_at";

function num(v: unknown): number | null {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, n) : null;
}
function date(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).slice(0, 10);
  return s || null;
}

function clean(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  if (typeof body.deal_name === "string") out.deal_name = body.deal_name.trim();
  if (body.entity != null) out.entity = String(body.entity).trim() || null;
  if (body.market != null) out.market = String(body.market).trim() || null;
  if (typeof body.stage === "string") out.stage = STAGES.includes(body.stage) ? body.stage : "Sourcing";
  if (body.owner != null) out.owner = String(body.owner).trim() || null;
  if ("purchase_price" in body) out.purchase_price = num(body.purchase_price);
  if ("budget" in body) out.budget = num(body.budget);
  if ("costs_to_date" in body) out.costs_to_date = num(body.costs_to_date);
  if (body.next_action != null) out.next_action = String(body.next_action).trim() || null;
  if ("next_action_due" in body) out.next_action_due = date(body.next_action_due);
  if ("dd_deadline" in body) out.dd_deadline = date(body.dd_deadline);
  if ("closing_date" in body) out.closing_date = date(body.closing_date);
  if (body.notes != null) out.notes = String(body.notes).trim() || null;
  return out;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { data, error } = await supabase
    .from("deal_pipeline")
    .select(COLS)
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const row = clean(body);
  if (!row.deal_name) return NextResponse.json({ error: "deal_name required" }, { status: 400 });

  const { data, error } = await supabase
    .from("deal_pipeline")
    .insert({ ...row, created_by: user.email ?? user.id })
    .select(COLS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const id = body.id;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const row = clean(body);
  delete (row as { id?: unknown }).id;

  const { data, error } = await supabase
    .from("deal_pipeline")
    .update({ ...row, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(COLS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await supabase.from("deal_pipeline").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
