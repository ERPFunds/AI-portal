import Anthropic from "@anthropic-ai/sdk";
import type { ResearchBundle } from "../research";

const anthropic = new Anthropic();

export interface SubSectorDeepDiveOutput {
  summary: string;
  brief: string;
  outputType: "brief";
}

export async function runSubSectorDeepDive(params: {
  ask: string;
  projectContext: string;
  research: ResearchBundle;
}): Promise<SubSectorDeepDiveOutput> {
  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 4000,
    system: `You are a CRE sub-sector analyst for ERP Industrials. Produce dense, LP-grade deep dives on industrial sub-sectors for investor decks and OMs.

Structure: market size and growth → demand drivers → supply dynamics → key players → valuation and pricing → ERP relevance.

ERP context: Industrial CRE focused on Permian Basin and secondary markets. Core asset types: service yards, industrial outdoor storage (IOS), cold storage, flex industrial, logistics facilities.`,
    messages: [
      {
        role: "user",
        content: `Write a sub-sector deep dive for: ${params.ask}
Project context: ${params.projectContext}

Research:
${params.research.findings}

${params.research.sources.length > 0 ? `Sources:\n${params.research.sources.join("\n")}` : ""}

---
Format:

# Sub-Sector Deep Dive: [sub-sector name]

## Market Overview
[Size ($B or sqft), 5-year CAGR, primary geographies driving growth]

## Demand Drivers
[4-6 bullets — each driver with a brief explanation and supporting data point]

## Supply Dynamics
[New supply pipeline, barriers to entry, land constraints, development timelines]

## Key Players
[Major operators, REITs, and private owners in this space — 5-8 names with brief note on each]

## Rent & Valuation
[Current rent range, cap rate range, notable recent transactions, trend direction]

## ERP Opportunity
[How this sub-sector intersects with ERP's markets, strategy, and competitive advantage. Be specific.]

---
*Sources: [numbered list]*`,
      },
    ],
  });

  const brief = response.content[0].type === "text" ? response.content[0].text : "";
  const summary = `Sub-sector deep dive complete for ${params.projectContext}.`;

  return { summary, brief, outputType: "brief" };
}
