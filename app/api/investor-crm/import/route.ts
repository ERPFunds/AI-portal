import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Bulk import for investor workbooks (LP directories, prospect exports). The client parses the
// spreadsheet and posts normalized rows; this upserts them so re-importing an updated file
// refreshes records rather than duplicating them. Portal-owned — nothing is written externally.
// RLS-locked tables → service-role client.

interface InvestorIn {
  investor?: string; fund?: string | null; program?: string | null;
  committed_usd?: number | string | null; target_amount?: number | string | null;
  contact?: string | null; notes?: string | null; owner?: string | null; expected_close?: string | null;
}
interface OtherIn {
  name?: string; category?: string | null; contact?: string | null; title?: string | null;
  email?: string | null; phone?: string | null; phone_cell?: string | null;
  address?: string | null; owner?: string | null; notes?: string | null;
}
interface ContactIn {
  investor?: string; name?: string; title?: string | null; email?: string | null;
  phone_office?: string | null; phone_cell?: string | null; address?: string | null;
  notes?: string | null; is_primary?: boolean;
}

const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const str = (v: unknown) => { const t = String(v ?? "").trim(); return t || null; };
const money = (v: unknown) => {
  const raw = String(v ?? "").replace(/[$,\s]/g, "");
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};
const isoDate = (v: unknown) => {
  const t = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
};

// Supabase rejects very large single payloads; upsert in batches.
async function upsertAll(
  supabase: ReturnType<typeof createAdminClient>,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
) {
  let done = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict });
    if (error) throw new Error(`${table} rows ${i}-${i + chunk.length}: ${error.message}`);
    done += chunk.length;
  }
  return done;
}

