import Parser from "rss-parser";

export interface FeedItem {
  title: string;
  link: string;
  pubDate: Date;
  source: string;
  summary?: string;
}

const parser = new Parser();

// Agent 1 — Permian Brief (weekly newsletter)
const PERMIAN_BRIEF_FEEDS: { url: string; source: string }[] = [
  { url: "https://www.oilandgas360.com/feed/",                              source: "Oil & Gas 360" },
  { url: "https://www.worldoil.com/rss/news",                              source: "World Oil" },
  { url: "https://www.rigzone.com/rss/news.aspx",                          source: "Rigzone" },
  { url: "https://www.eia.gov/rss/todayinenergy.xml",                      source: "EIA Today in Energy" },
  { url: "https://oilprice.com/rss/main",                                  source: "OilPrice.com" },
  { url: "https://bisnow.com/rss/houston",                                 source: "Bisnow Texas" },
  { url: "https://connectcre.com/feed/",                                   source: "Connect CRE" },
  { url: "https://credaily.com/feed/",                                     source: "CRE Daily" },
  { url: "https://www.globest.com/feed/",                                  source: "GlobeSt" },
  { url: "https://commercialobserver.com/feed/",                           source: "Commercial Observer" },
];

// Agent 3 — Competitive Landscape Profile
const COMPETITIVE_FEEDS: { url: string; source: string }[] = [
  { url: "https://www.prnewswire.com/rss/news-releases-list.rss",         source: "PR Newswire" },
  { url: "https://www.businesswire.com/rss/home",                         source: "Business Wire" },
  { url: "https://therealdeal.com/feed/",                                  source: "The Real Deal" },
  { url: "https://www.globest.com/feed/",                                  source: "GlobeSt" },
  { url: "https://commercialobserver.com/feed/",                           source: "Commercial Observer" },
  { url: "https://www.costar.com/rss",                                     source: "CoStar News" },
];

// Agent 5 — Comparable Fund Benchmarking
const FUND_BENCHMARK_FEEDS: { url: string; source: string }[] = [
  { url: "https://efts.sec.gov/LATEST/search-index?q=%22Form+D%22&dateRange=custom&startdt=2024-01-01&forms=D", source: "SEC EDGAR Form D" },
  { url: "https://pere.privateequityinternational.com/feed/",              source: "PERE / IPE Real Assets" },
  { url: "https://www.prnewswire.com/rss/news-releases-list.rss",         source: "PR Newswire" },
];

export const RSS_FEEDS_BY_AGENT = {
  "permian-brief":   PERMIAN_BRIEF_FEEDS,
  "competitive":     COMPETITIVE_FEEDS,
  "fund-benchmark":  FUND_BENCHMARK_FEEDS,
};

export async function fetchAllFeeds(): Promise<FeedItem[]> {
  const results: FeedItem[] = [];

  await Promise.allSettled(
    PERMIAN_BRIEF_FEEDS.map(async ({ url, source }) => {
      try {
        const feed = await parser.parseURL(url);
        for (const item of feed.items) {
          if (item.link && item.title && item.pubDate) {
            results.push({
              title: item.title,
              link: item.link,
              pubDate: new Date(item.pubDate),
              source,
              summary: item.contentSnippet,
            });
          }
        }
      } catch {
        // Skip feeds that fail silently
      }
    })
  );

  return results;
}