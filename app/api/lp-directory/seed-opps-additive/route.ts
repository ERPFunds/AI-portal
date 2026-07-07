import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { addFundIvProposalOpps } from "@/lib/agents/ir/salesforce";
import { logSalesforceActivity } from "@/lib/agents/ir/activity-log";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ONE-TIME: add a NEW Fund IV Proposal Opportunity to Fund IV target Accounts (incl. the 52 that
// only have prior-fund Opps) WITHOUT touching existing Opportunities. Skips accounts that already
// have a Fund IV opp. Dry-run by default; ?apply=1&confirm=fund-iv-opps to write. Temporary.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.from("lp_directory_cache").select("data").eq("id", 1).maybeSingle();
  const lps = ((data as { data?: { lps?: Record<string, unknown>[] } } | null)?.data?.lps ?? []) as Record<string, unknown>[];
  if (!lps.length) return NextResponse.json({ error: "LP directory cache empty — Sync the LP directory first" }, { status: 400 });

  const targets = lps
    .filter((l) => l.group !== "DST / 1031" && l.sfCrmId) // Fund IV targets with a matched Account
    .map((l) => ({ investor: String(l.investor ?? ""), crmId: (l.sfCrmId as string) ?? null, amountUsd: Number(l.commitmentUsd) || 0 }))
    .filter((t) => t.investor);

  const apply = req.nextUrl.searchParams.get("apply") === "1" && req.nextUrl.searchParams.get("confirm") === "fund-iv-opps";
  const stage = req.nextUrl.searchParams.get("stage") || "Proposal";

  const r = await addFundIvProposalOpps(targets, stage, !apply);

  if (apply && r.created.length) {
    for (const investor of r.created) await logSalesforceActivity("Added Fund IV Proposal opportunity", investor);
    await logSalesforceActivity("Fund IV opportunities added", `Created ${r.created.length} Fund IV Proposal opportunities (prior-fund opps untouched)`);
  }

  return NextResponse.json({
    applied: apply,
    stage,
    matchedAccounts: r.targets,
    created: r.created.length,
    skippedHasFundIvOpp: r.skippedHasOpp.length,
    skippedNoAccount: r.skippedNoAccount.length,
    errorCount: r.errors.length,
    sampleCreated: r.created.slice(0, 15),
    sampleErrors: r.errors.slice(0, 10),
  });
}
