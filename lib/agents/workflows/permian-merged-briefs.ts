/**
 * Permian brief generators — Monday, Submarket Watch, and Fund Landscape.
 * Used by /api/cron/permian-brief, /api/cron/permian-submarket-watch,
 * and /api/cron/permian-fund-landscape.
 */

import Anthropic from "@anthropic-ai/sdk";
import Parser from "rss-parser";
import { ApifyClient } from "apify-client";
import { runWeeklyMarketUpdate } from "@/lib/agents/workflows/weekly-market-update";

const anthropic = new Anthropic();
const rssParser = new Parser();
const apify = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

// ── Shared feeds ───────────────────────────────────────────────────────────────

const SHARED_FEEDS = [
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

const FUND_FEEDS = [
  { url: "https://pere.privateequityinternational.com/feed/", source: "PERE" },
  { url: "https://www.nreionline.com/rss.xml", source: "NREI" },
  { url: "https://www.irei.com/feed/", source: "Institutional RE" },
  { url: "https://www.globest.com/feed/", source: "GlobeSt" },
  { url: "https://credaily.com/feed/", source: "CRE Daily" },
  { url: "https://www.costar.com/rss", source: "CoStar News" },
];

// ── Monday brief queries / keywords ───────────────────────────────────────────

const MONDAY_QUERIES = [
  "Permian Basin industrial real estate 2026",
  "Midland Odessa Texas industrial warehouse lease sale 2026",
  "West Texas industrial CRE investment 2026",
  "Permian Basin IOS industrial outdoor storage",
  "Midland Texas commercial real estate market update",
];

const MONDAY_KEYWORDS = [
  "permian", "midland texas", "odessa texas", "west texas", "midland-odessa",
  "permian basin", "ector county", "midland county", "andrews county",
  "industrial outdoor storage", "IOS", "service yard", "flex industrial",
  "permian industrial", "west texas cre", "permian cre",
  "sale comp", "comparable", "absorption", "vacancy", "lease rate",
  "cap rate", "warehouse", "logistics", "industrial real estate",
];

// ── Submarket watch queries / keywords ────────────────────────────────────────

const SUBMARKET_QUERIES = [
  "Permian Basin industrial real estate sale 2026",
  "Midland Odessa industrial warehouse lease sale 2026",
  "Permian Basin service yard industrial outdoor storage",
  "Texas industrial CRE submarket absorption vacancy 2026",
  "West Texas industrial sale comp 2026",
];

// Must match at least one geographic keyword
const SUBMARKET_GEO_KEYWORDS = [
  "permian", "west texas", "permian basin", "permian cre",
  "midland tx", "midland, tx", "midland texas", "midland-odessa",
  "odessa tx", "odessa, tx", "odessa texas",
  "ector county", "andrews texas",
];

const SUBMARKET_TOPIC_KEYWORDS = [
  "industrial outdoor storage", "service yard", "ios",
  "sale comp", "comparable", "absorption", "vacancy", "lease rate",
  "cap rate", "industrial cre", "warehouse",
];

// ── Fund landscape queries / keywords ─────────────────────────────────────────

const FUND_APIFY_QUERIES = [
  "industrial outdoor storage IOS fund raise close 2025 2026",
  "Permian Basin West Texas industrial CRE fund acquisition LP",
  "industrial net lease private equity fund IRR 2026",
  "small mid-market industrial REIT fund raise 2025 2026",
  "industrial CRE fund LP capital raise close Midland Odessa",
  "outdoor storage truck terminal service yard fund acquisition",
  "industrial real estate fund benchmark distribution 2025 2026",
];

const FUND_KEYWORDS = [
  "fund raise", "fund launch", "capital raise", "equity raise", "fund close",
  "private equity industrial", "industrial reit", "reit acquisition",
  "irr", "equity multiple", "fund return", "carried interest",
  "industrial fund", "outdoor storage fund", "ios fund", "benchmark",
  "fund iv", "fund v", "fund vi", "limited partner", "lp appetite",
  "prologis", "blackstone real estate", "eqt exeter", "nuveen industrial",
  "ares industrial", "link logistics", "istar", "clarion industrial",
  "industrial logistics fund", "net lease fund", "west texas industrial",
];

const RE_ANCHORS = [
  "real estate", "industrial", "warehouse", "logistics", "reit",
  "cre", "net lease", "commercial property", "storage", "distribution",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

interface NewsItem {
  title: string;
  link: string;
  pubDate: Date;
  source: string;
  summary?: string;
  fromApify?: boolean;
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

const HTML_SHELL = (title: string, subtitle: string, bodyContent: string) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;">
<div style="max-width:680px;margin:32px auto;background:#ffffff;">
  <div style="padding:28px 40px 20px;border-bottom:2px solid #e2e8f0;">
    <p style="font-size:10px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#94a3b8;margin:0 0 10px;">ERP Funds &middot; Permian Basin / West Texas &middot; Weekly</p>
    <h1 style="font-size:24px;font-weight:700;color:#0f172a;margin:0 0 6px;line-height:1.2;">&#9875; ${title}</h1>
    <p style="font-size:13px;color:#64748b;margin:0;">${subtitle}</p>
  </div>
  <div style="padding:28px 40px 8px;">${bodyContent}</div>
  <div style="padding:16px 40px 28px;border-top:1px solid #e2e8f0;margin-top:16px;">
    <p style="font-size:11px;color:#94a3b8;font-style:italic;margin:0;">Questions or corrections &rarr; reply to this email.</p>
  </div>
</div>
</body>
</html>`;

const SECTION_DIVIDER = (label: string) =>
  `<div style="border-top:3px solid #0f172a;margin:36px 0 24px;padding-top:16px;">
    <p style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#0f172a;margin:0;">${label}</p>
  </div>`;

async function fetchApifyNews(queries: string[], maxResultsPerQuery: number): Promise<NewsItem[]> {
  try {
    const run = await apify.actor("easyapi/google-news-scraper").call({ queries, maxResultsPerQuery });
    const { items: apifyItems } = await apify.dataset(run.defaultDatasetId).listItems();
    const out: NewsItem[] = [];
    for (const i of apifyItems as Record<string, unknown>[]) {
      if (i.link && i.title && i.date_utc) {
        const rawLink = String(i.link);
        out.push({
          title: String(i.title),
          link: rawLink.startsWith("/") ? `https://news.google.com${rawLink}` : rawLink,
          pubDate: new Date(String(i.date_utc)),
          source: String(i.source ?? "Google News"),
          summary: i.snippet ? String(i.snippet) : undefined,
          fromApify: true,
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

// ── Fetch functions ────────────────────────────────────────────────────────────

async function fetchMondayNews(excludeUrls?: Set<string>): Promise<NewsItem[]> {
  const items: NewsItem[] = [];

  await Promise.allSettled(
    SHARED_FEEDS.map(async ({ url, source }) => {
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

  items.push(...await fetchApifyNews(MONDAY_QUERIES, 15));

  const seen = new Set<string>();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  return items
    .filter((i) => i.pubDate > sevenDaysAgo)
    .filter((i) => !excludeUrls?.has(i.link))
    .filter((i) => { const text = `${i.title} ${i.summary ?? ""}`.toLowerCase(); return MONDAY_KEYWORDS.some((kw) => text.includes(kw.toLowerCase())); })
    .filter((i) => { if (seen.has(i.link)) return false; seen.add(i.link); return true; })
    .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime())
    .slice(0, 20);
}

async function fetchSubmarketNews(excludeUrls?: Set<string>): Promise<NewsItem[]> {
  const items: NewsItem[] = [];

  await Promise.allSettled(
    SHARED_FEEDS.map(async ({ url, source }) => {
      try {
        const feed = await rssParser.parseURL(url);
        for (const item of feed.items) {
          if (item.link && item.title && item.pubDate) {
            items.push({ title: item.title, link: item.link, pubDate: new Date(item.pubDate), source, summary: item.contentSnippet });
          }
        }
      } catch { /* skip */ }
    })
  );

  items.push(...await fetchApifyNews(SUBMARKET_QUERIES, 15));

  const seen = new Set<string>();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  return items
    .filter((i) => i.pubDate > thirtyDaysAgo)
    .filter((i) => !excludeUrls?.has(i.link))
    .filter((i) => {
      const text = `${i.title} ${i.summary ?? ""}`.toLowerCase();
      if (i.fromApify) return SUBMARKET_TOPIC_KEYWORDS.some((kw) => text.includes(kw));
      return SUBMARKET_GEO_KEYWORDS.some((kw) => text.includes(kw));
    })
    .filter((i) => { if (seen.has(i.link)) return false; seen.add(i.link); return true; })
    .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime())
    .slice(0, 25);
}

async function fetchFundNews(excludeUrls?: Set<string>): Promise<NewsItem[]> {
  const items: NewsItem[] = [];

  await Promise.allSettled(
    FUND_FEEDS.map(async ({ url, source }) => {
      try {
        const feed = await rssParser.parseURL(url);
        for (const item of feed.items) {
          if (item.link && item.title && item.pubDate) {
            items.push({ title: item.title, link: item.link, pubDate: new Date(item.pubDate), source, summary: item.contentSnippet });
          }
        }
      } catch { /* skip */ }
    })
  );

  items.push(...await fetchApifyNews(FUND_APIFY_QUERIES, 15));

  const seen = new Set<string>();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  return items
    .filter((i) => i.pubDate > thirtyDaysAgo)
    .filter((i) => !excludeUrls?.has(i.link))
    .filter((i) => {
      const text = `${i.title} ${i.summary ?? ""}`.toLowerCase();
      if (i.fromApify) return RE_ANCHORS.some((kw) => text.includes(kw));
      const hasFund = FUND_KEYWORDS.some((kw) => text.includes(kw));
      const hasRE = RE_ANCHORS.some((kw) => text.includes(kw));
      return hasFund && hasRE;
    })
    .filter((i) => { if (seen.has(i.link)) return false; seen.add(i.link); return true; })
    .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime())
    .slice(0, 25);
}

// ── Exported generators ────────────────────────────────────────────────────────

export async function generatePermianSubmarketBrief(period: string, opts?: { excludeUrls?: Set<string> }): Promise<{ subject: string; htmlBody: string; summary: string; newsItems: NewsItem[] }> {
  const news = await fetchSubmarketNews(opts?.excludeUrls);

  const subject = `Permian Submarket Watch — ${period}`;

  if (news.length === 0) {
    const htmlBody = HTML_SHELL(subject, "Sale comps & tenant activity · Permian Basin / West Texas",
      `<p style="color:#64748b;line-height:1.7;">No Permian submarket articles found this week.</p>`);
    return { subject, htmlBody, summary: "No articles this week.", newsItems: [] };
  }

  const articleList = news.map((a, i) => `${i + 1}. [${a.source}] ${a.title} (${a.pubDate.toLocaleDateString()})`).join("\n");

  const msg = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1500,
    messages: [{
      role: "user",
      content: `You are an industrial CRE market analyst for ERP Industrials. Write a Submarket Watch brief (2-3 paragraphs) covering Permian Basin industrial — Midland, Odessa, and surrounding West Texas.

Focus on: sale comps with $/SF and cap rates (include data vintage), named tenant moves, lease signings, IOS/service yard deals, and vacancy/absorption shifts. Be specific — named companies, addresses, figures. Do not apologize for limited data; extract what IS useful and frame it for a West Texas industrial investor. Every stat needs a source and date.

This is an automated newsletter — do NOT ask follow-up questions, offer options, or end with bullet-point suggestions. Write the paragraphs and stop.

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

  const htmlBody = HTML_SHELL(subject, "Sale comps & tenant activity · Permian Basin / West Texas", newsSection);
  return { subject, htmlBody, summary: narrative.slice(0, 300), newsItems: news };
}

export async function generatePermianFundCompetitorBrief(period: string, opts?: { excludeUrls?: Set<string> }): Promise<{ subject: string; htmlBody: string; summary: string; newsItems: NewsItem[] }> {
  const news = await fetchFundNews(opts?.excludeUrls);

  const subject = `Permian Fund Landscape Brief — ${period}`;

  if (news.length === 0) {
    const htmlBody = HTML_SHELL(subject, "Competitor activity & fund benchmarks · Permian Basin Industrial",
      `<p style="color:#64748b;line-height:1.7;">No fund landscape articles found this week.</p>`);
    return { subject, htmlBody, summary: "No articles this week.", newsItems: [] };
  }

  const articleList = news.slice(0, 20).map((a, i) => `${i + 1}. [${a.source}] ${a.title} (${a.pubDate.toLocaleDateString()})`).join("\n");

  const msg = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1500,
    messages: [{
      role: "user",
      content: `You are a competitive intelligence analyst for ERP Industrials, a Permian Basin industrial CRE fund manager raising Fund IV. Write a Fund Landscape Brief (2-3 paragraphs) for Meghan (head of fundraising) to use in LP meetings this week.

ERP context: ~$50M fund targeting Permian Basin industrial outdoor storage (IOS), service yards, and small-bay industrial. Competing against larger generalist industrial funds but differentiated by West Texas market depth.

From the articles below, synthesize what's relevant for LP conversations:
1. Which funds are actively raising or just closed — sizes, strategies, target returns
2. What LP appetite signals are visible — what asset types and geographies are attracting capital?
3. How does ERP's IOS/Permian focus compare to what competitors are doing — is it differentiated or crowded?
4. Any IRR benchmarks, fee structures, or LP preference shifts worth noting

Write with confidence — synthesize what the articles tell you and draw LP-facing implications. Do not apologize for limited data. This is an automated newsletter — do NOT ask follow-up questions or end with bullet-point suggestions. Write the brief and stop.

Articles:
${articleList}`,
    }],
  });

  const narrative = msg.content[0].type === "text" ? msg.content[0].text : "";
  const narrativeHtml = narrative.split("\n\n").map((p) => `<p style="line-height:1.7;color:#374151;margin:0 0 14px;">${p}</p>`).join("");

  const fundSection = `
${SECTION_DIVIDER("This Week's Fund Landscape — Industrial CRE")}
${narrativeHtml}
<div style="margin-top:12px;">${articlesToHtml(news.slice(0, 20))}</div>
`;

  const htmlBody = HTML_SHELL(subject, "Competitor activity & fund benchmarks · Permian Basin Industrial", fundSection);
  return { subject, htmlBody, summary: narrative.slice(0, 300), newsItems: news };
}

export async function generatePermianMondayBrief(period: string, opts?: { excludeUrls?: Set<string> }): Promise<{ subject: string; htmlBody: string; summary: string; newsItems: NewsItem[] }> {
  const [brief, news] = await Promise.all([
    runWeeklyMarketUpdate({ market: "permian", period }),
    fetchMondayNews(opts?.excludeUrls),
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

  const htmlBody = brief.htmlBody.replace(
    /([ \t]*<!-- Footer -->)/,
    `<div style="padding:0 40px;">${newsSection}</div>\n  $1`
  );

  return { subject: brief.subject, htmlBody, summary: brief.summary, newsItems: news };
}
