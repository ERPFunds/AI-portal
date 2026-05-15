import Anthropic from "@anthropic-ai/sdk";
import type { ResearchBundle } from "../research";

const anthropic = new Anthropic();

export interface SaleCompsPullOutput {
  summary: string;
  brief: string;
  outputType: "comps";
}

export async function runSaleCompsPull(params: {
  ask: string;
  projectContext: string;
  research: ResearchBundle;
}): Promise<SaleCompsPullOutput> {
  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 3000,
    system: `You are a CRE transaction analyst for ERP Industrials. Extract and present comparable sale transactions for OM comparable transaction sections.

Present comps in a structured format. For each comp include: property description, market/submarket, sale date, size (SF or acres), sale price, price per SF or price per acre, cap rate (if available), buyer type, and source.

Be factual. Only include transactions you can cite. Note when data is estimated or extrapolated from partial information.`,
    messages: [
      {
        role: "user",
        content: `Pull sale comparables for: ${params.ask}
Project context: ${params.projectContext}

Research findings:
${params.research.findings}

${params.research.sources.length > 0 ? `Sources:\n${params.research.sources.join("\n")}` : ""}

---
Format:

# Sale Comparables — [asset type / market]

## Transaction Summary

| Property | Submarket | Date | Size | Price | $/SF or $/Acre | Cap Rate | Buyer Type | Source |
|----------|-----------|------|------|-------|----------------|----------|------------|--------|
[Fill in rows for each comp found]

## Comp Set Analysis
[3-5 sentences: pricing range, trend direction, what's driving values in this market, any notable outliers]

## Implied Pricing for [project context]
[Apply comp set to ERP's subject asset — what does this comp set imply for pricing/value? Be explicit about assumptions.]

---
*Note: CoStar direct API access pending provisioning. Comps sourced from public records, broker reports, press releases, and trade publications.*
*Sources: [numbered list]*`,
      },
    ],
  });

  const brief = response.content[0].type === "text" ? response.content[0].text : "";
  const summary = `Sale comps pulled for ${params.projectContext}.`;

  return { summary, brief, outputType: "comps" };
}
