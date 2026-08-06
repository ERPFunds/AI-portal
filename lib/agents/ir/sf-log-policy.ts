import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

// What kind of correspondence this is, for the "log it to Salesforce?" decision.
export type SfLogCategory = "expression-of-interest" | "new-contact-intro" | "dd-portfolio" | "day-to-day";
export interface SfLogDecision { log: boolean; category: SfLogCategory; reason: string }

// ERP's policy for what belongs in Salesforce as a correspondence note. We log ONLY meaningful
// relationship events — expressions of interest and new-contact introductions (primary), and
// due-diligence / portfolio responses (secondary). Routine day-to-day traffic is NOT logged.
const SYSTEM = `You are the logging gatekeeper for ERP Industrials' Investor Relations CRM (Salesforce). ERP is a private-equity real estate fund. Decide whether an email is worth saving as a correspondence note, or is routine day-to-day traffic that should NOT be logged.

Return ONLY a JSON object: { "category": one of ["expression-of-interest","new-contact-intro","dd-portfolio","day-to-day"], "reason": "<short phrase>" }.

LOG these (category is NOT day-to-day):
- expression-of-interest: the sender expresses interest in ERP's offerings/funds/transactions, in investing or allocating capital, or in working with ERP — including a broker/advisor bringing a client, or interest in a specific deal or fund.
- new-contact-intro: an introduction of a new person or firm — someone introducing themselves or being introduced, especially with background about their firm, role, mandate, or AUM. A first-touch from a prospective investor/broker/advisor.
- dd-portfolio: a substantive due-diligence inquiry, or a reply answering due-diligence / portfolio questions about the fund, strategy, structure, terms, fees, track record, tax treatment, or specific assets.

DO NOT LOG (category = day-to-day) — this is the DEFAULT:
- scheduling / logistics / calendar, thanks / acknowledgements ("got it", "sounds good"), forwarding a file, signature or administrative back-and-forth
- account / statement / K-1 / tax / distribution / document requests and other operational questions (these route to Tracy Doyle)
- generic follow-ups and routine relationship chatter that isn't interest, an introduction, or a substantive DD/portfolio matter

When in doubt, choose day-to-day.`;

/**
 * Classify whether an IR email should be logged to Salesforce per ERP's policy.
 * Fails SAFE toward NOT logging (the user's directive is to keep day-to-day noise out of the CRM).
 */
export async function classifySfLogWorthiness(params: { subject: string; body: string }): Promise<SfLogDecision> {
  try {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 150,
      system: [{ type: "text" as const, text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `Subject: ${params.subject}\n\n${(params.body || "").slice(0, 3000)}` }],
    });
    const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { log: false, category: "day-to-day", reason: "no classification returned" };
    const parsed = JSON.parse(m[0]) as { category?: SfLogCategory; reason?: string };
    const category = (["expression-of-interest", "new-contact-intro", "dd-portfolio", "day-to-day"] as const)
      .includes(parsed.category as SfLogCategory) ? (parsed.category as SfLogCategory) : "day-to-day";
    return { log: category !== "day-to-day", category, reason: (parsed.reason || "").slice(0, 120) };
  } catch {
    return { log: false, category: "day-to-day", reason: "classifier unavailable — skipped" };
  }
}
