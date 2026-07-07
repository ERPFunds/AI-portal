import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAccountsAndOpportunities } from "@/lib/agents/ir/salesforce";
import { logSalesforceActivity } from "@/lib/agents/ir/activity-log";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ONE-TIME: for Fund IV target LPs that have NO Salesforce Account, create the Account + a Proposal
// Opportunity. Dry-run by default; ?apply=1&confirm=fund-iv-accounts to write. Temporary — remove after.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.from("lp_directory_cache").select("data").eq("id", 1).maybeSingle();
  const lps = ((data as { data?: { lps?: Record<string, unknown>[] } } | null)?.data?.lps ?? []) as Record<string, unknown>[];
  if (!lps.length) return NextResponse.json({ error: "LP directory cache empty — open/Sync the LP directory first" }, { status: 400 });

  const targets = lps
    .filter((l) => l.group !== "DST / 1031" && !l.sfCrmId) // Fund IV targets with no matched Account
    .map((l) => ({ investor: String(l.investor ?? ""), amountUsd: Number(l.commitmentUsd) || 0 }))
    .filter((t) => t.investor);

  const apply = req.nextUrl.searchParams.get("apply") === "1" && req.nextUrl.searchParams.get("confirm") === "fund-iv-accounts";
  const stage = req.nextUrl.searchParams.get("stage") || "Proposal";

  const r = await createAccountsAndOpportunities(targets, stage, !apply);

  if (apply) {
    for (const c of r.created) {
      await logSalesforceActivity("Created Account + Proposal opportunity", `${c.investor}${c.oppCreated ? "" : " (account only — opp failed)"}`);
    }
    if (r.created.length) await logSalesforceActivity("Fund IV accounts seeded", `Created ${r.created.length} Account(s) + Proposal opportunities`);
  }

  return NextResponse.json({
    applied: apply,
    stage,
    targetsWithoutAccount: r.targets,
    created: r.created.length,
    skippedExists: r.skippedExists.length,
    errorCount: r.errors.length,
    sampleCreated: r.created.slice(0, 15).map((c) => c.investor),
    sampleErrors: r.errors.slice(0, 10),
  });
}
