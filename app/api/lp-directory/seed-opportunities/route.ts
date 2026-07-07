import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { seedFundIvOpportunities } from "@/lib/agents/ir/salesforce";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ONE-TIME bulk seed: create a Salesforce Opportunity (stage=Proposal by default) for every Fund IV
// TARGET LP that has a matched Account but no existing Opportunity. Reads the LP directory cache for
// the target list. Dry-run by default; pass ?apply=1&confirm=fund-iv-proposals to actually write.
// Temporary admin endpoint — remove after use.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.from("lp_directory_cache").select("data").eq("id", 1).maybeSingle();
  const lps = ((data as { data?: { lps?: Record<string, unknown>[] } } | null)?.data?.lps ?? []) as Record<string, unknown>[];
  if (!lps.length) return NextResponse.json({ error: "LP directory cache is empty — open the LP directory / Sync first" }, { status: 400 });

  const targets = lps
    .filter((l) => l.group !== "DST / 1031")
    .map((l) => ({ investor: String(l.investor ?? ""), crmId: (l.sfCrmId as string) ?? null, amountUsd: Number(l.commitmentUsd) || 0 }))
    .filter((t) => t.investor);

  const apply = req.nextUrl.searchParams.get("apply") === "1" && req.nextUrl.searchParams.get("confirm") === "fund-iv-proposals";
  const stage = req.nextUrl.searchParams.get("stage") || "Proposal";

  const r = await seedFundIvOpportunities(targets, stage, !apply);
  return NextResponse.json({
    applied: apply,
    stage,
    fundIvTargets: r.targets,
    created: r.created.length,
    skippedHasOpp: r.skippedHasOpp.length,
    skippedNoAccount: r.skippedNoAccount.length,
    errorCount: r.errors.length,
    sampleCreated: r.created.slice(0, 10),
    sampleErrors: r.errors.slice(0, 10),
  });
}
