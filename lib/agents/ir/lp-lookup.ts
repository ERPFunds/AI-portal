import { createClient } from "@/lib/supabase/server";

/**
 * "Is this email a known investor, and under what entity?" — built from the LP Directory cache.
 * Used to decide which of Meghan's sent replies to log to Salesforce (we only log correspondence
 * with investors, not her personal mail) and to link a new Contact under the right Account.
 */
// Free / consumer mail providers — we trust these only by EXACT email, never by whole domain
// (trusting "gmail.com" would trust everyone). Corporate/advisory domains are trusted by domain.
const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "hotmail.com", "outlook.com", "live.com",
  "msn.com", "aol.com", "icloud.com", "me.com", "mac.com", "comcast.net", "att.net", "verizon.net",
  "sbcglobal.net", "cox.net", "bellsouth.net", "proton.me", "protonmail.com", "gmx.com", " meta.com",
]);

export interface InvestorLookup {
  /** lowercased recipient email → investor entity name (for Account linking) */
  emailToName: Map<string, string>;
  /** corporate/advisory domains we've seen on investor/broker emails (free-mail excluded) */
  knownDomains: Set<string>;
  isInvestor(email: string): boolean;
  nameFor(email: string): string | undefined;
  /** A known investor OR someone at a known corporate/advisory domain (e.g. a broker's colleague). */
  isKnownSender(email: string): boolean;
}

export async function loadInvestorLookup(): Promise<InvestorLookup> {
  const emailToName = new Map<string, string>();
  try {
    const sb = await createClient();
    const { data } = await sb.from("lp_directory_cache").select("data").eq("id", 1).maybeSingle();
    const lps = ((data as { data?: { lps?: Array<Record<string, unknown>> } } | null)?.data?.lps) ?? [];
    for (const lp of lps) {
      const name = String(lp.investor ?? "").trim();
      for (const e of [lp.email, lp.resolvedEmail]) {
        const em = String(e ?? "").toLowerCase().trim();
        if (em && em.includes("@") && !emailToName.has(em)) emailToName.set(em, name);
      }
    }
  } catch {
    /* empty lookup on failure — callers treat everyone as non-investor and log nothing extra */
  }
  const norm = (e: string) => (e || "").toLowerCase().trim();
  const domainOf = (e: string) => norm(e).split("@")[1] || "";

  // Corporate/advisory domains seen on investor & broker emails — trusted at the domain level so a
  // colleague at a known firm (e.g. ethan@ vs gaston@g3capitalwealth.com) is recognized. Free-mail
  // providers are excluded (we'd never trust all of gmail.com).
  const knownDomains = new Set<string>();
  for (const em of emailToName.keys()) {
    const dom = domainOf(em);
    if (dom && !FREE_MAIL.has(dom)) knownDomains.add(dom);
  }

  return {
    emailToName,
    knownDomains,
    isInvestor: (e) => emailToName.has(norm(e)),
    nameFor: (e) => emailToName.get(norm(e)),
    isKnownSender: (e) => emailToName.has(norm(e)) || knownDomains.has(domainOf(e)),
  };
}
