import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGraphToken } from "@/lib/agents/graph-token";
import { isRealContactEmail } from "@/lib/agents/ir/email-validity";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const GRAPH = "https://graph.microsoft.com/v1.0";
const PAGE = 100;

// Backfills CRM contact emails from the addresses the team has actually corresponded with.
//
//   action:"index"  walks Meghan's and William's inbox + sent items backwards in time and records
//                   every counterparty (name -> email) in mailbox_directory. Resumable: each run
//                   continues from the watermark in mailbox_scan_state, so it can be called
//                   repeatedly until it reports done.
//   action:"match"  matches PE prospect contacts that have no email against that directory.
//                   Dry-run unless apply:true.
//
// Nothing is read but the participant fields — no subjects, no bodies. Internal addresses are
// never written to the CRM.

const DEFAULT_MAILBOXES = ["mberry@erpfunds.com", "wmeyer@erpfunds.com"];
const INTERNAL = /@erpfunds\.com$/i;

// Same normalization the CRM uses elsewhere: lowercase, drop punctuation, collapse spaces.
// Parenthetical asides are stripped first — "Krista Herczeg (Managing Partner)" is a name plus a
// title, and the title must not become part of the key.
function nameKey(s: string | null | undefined): string {
  return (s || "")
    .replace(/\([^)]*\)/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Honorifics and suffixes carry no matching signal and differ between the CRM and mail headers.
const NOISE_TOKENS = new Set(["mr", "mrs", "ms", "dr", "jr", "sr", "ii", "iii", "iv", "cfa", "cpa", "cfp", "esq", "phd", "mba"]);

function nameTokens(s: string | null | undefined): string[] {
  return nameKey(s).split(" ").filter((t) => t.length > 1 && !NOISE_TOKENS.has(t));
}

/** A display name good enough to key on — a real person, not an echoed address or a lone word. */
function usableName(s: string | null | undefined): string {
  const raw = (s || "").trim();
  if (!raw || /@/.test(raw)) return "";              // the address echoed as the name
  const t = nameTokens(raw);
  return t.length >= 2 ? t.join(" ") : "";           // need at least first + last
}

// Outlook renders many senders "Last, First" — index both orders so either matches.
function keyVariants(display: string): string[] {
  const t = nameTokens(display);
  if (t.length < 2) return [];
  const out = [t.join(" ")];
  const swapped = [...t.slice(1), t[0]].join(" ");   // "berry meghan" -> "meghan berry"
  if (swapped !== out[0]) out.push(swapped);
  if (t.length > 2) {
    const firstLast = `${t[0]} ${t[t.length - 1]}`;  // drop middle names
    if (!out.includes(firstLast)) out.push(firstLast);
  }
  return out;
}

interface Party { email: string; name: string; when: string }

async function authorize(req: NextRequest): Promise<string | null> {
  const bearer = req.headers.get("authorization") ?? "";
  if (process.env.CRON_SECRET && bearer === `Bearer ${process.env.CRON_SECRET}`) return "cron";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user ? (user.email ?? user.id) : null;
}

// ── Indexing ─────────────────────────────────────────────────────────────────

// One page-walk of a folder, going backwards from `before` until the time floor or the budget.
async function walkFolder(
  token: string, mailbox: string, folder: "inbox" | "sentitems",
  floorIso: string, beforeIso: string | null, deadline: number,
): Promise<{ parties: Party[]; oldest: string | null; newest: string | null; messages: number; done: boolean }> {
  const dateField = folder === "inbox" ? "receivedDateTime" : "sentDateTime";
  const select = folder === "inbox"
    ? `from,${dateField}`
    : `toRecipients,ccRecipients,${dateField}`;

  const clauses = [`${dateField} ge ${floorIso}`];
  if (beforeIso) clauses.push(`${dateField} lt ${beforeIso}`);
  let url: string | null =
    `${GRAPH}/users/${encodeURIComponent(mailbox)}/mailFolders/${folder}/messages` +
    `?$select=${select}&$filter=${encodeURIComponent(clauses.join(" and "))}` +
    `&$orderby=${encodeURIComponent(`${dateField} desc`)}&$top=${PAGE}`;

  const parties: Party[] = [];
  let oldest: string | null = null;
  let newest: string | null = null;
  let messages = 0;
  let done = false;

  while (url) {
    if (Date.now() > deadline) return { parties, oldest, newest, messages, done: false };
    const r: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`Graph ${mailbox}/${folder} ${r.status}: ${(await r.text()).slice(0, 180)}`);
    const j = await r.json();
    const batch = (j.value ?? []) as Record<string, unknown>[];
    for (const m of batch) {
      const when = (m[dateField] as string) || "";
      if (when) {
        if (!newest || when > newest) newest = when;
        if (!oldest || when < oldest) oldest = when;
      }
      messages++;
      const addrs: { name?: string; address?: string }[] = [];
      if (folder === "inbox") {
        const f = (m.from as { emailAddress?: { name?: string; address?: string } })?.emailAddress;
        if (f) addrs.push(f);
      } else {
        for (const key of ["toRecipients", "ccRecipients"]) {
          for (const rc of ((m[key] as { emailAddress?: { name?: string; address?: string } }[]) ?? [])) {
            if (rc.emailAddress) addrs.push(rc.emailAddress);
          }
        }
      }
      for (const a of addrs) {
        const email = (a.address || "").trim().toLowerCase();
        if (!email || INTERNAL.test(email) || !isRealContactEmail(email)) continue;
        parties.push({ email, name: (a.name || "").trim(), when });
      }
    }
    url = (j["@odata.nextLink"] as string) || null;
    if (!url) done = true;                        // reached the floor for this folder
  }
  return { parties, oldest, newest, messages, done };
}

