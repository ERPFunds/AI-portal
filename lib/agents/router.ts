import Anthropic from "@anthropic-ai/sdk";

const AUTHORIZED_SENDERS = new Set([
  "mparad@erpfunds.com",
  "mberry@erpfunds.com",
  "wmeyer@erpfunds.com",
  "bberry@erpfunds.com",
]);

export type Prefix = "RESEARCH" | "BUILD" | "WRITE";

export type WorkflowId =
  | "market-update-digest"
  | "lp-ready-summary"
  | "sub-sector-deep-dive"
  | "sale-comps-pull"
  | "save-file-only"
  | "deck-builder"
  | "om-editor"
  | "om-writer"
  | "competitive-intel-xls"
  | "update-buyer-list"
  | "update-pipeline-comps"
  | "update-commitment-schedule";

export interface RouterResult {
  prefix: Prefix;
  workflowId: WorkflowId;
  projectContext: string;
  ask: string;
}

export interface RouterError {
  error: "unauthorized" | "unrecognized-prefix" | "classification-failed";
  message: string;
}

const WORKFLOW_DESCRIPTIONS = `
RESEARCH: prefix workflows:
- market-update-digest: Pull market section or market intel for an OM or deck
  Examples: "Pull market section for OM — Tampa logistics property", "Market intel for Q2 deck"
- lp-ready-summary: React to research with a strategic angle or framing for a deck
  Examples: "For the Q2 deck, lean into our Midland-Odessa occupancy story", "Pair with rent-per-acre growth on IOS"
- sub-sector-deep-dive: Deep dive on a specific industrial sub-sector or asset class
  Examples: "Deep dive on cold storage", "Research industrial outdoor storage for Q2 LP deck"
- sale-comps-pull: Pull sale comparable transactions for a property or market
  Examples: "Sale comps for Tampa logistics property", "Comps for Midland service yard"
- save-file-only: Save an article, report, or attachment to the KB — no research workflow
  Examples: "Save this CBRE Q1 industrial report to the KB — just file it", "Add this NAIOP report to the deck KB"

BUILD: prefix workflows:
- deck-builder: Assemble or edit an LP investor deck or update deck
  Examples: "Q2 LP update deck — Q1 fund performance attached", "Tighten the Permian section of the Q2 LP deck"
- om-editor: Assemble or edit an Offering Memorandum
  Examples: "OM for Tampa logistics property — underwriting model attached", "Add comparable transactions section to the Tampa OM"
- competitive-intel-xls: Add competitor fund details to the competitive intelligence Excel tracker
  Examples: "Competitive intel: Blackstone raised $5B industrial fund, 18% IRR target", "Add these fund details to the tracker — EQT IOS fund closed", "Competitive intel from this PERE article — add to spreadsheet"
- update-buyer-list: Add new potential buyers or acquirers to the buyer list spreadsheet
  Examples: "Add these buyers to the list — Link Logistics and Prologis both active in Permian", "New IOS buyer: Industrial Outdoor Ventures — add to buyer list", "Update buyer list with acquirers from this CBRE report"
- update-pipeline-comps: Add new pipeline deals or sale comps to the Brevard or Permian pipeline tracker spreadsheet
  Examples: "Add this Permian comp to the tracker — 40ac service yard sold at $85k/acre", "New Brevard pipeline deal — add to pipeline comps", "Update comps with these Space Coast transactions"
- update-commitment-schedule: Add a new LP investor commitment to the Fund IV commitment schedule
  Examples: "Add LP commitment — Jones Trust committed $500K soft circle", "Log new commitment: Smith Family Office in for $1M hard", "Update commitment schedule — new LP committed"

WRITE: prefix workflows:
- om-writer: Draft polished thesis-style prose for an OM section
  Examples: "Investment Thesis section for the Tampa OM", "Executive Summary for the Tampa OM", "Tighten the Demand Drivers narrative"
`;

const anthropic = new Anthropic();

export async function routeEmail(params: {
  from: string;
  subject: string;
  body: string;
}): Promise<RouterResult | RouterError> {
  const fromNorm = params.from.toLowerCase().trim();
  if (!AUTHORIZED_SENDERS.has(fromNorm)) {
    return {
      error: "unauthorized",
      message: `Sender ${params.from} is not authorized. Authorized senders: Meghan (mberry@erpfunds.com), William (wmeyer@erpfunds.com), Michele (mparad@erpfunds.com), Brennan (bberry@erpfunds.com).`,
    };
  }

  // Detect prefix in subject or first line of body
  const searchText = `${params.subject} ${params.body}`.trim();
  const prefixMatch = searchText.match(/^(RESEARCH|BUILD|WRITE)\s*:/i);
  if (!prefixMatch) {
    return {
      error: "unrecognized-prefix",
      message: `No recognized prefix found. Start your email subject with RESEARCH:, BUILD:, or WRITE:.`,
    };
  }

  const prefix = prefixMatch[1].toUpperCase() as Prefix;
  const ask = searchText.slice(prefixMatch[0].length).trim();

  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `${WORKFLOW_DESCRIPTIONS}

Classify this request into the correct workflow. The prefix is: ${prefix}

Request text: "${ask}"

Respond ONLY with valid JSON, no other text:
{
  "workflowId": "<exact workflow ID from the list above>",
  "projectContext": "<short project name, e.g. 'Q2 LP Deck', 'Tampa Logistics OM', 'Permian IOS Research'>"
}`,
      },
    ],
  });

  try {
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");
    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.workflowId) throw new Error("Missing workflowId");

    return {
      prefix,
      workflowId: parsed.workflowId as WorkflowId,
      projectContext: parsed.projectContext ?? ask.slice(0, 60),
      ask,
    };
  } catch {
    return {
      error: "classification-failed",
      message: "Could not classify the workflow from your request. Please check your prefix and try again.",
    };
  }
}
