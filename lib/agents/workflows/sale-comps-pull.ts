import Anthropic from "@anthropic-ai/sdk";
import type { ResearchBundle } from "../research";
import { fetchCoStarComps } from "@/lib/costar";

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
  fileId?: string;
}): Promise<SaleCompsPullOutput> {
  // Augment research with live CoStar comps if available
  const costarMarket = params.ask.toLowerCase().includes("permian") || params.ask.toLowerCase().includes("midland") ? "Midland-Odessa TX"
    : params.ask.toLowerCase().includes("tampa") || params.ask.toLowerCase().includes("brevard") ? "Tampa FL"
    : params.projectContext;

  const costarAssetType = params.ask.toLowerCase().includes("ios") || params.ask.toLowerCase().includes("outdoor storage") ? "industrial outdoor storage"
    : params.ask.toLowerCase().includes("service yard") ? "service yard"
    : "industrial";

  const costar = await fetchCoStarComps({ market: costarMarket, assetType: costarAssetType });
  const costarSection = costar.available && costar.rawText
    ? `\n\nCoStar Comps (live):\n${costar.rawText}`
    : "\n\n(CoStar subscription not yet provisioned — comps sourced from public records and broker reports)";

  const userText = `Pull sale comparables for: ${params.ask}
Project context: ${params.projectContext}

Research findings:
${params.research.findings}${costarSection}

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
*Sources: [numbered list]*`;

  const userContent: Anthropic.MessageParam["content"] = params.fileId
    ? [
        { type: "document", source: { type: "file", file_id: params.fileId } } as any,
        { type: "text", text: userText },
      ]
    : userText;

  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 3000,
    system: [{ type: "text" as const, text: `You are a CRE transaction analyst for ERP Industrials. Extract and present comparable sale transactions for OM comparable transaction sections.

Present comps in a structured format. For each comp include: property description, market/submarket, sale date, size (SF or acres), sale price, price per SF or price per acre, cap rate (if available), buyer type, and source.

Be factual. Only include transactions you can cite. Note when data is estimated or extrapolated from partial information.`, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userContent }],
  });

  const brief = response.content[0].type === "text" ? response.content[0].text : "";
  const summary = `Sale comps pulled for ${params.projectContext}.`;

  return { summary, brief, outputType: "comps" };
}
