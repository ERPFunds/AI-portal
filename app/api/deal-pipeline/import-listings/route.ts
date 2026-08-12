import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { INBOUND_LISTINGS, isPipelineCandidate, listingToDeal } from "@/lib/data/inboundListings";

export const dynamic = "force-dynamic";

// Auto-add-to-pipeline mechanism: promote inbound listings into the deal_pipeline table.
// POST { ids?: string[] }  — specific listing ids to import; omit to import every fit candidate.
// Dedupes against existing deal_name (case-insensitive) so re-running is safe and idempotent.
// Server owns the listing source (INBOUND_LISTINGS today; swap for the live inbox later), so
// callers pass ids only — the mapping and validation happen here. A future auto-capture agent
// can call this same endpoint.

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const ids = Array.isArray(body.ids) ? body.ids.map(String) : null;

  // Resolve requested listings (or all fit candidates), keeping only pipeline-eligible ones.
  const selected = INBOUND_LISTINGS.filter(
    (l) => isPipelineCandidate(l) && (ids ? ids.includes(l.id) : true),
  );

  if (!selected.length) {
    return NextResponse.json({ added: 0, skipped: 0, items: [], message: "No eligible listings to import." });
  }

  // Dedupe against what's already in the pipeline.
  const { data: existing, error: readErr } = await supabase
    .from("deal_pipeline")
    .select("deal_name");
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  const have = new Set((existing ?? []).map((r) => String(r.deal_name).trim().toLowerCase()));

  const toInsert: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const l of selected) {
    const deal = listingToDeal(l);
    if (have.has(deal.deal_name.trim().toLowerCase())) { skipped++; continue; }
    have.add(deal.deal_name.trim().toLowerCase()); // guard against dup ids within one request
    toInsert.push({ ...deal, created_by: user.email ?? user.id });
  }

  if (!toInsert.length) {
    return NextResponse.json({ added: 0, skipped, items: [], message: "All selected listings already in the pipeline." });
  }

  const { data, error } = await supabase
    .from("deal_pipeline")
    .insert(toInsert)
    .select("id, deal_name, market, stage, purchase_price, next_action, notes, created_at, updated_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ added: data?.length ?? 0, skipped, items: data ?? [] });
}
