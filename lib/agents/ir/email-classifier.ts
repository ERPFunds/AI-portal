import Anthropic from "@anthropic-ai/sdk";
import { getIrQaGrounding } from "@/lib/agents/ir/ir-grounding";

const client = new Anthropic();

export type EmailCategory =
  | "portal-access"
  | "k1-tax-docs"
  | "distribution-status"
  | "general-faq"
  | "escalation-complaint"
  | "escalation-legal"
  | "escalation-redemption"
  | "escalation-new-inquiry"
  | "escalation-other"
  | "new-prospect"
  | "attachment"
  | "onboarding";

export interface EmailClassification {
  category: EmailCategory;
  isEscalation: boolean;
  escalationReason: string | null;
  lpName: string | null;
  isExistingLp: boolean;
  isDueDiligence: boolean;
  draftSubject: string;
  draftHtml: string;
  summary: string;
}

const FAQ_CONTEXT = `
Standard handling for repeat investor questions:

CRITICAL — investors do NOT have any online portal or app. There is NO investor portal, no login, no account to reset. NEVER mention https://app.erpfunds.com, a "portal", a "portal account", logging in, viewing/downloading documents online, or resetting access. app.erpfunds.com is an INTERNAL staff tool — investors must never be pointed to it.

For ANY account, document, statement, K-1/tax, distribution, access, or general operational question, the ONLY correct response is to refer the investor to Tracy Doyle (tdoyle@erpfunds.com), who handles these directly. Do not describe self-service steps — just make the warm hand-off to Tracy.

K-1 / TAX DOCUMENTS: Refer the investor to Tracy Doyle (tdoyle@erpfunds.com), who provides them.
DISTRIBUTION STATUS: Distributions are made per the fund schedule; for any specifics refer the investor to Tracy Doyle (tdoyle@erpfunds.com).
ACCOUNT / STATEMENTS / GENERAL SUPPORT: Refer the investor to Tracy Doyle (tdoyle@erpfunds.com).

CONTACTS:
- Investor support (accounts, documents, operations): Tracy Doyle — tdoyle@erpfunds.com
- IR: Meghan Berry — mberry@erpfunds.com

There is NO investors@erpfunds.com address — it does not exist. NEVER give it out. The only investor-support address is Tracy Doyle, tdoyle@erpfunds.com.
`;

// Structured-output schema: the API guarantees the response is valid JSON matching this shape,
// so parsing can never fail (the old regex-extract-JSON approach broke on truncated output).
const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["category", "isEscalation", "escalationReason", "lpName", "isExistingLp", "isDueDiligence", "draftSubject", "draftHtml", "summary"],
  properties: {
    category: {
      type: "string",
      enum: ["portal-access", "k1-tax-docs", "distribution-status", "general-faq", "escalation-complaint", "escalation-legal", "escalation-redemption", "escalation-new-inquiry", "escalation-other", "new-prospect", "attachment", "onboarding"],
    },
    isEscalation: { type: "boolean" },
    escalationReason: { anyOf: [{ type: "string" }, { type: "null" }], description: "One short phrase saying WHY this needs a human (used as an Outlook tag), or null" },
    lpName: { anyOf: [{ type: "string" }, { type: "null" }] },
    isExistingLp: { type: "boolean" },
    isDueDiligence: { type: "boolean" },
    draftSubject: { type: "string" },
    draftHtml: { type: "string" },
    summary: { type: "string" },
  },
} as const;

export async function classifyInvestorEmail(params: {
  from: string;
  subject: string;
  body: string;
  signAs?: string;
  /** Prior messages in the same Outlook conversation (oldest first), for full-thread context. */
  threadContext?: string;
}): Promise<EmailClassification> {
  const signer = params.signAs || "Meghan Berry";
  // Ground every draft on the SOP sources — the IR Q&A Reference doc + approved Learned Q&A — so
  // replies follow the current approved answers. Non-fatal if a source is unavailable.
  const faqContext = FAQ_CONTEXT + (await getIrQaGrounding());

  const msg = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 8000,
    output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    system: [{ type: "text" as const, text: `You are the IR agent for ERP Industrials, a private equity real estate firm focused on industrial assets in the Permian Basin and other markets.
You classify inbound investor emails and draft responses for the IR team's review.

${faqContext}

Rules:
- Identify repeat/FAQ questions vs. items needing escalation to a human
- ESCALATION TEST — every draft is human-reviewed before sending, so routine (isEscalation=false) is the DEFAULT. Set isEscalation=true ONLY when a human must DECIDE something, not merely see the email:
  (a) getting the reply wrong carries real risk: a complaint or unhappy investor, legal/regulatory matters, redemption or withdrawal requests, money movement or wire details, pricing/fee/commitment/side-letter negotiation; or
  (b) the email asks something genuinely unanswerable from the approved sources here (and not simply routable to Tracy Doyle).
- A FIRST-TIME PROSPECT — or a broker/RIA inquiring on behalf of one — asking for standard materials (deck, PPM, fund overview), an intro call, or due-diligence questions answerable from the approved sources is NOT an escalation: use category "new-prospect", isEscalation=false, and draft the standard reply. Escalate a prospect email only if it trips (a) or (b) above.
- Draft responses in a warm, professional tone as if from ${signer}'s office
- NEVER include specific financial figures you don't have — refer the investor to Tracy Doyle (tdoyle@erpfunds.com)
- Investors have NO portal/app access — NEVER mention app.erpfunds.com, a portal, a portal account, or logging in. Route every account/document/access/K-1/distribution question to Tracy Doyle (tdoyle@erpfunds.com)
- All drafts are saved for review — the IR team approves before sending. Never auto-send.
- DST investors route to Tracy Doyle for operational questions
- Sign off as "${signer}" only — do NOT add an "Investor Relations" title or department line (no "Investor Relations", "IR", or "ERP Industrials Investor Relations" under the name)
- ALWAYS write your best draft reply in draftHtml — never leave it empty. When an email trips the escalation test, set isEscalation=true so it's filed for human review, but STILL provide a genuine best-effort draft the reviewer can edit and send (draw on the Q&A reference / approved answers where relevant). Avoid pure filler ("thanks, noted") — write the most useful reply you can even when escalating.
- If a PRIOR THREAD is provided, read it: answer only what's still open, don't repeat what was already said, and keep the draft consistent with earlier replies in the thread.

Field notes for the structured output:
- isDueDiligence: true if the sender is asking due-diligence questions about the fund / requesting fund details or documents to evaluate an investment
- escalationReason: when escalating, a SHORT phrase (a few words) naming the reason — it is shown as an Outlook tag
- draftHtml: full HTML email ready for the IR lead's Outlook drafts
- summary: one sentence — what this email is and what action was taken`, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Classify and draft a response for this investor email:

From: ${params.from}
Subject: ${params.subject}

${params.body}${params.threadContext ? `

=== PRIOR THREAD (same conversation, oldest first — context only, reply to the email above) ===
${params.threadContext}` : ""}`,
      },
    ],
  });

  const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
  if (!text) throw new Error(`Empty classifier response (stop_reason=${msg.stop_reason})`);
  // output_config.format guarantees the text block is valid JSON matching OUTPUT_SCHEMA.
  return JSON.parse(text) as EmailClassification;
}
