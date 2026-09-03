import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetch-all";

export const dynamic = "force-dynamic";

// Investor CRM overlay: portal-owned fields layered onto the LP-directory record,
// keyed by normalized investor name (same key convention as lp_committed). These are
// fields the CRM owns and Salesforce/SharePoint do not — the 7-stage capital-raise
// funnel value, LP tier, relationship owner, and source. Committed capital, funds,
// broker/advisor, last interaction, and meetings all still come from /api/lp-directory.
// RLS-locked table → all I/O via the service-role client.

const FUNNEL_STAGES = [
  "Identified", "Contacted", "Deck/OM sent", "Diligence", "Soft-circle", "Subscription docs", "Funded",
];
const TIERS = ["Anchor", "Core", "Prospect"];
const DESCRIPTIONS = ["Investor", "Buyer", "Broker", "Lawyer"];
const PROGRAMS = ["PE", "DST"];

const COLS = "investor_key, investor, program, funnel_stage, tier, owner, source, entity, investor_type, target_amount, expected_close, archived, portal_created, is_lp, fund, prior_fund, fund_commitments, committed_usd, contact, email, phone, address, website, state, notes, next_steps, broker_dealer, advisor, about, about_sources, about_researched_at, updated_by, updated_at";

// Must match how keys are stored: lowercase, punctuation collapsed to single spaces.
// A weaker normalization silently inserts a duplicate instead of updating the record.
const normKey = (investor: string) => investor.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const str = (v: unknown) => { const t = String(v ?? "").trim(); return t || null; };
const money = (v: unknown) => {
  const raw = String(v ?? "").replace(/[$,\s]/g, "");
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

export async function GET() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createAdminClient();

  // Paged: the table is past PostgREST's 1,000-row default, and an unbounded select
  // would drop the overflow without erroring.
  let data: { investor_key: string }[];
  try {
    data = await fetchAll<{ investor_key: string }>(() => supabase.from("investor_crm").select(COLS));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }

  // Return as a map keyed by investor_key so the client can merge onto LP records in O(1).
  const byKey: Record<string, unknown> = {};
  for (const row of data) byKey[row.investor_key] = row;
  return NextResponse.json({ overlays: byKey });
}

export async function PATCH(req: NextRequest) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createAdminClient();

  const body = await req.json().catch(() => ({}));
  const investor = String(body.investor ?? "").trim();
  if (!investor) return NextResponse.json({ error: "investor required" }, { status: 400 });

  // Renaming the entity moves the record and its contacts to a new key.
  const renameTo = String(body.rename_to ?? "").trim();
  if (renameTo && normKey(renameTo) !== normKey(investor)) {
    const newKey = normKey(renameTo);
    const { data: clash } = await supabase.from("investor_crm").select("investor_key").eq("investor_key", newKey).maybeSingle();
    if (clash) return NextResponse.json({ error: "An investor with that name already exists" }, { status: 409 });
    // Everything keyed on investor_key has to move together, or the rename silently
    // orphans the record's commitments, prior-fund contacts and distribution-list rows.
    const oldKey = normKey(investor);
    await supabase.from("investor_contacts").update({ investor_key: newKey, investor: renameTo }).eq("investor_key", oldKey);
    await supabase.from("lp_committed").update({ investor_key: newKey, investor: renameTo }).eq("investor_key", oldKey);
    await supabase.from("lp_prior_contacts").update({ investor_key: newKey }).eq("investor_key", oldKey);
    await supabase.from("crm_distribution_list_members").update({ investor_key: newKey, investor: renameTo }).eq("investor_key", oldKey);
    const { data: moved, error: mErr } = await supabase.from("investor_crm")
      .update({ investor_key: newKey, investor: renameTo, updated_by: user.email ?? user.id, updated_at: new Date().toISOString() })
      .eq("investor_key", normKey(investor)).select(COLS).single();
    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
    return NextResponse.json({ overlay: moved });
  }
  const row: Record<string, unknown> = {
    investor_key: normKey(investor),
    investor,
    updated_by: user.email ?? user.id,
    updated_at: new Date().toISOString(),
  };
  if (body.program !== undefined) row.program = PROGRAMS.includes(body.program) ? body.program : null;
  if (body.funnel_stage !== undefined) row.funnel_stage = body.funnel_stage && FUNNEL_STAGES.includes(body.funnel_stage) ? body.funnel_stage : (body.funnel_stage || null);
  if (body.tier !== undefined) { const t = body.tier ? String(body.tier).trim() : ""; row.tier = t && TIERS.includes(t) ? t : (t || null); }
  if (body.owner !== undefined) row.owner = body.owner ? String(body.owner).trim() : null;
  if (body.source !== undefined) row.source = body.source ? String(body.source).trim() : null;
  // Free text is accepted so historic values ("Law Firm", "Vendor") survive an unrelated save.
  if (body.investor_type !== undefined) row.investor_type = str(body.investor_type);
  if (body.entity !== undefined) row.entity = body.entity ? String(body.entity).trim() : null;
  // Portal overrides for the SF Opportunity Amount / CloseDate shown on the record.
  if (body.target_amount !== undefined) {
    const raw = String(body.target_amount ?? "").replace(/[$,\s]/g, "");
    const n = raw ? Number(raw) : NaN;
    row.target_amount = Number.isFinite(n) && n > 0 ? n : null;
  }
  if (body.archived !== undefined) row.archived = !!body.archived;
  if (body.is_lp !== undefined) row.is_lp = !!body.is_lp;
  // Hand-edited About wins over whatever the research route last wrote.
  if (body.about !== undefined) row.about = str(body.about);
  if (body.fund !== undefined) row.fund = str(body.fund);
  if (body.prior_fund !== undefined) row.prior_fund = str(body.prior_fund);
  if (body.contact !== undefined) row.contact = str(body.contact);
  if (body.email !== undefined) row.email = str(body.email);
  if (body.phone !== undefined) row.phone = str(body.phone);
  if (body.address !== undefined) row.address = str(body.address);
  if (body.website !== undefined) row.website = str(body.website);
  if (body.notes !== undefined) row.notes = str(body.notes);
  if (body.next_steps !== undefined) row.next_steps = str(body.next_steps);
  if (body.broker_dealer !== undefined) row.broker_dealer = str(body.broker_dealer);
  if (body.advisor !== undefined) row.advisor = str(body.advisor);
  if (body.state !== undefined) row.state = body.state ? String(body.state).trim().toUpperCase().slice(0,2) : null;
  if (body.committed_usd !== undefined) row.committed_usd = money(body.committed_usd);
  if (body.expected_close !== undefined) {
    const d = String(body.expected_close ?? "").slice(0, 10);
    row.expected_close = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
  }

  const { data, error } = await supabase
    .from("investor_crm")
    .upsert(row, { onConflict: "investor_key" })
    .select(COLS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ overlay: data });
}

