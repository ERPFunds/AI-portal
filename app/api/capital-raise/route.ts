import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Fund IV capital-raise pipeline: portal-managed opportunities moving through the raise funnel.
// All access is gated on an authed session; the pipeline is team-wide.

const STAGES = ["Identified", "Contacted", "Deck/OM sent", "Diligence", "Soft-circle", "Subscription docs", "Funded"];
const CHANNELS = ["Direct Fund IV LP", "DST/1031"];

const COLS = "id, prospect, channel, stage, expected_amount, owner, probability, next_step, last_touch, notes, created_at, updated_at";

function clean(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  if (typeof body.prospect === "string") out.prospect = body.prospect.trim();
  if (typeof body.channel === "string") out.channel = CHANNELS.includes(body.channel) ? body.channel : "Direct Fund IV LP";
  if (typeof body.stage === "string") out.stage = STAGES.includes(body.stage) ? body.stage : "Identified";
  if (body.expected_amount != null) out.expected_amount = Math.max(0, Number(body.expected_amount) || 0);
  if (body.owner != null) out.owner = String(body.owner).trim() || null;
  if (body.probability != null) out.probability = Math.min(100, Math.max(0, Math.round(Number(body.probability) || 0)));
  if (body.next_step != null) out.next_step = String(body.next_step).trim() || null;
  if (body.last_touch != null) out.last_touch = String(body.last_touch).slice(0, 10) || null;
  if (body.notes != null) out.notes = String(body.notes).trim() || null;
  return out;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { data, error } = await supabase
    .from("capital_raise_pipeline")
    .select(COLS)
    .order("expected_amount", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const row = clean(body);
  if (!row.prospect) return NextResponse.json({ error: "prospect required" }, { status: 400 });

  const { data, error } = await supabase
    .from("capital_raise_pipeline")
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
    .from("capital_raise_pipeline")
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
  const { error } = await supabase.from("capital_raise_pipeline").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
