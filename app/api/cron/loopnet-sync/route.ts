import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ERP Industrials' LoopNet company page — the authoritative list of their active listings.
const COMPANY_URL = "https://www.loopnet.com/company/erp-industrials/9rvtzp4l/";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// Weekly job: pull ERP's active LoopNet listings and auto-refresh the loopnetUrl on each
// vacant property. This fixes stale links (a retired listing ID is replaced with the current
// one) and adds a link when a vacancy gets newly listed. Conservative: only updates a row
// when the company page has a matching listing whose URL differs — it never clears a link
// just because it isn't on the company page (some listings are co-listed by other brokers).
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Fetch ERP's company page
  let html = "";
  try {
    const r = await fetch(COMPANY_URL, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
      cache: "no-store",
    });
    html = await r.text();
    if (!r.ok) return NextResponse.json({ ok: false, blocked: true, status: r.status }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ ok: false, blocked: true, error: String(e) }, { status: 200 });
  }

  // 2. Parse the /Listing/ URLs and key them by street number
  const urls = [...new Set([...html.matchAll(/https?:\/\/www\.loopnet\.com\/Listing\/[^"'\s)\\]+/g)].map(m => m[0]))];
  if (urls.length === 0) {
    // No listings parsed — almost certainly a bot-block/challenge page. Do nothing destructive.
    return NextResponse.json({ ok: false, blocked: true, reason: "no listings parsed" }, { status: 200 });
  }
  const byStreet: Record<string, string> = {};
  for (const u of urls) {
    const m = u.match(/\/Listing\/(\d+)-/);
    if (m && !byStreet[m[1]]) byStreet[m[1]] = u;
  }

  // 3. Auto-refresh loopnetUrl on vacant buildings + multi-tenant buildings (units inherit it)
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

  return NextResponse.json({ ok: true, listingsOnCompanyPage: urls.length, updatedCount: updated.length, updated });
}
