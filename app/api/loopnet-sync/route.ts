import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCompanyListingUrls } from "@/lib/loopnet-company";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Manual "Refresh LoopNet listings" — triggered by a logged-in user from the
// Properties or Vacancies tab. Auto-refreshes each vacancy's loopnetUrl from
// ERP's LoopNet company page (fixes stale links, adds newly listed vacancies).
export async function POST() {
  // require an authenticated portal user
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const listing = await getCompanyListingUrls();
  if (listing.urls.length === 0) {
    return NextResponse.json({
      ok: false, blocked: true, via: listing.via,
      directStatus: listing.directStatus, apifyError: listing.apifyError, reason: listing.reason,
    });
  }

  const byStreet: Record<string, string> = {};
  for (const u of listing.urls) { const m = u.match(/\/Listing\/(\d+)-/); if (m && !byStreet[m[1]]) byStreet[m[1]] = u; }

  let admin;
  try { admin = createAdminClient(); }
  catch { return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY not set in environment" }); }

  const { data: props, error } = await admin
    .from("properties")
    .select('id, address, type, units, "loopnetUrl"')
    .or("type.eq.vacant,units.not.is.null");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const updated: { address: string; to: string }[] = [];
  for (const p of props ?? []) {
    const sm = (p.address as string).match(/^\s*(\d+)/);
    if (!sm) continue;
    const found = byStreet[sm[1]];
    if (found && found !== p.loopnetUrl) {
      await admin.from("properties").update({ loopnetUrl: found, updated_at: new Date().toISOString() }).eq("id", p.id);
      updated.push({ address: p.address, to: found });
    }
  }
  return NextResponse.json({ ok: true, via: listing.via, listingsOnCompanyPage: listing.urls.length, updatedCount: updated.length, updated });
}
