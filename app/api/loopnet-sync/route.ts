import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const COMPANY_URL = "https://www.loopnet.com/company/erp-industrials/9rvtzp4l/";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// Manual "Refresh LoopNet listings" — same logic as the weekly cron, but triggered by a
// logged-in user from the Properties tab. Auto-refreshes each vacancy's loopnetUrl from
// ERP's LoopNet company page (fixes stale links, adds newly listed vacancies).
export async function POST() {
  // require an authenticated portal user
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let html = "";
  try {
    const r = await fetch(COMPANY_URL, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
      cache: "no-store",
    });
    html = await r.text();
    if (!r.ok) return NextResponse.json({ ok: false, blocked: true, status: r.status });
  } catch (e) {
    return NextResponse.json({ ok: false, blocked: true, error: String(e) });
  }

  const urls = [...new Set([...html.matchAll(/https?:\/\/www\.loopnet\.com\/Listing\/[^"'\s)\\]+/g)].map(m => m[0]))];
  if (urls.length === 0) return NextResponse.json({ ok: false, blocked: true, reason: "no listings parsed (bot-blocked)" });
  const byStreet: Record<string, string> = {};
  for (const u of urls) { const m = u.match(/\/Listing\/(\d+)-/); if (m && !byStreet[m[1]]) byStreet[m[1]] = u; }

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
  return NextResponse.json({ ok: true, listingsOnCompanyPage: urls.length, updatedCount: updated.length, updated });
}
