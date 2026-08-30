import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getInteractions } from "@/lib/agents/ir/mailbox-interactions";
import { isRealContactEmail } from "@/lib/agents/ir/email-validity";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// New investor contact capture: people who appear in the IR mailboxes' correspondence but
// aren't in any of the portal's directories yet. The mailbox scan is the same one that powers
// "last interaction"; everything already known — LP directory records, imported and CRM
// contacts, DST vendors, contractors, lenders, captured event contacts — is subtracted, along
// with internal addresses, junk (no-reply/voicemail/image cids) and anything dismissed here.
// RLS-locked tables → service-role client.

const INTERNAL = /@erpfunds\.com$/i;

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

  const [cache, prior, crmContacts, vendors, contractors, lenders, imported, dismissed] = await Promise.all([
    supabase.from("lp_directory_cache").select("data").eq("id", 1).maybeSingle(),
    supabase.from("lp_prior_contacts").select("email"),
    supabase.from("investor_contacts").select("email"),
    supabase.from("dst_vendors").select("email"),
    supabase.from("contractors").select("email"),
    supabase.from("lenders").select("email"),
    supabase.from("imported_contacts").select("email"),
    supabase.from("crm_capture_dismissed").select("email"),
  ]);

  const lps = ((cache.data?.data as { lps?: LpLite[] } | undefined)?.lps) ?? [];
  for (const lp of lps) { add(lp.email); add(lp.resolvedEmail); }
  for (const set of [prior, crmContacts, vendors, contractors, lenders, imported, dismissed]) {
    for (const r of ((set.data ?? []) as { email?: string | null }[])) add(r.email);
  }

  // Everyone the IR mailboxes have actually corresponded with.
  let byEmail: Awaited<ReturnType<typeof getInteractions>>["byEmail"] = {};
  try { ({ byEmail } = await getInteractions()); }
  catch (e) { return NextResponse.json({ error: `Mailbox scan failed: ${String(e).slice(0, 200)}` }, { status: 502 }); }

  const candidates = Object.entries(byEmail)
    .filter(([email]) => email && !known.has(email) && !INTERNAL.test(email) && isRealContactEmail(email))
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

  return NextResponse.json({ contacts: candidates, scanned: Object.keys(byEmail).length, known: known.size });
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