async function runIndex(body: Record<string, unknown>) {
  const token = await getGraphToken();
  if (!token) return NextResponse.json({ error: "AZURE credentials not configured" }, { status: 500 });

  const admin = createAdminClient();
  const mailboxes = Array.isArray(body.mailboxes) && body.mailboxes.length
    ? (body.mailboxes as string[]) : DEFAULT_MAILBOXES;
  const months = Number(body.months ?? 36);
  const floor = new Date();
  floor.setMonth(floor.getMonth() - (Number.isFinite(months) && months > 0 ? months : 36));
  const floorIso = floor.toISOString();
  const deadline = Date.now() + Number(body.budgetMs ?? 210_000);

  const { data: stateRows } = await admin.from("mailbox_scan_state").select("*");
  const state = new Map((stateRows ?? []).map((r) => [`${r.mailbox}|${r.folder}`, r]));

  // Aggregate this run's sightings in memory, then write one row per address.
  const seen = new Map<string, { name: string; hits: number; first: string; last: string; boxes: Set<string> }>();
  const report: Record<string, unknown>[] = [];
  let allDone = true;

  for (const mailbox of mailboxes) {
    for (const folder of ["inbox", "sentitems"] as const) {
      const prior = state.get(`${mailbox}|${folder}`);
      // Continue backwards from wherever the last run stopped.
      const before = prior?.oldest_scanned ? new Date(prior.oldest_scanned).toISOString() : null;
      if (prior?.oldest_scanned && new Date(prior.oldest_scanned) <= floor) {
        report.push({ mailbox, folder, skipped: "already scanned to floor" });
        continue;
      }
      try {
        const res = await walkFolder(token, mailbox, folder, floorIso, before, deadline);
        for (const p of res.parties) {
          const cur = seen.get(p.email);
          if (!cur) {
            seen.set(p.email, { name: p.name, hits: 1, first: p.when, last: p.when, boxes: new Set([mailbox]) });
          } else {
            cur.hits++;
            cur.boxes.add(mailbox);
            if (p.when && p.when < cur.first) cur.first = p.when;
            if (p.when && p.when > cur.last) cur.last = p.when;
            // Prefer a real display name over an echoed address.
            if (!usableName(cur.name) && usableName(p.name)) cur.name = p.name;
          }
        }
        const oldest = res.oldest && prior?.oldest_scanned
          ? (res.oldest < prior.oldest_scanned ? res.oldest : prior.oldest_scanned)
          : (res.oldest ?? prior?.oldest_scanned ?? null);
        const newest = res.newest && prior?.newest_scanned
          ? (res.newest > prior.newest_scanned ? res.newest : prior.newest_scanned)
          : (res.newest ?? prior?.newest_scanned ?? null);
        await admin.from("mailbox_scan_state").upsert({
          mailbox, folder,
          // When a folder is exhausted, park the watermark at the floor so later runs skip it.
          oldest_scanned: res.done ? floorIso : oldest,
          newest_scanned: newest,
          messages: (prior?.messages ?? 0) + res.messages,
          updated_at: new Date().toISOString(),
        }, { onConflict: "mailbox,folder" });
        if (!res.done) allDone = false;
        report.push({ mailbox, folder, messages: res.messages, parties: res.parties.length, done: res.done });
      } catch (e) {
        allDone = false;
        report.push({ mailbox, folder, error: String(e).slice(0, 200) });
      }
    }
  }

  // Merge into the directory. Hits accumulate across runs; the best name seen wins.
  const emails = [...seen.keys()];
  let written = 0;
  for (let i = 0; i < emails.length; i += 500) {
    const slice = emails.slice(i, i + 500);
    const { data: existing } = await admin.from("mailbox_directory").select("*").in("email", slice);
    const prior = new Map((existing ?? []).map((r) => [r.email as string, r]));
    const rows = slice.map((email) => {
      const s = seen.get(email)!;
      const old = prior.get(email);
      const name = usableName(s.name) ? s.name : (old?.display_name ?? s.name);
      const boxes = new Set([...(old?.mailboxes ?? []), ...s.boxes]);
      return {
        email,
        display_name: name || null,
        name_key: usableName(name),
        hits: (old?.hits ?? 0) + s.hits,
        first_seen: old?.first_seen && old.first_seen < s.first ? old.first_seen : s.first,
        last_seen: old?.last_seen && old.last_seen > s.last ? old.last_seen : s.last,
        mailboxes: [...boxes],
        updated_at: new Date().toISOString(),
      };
    });
    const { error } = await admin.from("mailbox_directory").upsert(rows, { onConflict: "email" });
    if (error) return NextResponse.json({ error: error.message, report }, { status: 500 });
    written += rows.length;
  }

  const { count } = await admin.from("mailbox_directory").select("email", { count: "exact", head: true });
  return NextResponse.json({ ok: true, action: "index", complete: allDone, addressesTouched: written, directorySize: count ?? 0, report });
}

