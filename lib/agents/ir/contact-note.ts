import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export interface ContactNote {
  /** 2–4 sentence factual summary of what ERP communicated in the reply. */
  note: string;
  /** One short suggested follow-up, or "None". */
  nextStep: string;
}

/**
 * Write a CRM activity note from the reply ERP just sent to an investor/broker.
 * The note is logged to the matching Salesforce Contact (Workflow #3).
 */
export async function composeContactNote(params: {
  subject: string;
  sentReply: string; // the reply body (text) that was sent
  inbound?: string; // optional: the original inbound email for context
}): Promise<ContactNote> {
  const msg = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 600,
    system: [
      {
        type: "text" as const,
        text: `You write concise CRM activity notes for ERP Funds' Investor Relations team. You are given the reply that ERP just SENT to an investor or broker (and optionally the inbound email it answered). Write a factual log entry for the contact's Salesforce record.

Rules:
- "note": 2–4 sentences, past tense, summarizing what was communicated, answered, or committed in the reply. No fluff, no greetings, no marketing language. Capture specifics (figures, documents sent, dates, commitments) when present.
- "nextStep": one short imperative follow-up if the reply implies one (e.g., "Send executed PSA once received", "Confirm wire by Friday"), otherwise exactly "None".
- Never invent facts not present in the emails.

Return ONLY a JSON object: {"note": string, "nextStep": string}`,
        cache_control: { type: "ephemeral" as const },
      },
    ],
    messages: [
      {
        role: "user",
        content:
          `Subject: ${params.subject}\n\n` +
          (params.inbound ? `--- Inbound email ---\n${params.inbound}\n\n` : "") +
          `--- Reply sent by ERP ---\n${params.sentReply}`,
      },
    ],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in contact-note response");
  const parsed = JSON.parse(jsonMatch[0]) as Partial<ContactNote>;
  return { note: parsed.note ?? "", nextStep: parsed.nextStep ?? "None" };
}
