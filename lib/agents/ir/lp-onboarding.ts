import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export interface OnboardingEmail {
  day: 1 | 7 | 30;
  subject: string;
  htmlBody: string;
}

export interface LpOnboardingOutput {
  lpName: string;
  emails: OnboardingEmail[];
  summary: string;
  outputType: "onboarding";
}

export async function runLpOnboarding(params: {
  lpName: string;
  entityName?: string;
  investmentAmount?: string;
  signedDate?: string;
  fundName?: string;
}): Promise<LpOnboardingOutput> {
  const context = `
LP Name: ${params.lpName}
Entity: ${params.entityName ?? "N/A"}
Investment Amount: ${params.investmentAmount ?? "N/A"}
Signed Date: ${params.signedDate ?? "today"}
Fund: ${params.fundName ?? "ERP Industrials"}
IR Contact: Meghan Berry — mberry@erpfunds.com
Investor Support: Tracy Doyle — tdoyle@erpfunds.com (there is NO investors@erpfunds.com address — never use it)
`;

  const msg = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 3000,
    system: [{ type: "text" as const, text: `You write LP onboarding email sequences for ERP Industrials, an industrial real estate private equity firm focused on the Permian Basin and select other markets.
Tone: warm, professional, confident. Not corporate-stiff. These come from Meghan Berry (IR lead) — she will review before sending.

IMPORTANT: Investors have NO online portal or app. NEVER mention a portal, app.erpfunds.com, logging in, or "portal access". For account/document/statement/K-1/distribution questions, point them to Tracy Doyle (tdoyle@erpfunds.com), who handles these directly.

Write exactly three emails as a JSON array:
[
  { "day": 1, "subject": "...", "htmlBody": "...full HTML email..." },
  { "day": 7, "subject": "...", "htmlBody": "...full HTML email..." },
  { "day": 30, "subject": "...", "htmlBody": "...full HTML email..." }
]

Day 1: Welcome, key contacts (Meghan for IR, Tracy Doyle for account/document support), what to expect next, next reporting date
Day 7: Check-in, reinforce the relationship, invite any questions (route account/doc questions to Tracy Doyle)
Day 30: First month recap, open door for questions, restate the investment thesis briefly, long-term relationship tone`, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Generate the onboarding sequence for this new LP:\n${context}`,
      },
    ],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "[]";
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("No JSON array in onboarding response");

  const emails = JSON.parse(jsonMatch[0]) as OnboardingEmail[];
  const summary = `Generated ${emails.length}-email onboarding sequence for ${params.lpName} (Day 1, 7, 30). Drafts saved to Meghan's Outlook.`;

  return { lpName: params.lpName, emails, summary, outputType: "onboarding" };
}
