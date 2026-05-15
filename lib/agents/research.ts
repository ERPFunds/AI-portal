import Anthropic from "@anthropic-ai/sdk";

export interface ResearchBundle {
  query: string;
  findings: string;
  sources: string[];
}

const SYSTEM_PROMPT = `You are a CRE market research analyst for ERP Industrials, a commercial real estate investment firm focused on industrial assets — primarily service yards, industrial outdoor storage (IOS), logistics facilities, and cold storage — in the Permian Basin and secondary markets.

Pull relevant market intelligence from public sources. Focus on:
- Industrial CRE: vacancy rates, absorption, rent growth ($/sf or $/acre), cap rates
- Key markets: Permian Basin (Midland-Odessa), Tampa/Florida logistics, secondary Texas markets
- Sector drivers: oilfield services activity, supply chain logistics, e-commerce, cold chain
- Data sources: CoStar news, CBRE/JLL/Cushman broker reports, NAIOP/ULI research, public filings, trade press

Be specific and data-dense. Use actual figures when available. Flag data gaps honestly.`;

const anthropic = new Anthropic();

export async function runResearchAgent(params: {
  ask: string;
  projectContext: string;
  workflowId: string;
}): Promise<ResearchBundle> {
  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: [
      {
        type: "web_search_20250305" as "web_search_20250305",
        name: "web_search",
        max_uses: 5,
      } as unknown as Anthropic.Tool,
    ],
    messages: [
      {
        role: "user",
        content: `Research request: ${params.ask}
Project context: ${params.projectContext}
Workflow type: ${params.workflowId}

Search for current, specific market data. Return a structured research brief with key findings, data points, and source URLs.`,
      },
    ],
  });

  const textBlocks: string[] = [];
  const sources: string[] = [];

  for (const block of response.content) {
    if (block.type === "text") {
      textBlocks.push(block.text);
    }
    // Extract URLs from any tool result content
    const raw = JSON.stringify(block);
    const urls = raw.match(/https?:\/\/[^\s"\\]+/g) ?? [];
    for (const u of urls) {
      if (!u.includes("anthropic") && !u.includes("api.")) {
        sources.push(u);
      }
    }
  }

  return {
    query: params.ask,
    findings: textBlocks.join("\n\n") || "No findings returned.",
    sources: [...new Set(sources)].slice(0, 10),
  };
}
