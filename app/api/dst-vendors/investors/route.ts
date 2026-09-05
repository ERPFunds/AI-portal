import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetch-all";

export const dynamic = "force-dynamic";

// Which DST investors sit under which vendor account — the reverse of the broker-dealer /
// advisor fields the DST Investors tab already writes. There is no join table: an investor
// names its broker dealer and its advisor as text on `investor_crm`, and that stays the one
// source of truth, so linking from either side is the same write. This route only resolves
// those names to vendor accounts and totals them up.
//
// An investor reaches a vendor three ways:
//   • broker_dealer matches the account's name           → direct, role "Broker Dealer"
//   • advisor matches the account's name                 → direct, role "Advisor"
//   • advisor matches a person on the account            → direct, role "Advisor", via that person
// and a direct link to a brokerage also rolls up to the broker dealer it is affiliated with
// (parent_id), as an indirect link — that is how a BD sees the whole book underneath it.

interface InvestorRow {
  investor_key: string; investor: string | null; broker_dealer: string | null; advisor: string | null;
  committed_usd: number | string | null; funnel_stage: string | null; owner: string | null;
  email: string | null; fund: string | null; state: string | null;
}
interface VendorRow { id: string; name: string; parent_id: string | null; vendor_type: string | null }
interface ContactRow { vendor_id: string; name: string }

export interface VendorInvestorLink {
  investor_key: string;
  investor: string;
  role: "Broker Dealer" | "Advisor";
  /** The person or brokerage the link runs through, where it isn't the account itself. */
  via: string | null;
  /** False when the link is inherited from a brokerage listed under this broker dealer. */
  direct: boolean;
  committed: number;
  stage: string | null;
  owner: string | null;
  email: string | null;
  fund: string | null;
  state: string | null;
}

const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
// Second pass for the same firm written with and without its legal suffix ("LPL Financial
// LLC" vs "LPL Financial"). Only the suffix comes off — words like Group or Capital are
// part of the name and dropping them would collide two different firms.
const LEGAL = /\b(llc|l l c|inc|incorporated|corp|corporation|co|ltd|limited|lp|llp|pllc|pc|plc|pa|company)\b/g;
const loose = (v: unknown) => norm(v).replace(LEGAL, " ").replace(/\s+/g, " ").trim();
const num = (v: unknown) => { const n = Number(String(v ?? "").replace(/[$,\s]/g, "")); return Number.isFinite(n) ? n : 0 };

// Two advisors who worked the same deal are recorded in one field — "Harmony Russo / Neil
// McAuliffe", "Mike O'Toole & Joe Michaletz" — and a few carry a parenthetical aside. The
// field is only split when it does not resolve whole, because a firm name can carry the
// same punctuation ("Real Estate Tax Strategies, Inc.") and splitting it matches nothing.
const advisorParts = (raw: string | null): string[] =>
  String(raw ?? "").replace(/\([^)]*\)/g, " ")
    .split(/\s*(?:\/|&|,| and )\s*/i)
    .map(s => s.trim())
    // A trailing "Inc." left behind by the split is not somebody's name.
    .filter(s => s && !/^(inc|llc|corp|co|ltd|lp|llp|pllc|pc|plc|pa)\.?$/i.test(s));

