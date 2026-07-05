/**
 * Permian Monday Brief — wraps runWeeklyMarketUpdate and appends a live
 * RSS + Apify news digest section, matching the structure Brevard uses.
 *
 * Used by both:
 *   - /api/cron/permian-brief  (weekly cron)
 *   - /api/test-all-briefs     (on-demand test)
 */

import Anthropic from "@anthropic-ai/sdk";
import Parser from "rss-parser";
import { ApifyClient } from "apify-client";
import { runWeeklyMarketUpdate } from "@/lib/agents/workflows/weekly-market-update";

const anthropic = new Anthropic();
const rssParser = new Parser();
const apify = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

// ── Feeds ─────────────────────────────────────────────────────────────────────

const PERMIAN_FEEDS = [
  { url: "https://www.globest.com/feed/", source: "GlobeSt" },
  { url: "https://commercialobserver.com/feed/", source: "Commercial Observer" },
  { url: "https://credaily.com/feed/", source: "CRE Daily" },
  { url: "https://therealdeal.com/feed/", source: "The Real Deal" },
  { url: "https://bisnow.com/rss/dallas-fort-worth", source: "Bisnow DFW" },
  { url: "https://bisnow.com/rss/texas", source: "Bisnow Texas" },
  { url: "https://connectcre.com/feed/", source: "Connect CRE" },
  { url: "https://www.prnewswire.com/rss/news-releases-list.rss", source: "PR Newswire" },
  { url: "https://www.businesswire.com/rss/home", source: "Business Wire" },
];

const PERMIAN_QUERIES = [
  "Permian Basin industrial real estate 2026",
  "Midland Odessa Texas industrial warehouse lease sale 2026",
  "West Texas industrial CRE investment 2026",
  "Permian Basin IOS industrial outdoor storage",
  "Midland Texas commercial real estate market update",
];

const PERMIAN_KEYWORDS = [
  "permian", "midland texas", "odessa texas", "west texas", "midland-odessa",
  "permian basin", "ector county", "midland county", "andrews county",
  "industrial outdoor storage", "IOS", "service yard", "flex industrial",
  "permian industrial", "west texas cre", "permian cre",
  "sale comp", "comparable", "absorption", "vacancy", "lease rate",
  "cap rate", "warehouse", "logistics", "industrial real estate",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

interface NewsItem {
  title: string;
  link: string;
  pubDate: Date;
  source: string;
  summary?: string;
}

async function fetchPermianNews(excludeUrls?: Set<string>): Promise<NewsItem[]> {
  const items: NewsItem[] = [];

  await Promise.allSettled(
    PERMIAN_FEEDS.map(async ({ url, source }) => {
      try {
        const feed = await rssParser.parseURL(url);
        for (const item of feed.items) {
          if (item.link && item.title && item.pubDate) {
            items.push({ title: item.title, link: item.link, pubDate: new Date(item.pubDate), source, summary: item.contentSnippet });
          }
        }
      } catch { /* skip failing feeds */ }
    })
  );

  try {
    const run = await apify.actor("apify/google-news-scraper").call({ queries: PERMIAN_QUERIES, maxResultsPerQuery: 15, dateFilter: "week" });
    const { items: apifyItems } = await apify.dataset(run.defaultDatasetId).listItems();
    for (const i of apifyItems as Record<string, unknown>[]) {
      if (i.url && i.title && i.publishedAt) {
        items.push({ title: String(i.title), link: String(i.url), pubDate: new Date(String(i.publishedAt)), source: String(i.source ?? "Google News"), summary: i.description ? String(i.description) : undefined });
      }
    }
  } catch { /* Apify optional */ }

  const seen = new Set<string>();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  return items
    .filter((i) => i.pubDate > sevenDaysAgo)
    .filter((i) => !excludeUrls?.has(i.link))
    .filter((i) => { const text = `${i.title} ${i.summary ?? ""}`.toLowerCase(); return PERMIAN_KEYWORDS.some((kw) => text.includes(kw.toLowerCase())); })
    .filter((i) => { if (seen.has(i.link)) return false; seen.add(i.link); return true; })
    .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime())
    .slice(0, 20);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function articlesToHtml(news: NewsItem[]): string {
  return news.map((a) => {
    const url = a.link;
    const dateStr = a.pubDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const safeSource = escapeHtml(a.source);
    const safeTitle = escapeHtml(a.title);
    const sourceEl = `<a href="${url}" style="font-weight:700;color:#1d4ed8;text-decoration:underline;">${safeSource}</a>`;
    const titleEl = `<a href="${url}" style="font-weight:700;color:#1d4ed8;text-decoration:underline;">${safeTitle}</a>`;
    const bodyText = a.summary ? `<p style="font-size:13px;color:#475569;line-height:1.6;margin:0;">${escapeHtml(a.summary)}</p>` : "";
    return `<div style="border-left:3px solid #cbd5e1;padding:6px 0 6px 14px;margin:0 0 16px;">
  <p style="font-size:12px;margin:0 0 4px;line-height:1.5;">${sourceEl}<span style="color:#94a3b8;margin:0 5px;">&middot;</span>${titleEl}<span style="color:#94a3b8;margin:0 5px;">&middot;</span><span style="color:#94a3b8;">${dateStr}</span></p>
  ${bodyText}
</div>`;
  }).join("\n");
}

const SECTION_DIVIDER = (label: string) =>
  `<div style="border-top:3px solid #0f172a;margin:36px 0 24px;padding-top:16px;">
    <p style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#0f172a;margin:0;">${label}</p>
  </div>`;

// ── Exported generator ────────────────────────────────────────────────────────

export async function generatePermianMondayBrief(period: string, opts?: { excludeUrls?: Set<string> }): Promise<{ subject: string; htmlBody: string; summary: string; newsItems: NewsItem[] }> {
  const [brief, news] = await Promise.all([
    runWeeklyMarketUpdate({ market: "permian", period }),
    fetchPermianNews(opts?.excludeUrls),
  ]);

  if (news.length === 0) {
    return { ...brief, newsItems: [] };
  }

  const articleList = news.map((a, i) => `${i + 1}. [${a.source}] ${a.title} (${a.pubDate.toLocaleDateString()})`).join("\n");

  const msg = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1200,
    messages: [{
      role: "user",
      content: `You are an industrial CRE analyst for ERP Funds. Write a 2-3 paragraph news summary covering these Permian Basin / West Texas industrial CRE articles from this week. Focus on: sale comps with $/SF and cap rates (include data vintage), named tenant moves, lease signings, IOS/service yard deals, and any pricing or vacancy shifts. Be specific — named companies, addresses, figures. Every stat needs a date.

Articles:
${articleList}`,
    }],
  });

  const narrative = msg.content[0].type === "text" ? msg.content[0].text : "";
  const narrativeHtml = narrative.split("\n\n").map((p) => `<p style="line-height:1.7;color:#374151;margin:0 0 14px;">${p}</p>`).join("");

  const newsSection = `
${SECTION_DIVIDER("This Week's News — Permian Basin Industrial")}
${narrativeHtml}
<div style="margin-top:12px;">${articlesToHtml(news)}</div>
`;

  // Inject news section before the footer — anchor on the static HTML comment
  // so dynamic article content can never accidentally match the pattern.
  const htmlBody = brief.htmlBody.replace(
    /([ \t]*<!-- Footer -->)/,
    `<div style="padding:0 40px;">${newsSection}</div>\n  $1`
  );

  return { subject: brief.subject, htmlBody, summary: brief.summary, newsItems: news };
}
