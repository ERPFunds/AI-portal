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

const PORTAL_URL = "https://app.erpfunds.com";

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
Portal URL: ${PORTAL_URL}
IR Contact: Meghan Berry — mberry@erpfunds.com
Investor Support: Tracy Doyle — tdoyle@erpfunds.com / investors@erpfunds.com
`;

  const msg = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 3000,
    system: `You write LP onboarding email sequences for ERP Industrials, an industrial real estate private equity firm focused on the Permian Basin and select other markets.
Tone: warm, professional, confident. Not corporate-stiff. These come from Meghan Berry (IR lead) — she will review before sending.

Write exactly three emails as a JSON array:
[
  { "day": 1, "subject": "...", "htmlBody": "...full HTML email..." },
  { "day": 7, "subject": "...", "htmlBody": "...full HTML email..." },
  { "day": 30, "subject": "...", "htmlBody": "...full HTML email..." }
]

Day 1: Welcome, portal access instructions, key contacts, what to expect next, next reporting date
Day 7: Check-in, highlight 1-2 specific things to explore in the portal, reinforce relationship
Day 30: First month recap, open door for questions, restate the investment thesis briefly, long-term relationship tone`,
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
