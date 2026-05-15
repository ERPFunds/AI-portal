import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export interface OmEditorOutput {
  summary: string;
  omContent: string;
  outputType: "om";
}

export type OmMode = "new-draft" | "insert-section" | "edit-existing";

export async function runOmEditor(params: {
  ask: string;
  projectContext: string;
  researchFindings?: string;
  dealData?: string;
  attachmentContent?: string;
  mode: OmMode;
}): Promise<OmEditorOutput> {
  const contextData = [
    params.researchFindings && `Market Research:\n${params.researchFindings}`,
    params.dealData && `Deal Data (T12 / Rent Roll / Underwriting):\n${params.dealData}`,
    params.attachmentContent &&
      `Attached Data:\n${params.attachmentContent.slice(0, 8000)}`,
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");

  const modeInstructions: Record<OmMode, string> = {
    "new-draft":
      "Create a complete OM structure with all sections. Where specific property data is missing, insert placeholder markers [INSERT: description of data needed].",
    "insert-section":
      "Draft only the requested section, formatted for direct insertion into an existing OM. Match institutional OM style.",
    "edit-existing":
      "Edit and improve the provided section per the request. Preserve the author's voice while sharpening the argument and prose.",
  };

  const fullOmStructure =
    params.mode === "new-draft"
      ? `
Cover Page
Table of Contents
1. Executive Summary
2. Investment Highlights (5-7 bullets)
3. Property Description
4. Location & Market Analysis
5. Tenant Summary & Lease Abstract
6. Comparable Transactions
7. Financial Analysis & Pro Forma
8. Investment Thesis
9. Demand Drivers
10. Appendix (aerials, site plans, financials)`
      : "";

  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 6000,
    system: `You are an Offering Memorandum editor for ERP Industrials. You produce institutional-grade OM content for industrial CRE assets targeting sophisticated buyers: family offices, private equity, REITs, and institutional investment managers.

OM standards:
- Audience: expects factual, thesis-driven analysis — not promotional copy
- Voice: authoritative, data-grounded, direct
- Every claim should be supportable with data or be clearly framed as management view
- Deal with energy-adjacent industrial: service yards, IOS, logistics

ERP context: Permian Basin specialists; energy sector demand drives industrial occupancy; occupancy track record through cycles is core to the pitch.`,
    messages: [
      {
        role: "user",
        content: `${modeInstructions[params.mode]}

Request: ${params.ask}
Project: ${params.projectContext}
${fullOmStructure}

${contextData || "No internal data attached. Use placeholder markers [INSERT: data needed] throughout for property-specific figures."}`,
      },
    ],
  });

  const omContent = response.content[0].type === "text" ? response.content[0].text : "";
  const charCount = omContent.length;
  const summary = `OM ${params.mode} complete for ${params.projectContext}. ${charCount.toLocaleString()} characters. Filed to OneDrive for review.`;

  return { summary, omContent, outputType: "om" };
}
