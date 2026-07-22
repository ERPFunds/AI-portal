import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCompanyListingUrls } from "@/lib/loopnet-company";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Weekly job: pull ERP's active LoopNet listings and auto-refresh the loopnetUrl on each
// vacant property. This fixes stale links (a retired listing ID is replaced with the current
// one) and adds a link when a vacancy gets newly listed. Conservative: only updates a row
// when the company page has a matching listing whose URL differs — it never clears a link
// just because it isn't on the company page (some listings are co-listed by other brokers).
//
// Uses the shared getCompanyListingUrls() helper: direct fetch first, then an Apify
// browser-scraper fallback when LoopNet's bot protection blocks the request (403).
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Fetch ERP's active listing URLs (with Apify fallback), keyed by street number
  const listing = await getCompanyListingUrls();
  if (listing.urls.length === 0) {
    // No listings parsed — bot-blocked / scraper failed. Do nothing destructive.
    return NextResponse.json({
      ok: false, blocked: true, via: listing.via,
      directStatus: listing.directStatus, apifyError: listing.apifyError, reason: listing.reason,
    }, { status: 200 });
  }
  const byStreet: Record<string, string> = {};
  for (const u of listing.urls) {
    const m = u.match(/\/Listing\/(\d+)-/);
    if (m && !byStreet[m[1]]) byStreet[m[1]] = u;
  }

  // 2. Auto-refresh loopnetUrl on vacant buildings + multi-tenant buildings (units inherit it)
  const sb = createAdminClient();
  const { data: props, error } = await sb
    .from("properties")
    .select('id, address, type, units, "loopnetUrl"')
    .or("type.eq.vacant,units.not.is.null");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const updated: { address: string; from: string | null; to: string }[] = [];
  for (const p of props ?? []) {
    const sm = (p.address as string).match(/^\s*(\d+)/);
    if (!sm) continue;
    const found = byStreet[sm[1]];
    if (found && found !== p.loopnetUrl) {
      await sb.from("properties").update({ loopnetUrl: found, updated_at: new Date().toISOString() }).eq("id", p.id);
      updated.push({ address: p.address, from: p.loopnetUrl ?? null, to: found });
    }
  }

  return NextResponse.json({ ok: true, via: listing.via, listingsOnCompanyPage: listing.urls.length, updatedCount: updated.length, updated });
}
