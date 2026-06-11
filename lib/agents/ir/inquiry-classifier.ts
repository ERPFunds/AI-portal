import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export interface InquiryClassification {
  isInvestorInquiry: boolean;
  reason: string;
  // Best-guess sender type, for context only — routing decisions use isInvestorInquiry.
  senderType:
    | "investor"
    | "prospective-investor"
    | "broker"
    | "ria-wealth-advisor"
    | "vendor-solicitation"
    | "internal"
    | "automated-newsletter"
    | "other";
  confidence: "high" | "medium" | "low";
}

const SYSTEM = `You triage inbound email for ERP Funds, a private real estate / private equity firm (industrial assets, DSTs, and funds). Investor Relations is handled by Meghan Berry (mberry@erpfunds.com).

Your only job: decide whether an email is an investor- or broker-relations inquiry that the IR team should capture and respond to, versus noise that should be ignored.

COUNT AS AN IR INQUIRY (isInvestorInquiry = true):
- Current or prospective investors (LPs) asking questions, requesting info, or following up
- Brokers, RIAs, wealth advisors, or their assistants inquiring on behalf of clients
- Capital-raise, fund, DST, K-1/tax-doc, distribution, portal-access, or subscription questions
- Anyone requesting a meeting, deck, PPM, or due-diligence materials about the funds

DO NOT COUNT (isInvestorInquiry = false):
- Vendor sales pitches and cold solicitations selling a product/service to ERP
- Marketing newsletters, mailing-list blasts, and automated notifications
- Internal ERP staff chatter unrelated to a specific investor
- Spam, calendar invites, receipts, and obvious no-reply automated mail

When genuinely unsure but the email plausibly concerns the funds or an investor relationship, lean true — a missed investor inquiry is worse than a stray contact record.

Return ONLY a JSON object with exactly these fields:
{
  "isInvestorInquiry": boolean,
  "reason": string (one short sentence explaining the decision),
  "senderType": one of "investor" | "prospective-investor" | "broker" | "ria-wealth-advisor" | "vendor-solicitation" | "internal" | "automated-newsletter" | "other",
  "confidence": "high" | "medium" | "low"
}`;

export async function classifyInquiry(params: {
  from: string;
  subject: string;
  body: string;
}): Promise<InquiryClassification> {
  const msg = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 400,
    system: [{ type: "text" as const, text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Classify this email.

From: ${params.from}
Subject: ${params.subject}

${(params.body || "").slice(0, 6000)}`,
      },
    ],
  });

  const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in inquiry-classifier response");
  return JSON.parse(jsonMatch[0]) as InquiryClassification;
}
