import Anthropic from "@anthropic-ai/sdk";
import { fetchFeedsForWorkflow, type FeedItem } from "@/lib/rss";
import { fetchGoogleNews } from "@/lib/apify";

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
  market?: string;
}): Promise<ResearchBundle> {
  // 1. Fetch RSS feeds + Google News in parallel
  const [rssArticles, googleArticles] = await Promise.all([
    fetchFeedsForWorkflow(params.workflowId, params.market, 50),
    fetchGoogleNews(params.workflowId, params.market ?? "", 30),
  ]);

  // Merge: RSS first (curated), then Google News deduped by URL, newest-first, cap at 65
  const seenLinks = new Set(rssArticles.map((a) => a.link));
  const articles: FeedItem[] = [
    ...rssArticles,
    ...googleArticles.filter((a) => !seenLinks.has(a.link)),
  ]
    .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime())
    .slice(0, 65);

  // Build article context string
  const articleContext = articles.length > 0
    ? articles
        .map(
          (a, i) =>
            `[${i + 1}] ${a.source} | ${a.pubDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}\n` +
            `Title: ${a.title}\n` +
            (a.summary ? `Summary: ${a.summary}\n` : "") +
            `URL: ${a.link}`
        )
        .join("\n\n")
    : "No RSS articles available.";

  const sources = articles.map((a) => a.link);

  // 2. Claude + web_search to supplement with targeted queries
  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 4096,
    system: [{ type: "text" as const, text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    tools: [
      {
        type: "web_search_20250305" as "web_search_20250305",
        name: "web_search",
        max_uses: 3,
      } as unknown as Anthropic.Tool,
    ],
    messages: [
      {
        role: "user",
        content: `Research request: ${params.ask}
Project context: ${params.projectContext}
Workflow type: ${params.workflowId}

--- FRESH RSS ARTICLES (use these as primary sources) ---
${articleContext}
--- END RSS ARTICLES ---

Using the RSS articles above as your primary source material, plus targeted web searches for any specific data gaps (vacancy rates, recent transactions, macro figures), produce a structured research brief with key findings, data points, and source URLs. Prioritize articles from the last 7-14 days. Be specific — include actual numbers, company names, addresses, and dollar figures wherever available.`,
      },
    ],
  });

  const textBlocks: string[] = [];
  const extraSources: string[] = [];

  for (const block of response.content) {
    if (block.type === "text") {
      textBlocks.push(block.text);
    }
    // Extract any additional URLs from web search results
    const raw = JSON.stringify(block);
    const urls = raw.match(/https?:\/\/[^\s"\\]+/g) ?? [];
    for (const u of urls) {
      if (!u.includes("anthropic") && !u.includes("api.")) {
        extraSources.push(u);
      }
    }
  }

  return {
    query: params.ask,
    findings: textBlocks.join("\n\n") || "No findings returned.",
    sources: [...new Set([...sources, ...extraSources])].slice(0, 15),
  };
}
