import Anthropic from "@anthropic-ai/sdk";
import { getIrQaGrounding } from "@/lib/agents/ir/ir-grounding";

const client = new Anthropic();

export interface LpOutreachInput {
  investor: string;
  contact?: string;
  commitment?: string;
  commitType?: string;
  fundType?: string;            // "Fund IV" or "DST / 1031"
  lastInteraction?: string;     // note from the most recent logged interaction
  lastInteractionDate?: string; // ISO date of that interaction
  advisorFirm?: string;
  advisorContact?: string;
  notes?: string;
  signAs?: string;
}

/**
 * Draft a short, warm proactive outreach email to an LP/investor (a relationship check-in),
 * grounded in whatever context we have. Never invents figures; never references a portal;
 * routes operational questions to Tracy Doyle. Returns a subject + plain-text body.
 */
export async function draftLpOutreach(p: LpOutreachInput): Promise<{ subject: string; bodyText: string }> {
  const signer = p.signAs || "Meghan Berry";
  const firstName = (p.contact || "").split(/[ ,&/]/).filter(Boolean)[0] || "";

  let sinceNote = "";
  if (p.lastInteractionDate) {
    const days = Math.floor((Date.now() - new Date(p.lastInteractionDate).getTime()) / 86400000);
    if (Number.isFinite(days)) sinceNote = `It has been about ${Math.max(1, Math.round(days / 30))} month(s) since the last contact.`;
  }

  const context = [
    `Investor / LP: ${p.investor}`,
    p.contact ? `Primary contact: ${p.contact}` : "",
    firstName ? `Greet them as: ${firstName}` : "",
    p.fundType ? `Fund / product: ${p.fundType}` : "",
    p.commitment ? `Commitment on file: ${p.commitment}${p.commitType ? ` (${p.commitType})` : ""}` : "",
    p.advisorFirm || p.advisorContact ? `Broker/advisor: ${[p.advisorContact, p.advisorFirm].filter(Boolean).join(" @ ")}` : "",
    p.lastInteraction ? `Most recent logged interaction: ${p.lastInteraction}` : "No prior interaction is logged in our mailboxes.",
    sinceNote,
    p.notes ? `Internal notes (context only — do NOT quote verbatim): ${p.notes}` : "",
  ].filter(Boolean).join("\n");

  const system = `You are ${signer}, Investor Relations lead at ERP Industrials, a private-equity real estate firm focused on industrial assets in the Permian Basin and select markets. You are writing a SHORT, warm, professional proactive outreach email to an investor/LP — a relationship touch, not a reply.

Rules:
- Warm, genuine, concise (3-6 sentences). Sound like ${signer}, not a template.
- If there is a recent interaction, reference it naturally. If it has been a while, a gentle reconnect ("wanted to check in"). If there's no prior contact, a brief, friendly introduction/relationship note.
- NEVER invent or imply specific figures — returns, distributions, valuations, dates, or performance you were not given. Speak only in general terms.
- Investors have NO online portal or app. NEVER mention app.erpfunds.com, a portal, a "portal account", or logging in.
- For any account, document, K-1/tax, statement, or distribution question, direct them to Tracy Doyle (tdoyle@erpfunds.com).
- Sign off as "${signer}" only — no title, department, or "Investor Relations" line under the name.
- This is a DRAFT for ${signer} to review and edit before sending — leave it easy to personalize.
- Follow the approved IR Q&A sources below for how ERP describes itself and handles recurring questions; never contradict them.

Return ONLY a JSON object: {"subject": "...", "body": "...plain text with \\n line breaks..."}.`;

  const grounding = await getIrQaGrounding();

  const msg = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 1200,
    system: [{ type: "text" as const, text: system + grounding }],
    messages: [{ role: "user", content: `Draft the outreach email for this investor:\n${context}` }],
  });

  const text = msg.content[0]?.type === "text" ? msg.content[0].text : "{}";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const parsed = jsonMatch ? (JSON.parse(jsonMatch[0]) as { subject?: string; body?: string }) : {};
  return {
    subject: (parsed.subject || `ERP Industrials — ${p.investor}`).trim(),
    bodyText: (parsed.body || "").trim(),
  };
}
