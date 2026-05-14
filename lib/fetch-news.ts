import { ApifyClient } from "apify-client";
import { subDays } from "date-fns";
import { fetchAllFeeds, FeedItem } from "@/lib/rss";
import { isPermianRelevant } from "@/lib/filter-permian";
import { getPreviouslyPublishedUrls } from "@/lib/db";

const apify = new ApifyClient({ token: process.env.APIFY_API_TOKEN });
const AGENT_NAME = "permian-brief";
const ARTICLE_WINDOW_DAYS = 60;

async function fetchApifyItems(): Promise<FeedItem[]> {
  try {
    const run = await apify.actor("apify/google-news-scraper").call({
      queries: [
        "Permian Basin industrial real estate",
        "Permian Basin CRE warehouse logistics",
        "West Texas industrial market",
      ],
      maxResultsPerQuery: 20,
    });
    const { items } = await apify.dataset(run.defaultDatasetId).listItems();
    return (items as any[])
      .filter((i) => i.url && i.title && i.publishedAt)
      .map((i) => ({
        title: i.title,
        link: i.url,
        pubDate: new Date(i.publishedAt),
        source: i.source ?? "Google News",
        summary: i.description,
      }));
  } catch {
    return [];
  }
}

function dedupe(items: FeedItem[]): FeedItem[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    if (seen.has(i.link)) return false;
    seen.add(i.link);
    return true;
  });
}

export async function fetchNewsItems(): Promise<FeedItem[]> {
  const [rssItems, apifyItems, alreadyPublished] = await Promise.all([
    fetchAllFeeds(),
    fetchApifyItems(),
    getPreviouslyPublishedUrls(AGENT_NAME),
  ]);

  const allItems = [...rssItems, ...apifyItems];
  const windowStart = subDays(new Date(), ARTICLE_WINDOW_DAYS);

  const filtered = allItems
    .filter((i) => i.pubDate > windowStart)
    .filter(isPermianRelevant)
    .filter((i) => !alreadyPublished.has(i.link))
    .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

  return dedupe(filtered);
}
