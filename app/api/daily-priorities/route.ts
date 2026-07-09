import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Finance & Admin daily priority list: a ranked, portal-managed to-do queue for the
// accounting/admin team. Manually managed today; structured so agent workflows
// (deposit reviews, payment applications, approvals, deadlines) can feed it later.
// Access is gated on an authed session; the list is team-wide.

const CATEGORIES = [
  "Deposit Review", "Payment Application", "Check Approval", "Invoice Approval",
  "Overdue Notice", "Approval (above threshold)", "Document Signing",
  "Expense Report", "Deadline", "Other",
];
const PRIORITIES = ["High", "Medium", "Low"];
const STATUSES = ["Open", "In Progress", "Blocked", "Done"];

const COLS = "id, title, reason, category, priority, status, owner, amount, entity, due_date, source, link, notes, created_by, completed_at, created_at, updated_at";

function clean(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  if (typeof body.title === "string") out.title = body.title.trim();
  if (body.reason != null) out.reason = String(body.reason).trim() || null;
  if (typeof body.category === "string") out.category = CATEGORIES.includes(body.category) ? body.category : "Other";
  if (typeof body.priority === "string") out.priority = PRIORITIES.includes(body.priority) ? body.priority : "Medium";
  if (typeof body.status === "string") out.status = STATUSES.includes(body.status) ? body.status : "Open";
  if (body.owner != null) out.owner = String(body.owner).trim() || null;
  if (body.amount != null) out.amount = body.amount === "" ? null : Math.max(0, Number(body.amount) || 0);
  if (body.entity != null) out.entity = String(body.entity).trim() || null;
  if (body.due_date != null) out.due_date = String(body.due_date).slice(0, 10) || null;
  if (body.source != null) out.source = String(body.source).trim() || null;
  if (body.link != null) out.link = String(body.link).trim() || null;
  if (body.notes != null) out.notes = String(body.notes).trim() || null;
  return out;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { data, error } = await supabase
    .from("daily_priorities")
    .select(COLS)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const row = clean(body);
  if (!row.title) return NextResponse.json({ error: "title required" }, { status: 400 });

  const { data, error } = await supabase
    .from("daily_priorities")
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

  // Stamp completion when moving to/from Done.
  if (row.status === "Done") (row as Record<string, unknown>).completed_at = new Date().toISOString();
  else if (typeof row.status === "string") (row as Record<string, unknown>).completed_at = null;

  const { data, error } = await supabase
    .from("daily_priorities")
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
  const { error } = await supabase.from("daily_priorities").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
