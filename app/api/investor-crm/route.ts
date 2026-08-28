import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
const PROGRAMS = ["PE", "DST"];

const COLS = "investor_key, investor, program, funnel_stage, tier, owner, source, entity, target_amount, expected_close, updated_by, updated_at";

const normKey = (investor: string) => investor.trim().toLowerCase();

export async function GET() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createAdminClient();

  const { data, error } = await supabase.from("investor_crm").select(COLS);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Return as a map keyed by investor_key so the client can merge onto LP records in O(1).
  const byKey: Record<string, unknown> = {};
  for (const row of (data ?? []) as { investor_key: string }[]) byKey[row.investor_key] = row;
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
  if (body.entity !== undefined) row.entity = body.entity ? String(body.entity).trim() : null;
  // Portal overrides for the SF Opportunity Amount / CloseDate shown on the record.
  if (body.target_amount !== undefined) {
    const raw = String(body.target_amount ?? "").replace(/[$,\s]/g, "");
    const n = raw ? Number(raw) : NaN;
    row.target_amount = Number.isFinite(n) && n > 0 ? n : null;
  }
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
