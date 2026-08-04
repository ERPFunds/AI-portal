import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCompanyListings, computeLinkUpdates } from "@/lib/loopnet-company";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Manual "Refresh LoopNet listings" — triggered by a logged-in user from the Properties or
// Vacancies tab. Scrapes ERP's markets, matches listings to ERP's properties by address, and
// refreshes each loopnetUrl (validates existing links + attaches links to newly-listed assets).
export async function POST() {
  // require an authenticated portal user
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await getCompanyListings();
  if (result.listings.length === 0) {
    return NextResponse.json({
      ok: false, blocked: true, via: result.via,
      directStatus: result.directStatus, apifyError: result.apifyError, apifyDebug: result.apifyDebug, reason: result.reason,
    });
  }

  let admin;
  try { admin = createAdminClient(); }
  catch { return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY not set in environment" }); }

  // Match against every property so a currently-listed asset gets its link, even if occupied in our records.
  const { data: props, error } = await admin.from("properties").select('id, address, "loopnetUrl"');
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const updates = computeLinkUpdates((props ?? []) as any, result.listings);
  for (const u of updates) {
    await admin.from("properties").update({ loopnetUrl: u.to, updated_at: new Date().toISOString() }).eq("id", u.id);
  }

  return NextResponse.json({
    ok: true, via: result.via,
    listingsFound: result.listings.length,
    updatedCount: updates.length,
    updated: updates,
    apifyDebug: result.apifyDebug,
  });
}
