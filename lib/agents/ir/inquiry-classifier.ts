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
  // Best-guess contact identity parsed from the From display name + email + signature.
  // lastName is ALWAYS non-empty (Salesforce requires it) — falls back to the email handle.
  contact: {
    firstName: string;
    lastName: string;
    fullName: string;
    company: string;
    title: string;
  };
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

ALSO extract the sender's identity for a Salesforce contact. Read the From line AND the email's sign-off/signature (e.g., "Best, John Smith — Acme Capital, Managing Director"). Prefer a real human name from the signature or the From display name over the email handle.
- lastName is REQUIRED and must never be empty (Salesforce requires it). If you can identify a real surname, use it. If you truly cannot determine a name (e.g., info@, no signature), fall back to a cleaned, capitalized version of the email local-part (the text before "@") as lastName, and set firstName to null.
- Do not invent a name that isn't supported by the email. company/title only if clearly present in the signature.

Field notes:
- reason: one short sentence explaining the decision
- contact.lastName: never empty — real surname, else cleaned email handle`;

// Structured-output schema — the API guarantees valid JSON matching this shape.
const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["isInvestorInquiry", "reason", "senderType", "confidence", "contact"],
  properties: {
    isInvestorInquiry: { type: "boolean" },
    reason: { type: "string" },
    senderType: {
      type: "string",
      enum: ["investor", "prospective-investor", "broker", "ria-wealth-advisor", "vendor-solicitation", "internal", "automated-newsletter", "other"],
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    contact: {
      type: "object",
      additionalProperties: false,
      required: ["firstName", "lastName", "fullName", "company", "title"],
      properties: {
        firstName: { anyOf: [{ type: "string" }, { type: "null" }] },
        lastName: { type: "string" },
        fullName: { anyOf: [{ type: "string" }, { type: "null" }] },
        company: { anyOf: [{ type: "string" }, { type: "null" }] },
        title: { anyOf: [{ type: "string" }, { type: "null" }] },
      },
    },
  },
} as const;

export async function classifyInquiry(params: {
  from: string;
  subject: string;
  body: string;
}): Promise<InquiryClassification> {
  const msg = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1000,
    output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
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
  if (!text) throw new Error(`Empty inquiry-classifier response (stop_reason=${msg.stop_reason})`);
  // output_config.format guarantees the text block is valid JSON matching OUTPUT_SCHEMA.
  const result = JSON.parse(text) as InquiryClassification;

  // Normalize the contact block so every field is always a (possibly empty) string,
  // never null/undefined. Power Automate's Parse JSON validates the whole response
  // against a string schema and would fail on a null — so coerce here.
  const handle = (params.from.split("@")[0] || params.from || "Unknown").trim();
  const fallbackLast = handle.charAt(0).toUpperCase() + handle.slice(1);
  const c = result.contact || ({} as InquiryClassification["contact"]);
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  result.contact = {
    firstName: str(c.firstName),
    lastName: str(c.lastName).trim() || fallbackLast,
    fullName: str(c.fullName),
    company: str(c.company),
    title: str(c.title),
  };
  return result;
}
