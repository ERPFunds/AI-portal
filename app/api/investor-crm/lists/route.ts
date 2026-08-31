import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// CRM distribution lists: named lists an investor can be added to (Quarterly LP Update,
// Fund IV — Warm, etc.). Distinct from the Salesforce broker distribution list at
// /api/distribution-lists. Membership is keyed by investor_key (normalized name).
// RLS-locked tables → service-role client.

const LIST_COLS = "id, name, description, program, created_by, created_at";
const MEMBER_COLS = "id, list_id, investor_key, investor, added_by, added_at";
// Must match how keys are stored: lowercase, punctuation collapsed to single spaces.
// A weaker normalization silently inserts a duplicate instead of updating the record.
const normKey = (investor: string) => investor.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export async function GET(req: NextRequest) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createAdminClient();

  const investorKey = normKey(req.nextUrl.searchParams.get("investor_key") ?? "");

  const [{ data: lists, error: le }, { data: members, error: me }] = await Promise.all([
    supabase.from("crm_distribution_lists").select(LIST_COLS).order("created_at", { ascending: true }),
    supabase.from("crm_distribution_list_members").select(MEMBER_COLS),
  ]);
  if (le) return NextResponse.json({ error: le.message }, { status: 500 });
  if (me) return NextResponse.json({ error: me.message }, { status: 500 });

  const memberRows = (members ?? []) as { list_id: string; investor_key: string }[];
  const counts: Record<string, number> = {};
  for (const m of memberRows) counts[m.list_id] = (counts[m.list_id] ?? 0) + 1;

  const withCounts = (lists ?? []).map((l) => ({ ...(l as Record<string, unknown>), member_count: counts[(l as { id: string }).id] ?? 0 }));

  // If an investor_key is supplied, also return which list ids that investor belongs to.
  const memberIds = investorKey
    ? memberRows.filter((m) => m.investor_key === investorKey).map((m) => m.list_id)
    : undefined;

  return NextResponse.json({ lists: withCounts, memberIds });
}

export async function POST(req: NextRequest) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createAdminClient();

  const body = await req.json().catch(() => ({}));
  const by = user.email ?? user.id;

  if (body.action === "create-list") {
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
    const { data, error } = await supabase
      .from("crm_distribution_lists")
      .insert({
        name,
        description: body.description ? String(body.description).trim() : null,
        program: ["PE", "DST"].includes(body.program) ? body.program : null,
        created_by: by,
      })
      .select(LIST_COLS)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ list: { ...data, member_count: 0 } });
  }

  if (body.action === "add-member") {
    const listId = String(body.list_id ?? "").trim();
    const investor = String(body.investor ?? "").trim();
    if (!listId || !investor) return NextResponse.json({ error: "list_id and investor required" }, { status: 400 });
    const { data, error } = await supabase
      .from("crm_distribution_list_members")
      .upsert(
        { list_id: listId, investor_key: normKey(investor), investor, added_by: by },
        { onConflict: "list_id,investor_key" }
      )
      .select(MEMBER_COLS)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ member: data });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createAdminClient();

  const listId = req.nextUrl.searchParams.get("list_id");
  const investorKey = req.nextUrl.searchParams.get("investor_key");

  // Remove a single membership (investor from a list)
  if (listId && investorKey) {
    const { error } = await supabase
      .from("crm_distribution_list_members")
      .delete()
      .eq("list_id", listId)
      .eq("investor_key", normKey(investorKey));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Delete an entire list (members cascade)
  if (listId) {
    const { error } = await supabase.from("crm_distribution_lists").delete().eq("id", listId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "list_id required" }, { status: 400 });
}