// ── Matching ─────────────────────────────────────────────────────────────────

interface Candidate { email: string; display: string; hits: number; last: string | null }

async function runMatch(body: Record<string, unknown>, actor: string) {
  const admin = createAdminClient();
  const apply = body.apply === true;

  const { data: dir, error: dirErr } = await admin
    .from("mailbox_directory").select("email, display_name, name_key, hits, last_seen")
    .neq("name_key", "");
  if (dirErr) return NextResponse.json({ error: dirErr.message }, { status: 500 });
  if (!dir?.length) return NextResponse.json({ error: "Directory is empty — run action:'index' first" }, { status: 400 });

  // name key (in both orderings) -> every address seen under it
  const byName = new Map<string, Candidate[]>();
  for (const r of dir) {
    const cand: Candidate = { email: r.email as string, display: (r.display_name as string) ?? "", hits: (r.hits as number) ?? 0, last: (r.last_seen as string) ?? null };
    for (const k of keyVariants((r.display_name as string) ?? "")) {
      const list = byName.get(k) ?? [];
      if (!list.some((c) => c.email === cand.email)) list.push(cand);
      byName.set(k, list);
    }
  }

  const { data: accounts } = await admin
    .from("investor_crm").select("investor_key, investor, email")
    .eq("program", "PE").eq("is_lp", false).or("archived.is.null,archived.eq.false");
  const accountKeys = new Set((accounts ?? []).map((a) => a.investor_key as string));

  const { data: contacts, error: cErr } = await admin
    .from("investor_contacts").select("id, investor_key, investor, name, email")
    .or("email.is.null,email.eq.");
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

  const targets = (contacts ?? []).filter((c) => accountKeys.has(c.investor_key as string));

  const matched: Record<string, unknown>[] = [];
  const ambiguous: Record<string, unknown>[] = [];
  const unmatched: string[] = [];

  for (const c of targets) {
    const key = usableName(c.name as string);
    if (!key) { unmatched.push(`${c.investor} / ${c.name} (unusable name)`); continue; }
    const cands = byName.get(key) ?? [];
    if (!cands.length) { unmatched.push(`${c.investor} / ${c.name}`); continue; }

    const sorted = [...cands].sort((a, b) => b.hits - a.hits);
    // One address, or a clear favourite: accept. Otherwise leave it for a human.
    const clear = sorted.length === 1 || sorted[0].hits >= sorted[1].hits * 3;
    const row = {
      contactId: c.id, account: c.investor, contact: c.name,
      email: sorted[0].email, hits: sorted[0].hits, lastSeen: sorted[0].last,
      alternatives: sorted.slice(1, 4).map((s) => `${s.email} (${s.hits})`),
    };
    if (clear) matched.push(row); else ambiguous.push(row);
  }

  if (!apply) {
    return NextResponse.json({
      ok: true, action: "match", apply: false,
      candidates: targets.length, matched: matched.length, ambiguous: ambiguous.length, unmatched: unmatched.length,
      matches: matched, ambiguousMatches: ambiguous, unmatchedSample: unmatched.slice(0, 40),
    });
  }

  const now = new Date().toISOString();
  let written = 0;
  for (const m of matched) {
    const { error } = await admin.from("investor_contacts")
      .update({ email: m.email as string, updated_by: `outlook-backfill:${actor}`, updated_at: now })
      .eq("id", m.contactId as string);
    if (!error) written++;
  }

  // Give the account itself the address when it has none and only one contact was filled.
  const perAccount = new Map<string, string[]>();
  for (const m of matched) {
    const acct = (targets.find((t) => t.id === m.contactId)?.investor_key as string) ?? "";
    const list = perAccount.get(acct) ?? [];
    list.push(m.email as string);
    perAccount.set(acct, list);
  }
  let accountsFilled = 0;
  for (const [key, emails] of perAccount) {
    const acct = (accounts ?? []).find((a) => a.investor_key === key);
    if (!acct || (acct.email && String(acct.email).trim())) continue;
    if (emails.length !== 1) continue;
    const { error } = await admin.from("investor_crm")
      .update({ email: emails[0], updated_by: `outlook-backfill:${actor}`, updated_at: now })
      .eq("investor_key", key);
    if (!error) accountsFilled++;
  }

  return NextResponse.json({
    ok: true, action: "match", apply: true,
    candidates: targets.length, contactsFilled: written, accountsFilled,
    ambiguous: ambiguous.length, unmatched: unmatched.length, ambiguousMatches: ambiguous,
  });
}

// ── Handlers ─────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const actor = await authorize(req);
  if (!actor) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const admin = createAdminClient();
  const { count: directorySize } = await admin.from("mailbox_directory").select("email", { count: "exact", head: true });
  const { data: scan } = await admin.from("mailbox_scan_state").select("*").order("mailbox");
  return NextResponse.json({ directorySize: directorySize ?? 0, scan: scan ?? [] });
}

export async function POST(req: NextRequest) {
  const actor = await authorize(req);
  if (!actor) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "match");
  if (action === "index") return runIndex(body);
  if (action === "match") return runMatch(body, actor);
  return NextResponse.json({ error: `Unknown action '${action}'` }, { status: 400 });
}
