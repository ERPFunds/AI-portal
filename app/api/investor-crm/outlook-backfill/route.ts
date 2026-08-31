import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getInteractions } from "@/lib/agents/ir/mailbox-interactions";
import { isRealContactEmail } from "@/lib/agents/ir/email-validity";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Fills missing investor emails from what Meghan's and William's mailboxes actually show:
// the IR mailbox scan already resolves each correspondent's display name and address, so a
// contact we hold by name only can be matched to the address that person writes from.
//
// Matching is deliberately conservative — an exact normalized name match on the contact, or
// on the investing entity itself. Nothing already recorded is overwritten.
// GET reports what would be filled; POST performs it.

const INTERNAL = /@erpfunds\.com$/i;
const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

interface Row { investor_key: string; investor: string; committed_usd: number | null; is_lp: boolean }
interface ContactRow { id: string; investor_key: string; name: string; email: string | null }

async function build(supabase: ReturnType<typeof createAdminClient>) {
  const [{ data: lps }, { data: contacts }] = await Promise.all([
    supabase.from("investor_crm").select("investor_key, investor, committed_usd, is_lp").eq("archived", false),
    supabase.from("investor_contacts").select("id, investor_key, name, email"),
  ]);
  const investors = ((lps ?? []) as Row[]).filter((r) => (r.committed_usd ?? 0) > 0 || r.is_lp);
  const byInvestor = new Map<string, ContactRow[]>();
  for (const c of ((contacts ?? []) as ContactRow[])) {
    (byInvestor.get(c.investor_key) ?? byInvestor.set(c.investor_key, []).get(c.investor_key)!).push(c);
  }
  // Investors with no email anywhere on the account.
  const gaps = investors.filter((i) => !(byInvestor.get(i.investor_key) ?? []).some((c) => c.email));
  return { investors, gaps, byInvestor };
}

/** The mailbox scan indexed by correspondent display name -> their address. */
async function nameIndex() {
  const { byName, byEmail } = await getInteractions();
  const idx = new Map<string, { email: string; mailbox: string; date: string }>();
  const add = (label: string | undefined, email: string | undefined, mailbox: string, date: string) => {
    const k = norm(label ?? "");
    const e = (email ?? "").trim();
    if (!k || k.split(" ").length < 2 || !e || INTERNAL.test(e) || !isRealContactEmail(e)) return;
    const prev = idx.get(k);
    if (!prev || new Date(date).getTime() > new Date(prev.date).getTime()) idx.set(k, { email: e, mailbox, date });
  };
  for (const it of Object.values(byName)) add(it.counterparty, it.counterpartyEmail, it.mailbox, it.date);
  for (const it of Object.values(byEmail)) add(it.counterparty, it.counterpartyEmail, it.mailbox, it.date);
  return idx;
}

export async function GET() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createAdminClient();
  const { investors, gaps } = await build(supabase);
  const idx = await nameIndex();
  return NextResponse.json({
    lp_investors: investors.length,
    missing_an_email: gaps.length,
    correspondents_indexed: idx.size,
  });
}

export async function POST(req: NextRequest) {
  const isCron = !!process.env.CRON_SECRET &&
    req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCron) {
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const supabase = createAdminClient();

  const { gaps, byInvestor } = await build(supabase);
  if (!gaps.length) return NextResponse.json({ ok: true, filled: 0, note: "Nothing missing" });

  let idx: Awaited<ReturnType<typeof nameIndex>>;
  try { idx = await nameIndex(); }
  catch (e) { return NextResponse.json({ error: `Mailbox scan failed: ${String(e).slice(0, 250)}` }, { status: 502 }); }

  const updates: { id: string; email: string }[] = [];
  const inserts: Record<string, unknown>[] = [];
  const matched: string[] = [];

  for (const g of gaps) {
    const people = byInvestor.get(g.investor_key) ?? [];
    let hit: { email: string; mailbox: string } | undefined;
    let target: ContactRow | undefined;

    // 1) a contact we hold by name only, matched to the address they write from
    for (const c of people) {
      const found = idx.get(norm(c.name));
      if (found) { hit = found; target = c; break; }
    }
    // 2) failing that, the entity itself corresponding under its own name
    if (!hit) {
      const found = idx.get(norm(g.investor));
      if (found) hit = found;
    }
    if (!hit) continue;

    matched.push(`${g.investor} <= ${hit.email} (${hit.mailbox})`);
    if (target) updates.push({ id: target.id, email: hit.email });
    else inserts.push({
      investor_key: g.investor_key, investor: g.investor,
      match_key: `e:${hit.email.toLowerCase()}`, name: g.investor, email: hit.email,
      is_primary: false, created_by: "backfill:outlook", updated_by: "backfill:outlook",
    });
  }

  for (const u of updates) {
    await supabase.from("investor_contacts")
      .update({ email: u.email, updated_by: "backfill:outlook", updated_at: new Date().toISOString() })
      .eq("id", u.id).is("email", null);
  }
  if (inserts.length) {
    const { error } = await supabase.from("investor_contacts")
      .upsert(inserts, { onConflict: "investor_key,match_key", ignoreDuplicates: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    considered: gaps.length,
    filled: updates.length + inserts.length,
    updated_existing_contacts: updates.length,
    added_contacts: inserts.length,
    sample: matched.slice(0, 25),
  });
}
