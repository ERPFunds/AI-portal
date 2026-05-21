import Parser from "rss-parser";

export interface FeedItem {
  title: string;
  link: string;
  pubDate: Date;
  source: string;
  summary?: string;
}

// 10-second timeout per feed — prevents slow/unresponsive feeds from hanging the entire fetch
const parser = new Parser({ timeout: 10000 });

// ── Shared industrial CRE feeds (used in both Permian and Brevard) ────────────────
const INDUSTRIAL_CRE_FEEDS: { url: string; source: string }[] = [
  // Broker wire services — CBRE, JLL, C&W, Newmark press releases
  { url: "https://www.prnewswire.com/rss/news-releases-list.rss",          source: "PR Newswire" },
  { url: "https://www.businesswire.com/rss/home",                          source: "Business Wire" },
  { url: "https://www.globenewswire.com/RssFeed/country/United+States",    source: "GlobeNewswire" },

  // CRE nationals + industrial-specific
  { url: "https://www.globest.com/industrial/feed/",                       source: "GlobeSt Industrial" },
  { url: "https://www.globest.com/feed/",                                  source: "GlobeSt" },
  { url: "https://commercialobserver.com/feed/",                           source: "Commercial Observer" },
  { url: "https://credaily.com/feed/",                                     source: "CRE Daily" },
  { url: "https://connectcre.com/feed/",                                   source: "Connect CRE" },
  { url: "https://therealdeal.com/feed/",                                  source: "The Real Deal" },
  { url: "https://www.naiop.org/rss",                                      source: "NAIOP" },
  { url: "https://www.sior.com/news/press-releases?format=rss",            source: "SIOR" },
  { url: "https://www.costar.com/rss",                                     source: "CoStar News" },

  // Logistics & supply chain — direct industrial demand signal
  { url: "https://www.freightwaves.com/news/feed",                         source: "FreightWaves" },
  { url: "https://www.supplychaindive.com/feeds/news/",                    source: "Supply Chain Dive" },
  { url: "https://www.dcvelocity.com/rss/",                                source: "DC Velocity" },
  { url: "https://www.logisticsmgmt.com/rss/articles",                     source: "Logistics Management" },
  { url: "https://www.mmh.com/rss/articles",                               source: "Modern Materials Handling" },
  { url: "https://bisnow.com/rss/national",                                source: "Bisnow National" },
];

// Agent 1 — Permian Brief (weekly newsletter)
const PERMIAN_BRIEF_FEEDS: { url: string; source: string }[] = [
  ...INDUSTRIAL_CRE_FEEDS,

  // ── Texas CRE & business ───────────────────────────────────────────────────────
  { url: "https://bisnow.com/rss/dallas",                                  source: "Bisnow Dallas" },
  { url: "https://bisnow.com/rss/houston",                                 source: "Bisnow Houston" },
  { url: "https://www.bizjournals.com/dallas/feed/latest-news",            source: "Dallas Business Journal" },
  { url: "https://www.bizjournals.com/sanantonio/feed/latest-news",        source: "San Antonio Business Journal" },

  // ── Permian / West Texas local ─────────────────────────────────────────────────
  { url: "https://www.mrt.com/search/?f=rss&t=article&c=news",            source: "Midland Reporter-Telegram" },
  { url: "https://www.texastribune.org/feeds/latest/",                     source: "Texas Tribune" },

  // ── Oil & gas upstream (E&P activity = demand signal for industrial) ───────────
  { url: "https://www.oilandgas360.com/feed/",                             source: "Oil & Gas 360" },
  { url: "https://www.worldoil.com/rss/news",                              source: "World Oil" },
  { url: "https://www.rigzone.com/rss/news.aspx",                          source: "Rigzone" },
  { url: "https://www.eia.gov/rss/todayinenergy.xml",                      source: "EIA Today in Energy" },
  { url: "https://oilprice.com/rss/main",                                  source: "OilPrice.com" },
  { url: "https://www.hartenergy.com/rss",                                 source: "Hart Energy" },
  { url: "https://www.ogj.com/rss/all-ogj-news.rss",                      source: "Oil & Gas Journal" },
  { url: "https://www.dallasfed.org/rss/research",                         source: "Dallas Fed Research" },
];

// Agent 3 — Competitive Landscape Profile
const COMPETITIVE_FEEDS: { url: string; source: string }[] = [
  ...INDUSTRIAL_CRE_FEEDS,
];

