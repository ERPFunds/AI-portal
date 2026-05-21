import Anthropic from "@anthropic-ai/sdk";

export type OmSection = "Investment Thesis" | "Executive Summary" | "Demand Drivers";

const anthropic = new Anthropic();

export interface OmWriterOutput {
  summary: string;
  prose: string;
  section: OmSection;
  outputType: "om-prose";
}

const SECTION_PROMPTS: Record<OmSection, string> = {
  "Investment Thesis": `Write the Investment Thesis section. This is the core "why this asset, why this market, why now" argument — 3-4 paragraphs of polished institutional prose.

Structure:
- Para 1: The market thesis (macro tailwind + submarket-specific dynamics)
- Para 2: The asset-specific positioning (why this property captures the opportunity)
- Para 3: The timing argument (why now, what's changed or is changing)
- Para 4 (optional): ERP's competitive advantage in owning/operating this asset type in this market

Tone: Confident, data-grounded. Not promotional. An institutional buyer should read this and immediately understand the investment logic.`,

  "Executive Summary": `Write the Executive Summary. Maximum 1 page equivalent.

Structure:
1. Property overview (2-3 sentences: asset description, size, location)
2. Market context (2-3 sentences: submarket conditions, demand backdrop)
3. Investment Highlights (5-6 bulleted highlights — data-forward, each one a reason to buy)
4. Financial summary (key metrics in a brief table: asking price, cap rate, GBA, occupancy, NOI, etc. — use placeholders [INSERT] where ERP data is needed)
5. The opportunity in 2 sentences

Professional. Scannable. An LP or buyer should understand the deal in 90 seconds.`,

  "Demand Drivers": `Write the Demand Drivers section. 4-5 demand drivers with a substantive paragraph each.

For each driver:
- Name the driver clearly as a subheading
- Para 1: The macro or sector trend (what's driving it at the national/regional level)
- Para 2: How this translates to demand for this specific asset type and market
- Para 3: How this property is positioned to benefit

Drivers should be specific to industrial CRE and the Permian Basin / subject market. Avoid generic platitudes — anchor every driver in data or observable market behavior.`,
};

export function detectSection(ask: string): OmSection {
  const lower = ask.toLowerCase();
  if (lower.includes("investment thesis") || lower.includes("thesis")) return "Investment Thesis";
  if (lower.includes("executive summary") || lower.includes("exec summary")) return "Executive Summary";
  if (lower.includes("demand driver")) return "Demand Drivers";
  // Default
  return "Investment Thesis";
}

export async function runOmWriter(params: {
  ask: string;
  projectContext: string;
  section?: OmSection;
  researchFindings?: string;
  attachmentContent?: string;
  fileId?: string;
}): Promise<OmWriterOutput> {
  const section = params.section ?? detectSection(params.ask);

  const contextData = [
    params.researchFindings && `Market Research:\n${params.researchFindings}`,
    params.attachmentContent && `Deal Data:\n${params.attachmentContent.slice(0, 6000)}`,
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");

  const promptText = `${SECTION_PROMPTS[section]}

Project: ${params.projectContext}
Additional direction from team: ${params.ask}

${contextData || "Draw on general ERP Industrials market knowledge. Flag specific data gaps with [DATA NEEDED: description of what's missing]."}`;

  const userContent: Anthropic.MessageParam["content"] = params.fileId
    ? [
        { type: "document", source: { type: "file", file_id: params.fileId } } as any,
        { type: "text", text: promptText },
      ]
    : promptText;

  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 3000,
    system: [{ type: "text" as const, text: `You are a senior OM writer for ERP Industrials. Write polished, thesis-style investment prose for institutional buyers — family offices, REITs, private equity, and institutional investment managers.

Voice: Authoritative, data-grounded, direct. Never promotional. Every claim is either supported by data or clearly framed as management judgment.

ERP Industrials edge: Deep Permian Basin market knowledge; energy-adjacent industrial demand expertise; occupancy track record through cycles; IOS and service yard specialists.`, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userContent }],
  });

  const prose = response.content[0].type === "text" ? response.content[0].text : "";
  const summary = `${section} drafted for ${params.projectContext}. Ready for Meghan/William review.`;

  return { summary, prose, section, outputType: "om-prose" };
}
