import Anthropic from "@anthropic-ai/sdk";
import type { ResearchBundle } from "../research";

const anthropic = new Anthropic();

export interface MarketUpdateDigestOutput {
  summary: string;
  brief: string;
  outputType: "brief";
}

export async function runMarketUpdateDigest(params: {
  ask: string;
  projectContext: string;
  research: ResearchBundle;
}): Promise<MarketUpdateDigestOutput> {
  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 3000,
    system: [{ type: "text" as const, text: `You are a CRE market analyst for ERP Industrials. Write clean, fact-dense market briefs for LP investor decks and Offering Memoranda.

Tone: professional, direct, data-first. No filler language. Every claim should be supportable. Structure for easy scan.

ERP context: Permian Basin industrial CRE, service yards, IOS, logistics. Key markets: Midland-Odessa, Tampa/Florida, secondary Texas.`, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Write a market section brief for: ${params.ask}
Project: ${params.projectContext}

Research findings:
${params.research.findings}

${params.research.sources.length > 0 ? `Sources:\n${params.research.sources.join("\n")}` : ""}

---
Format the output as follows:

# Market Section — [submarket or market name]

## Key Market Statistics
[Bullet list: vacancy rate, absorption, rent $/sf or $/acre, YoY change, notable recent deliveries]

## Demand Drivers
[3-4 sentences on the demand thesis for this market]

## Supply & Pipeline
[Current conditions: new supply under construction, land constraints, notable deliveries]

## Investment Implications
[2-3 sentences connecting the data to ${params.projectContext}]

---
*Sources: [numbered list of URLs/publications]*`,
      },
    ],
  });

  const brief = response.content[0].type === "text" ? response.content[0].text : "";
  const summary = `Market section brief generated for ${params.projectContext}. ${brief.split("\n").filter((l) => l.startsWith("##")).length} sections covered.`;

  return { summary, brief, outputType: "brief" };
}
