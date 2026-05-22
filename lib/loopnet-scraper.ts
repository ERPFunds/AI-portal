/**
 * LoopNet vacancy scraper
 *
 * Uses Apify's website-content-crawler (JS-rendered) to pull the LoopNet
 * industrial-for-lease search page, then uses Claude to extract structured
 * listing objects from the raw page text.
 *
 * Road-corridor filter for the Permian newsletter is exported separately so
 * the cron route can apply it after fetching.
 */

import { ApifyClient } from "apify-client";
import Anthropic from "@anthropic-ai/sdk";

const apify = new ApifyClient({ token: process.env.APIFY_API_TOKEN });
const anthropic = new Anthropic();

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LoopNetListing {
  address: string;
  propertyName?: string;
  size?: string;           // total building SF
  availableSpace?: string; // available SF
  price?: string;          // asking rent or price
  propertyType?: string;
  url: string;
  description?: string;
}

// ── Permian corridor filter ───────────────────────────────────────────────────

// Matches any of the seven specified roads in an address or description string.
const PERMIAN_ROAD_PATTERNS: RegExp[] = [
  /\bhwy\.?\s*191\b/i,
  /\bhighway\s*191\b/i,
  /\bus[- ]?191\b/i,
  /\bi[- ]?20\b/i,
  /\binterstate\s*20\b/i,
  /\bbus(?:iness)?\.?\s*(?:route\s*)?20\b/i,
  /\bfm[-\s]?1788\b/i,
  /\bfarm[-\s]to[-\s]market\s*(?:road\s*)?1788\b/i,
  /\bhwy\.?\s*158\b/i,
  /\bhighway\s*158\b/i,
  /\bmurphy\s*st(?:reet)?\b/i,
  /\bindustrial\s*ave(?:nue)?\b/i,
];

export function isOnPermianCorridor(listing: LoopNetListing): boolean {
  const text = `${listing.address} ${listing.description ?? ""}`;
  return PERMIAN_ROAD_PATTERNS.some((re) => re.test(text));
}

// ── LoopNet search URLs ───────────────────────────────────────────────────────

const SEARCH_URLS: Record<"brevard" | "permian", string[]> = {
  brevard: [
    "https://www.loopnet.com/search/industrial-properties/brevard-county-fl/for-lease/",
  ],
  permian: [
    "https://www.loopnet.com/search/industrial-properties/midland-tx/for-lease/",
    "https://www.loopnet.com/search/industrial-properties/odessa-tx/for-lease/",
  ],
};

// ── Crawl a single LoopNet page via Apify ────────────────────────────────────

async function crawlPage(url: string): Promise<string> {
  try {
    const run = await apify
      .actor("apify/website-content-crawler")
      .call(
        {
          startUrls: [{ url }],
          maxCrawlPages: 1,
          maxCrawlDepth: 0,
          crawlerType: "playwright:firefox",
          // Increase wait so JS-heavy listing cards have time to render
          pageLoadTimeoutSecs: 45,
        },
        { timeoutSecs: 180 }
      );

    const { items } = await apify.dataset(run.defaultDatasetId).listItems();
    const page = items[0] as Record<string, unknown> | undefined;
    const text =
      (page?.text as string) ??
      (page?.markdown as string) ??
      (page?.content as string) ??
      "";
    return text;
  } catch (err) {
    console.error(`[loopnet-scraper] crawl failed for ${url}:`, err);
    return "";
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function fetchLoopNetListings(params: {
  market: "brevard" | "permian";
  maxListings?: number;
}): Promise<LoopNetListing[]> {
  const { market, maxListings = 40 } = params;

  const urls = SEARCH_URLS[market];
  const pageTexts = await Promise.all(urls.map(crawlPage));
  const combinedText = pageTexts.filter((t) => t.trim()).join("\n\n---PAGE BREAK---\n\n");

  if (!combinedText.trim()) {
    console.warn(`[loopnet-scraper] No page content retrieved for ${market}`);
    return [];
  }

  // Claude extracts structured listings from the raw page text.
  // We truncate to ~14 k chars to stay within a reasonable token budget.
  const prompt = `You are extracting industrial property listings from a LoopNet search results page. The raw page text is below.

Return a JSON array of listing objects. Each object must have:
- address (string, required — street address including city/state if present)
- propertyName (string or null)
- size (string or null — total building SF, e.g. "24,500 SF")
- availableSpace (string or null — available SF, e.g. "12,000 SF")
- price (string or null — asking rent or sale price, e.g. "$8.50/SF/YR")
- propertyType (string or null)
- url (string — full URL if visible, otherwise empty string)
- description (string or null — one-sentence summary if available)

Only include listings that have a recognisable street address. Omit entries with no address.
Return ONLY the raw JSON array — no markdown, no code fences, no explanation.

Page text (truncated):
${combinedText.slice(0, 14000)}`;

  let listings: LoopNetListing[] = [];
  try {
    const msg = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = msg.content[0].type === "text" ? msg.content[0].text.trim() : "[]";
    listings = JSON.parse(raw) as LoopNetListing[];
  } catch (err) {
    console.error("[loopnet-scraper] Claude parse failed:", err);
    return [];
  }

  return listings
    .filter((l) => l.address?.trim())
    .slice(0, maxListings);
}
