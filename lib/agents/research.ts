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

Using the RSS articles above as your primary source material, plus targeted web searches for any specific data gaps (vacancy rates, recent transactions, macro figures), produce a structured research brief.

CITATION REQUIREMENTS — strictly enforced:
- Every factual claim, data point, statistic, or transaction must be followed by an inline citation: ([Source Name](URL)) immediately after the sentence.
- Example: "Industrial vacancy in Midland fell to 4.2% in Q1 2026 ([CoStar News](https://www.costar.com/article/...))."
- If a finding comes from a web search result, cite the actual article URL you found.
- If a finding synthesizes multiple articles, cite all of them.
- At the end of the brief, include a numbered **Sources** section listing every URL cited, with the source name and publication date.
- Do not make any unattributed claims — if you cannot cite it, flag it as an estimate or note the data gap.

Be specific — include actual numbers, company names, addresses, and dollar figures wherever available. Prioritize articles from the last 7-14 days.`,
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

  const findings = textBlocks.join("\n\n") || "No findings returned.";

  // Build a deduplicated source list from RSS articles used as context
  // This ensures links always appear in the output even if Claude's inline citations are sparse
  const allSources = [...new Set([...sources, ...extraSources])].slice(0, 60);

  // Append a sources footer if Claude didn't already include one
  const hasSources = /^#+\s*sources/im.test(findings) || /^\*\*sources/im.test(findings);
  const topArticles = articles.slice(0, 20); // top 20 most-recent articles used as context
  const sourcesFooter = hasSources
    ? ""
    : `\n\n---\n**Sources**\n${topArticles
        .map((a, i) => `${i + 1}. [${a.source} — ${a.title.slice(0, 80)}](${a.link}) (${a.pubDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })})`)
        .join("\n")}`;

  return {
    query: params.ask,
    findings: findings + sourcesFooter,
    sources: allSources,
  };
}
