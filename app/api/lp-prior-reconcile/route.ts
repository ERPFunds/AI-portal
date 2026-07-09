import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { salesforceConfigured, reconcilePriorContacts, type PriorReconcileEntity } from "@/lib/agents/ir/salesforce";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// One-time reconciliation of the imported prior-fund contacts (lp_prior_contacts) against Salesforce.
// Read-only by default; pass ?apply=1&confirm=YES to actually create the missing Accounts/Contacts.
export async function GET(req: NextRequest) {
  if (!salesforceConfigured()) return NextResponse.json({ error: "Salesforce not configured" }, { status: 503 });

  const apply = req.nextUrl.searchParams.get("apply") === "1" && req.nextUrl.searchParams.get("confirm") === "YES";

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("lp_prior_contacts")
    .select("investor_name, fund_label, first_name, last_name, email, company");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Aggregate rows by investor entity.
  const byKey = new Map<string, PriorReconcileEntity>();
  const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  for (const r of (data ?? []) as { investor_name: string; fund_label: string; first_name: string | null; last_name: string | null; email: string | null; company: string | null }[]) {
    const key = norm(r.investor_name);
    if (!key) continue;
    let e = byKey.get(key);
    if (!e) { e = { investor: r.investor_name, funds: [], contacts: [] }; byKey.set(key, e); }
    if (r.fund_label && !e.funds.includes(r.fund_label)) e.funds.push(r.fund_label);
    if ((r.email || "").trim()) {
      e.contacts.push({ firstName: r.first_name || "", lastName: r.last_name || "", email: (r.email || "").trim(), company: r.company || "" });
    }
  }
  const entities = [...byKey.values()];
  for (const e of entities) e.funds.sort();

  const report = await reconcilePriorContacts(entities, { apply });
  return NextResponse.json({ mode: apply ? "APPLIED" : "read-only (preview)", ...report });
}
