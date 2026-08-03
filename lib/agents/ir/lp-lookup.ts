import { createClient } from "@/lib/supabase/server";

/**
 * "Is this email a known investor, and under what entity?" — built from the LP Directory cache.
 * Used to decide which of Meghan's sent replies to log to Salesforce (we only log correspondence
 * with investors, not her personal mail) and to link a new Contact under the right Account.
 */
export interface InvestorLookup {
  /** lowercased recipient email → investor entity name (for Account linking) */
  emailToName: Map<string, string>;
  isInvestor(email: string): boolean;
  nameFor(email: string): string | undefined;
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
  return {
    emailToName,
    isInvestor: (e) => emailToName.has(norm(e)),
    nameFor: (e) => emailToName.get(norm(e)),
  };
}