// Create an investor in the portal. Salesforce is being offboarded, so nothing is written
// externally — the portal is the system of record for these records.
export async function POST(req: NextRequest) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createAdminClient();

  const body = await req.json().catch(() => ({}));
  const investor = String(body.investor ?? "").trim();
  if (!investor) return NextResponse.json({ error: "investor name is required" }, { status: 400 });

  const key = normKey(investor);
  const { data: existing } = await supabase
    .from("investor_crm").select("investor_key").eq("investor_key", key).maybeSingle();
  if (existing) return NextResponse.json({ error: "An investor with that name already exists" }, { status: 409 });

  const { data, error } = await supabase.from("investor_crm").insert({
    investor_key: key,
    investor,
    program: ["PE", "DST"].includes(body.program) ? body.program : "PE",
    // Which side of the book: the LP Directory and DST Investors are is_lp records,
    // PE Prospects are not.
    is_lp: body.is_lp === true,
    portal_created: true,
    archived: false,
    fund: str(body.fund),
    funnel_stage: FUNNEL_STAGES.includes(body.funnel_stage) ? body.funnel_stage : null,
    committed_usd: money(body.committed_usd),
    target_amount: money(body.target_amount),
    contact: str(body.contact),
    email: str(body.email),
    phone: str(body.phone),
    notes: str(body.notes),
    owner: str(body.owner),
    investor_type: DESCRIPTIONS.includes(body.investor_type) ? body.investor_type : str(body.investor_type),
    updated_by: user.email ?? user.id,
  }).select(COLS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ overlay: data });
}

// Remove a portal-created investor outright. Imported investors are archived via
// PATCH { archived: true } instead — the portal never edits the source systems.
export async function DELETE(req: NextRequest) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createAdminClient();

  const key = normKey(req.nextUrl.searchParams.get("investor_key") ?? "");
  if (!key) return NextResponse.json({ error: "investor_key required" }, { status: 400 });

  const { data: row } = await supabase
    .from("investor_crm").select("investor_key, portal_created").eq("investor_key", key).maybeSingle();
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(row as { portal_created?: boolean }).portal_created) {
    return NextResponse.json({ error: "This investor came from an import — archive it instead." }, { status: 400 });
  }

  const { error } = await supabase.from("investor_crm").delete().eq("investor_key", key);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
