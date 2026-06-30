import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export interface ExtractedQa {
  question: string;
  answer: string;
  category: string;
}

const SYSTEM = `You extract REUSABLE Q&A pairs from an answered investor-relations email (a reply ERP's IR team sent to an investor/broker; it usually quotes the original question). The goal is a shared FAQ that helps answer future investor questions and recurring due-diligence questions.

Return a JSON array. Each item: { "question": string, "answer": string, "category": string }.

KEEP only questions that a DIFFERENT investor or broker would plausibly ask again — two kinds:
- Investor FAQ: portal access, K-1s / tax docs, distributions, capital commitments/calls, reporting cadence, onboarding/subscription steps, who-to-contact.
- Due-diligence: fund strategy, structure, sponsor/track record, fees & terms, target returns approach, risk, tax treatment (e.g. DST/1031, depreciation), asset/market focus, redemption/liquidity terms.

REJECT (return nothing for these): one-off legal or entity matters specific to a single deal (e.g. dissolving a particular LLC), scheduling a specific call/meeting, "thanks"/acknowledgements, forwarding a specific file, signature/logistics, or anything tied to one investor's personal account that wouldn't recur.

Rules:
- GENERALIZE: strip investor names, specific dollar amounts, account numbers, and specific dates so it applies to any investor.
- Write a COMPLETE, self-contained answer (2–5 sentences) that stands on its own as an FAQ entry — enough context that someone could answer the question from it alone. Do NOT just echo a one-line reply.
- Stay faithful to what was actually said; do NOT invent figures, terms, or policies. If the email's answer is too thin to stand alone, skip it.
- category MUST be one of: portal-access | k1-tax | distributions | commitments | reporting | onboarding | fund-strategy | structure-terms | fees | due-diligence | general.
- If nothing qualifies, return [].

Return ONLY the JSON array, no prose.`;

export async function extractQaPairs(params: { subject: string; body: string }): Promise<ExtractedQa[]> {
  const msg = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 1200,
    system: [{ type: "text" as const, text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Answered investor email.\n\nSubject: ${params.subject}\n\n${params.body.slice(0, 6000)}`,
      },
    ],
  });
  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const arr = JSON.parse(match[0]) as ExtractedQa[];
    return arr
      .filter((x) => x && typeof x.question === "string" && typeof x.answer === "string" && x.question.trim() && x.answer.trim())
      .map((x) => ({ question: x.question.trim(), answer: x.answer.trim(), category: (x.category || "general").trim() }));
  } catch {
    return [];
  }
}