export async function POST(req: NextRequest) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createAdminClient();

  const body = await req.json().catch(() => ({}));
  const label = String(body.source ?? "import").slice(0, 40);
  const investorsIn: InvestorIn[] = Array.isArray(body.investors) ? body.investors : [];
  const contactsIn: ContactIn[] = Array.isArray(body.contacts) ? body.contacts : [];
  const othersIn: OtherIn[] = Array.isArray(body.others) ? body.others : [];
  if (!investorsIn.length && !contactsIn.length && !othersIn.length) {
    return NextResponse.json({ error: "Nothing to import" }, { status: 400 });
  }

  const by = `import:${label}`;
  // A contacts-only export keys rows by the person, not the investing entity, so each contact
  // has to be matched onto an existing investor: same entity name, an entity the account name
  // is a prefix of ("Buck Horn" -> "Buck Horn, L.P."), or an investor whose primary contact
  // names that person. Anything unmatched is reported rather than guessed at.
  const attachByName = !!body.attach_by_name;
  const matchIndex: { key: string; investor: string; contactWords: Set<string>; entityWords: Set<string> }[] = [];
  if (attachByName) {
    const { data: existing } = await supabase
      .from("investor_crm").select("investor_key, investor, contact").eq("archived", false);
    for (const r of ((existing ?? []) as { investor_key: string; investor: string; contact: string | null }[])) {
      matchIndex.push({
        key: r.investor_key,
        investor: r.investor,
        contactWords: new Set(norm(r.contact ?? "").split(" ").filter(Boolean)),
        entityWords: new Set(norm(r.investor).split(" ").filter(Boolean)),
      });
    }
  }
  const unmatched: string[] = [];
  function resolveInvestor(rawAccount: string, personName: string): string | null {
    const acct = norm(rawAccount);
    if (!matchIndex.length) return null;
    const exact = matchIndex.find((m) => m.key === acct);
    if (exact) return exact.investor;
    const prefix = matchIndex.find((m) => m.key.startsWith(acct + " ") || acct.startsWith(m.key + " "));
    if (prefix) return prefix.investor;
    const words = norm(personName).split(" ").filter(Boolean);
    if (words.length >= 2) {
      const first = words[0], last = words[words.length - 1];
      const byContact = matchIndex.find((m) => m.contactWords.has(first) && m.contactWords.has(last));
      if (byContact) return byContact.investor;
      const byEntity = matchIndex.find((m) => m.entityWords.has(first) && m.entityWords.has(last));
      if (byEntity) return byEntity.investor;
    }
    return null;
  }
  const program = body.program === "DST" ? "DST" : "PE";

  // Investors — keyed by normalized entity name, so a re-import updates in place.
  const investorRows = investorsIn
    .filter((v) => String(v.investor ?? "").trim())
    .map((v) => ({
      investor_key: norm(String(v.investor)),
      investor: String(v.investor).trim(),
      program: v.program === "DST" || v.program === "PE" ? v.program : program,
      portal_created: true,
      archived: false,
      fund: str(v.fund),
      committed_usd: money(v.committed_usd),
      target_amount: money(v.target_amount),
      contact: str(v.contact),
      notes: str(v.notes),
      owner: str(v.owner),
      expected_close: isoDate(v.expected_close),
      updated_by: by,
      updated_at: new Date().toISOString(),
    }));

  // Contacts — one row per person under an account, matched by email when present.
  const seen = new Set<string>();
  const contactRows = contactsIn
    .filter((c) => String(c.investor ?? "").trim() && (String(c.name ?? "").trim() || String(c.email ?? "").trim()))
    .map((c) => {
      const raw = String(c.investor).trim();
      const person = String(c.name ?? "").trim();
      const resolved = attachByName ? resolveInvestor(raw, person) : raw;
      if (!resolved) { unmatched.push(`${person || raw} [${raw}]`); return null; }
      const investor = resolved;
      const email = String(c.email ?? "").trim();
      const name = String(c.name ?? "").trim() || email;
      const key = norm(investor);
      const matchKey = email ? `e:${email.toLowerCase()}` : `n:${norm(name)}`;
      return {
        investor_key: key, investor, match_key: matchKey, name,
        title: str(c.title), email: email || null,
        phone_office: str(c.phone_office), phone_cell: str(c.phone_cell),
        address: str(c.address), notes: str(c.notes),
        is_primary: !!c.is_primary,
        created_by: by, updated_by: by, updated_at: new Date().toISOString(),
      };
    })
    // the unique key is (investor_key, match_key) — drop in-payload duplicates
    .filter((c): c is NonNullable<typeof c> => {
      if (!c) return false;
      const k = `${c.investor_key}|${c.match_key}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

  // Non-investor rows (lenders, law firms, vendors) go to the Other directory.
  const seenOther = new Set<string>();
  const otherRows = othersIn
    .filter((o) => String(o.name ?? "").trim())
    .map((o) => {
      const name = String(o.name).trim();
      const email = String(o.email ?? "").trim();
      const contact = String(o.contact ?? "").trim();
      return {
        name_key: norm(name), name,
        match_key: email ? `e:${email.toLowerCase()}` : `n:${norm(contact || name)}`,
        category: str(o.category) ?? "Other",
        contact: contact || null, title: str(o.title), email: email || null,
        phone: str(o.phone), phone_cell: str(o.phone_cell), address: str(o.address),
        owner: str(o.owner), notes: str(o.notes),
        created_by: by, updated_by: by, updated_at: new Date().toISOString(),
      };
    })
    .filter((o) => { const k = `${o.name_key}|${o.match_key}`; if (seenOther.has(k)) return false; seenOther.add(k); return true; });

  try {
    const funds = [...new Set(investorRows.map((r) => r.fund).filter(Boolean))] as string[];
    if (funds.length) {
      await upsertAll(supabase, "crm_funds",
        funds.map((name) => ({ name, program, created_by: by })), "name");
    }
    const investors = await upsertAll(supabase, "investor_crm", investorRows, "investor_key");
    const contacts = await upsertAll(supabase, "investor_contacts", contactRows, "investor_key,match_key");
    const others = await upsertAll(supabase, "crm_other", otherRows, "name_key,match_key");
    return NextResponse.json({
      ok: true, investors, contacts, others, funds: funds.length,
      unmatched: unmatched.length, unmatchedSample: unmatched.slice(0, 25),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 400) }, { status: 500 });
  }
}
