import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { opportunityFundBreakdown } from "@/lib/agents/ir/salesforce";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Read-only: for the Fund IV target LPs that already have Salesforce Opportunities, report which
// FUND those opps belong to (are they prior-fund / Fund III deals?). Temporary — remove after use.
export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase.from("lp_directory_cache").select("data").eq("id", 1).maybeSingle();
  const lps = ((data as { data?: { lps?: Record<string, unknown>[] } } | null)?.data?.lps ?? []) as Record<string, unknown>[];
  const accountIds = lps
    .filter((l) => l.group !== "DST / 1031" && l.sfCrmId)
    .map((l) => String(l.sfCrmId));
  const r = await opportunityFundBreakdown(accountIds);
  return NextResponse.json({ fundIvAccountsChecked: accountIds.length, ...r });
}
