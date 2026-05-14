import Parser from "rss-parser";

export interface FeedItem {
  title: string;
  link: string;
  pubDate: Date;
  source: string;
  summary?: string;
}

const parser = new Parser();

const RSS_FEEDS: { url: string; source: string }[] = [
  { url: "https://www.oilandgas360.com/feed/", source: "Oil & Gas 360" },
  { url: "https://www.worldoil.com/rss/news", source: "World Oil" },
  { url: "https://www.rigzone.com/rss/news.aspx", source: "Rigzone" },
  { url: "https://www.drillinginfo.com/feed/", source: "Enverus" },
  { url: "https://www.bizjournals.com/dallas/rss/industry/real-estate", source: "Biz Journals Dallas" },
  { url: "https://www.costar.com/rss", source: "CoStar" },
  { url: "https://commercialobserver.com/feed/", source: "Commercial Observer" },
  { url: "https://www.globest.com/feed/", source: "GlobeSt" },
];

export async function fetchAllFeeds(): Promise<FeedItem[]> {
  const results: FeedItem[] = [];

  await Promise.allSettled(
    RSS_FEEDS.map(async ({ url, source }) => {
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
