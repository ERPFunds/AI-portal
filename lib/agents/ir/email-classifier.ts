import Anthropic from "@anthropic-ai/sdk";
import { getIrQaReferenceText } from "@/lib/agents/ir/qa-reference";
import { getApprovedQaForPrompt } from "@/lib/agents/ir/qa-store";

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
Standard responses for repeat investor questions:

PORTAL ACCESS: Direct to https://app.erpfunds.com. For login/access issues, contact Tracy Doyle at tdoyle@erpfunds.com or investors@erpfunds.com.

K-1 / TAX DOCUMENTS: Available in the investor portal under "Documents". DST investors: contact Tracy Doyle at tdoyle@erpfunds.com.

DISTRIBUTION STATUS: Distributions are made per the fund schedule. Current status in the investor portal. Specific inquiries: investors@erpfunds.com.

CONTACTS:
- Investor support: Tracy Doyle — tdoyle@erpfunds.com / investors@erpfunds.com
- IR: Meghan Berry — mberry@erpfunds.com
`;

export async function classifyInvestorEmail(params: {
  from: string;
  subject: string;
  body: string;
}): Promise<EmailClassification> {
  // Reference the team-maintained IR Q&A doc (SOP section) on every draft, so replies
  // follow the current approved answers. Non-fatal if the doc is unavailable.
  let faqContext = FAQ_CONTEXT;
  try {
    const ref = await getIrQaReferenceText();
    if (ref) faqContext = `${FAQ_CONTEXT}\n\n=== IR Q&A Reference (authoritative — follow this when answering investor questions) ===\n${ref}`;
  } catch { /* fall back to base FAQ if the reference doc is unavailable */ }
  // Plus any Q&A the IR team has approved on the review page (Workflow 5).
  try {
    const approved = await getApprovedQaForPrompt();
    if (approved) faqContext += `\n\n=== Recently approved Q&A (reviewed by the IR team) ===\n${approved}`;
  } catch { /* non-fatal */ }

  const msg = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 1500,
    system: [{ type: "text" as const, text: `You are the IR agent for ERP Industrials, a private equity real estate firm focused on industrial assets in the Permian Basin and other markets.
You classify inbound investor emails and draft responses for Meghan Berry's review.

${faqContext}

Rules:
- Identify repeat/FAQ questions vs. items needing escalation to Meghan
- Draft responses in a warm, professional tone as if from Meghan's office
- NEVER include specific financial figures you don't have — redirect to portal or support contact
- All drafts are saved for Meghan's review — she approves before sending. Never auto-send.
- DST investors route to Tracy Doyle for operational questions

Return a JSON object with exactly these fields:
{
  "category": string (one of: portal-access | k1-tax-docs | distribution-status | general-faq | escalation-complaint | escalation-legal | escalation-redemption | escalation-new-inquiry | escalation-other),
  "isEscalation": boolean,
  "escalationReason": string or null,
  "lpName": string or null (extracted name),
  "isExistingLp": boolean,
  "isDueDiligence": boolean (true if the sender is asking due-diligence questions about the fund / requesting fund details or documents to evaluate an investment),
  "draftSubject": string,
  "draftHtml": string (full HTML email ready for Meghan's Outlook drafts),
  "summary": string (one sentence: what this email is and what action was taken)
}`, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Classify and draft a response for this investor email:

From: ${params.from}
Subject: ${params.subject}

${params.body}`,
      },
    ],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in classifier response");
  return JSON.parse(jsonMatch[0]) as EmailClassification;
}
