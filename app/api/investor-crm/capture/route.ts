import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getInteractions } from "@/lib/agents/ir/mailbox-interactions";
import { isRealContactEmail } from "@/lib/agents/ir/email-validity";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { classify, isTwoWay } from "@/lib/agents/ir/capture-classify";

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

/**
 * Walk the mailboxes, subtract everyone already in a directory, and classify what is left.
 * Slow (three mailboxes over Graph), so the daily cron calls this and the tab reads the cache.
 */
export async function runCaptureScan() {
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
  const { byEmail } = await getInteractions();

  const candidates = Object.entries(byEmail)
    .filter(([email, it]) => email && !known.has(email) && !INTERNAL.test(email) && isRealContactEmail(email)
      // Anything older than the floor is history, not a new contact worth chasing.
      && (() => { const d = new Date(it.date); return !isNaN(d.getTime()) && d >= SINCE; })())
    .map(([email, it]) => {
      const sent = it.sentCount ?? 0;
      const received = it.receivedCount ?? 0;
      return {
        email,
        name: it.counterparty && it.counterparty !== email ? it.counterparty : "",
        lastDate: it.date,
        subject: it.subject,
        mailbox: it.mailbox,
        direction: it.direction,
        preview: (it.preview || "").slice(0, 160),
        kind: classify(email),          // firm | individual | service
        sent,
        received,
        twoWay: isTwoWay(sent, received),
      };
    })
    // Automated and service senders are never CRM contacts, so they never reach the tab.
    .filter((c) => c.kind !== "service")
    .sort((a, b) => {
      // Real conversations first, then most recent.
      if (a.twoWay !== b.twoWay) return a.twoWay ? -1 : 1;
      return new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime();
    });

  return {
    contacts: candidates,
    scanned: Object.keys(byEmail).length,
    known: known.size,
    since: SINCE.toISOString().slice(0, 10),
  };
}

export async function GET(req: NextRequest) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createAdminClient();

  // ?refresh=1 forces a live walk; otherwise serve whatever the daily cron last wrote, so
  // opening the tab is instant instead of waiting on three mailboxes.
  if (req.nextUrl.searchParams.get("refresh") !== "1") {
    const { data } = await supabase.from("crm_capture_cache")
      .select("contacts, scanned_at, scanned, known, error").eq("id", 1).maybeSingle();
    if (data?.scanned_at) {
      return NextResponse.json({
        contacts: data.contacts ?? [],
        scanned: data.scanned ?? 0,
        known: data.known ?? 0,
        scannedAt: data.scanned_at,
        error: data.error ?? undefined,
        since: SINCE.toISOString().slice(0, 10),
      });
    }
  }

  try {
    const out = await runCaptureScan();
    await supabase.from("crm_capture_cache").upsert({
      id: 1, contacts: out.contacts, scanned: out.scanned, known: out.known,
      scanned_at: new Date().toISOString(), error: null,
    });
    return NextResponse.json({ ...out, scannedAt: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: `Mailbox scan failed: ${String(e).slice(0, 200)}` }, { status: 502 });
  }
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
