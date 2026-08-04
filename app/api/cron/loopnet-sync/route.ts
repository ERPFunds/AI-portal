import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCompanyListings, computeLinkUpdates } from "@/lib/loopnet-company";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Weekly job: scrape ERP's markets, match listings to ERP's properties by address, and refresh
// each loopnetUrl. Validates existing links (fixes stale listing IDs) and attaches a link when
// an owned property gets newly listed. Conservative: only updates a row when a matching listing's
// URL differs — it never clears a link. Uses the shared getCompanyListings() helper (direct fetch
// first, then the memo23/loopnet-scraper-ppe Apify actor).
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await getCompanyListings();
  if (result.listings.length === 0) {
    return NextResponse.json({
      ok: false, blocked: true, via: result.via,
      directStatus: result.directStatus, apifyError: result.apifyError, apifyDebug: result.apifyDebug, reason: result.reason,
    }, { status: 200 });
  }

  const sb = createAdminClient();
  const { data: props, error } = await sb.from("properties").select('id, address, "loopnetUrl"');
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const updates = computeLinkUpdates((props ?? []) as any, result.listings);
  for (const u of updates) {
    await sb.from("properties").update({ loopnetUrl: u.to, updated_at: new Date().toISOString() }).eq("id", u.id);
  }

  return NextResponse.json({
    ok: true, via: result.via,
    listingsFound: result.listings.length,
    updatedCount: updates.length,
    updated: updates,
  });
}
