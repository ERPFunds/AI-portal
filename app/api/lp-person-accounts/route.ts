import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { salesforceConfigured, syncPersonAccounts, type PersonAccountSync } from "@/lib/agents/ir/salesforce";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// One-time: reconcile the two prior-fund people who are Salesforce PERSON ACCOUNTS (the child-Contact
// insert was rejected). Read-only preview by default; ?apply=1&confirm=YES sets their PersonEmail
// (or creates a person account only if one genuinely doesn't exist).
const TARGET_KEYS = ["jon christiansen", "robert w drummond jr"];

export async function GET(req: NextRequest) {
  if (!salesforceConfigured()) return NextResponse.json({ error: "Salesforce not configured" }, { status: 503 });
  const apply = req.nextUrl.searchParams.get("apply") === "1" && req.nextUrl.searchParams.get("confirm") === "YES";

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("lp_prior_contacts")
    .select("investor_name, investor_key, fund_label, first_name, last_name, email")
    .in("investor_key", TARGET_KEYS);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byKey = new Map<string, PersonAccountSync>();
  for (const r of (data ?? []) as { investor_name: string; investor_key: string; fund_label: string; first_name: string | null; last_name: string | null; email: string | null }[]) {
    let p = byKey.get(r.investor_key);
    if (!p) { p = { name: r.investor_name, firstName: r.first_name || "", lastName: r.last_name || "", email: (r.email || "").trim(), funds: [] }; byKey.set(r.investor_key, p); }
    if (r.fund_label && !p.funds.includes(r.fund_label)) p.funds.push(r.fund_label);
    if (!p.email && (r.email || "").trim()) p.email = (r.email || "").trim();
  }
  const people = [...byKey.values()];
  for (const p of people) p.funds.sort();

  const results = await syncPersonAccounts(people, { apply });
  return NextResponse.json({ mode: apply ? "APPLIED" : "read-only (preview)", results });
}