export async function GET() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createAdminClient();

  let investors: InvestorRow[];
  let vendors: VendorRow[];
  let contacts: ContactRow[];
  try {
    [investors, vendors, contacts] = await Promise.all([
      // Same population the DST Investors tab lists: portal-owned, unarchived DST records.
      fetchAll<InvestorRow>(() => supabase.from("investor_crm")
        .select("investor_key, investor, broker_dealer, advisor, committed_usd, funnel_stage, owner, email, fund, state")
        .eq("program", "DST").eq("portal_created", true).neq("archived", true)),
      fetchAll<VendorRow>(() => supabase.from("dst_vendors")
        .select("id, name, parent_id, vendor_type").eq("archived", false)),
      fetchAll<ContactRow>(() => supabase.from("dst_vendor_contacts").select("vendor_id, name")),
    ]);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }

  // Name → vendor id. The exact index wins; the suffix-stripped one only fills gaps, and a
  // loose name shared by two accounts is dropped rather than guessed at.
  const exact = new Map<string, string>();
  const looseIdx = new Map<string, string | null>();
  for (const v of vendors) {
    if (!exact.has(norm(v.name))) exact.set(norm(v.name), v.id);
    const l = loose(v.name);
    if (l) looseIdx.set(l, looseIdx.has(l) ? null : v.id);
  }
  // Advisors are usually people on an account rather than accounts of their own.
  const byPerson = new Map<string, { vendorId: string; name: string }>();
  for (const c of contacts) {
    const k = norm(c.name);
    if (k && !byPerson.has(k)) byPerson.set(k, { vendorId: c.vendor_id, name: c.name });
  }
  const parentOf = new Map(vendors.map(v => [v.id, v.parent_id] as const));
  const nameOf = new Map(vendors.map(v => [v.id, v.name] as const));

  function resolveAccount(name: string | null): string | null {
    const n = norm(name);
    if (!n) return null;
    return exact.get(n) ?? looseIdx.get(loose(name)) ?? null;
  }

  const byVendor = new Map<string, VendorInvestorLink[]>();
  // Names on investor records that match no account here — worth surfacing, since a missing
  // broker dealer means a book of investors nobody can see from the vendor side.
  const unmatched = new Map<string, { name: string; role: string; count: number }>();

  const push = (vendorId: string, link: VendorInvestorLink) => {
    const list = byVendor.get(vendorId) ?? [];
    // One row per investor per account: a direct link replaces an inherited one.
    const at = list.findIndex(x => x.investor_key === link.investor_key);
    if (at < 0) list.push(link);
    else if (link.direct && !list[at].direct) list[at] = link;
    byVendor.set(vendorId, list);
  };

  const noteUnmatched = (name: string, role: string) => {
    const k = `${role}:${norm(name)}`;
    const prev = unmatched.get(k);
    if (prev) prev.count += 1;
    else unmatched.set(k, { name: name.trim(), role, count: 1 });
  };

  for (const iv of investors) {
    const base = {
      investor_key: iv.investor_key,
      investor: iv.investor ?? iv.investor_key,
      committed: num(iv.committed_usd),
      stage: iv.funnel_stage, owner: iv.owner, email: iv.email, fund: iv.fund, state: iv.state,
    };

    const targets: { vendorId: string; role: VendorInvestorLink["role"]; via: string | null }[] = [];

    const bd = resolveAccount(iv.broker_dealer);
    if (bd) targets.push({ vendorId: bd, role: "Broker Dealer", via: null });
    else if (norm(iv.broker_dealer)) noteUnmatched(iv.broker_dealer!, "Broker Dealer");

    // An advisor is a person on an account in most cases, and an account of its own in a
    // few. The whole field is tried first so a firm whose name contains a comma or an
    // ampersand matches as itself; only then is it read as several names.
    if (norm(iv.advisor)) {
      const wholeAccount = resolveAccount(iv.advisor);
      const wholePerson = byPerson.get(norm(iv.advisor));
      if (wholeAccount) targets.push({ vendorId: wholeAccount, role: "Advisor", via: null });
      else if (wholePerson) targets.push({ vendorId: wholePerson.vendorId, role: "Advisor", via: wholePerson.name });
      else {
        const parts = advisorParts(iv.advisor);
        for (const name of parts) {
          const acct = resolveAccount(name);
          const person = byPerson.get(norm(name));
          // With two advisors named, say which one this link runs through; with one, the
          // account row already says it.
          if (acct) targets.push({ vendorId: acct, role: "Advisor", via: parts.length > 1 ? name : null });
          else if (person) targets.push({ vendorId: person.vendorId, role: "Advisor", via: person.name });
          else noteUnmatched(name, "Advisor");
        }
      }
    }

    for (const t of targets) {
      push(t.vendorId, { ...base, role: t.role, via: t.via, direct: true });
      // Roll the link up the affiliation chain so a broker dealer sees what its brokerages
      // brought in. Guarded against a cycle in parent_id.
      let parent = parentOf.get(t.vendorId) ?? null;
      const seen = new Set<string>([t.vendorId]);
      while (parent && !seen.has(parent)) {
        seen.add(parent);
        push(parent, { ...base, role: t.role, via: nameOf.get(t.vendorId) ?? null, direct: false });
        parent = parentOf.get(parent) ?? null;
      }
    }
  }

  const out: Record<string, VendorInvestorLink[]> = {};
  for (const [vendorId, list] of byVendor) {
    out[vendorId] = list.sort((a, b) => b.committed - a.committed || a.investor.localeCompare(b.investor));
  }

  // The picker on the vendor side needs every DST investor, linked or not.
  const roster = investors
    .map(iv => ({
      investor_key: iv.investor_key,
      investor: iv.investor ?? iv.investor_key,
      broker_dealer: iv.broker_dealer,
      advisor: iv.advisor,
      committed: num(iv.committed_usd),
    }))
    .sort((a, b) => a.investor.localeCompare(b.investor));

  return NextResponse.json({
    byVendor: out,
    investors: roster,
    unmatched: [...unmatched.values()].sort((a, b) => b.count - a.count),
  });
}
