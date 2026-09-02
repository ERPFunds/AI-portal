import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// The managed list of fund labels (Fund IV, Fund III, DST I, …). Portal-owned — investors are
// tagged against these and the CRM's fund filter is built from them.
// RLS-locked → service-role client.

const COLS = "id, name, program, sort_order, created_by, created_at";

// An investor's fund field is a comma-separated list of labels ("DST I, DST II"), so a fund
// is only "sole" for that investor once removing it leaves nothing behind.
const labelsOf = (fund: unknown): string[] =>
  String(fund ?? "").split(",").map((s) => s.trim()).filter(Boolean);

/** Investors carrying this fund, split by whether it is the only one they hold. */
async function investorsForFund(
  supabase: ReturnType<typeof createAdminClient>, name: string, program: string | null,
) {
  let q = supabase.from("investor_crm").select("investor_key, investor, fund, fund_commitments");
  if (program) q = q.eq("program", program);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const sole: Record<string, unknown>[] = [];
  const shared: Record<string, unknown>[] = [];
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const labels = labelsOf(row.fund);
    if (!labels.includes(name)) continue;
    (labels.length === 1 ? sole : shared).push(row);
  }
  return { sole, shared };
}

export async function GET(req: NextRequest) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createAdminClient();

  // ?impact=<fund name> — what a cascading delete would actually remove, so the confirmation
  // can state it rather than guess.
  const impact = req.nextUrl.searchParams.get("impact");
  if (impact) {
    const program = req.nextUrl.searchParams.get("program");
    const { sole, shared } = await investorsForFund(supabase, impact, program);
    const keys = sole.map((r) => r.investor_key as string);
    let contacts = 0;
    if (keys.length) {
      const { count } = await supabase.from("investor_contacts")
        .select("id", { count: "exact", head: true }).in("investor_key", keys);
      contacts = count ?? 0;
    }
    return NextResponse.json({
      fund: impact,
      investorsDeleted: sole.length,
      contactsDeleted: contacts,
      investorsUntagged: shared.length,
      sample: sole.slice(0, 8).map((r) => r.investor as string),
    });
  }

  const { data, error } = await supabase
    .from("crm_funds").select(COLS)
    .order("sort_order", { ascending: true }).order("name", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ funds: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createAdminClient();

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const program = ["PE", "DST"].includes(body.program) ? body.program : null;

  const { data, error } = await supabase
    .from("crm_funds")
    .upsert({ name, program, sort_order: Number(body.sort_order) || 0, created_by: user.email ?? user.id }, { onConflict: "name" })
    .select(COLS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ fund: data });
}

export async function DELETE(req: NextRequest) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createAdminClient();

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data: fund } = await supabase.from("crm_funds").select(COLS).eq("id", id).maybeSingle();

  // Without cascade the label simply disappears and every investor record stays put.
  // With it, investors who held only this fund go too, contacts and all.
  const removed = { investorsDeleted: 0, contactsDeleted: 0, investorsUntagged: 0 };
  if (req.nextUrl.searchParams.get("cascade") === "1" && fund) {
    const name = fund.name as string;
    const { sole, shared } = await investorsForFund(supabase, name, (fund.program as string) ?? null);

    const keys = sole.map((r) => r.investor_key as string);
    if (keys.length) {
      const { count } = await supabase.from("investor_contacts")
        .select("id", { count: "exact", head: true }).in("investor_key", keys);
      removed.contactsDeleted = count ?? 0;
      // Contacts first — investor_contacts is keyed by investor_key, not a foreign key, so
      // deleting the parent alone would strand them.
      const { error: cErr } = await supabase.from("investor_contacts").delete().in("investor_key", keys);
      if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
      const { error: iErr } = await supabase.from("investor_crm").delete().in("investor_key", keys);
      if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });
      removed.investorsDeleted = keys.length;
    }

    // Investors in more than one fund keep their record and just lose this label.
    for (const row of shared) {
      const labels = labelsOf(row.fund).filter((l) => l !== name);
      const commitments = { ...((row.fund_commitments as Record<string, unknown>) ?? {}) };
      delete commitments[name];
      await supabase.from("investor_crm").update({
        fund: labels.join(", "),
        fund_commitments: Object.keys(commitments).length ? commitments : null,
        updated_by: `fund-delete:${user.email ?? user.id}`, updated_at: new Date().toISOString(),
      }).eq("investor_key", row.investor_key as string);
    }
    removed.investorsUntagged = shared.length;
  }

  const { error } = await supabase.from("crm_funds").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, ...removed });
}
