import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { salesforceConfigured, fetchContactsForAccounts } from "@/lib/agents/ir/salesforce";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// One-time backfill of investor contact details from Salesforce, for investors the imported
// spreadsheets left blank. Salesforce is being retired, so this pulls what it still holds
// before the data goes away. It only ADDS — nothing already in the portal is overwritten.
// GET reports what would be filled; POST performs it. RLS-locked → service-role client.

const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

interface Investor { investor_key: string; investor: string }

async function plan(supabase: ReturnType<typeof createAdminClient>) {
  const { data: lps } = await supabase
    .from("investor_crm").select("investor_key, investor, committed_usd, is_lp, archived")
    .eq("archived", false);
  const investors = ((lps ?? []) as (Investor & { committed_usd: number | null; is_lp: boolean })[])
    .filter((r) => (r.committed_usd ?? 0) > 0 || r.is_lp);

  const { data: contacts } = await supabase
    .from("investor_contacts").select("investor_key, email");
  const haveContact = new Set<string>();
  const haveEmail = new Set<string>();
  for (const c of ((contacts ?? []) as { investor_key: string; email: string | null }[])) {
    haveContact.add(c.investor_key);
    if (c.email) haveEmail.add(c.investor_key);
  }

  // Anyone missing an email (or any contact at all) is worth asking Salesforce about.
  const gaps = investors.filter((r) => !haveEmail.has(r.investor_key));
  return { investors, gaps, haveContact, haveEmail };
}

export async function GET() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!salesforceConfigured()) return NextResponse.json({ error: "Salesforce is not configured" }, { status: 503 });
  const supabase = createAdminClient();

  const { investors, gaps, haveContact } = await plan(supabase);
  return NextResponse.json({
    lp_investors: investors.length,
    missing_an_email: gaps.length,
    missing_any_contact: gaps.filter((g) => !haveContact.has(g.investor_key)).length,
    sample: gaps.slice(0, 20).map((g) => g.investor),
  });
}

export async function POST(req: NextRequest) {
  // Either an interactive session or the cron secret (lets the backfill be run server-side,
  // where the Salesforce credentials live).
  const isCron = !!process.env.CRON_SECRET &&
    req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCron) {
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  if (!salesforceConfigured()) return NextResponse.json({ error: "Salesforce is not configured" }, { status: 503 });
  const supabase = createAdminClient();

  const { gaps } = await plan(supabase);
  if (!gaps.length) return NextResponse.json({ ok: true, filled: 0, matched: 0, note: "Nothing missing" });

  let found: Awaited<ReturnType<typeof fetchContactsForAccounts>>;
  try { found = await fetchContactsForAccounts(gaps.map((g) => g.investor)); }
  catch (e) { return NextResponse.json({ error: `Salesforce query failed: ${String(e).slice(0, 250)}` }, { status: 502 }); }

  // Salesforce keys by exact account name; match back by normalized name.
  const byKey = new Map<string, { name: string; email: string | null; phone: string | null; mobile: string | null; title: string | null }[]>();
  for (const [acct, people] of Object.entries(found)) byKey.set(norm(acct), people);

  const rows: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  let matched = 0;
  for (const g of gaps) {
    const people = byKey.get(g.investor_key);
    if (!people?.length) continue;
    matched++;
    for (const p of people) {
      if (!p.name && !p.email) continue;
      const matchKey = p.email ? `e:${p.email.toLowerCase()}` : `n:${norm(p.name)}`;
      const dedupe = `${g.investor_key}|${matchKey}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      rows.push({
        investor_key: g.investor_key, investor: g.investor, match_key: matchKey,
        name: p.name || p.email, title: p.title, email: p.email,
        phone_office: p.phone, phone_cell: p.mobile,
        is_primary: false, created_by: "backfill:salesforce", updated_by: "backfill:salesforce",
        updated_at: new Date().toISOString(),
      });
    }
  }

  let filled = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    // Only fill blanks — never overwrite what the portal already holds.
    const { error } = await supabase.from("investor_contacts").upsert(chunk, { onConflict: "investor_key,match_key", ignoreDuplicates: true });
    if (error) return NextResponse.json({ error: error.message, filled }, { status: 500 });
    filled += chunk.length;
  }

  const requested = req.headers.get("x-source") ?? "ui";
  return NextResponse.json({ ok: true, considered: gaps.length, matched, filled, source: requested });
}
