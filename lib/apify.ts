/**
 * Apify Google News scraper integration
 * API token: process.env.APIFY_API_TOKEN
 * Actor: apify/google-news-scraper
 *
 * Supplements RSS feeds with Google News results, catching articles
 * that aren't in our curated feed list.
 */

import type { FeedItem } from "@/lib/rss";

const APIFY_BASE = "https://api.apify.com/v2";

// Market + workflow-aware search queries
// Permian queries explicitly target the broker sources shown in the mockup:
//   CBRE, JLL, Cushman & Wakefield, Newmark, NAIOP Texas
const QUERIES: Record<string, Record<string, string>> = {
  "weekly-market-update": {
    permian:
      "(CBRE OR JLL OR \"Cushman Wakefield\" OR Newmark OR \"Marcus Millichap\" OR NAIOP OR Colliers) " +
      "(Permian Basin OR Midland OR Odessa OR \"West Texas\") industrial market report 2026",
    brevard:
      "(CBRE OR JLL OR \"Cushman Wakefield\" OR Newmark OR NAIOP OR Colliers) " +
      "(\"Space Coast\" OR Brevard OR Melbourne OR Titusville) industrial 2026",
  },
  "submarket-intelligence": {
    permian:
      "(CBRE OR JLL OR \"Cushman Wakefield\" OR CoStar OR Newmark) " +
      "(Permian Basin OR Midland OR \"West Texas\") industrial vacancy rents absorption supply",
    brevard:
      "(CBRE OR JLL OR \"Cushman Wakefield\" OR CoStar) " +
      "(\"Brevard County\" OR \"Space Coast\" OR Melbourne) industrial vacancy rents absorption",
  },
  "competitor-intelligence": {
    permian:
      "industrial CRE fund acquisition \"Permian Basin\" OR \"outdoor storage\" OR \"service yard\" OR IOS " +
      "REIT OR \"private equity\" OR \"joint venture\" 2026",
    brevard:
      "industrial CRE fund acquisition \"Space Coast\" OR Brevard Florida " +
      "logistics OR \"cold storage\" OR aerospace REIT 2026",
  },
};

const DEFAULT_QUERY: Record<string, string> = {
  permian:
    "(CBRE OR JLL OR \"Cushman Wakefield\" OR Newmark OR NAIOP) Permian Basin industrial real estate Midland Odessa",
  brevard:
    "(CBRE OR JLL OR \"Cushman Wakefield\" OR Newmark) Space Coast Brevard County industrial real estate Florida",
};

function getQuery(workflowId: string, market: string): string {
  const mkt = market.toLowerCase();
  return (
    QUERIES[workflowId]?.[mkt] ??
    DEFAULT_QUERY[mkt] ??
    `${market} industrial commercial real estate`
  );
}

interface ApifyNewsItem {
  title?: string;
  url?: string;
  link?: string;
  description?: string;
  snippet?: string;
  text?: string;
  publishedAt?: string;
  date?: string;
  source?: { name?: string; title?: string } | string;
  publisher?: string;
  newsSource?: string;
}

function parseDate(raw: string | undefined): Date {
  if (!raw) return new Date();
  const d = new Date(raw);
  return isNaN(d.getTime()) ? new Date() : d;
}

function parseSource(item: ApifyNewsItem): string {
  if (typeof item.source === "object") return item.source?.name || item.source?.title || "Google News";
  if (typeof item.source === "string") return item.source;
  return item.publisher || item.newsSource || "Google News";
}

/**
 * Fetch Google News articles for a given market + workflow via Apify.
 * Returns [] if no API token is configured or on any error.
 */
export async function fetchGoogleNews(
  workflowId: string,
  market: string,
  maxItems = 20
): Promise<FeedItem[]> {
  const apiToken =
    process.env.APIFY_API_TOKEN ||
    process.env.APIFY_TOKEN ||
    process.env.APIFY_API;

  if (!apiToken) {
    console.warn("[apify] No API token found (tried APIFY_API_TOKEN, APIFY_TOKEN, APIFY_API) — skipping Google News fetch");
    return [];
  }

  const query = getQuery(workflowId, market);
  console.log(`[apify] Google News query: "${query}"`);

  try {
    const url =
      `${APIFY_BASE}/acts/apify~google-news-scraper/run-sync-get-dataset-items` +
      `?token=${apiToken}&timeout=25&memory=256`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        maxItems,
        language: "en",
        country: "US",
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      console.warn(`[apify] HTTP ${res.status} — ${await res.text().catch(() => "")}`);
      return [];
    }

    const items = (await res.json()) as ApifyNewsItem[];
    if (!Array.isArray(items)) {
      console.warn("[apify] Unexpected response shape");
      return [];
    }

    const articles: FeedItem[] = items
      .filter((item) => item.title && (item.url || item.link))
      .map((item) => ({
        title: item.title!,
        link: (item.url || item.link)!,
        pubDate: parseDate(item.publishedAt || item.date),
        source: parseSource(item),
        summary: (item.description || item.snippet || item.text || "").slice(0, 300),
      }));

    console.log(`[apify] Got ${articles.length} Google News articles`);
    return articles;
  } catch (err) {
    console.warn("[apify] fetch error:", err);
    return [];
  }
}