// Brevard / Space Coast — industrial CRE + local economy
const BREVARD_FEEDS: { url: string; source: string }[] = [
  // ── Shared industrial CRE ──────────────────────────────────────────────────
  ...INDUSTRIAL_CRE_FEEDS,

  // ── Florida CRE & business ─────────────────────────────────────────────────
  { url: "https://bisnow.com/rss/south-florida",                           source: "Bisnow South Florida" },
  { url: "https://bisnow.com/rss/orlando",                                 source: "Bisnow Orlando" },
  { url: "https://bisnow.com/rss/tampa",                                   source: "Bisnow Tampa" },
  { url: "https://floridarealtors.org/news-media/news-articles/rss",       source: "Florida Realtors" },
  { url: "https://www.bizjournals.com/orlando/feed/latest-news",           source: "Orlando Business Journal" },
  { url: "https://www.bizjournals.com/southflorida/feed/latest-news",      source: "South Florida Business Journal" },
  { url: "https://www.bizjournals.com/tampabay/feed/latest-news",          source: "Tampa Bay Business Journal" },

  // ── Brevard / Space Coast local ────────────────────────────────────────────
  { url: "https://www.spacecoastdaily.com/feed/",                          source: "Space Coast Daily" },
  { url: "https://www.floridatoday.com/arcio/rss/",                        source: "Florida Today (Brevard)" },
  { url: "https://brevardbusinessnews.com/feed/",                          source: "Brevard Business News" },

  // ── Space industry — launch cadence & aerospace employment signal ──────────
  { url: "https://spaceflightnow.com/feed/",                               source: "SpaceflightNow" },
  { url: "https://spacenews.com/feed/",                                    source: "SpaceNews" },
  { url: "https://www.nasaspaceflight.com/feed/",                          source: "NASASpaceflight.com" },
  { url: "https://feeds.arstechnica.com/arstechnica/space",                source: "Ars Technica Space" },
  { url: "https://www.nasa.gov/rss/dyn/breaking_news.rss",                 source: "NASA Breaking News" },
  { url: "https://blogs.nasa.gov/kennedy/feed/",                           source: "NASA Kennedy Space Center" },
  { url: "https://www.universetoday.com/feed/",                            source: "Universe Today" },

  // ── Economic development — Space Coast EDC & Enterprise Florida ────────────
  { url: "https://www.spacecoastedc.org/feed/",                           source: "Space Coast EDC" },
  { url: "https://floridajobs.org/feeds/news-rss.xml",                    source: "Enterprise Florida" },
];

// Submarket intelligence — CRE + macro combined
const SUBMARKET_FEEDS: { url: string; source: string }[] = [
  ...INDUSTRIAL_CRE_FEEDS,
  { url: "https://www.eia.gov/rss/todayinenergy.xml",                     source: "EIA Today in Energy" },
  { url: "https://bisnow.com/rss/texas",                                  source: "Bisnow Texas" },
  { url: "https://bisnow.com/rss/south-florida",                         source: "Bisnow South Florida" },
];

// Agent 5 — Comparable Fund Benchmarking
const FUND_BENCHMARK_FEEDS: { url: string; source: string }[] = [
  { url: "https://efts.sec.gov/LATEST/search-index?q=%22Form+D%22&dateRange=custom&startdt=2024-01-01&forms=D", source: "SEC EDGAR Form D" },
  { url: "https://pere.privateequityinternational.com/feed/",              source: "PERE / IPE Real Assets" },
  { url: "https://www.prnewswire.com/rss/news-releases-list.rss",         source: "PR Newswire" },
];

export const RSS_FEEDS_BY_AGENT = {
  "permian-brief":          PERMIAN_BRIEF_FEEDS,
  "weekly-market-update":   PERMIAN_BRIEF_FEEDS,  // Permian default; override per market below
  "brevard-weekly":         BREVARD_FEEDS,
  "submarket-intelligence": SUBMARKET_FEEDS,
  "competitor-intelligence":COMPETITIVE_FEEDS,
  "competitive":            COMPETITIVE_FEEDS,
  "fund-benchmark":         FUND_BENCHMARK_FEEDS,
};

export async function fetchAllFeeds(): Promise<FeedItem[]> {
  return fetchFeedsForWorkflow("permian-brief");
}

// Stop-words to ignore when comparing article titles for near-duplicate detection
const STOP_WORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with",
  "by","from","as","is","was","are","were","be","been","has","have","had",
  "its","it","this","that","these","those","new","says","said","will","may",
  "also","after","over","about","up","out","than","then","into","just","more",
]);

/** Extract significant tokens from a title for near-duplicate comparison */
function titleTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOP_WORDS.has(w))
  );
}

/** Returns true if two titles share enough tokens to be considered the same story */
function isSameStory(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return false;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  // Overlap ratio relative to the smaller title — 50%+ overlap = same story
  return shared / Math.min(a.size, b.size) >= 0.5;
}

/** Fetch RSS articles for a specific workflow + market, deduplicated and sorted newest-first */
export async function fetchFeedsForWorkflow(
  workflowId: string,
  market?: string,
  maxItems = 40
): Promise<FeedItem[]> {
  // Pick feed list — use market-specific override for weekly updates
  let feedKey = workflowId as keyof typeof RSS_FEEDS_BY_AGENT;
  if (workflowId === "weekly-market-update" && market?.toLowerCase() === "brevard") {
    feedKey = "brevard-weekly";
  }

  const feedList =
    RSS_FEEDS_BY_AGENT[feedKey] ??
    RSS_FEEDS_BY_AGENT["weekly-market-update"];

  const results: FeedItem[] = [];
  const seenLinks = new Set<string>();

  await Promise.allSettled(
    feedList.map(async ({ url, source }) => {
      try {
        const feed = await parser.parseURL(url);
        for (const item of feed.items) {
          if (item.link && item.title && item.pubDate && !seenLinks.has(item.link)) {
            seenLinks.add(item.link);
            results.push({
              title: item.title,
              link: item.link,
              pubDate: new Date(item.pubDate),
              source,
              summary: item.contentSnippet?.slice(0, 300),
            });
          }
        }
      } catch {
        // Skip feeds that fail silently
      }
    })
  );

  // Sort newest first, then remove near-duplicate stories (same story from multiple wires)
  const sorted = results.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

  const deduped: FeedItem[] = [];
  const dedupedTokens: Set<string>[] = [];

  for (const item of sorted) {
    const tokens = titleTokens(item.title);
    const isDupe = dedupedTokens.some((existing) => isSameStory(tokens, existing));
    if (!isDupe) {
      deduped.push(item);
      dedupedTokens.push(tokens);
    }
  }

  return deduped.slice(0, maxItems);
}