import Anthropic from "@anthropic-ai/sdk";
import type { ResearchBundle } from "../research";

const anthropic = new Anthropic();

export interface LpReadySummaryOutput {
  summary: string;
  brief: string;
  outputType: "brief";
}

export async function runLpReadySummary(params: {
  ask: string;
  projectContext: string;
  research: ResearchBundle;
}): Promise<LpReadySummaryOutput> {
  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 2500,
    system: `You are a CRE research analyst for ERP Industrials preparing context for an LP investor deck. Your output feeds directly into the deck-building workflow.

The team has given you a strategic direction — a specific angle or story to support. Your job is to surface the market data and facts that back that angle, organized for easy inclusion in a deck narrative.

ERP's proven stories: Permian Basin occupancy held in low 90s through the last cycle; rent-per-acre growth on industrial outdoor storage; energy-adjacent logistics demand driving industrial absorption.`,
    messages: [
      {
        role: "user",
        content: `Prepare LP-ready research context for: ${params.ask}
Project: ${params.projectContext}

Research findings:
${params.research.findings}

${params.research.sources.length > 0 ? `Sources:\n${params.research.sources.join("\n")}` : ""}

---
Organize the output as:

## Story Angle
[One sentence restating the angle the team wants to tell]

## Supporting Data Points
[Bullet list — each item is a specific, citable fact that supports the angle. Include numbers wherever possible.]

## Slide Copy Suggestions
[3-4 bullets phrased as they would appear on a slide — punchy, data-forward]

## Context for the Narrative
[2-3 sentences of connective tissue explaining why this angle matters to institutional LPs]

## Caveats / Data Gaps
[Honest 1-2 notes where the data is thinner or the story could be challenged. LPs will probe these.]

---
*Sources: [list]*`,
      },
    ],
  });

  const brief = response.content[0].type === "text" ? response.content[0].text : "";
  const summary = `LP-ready research context prepared for ${params.projectContext}.`;

  return { summary, brief, outputType: "brief" };
}
