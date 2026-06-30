import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export interface ExtractedQa {
  question: string;
  answer: string;
  category: string;
}

const SYSTEM = `You extract REUSABLE Q&A pairs from an answered investor-relations email (a reply ERP's IR team sent to an investor/broker; it usually quotes the original question).

Return a JSON array. Each item: { "question": string, "answer": string, "category": string }.

Rules:
- Only extract genuine, reusable investor questions with a substantive answer that would help answer the SAME question from a future investor. Skip one-off logistics (scheduling a specific call, "thanks", forwarding a file, anything purely personal).
- GENERALIZE — this becomes a shared FAQ. Strip investor names, specific dollar amounts, account numbers, specific dates, and any other investor-specific detail. Rewrite the question and answer as if they apply to any investor.
- Keep answers faithful to what was actually said; do NOT invent figures or policies.
- category MUST be one of: portal-access | k1-tax | distributions | commitments | reporting | onboarding | general.
- If there is nothing reusable, return [].

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
