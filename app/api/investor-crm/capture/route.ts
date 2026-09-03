import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getInteractions } from "@/lib/agents/ir/mailbox-interactions";
import { isRealContactEmail } from "@/lib/agents/ir/email-validity";
import { fetchAll } from "@/lib/supabase/fetch-all";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// New investor contact capture: people who appear in the IR mailboxes' correspondence but
// aren't in any of the portal's directories yet. The mailbox scan is the same one that powers
// "last interaction"; everything already known — LP directory records, imported and CRM
// contacts, every vendor and lender desk on both the investor and property side, captured
// event contacts — is subtracted, along with internal addresses, junk (no-reply/voicemail/
// image cids) and anything dismissed here.
// RLS-locked tables → service-role client.
//
// Every directory that can hold an address has to be listed here. Miss one and its people
// come back as strangers: the account tables mostly carry no address at all, so it is the
// *_contacts tables that matter.

const INTERNAL = /@erpfunds\.com$/i;

// Only surface people first seen from this date on. The underlying mailbox scan goes back
// 18 months and is shared with "last interaction" across the portal, so the floor is applied
// here rather than by shortening the scan for everyone.
const SINCE = new Date(process.env.CRM_CAPTURE_SINCE || "2026-07-01T00:00:00Z");

interface LpLite { email?: string | null; resolvedEmail?: string | null }

export async function GET() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createAdminClient();

  // Everything the portal already knows about.
  const known = new Set<string>();
  const add = (e: unknown) => {
    const s = String(e ?? "").trim().toLowerCase();
    if (s) known.add(s);
  };

  // Paged, because investor_contacts is past PostgREST's 1,000-row default and a truncated
  // read here would hand back known people as new ones.
  type E = { email?: string | null };
  const EMAIL_TABLES = [
    "investor_crm",              // the account's own address
    "investor_contacts",         // LP directory, PE prospects, DST investors
    "dst_vendors",               // broker dealers, brokerages, QIs
    "dst_vendor_contacts",       // the people under them
    "property_vendors",
    "property_vendor_contacts",
    "property_lenders",
    "property_lender_contacts",
    "contractors",               // legacy property tables, kept until they are retired
    "lenders",
    "lp_prior_contacts",
    "imported_contacts",         // event and CSV captures
    "crm_capture_dismissed",     // already waved off here
  ];

  const [cache, ...sets] = await Promise.all([
    supabase.from("lp_directory_cache").select("data").eq("id", 1).maybeSingle(),
    ...EMAIL_TABLES.map((t) => fetchAll<E>(() => supabase.from(t).select("email")).catch(() => [] as E[])),
  ]);

  const lps = ((cache.data?.data as { lps?: LpLite[] } | undefined)?.lps) ?? [];
  for (const lp of lps) { add(lp.email); add(lp.resolvedEmail); }
  for (const set of sets) for (const r of set) add(r.email);

  // Everyone the IR mailboxes have actually corresponded with.
  let byEmail: Awaited<ReturnType<typeof getInteractions>>["byEmail"] = {};
  try { ({ byEmail } = await getInteractions()); }
  catch (e) { return NextResponse.json({ error: `Mailbox scan failed: ${String(e).slice(0, 200)}` }, { status: 502 }); }

  const candidates = Object.entries(byEmail)
    .filter(([email, it]) => email && !known.has(email) && !INTERNAL.test(email) && isRealContactEmail(email)
      // Anything older than the floor is history, not a new contact worth chasing.
      && (() => { const d = new Date(it.date); return !isNaN(d.getTime()) && d >= SINCE; })())
    .map(([email, it]) => ({
      email,
      name: it.counterparty && it.counterparty !== email ? it.counterparty : "",
      lastDate: it.date,
      subject: it.subject,
      mailbox: it.mailbox,
      direction: it.direction,
      preview: (it.preview || "").slice(0, 160),
    }))
    .sort((a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime());

  return NextResponse.json({
    contacts: candidates,
    scanned: Object.keys(byEmail).length,
    known: known.size,
    since: SINCE.toISOString().slice(0, 10),
  });
}

// Dismiss an address so it stops appearing as a new contact.
export async function POST(req: NextRequest) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createAdminClient();

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const { error } = await supabase.from("crm_capture_dismissed")
    .upsert({ email, dismissed_by: user.email ?? user.id }, { onConflict: "email" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
