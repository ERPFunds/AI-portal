/**
 * Brevard merged brief generators.
 * Used by both the weekly cron (/api/cron/brevard-brief) and the
 * on-demand test endpoint (/api/test-all-briefs) so live RSS/Apify
 * data is included in both.
 */

import Anthropic from "@anthropic-ai/sdk";
import Parser from "rss-parser";
import { ApifyClient } from "apify-client";
import { runWeeklyMarketUpdate } from "@/lib/agents/workflows/weekly-market-update";
import { runSubmarketIntelligence } from "@/lib/agents/workflows/submarket-intelligence";
import { runCompetitorIntelligence } from "@/lib/agents/workflows/competitor-intelligence";

const anthropic = new Anthropic();
const rssParser = new Parser();
const apify = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

// ── Feeds ────────────────────────────────────────────────────────────────────

const SHARED_FEEDS = [
  { url: "https://www.globest.com/feed/", source: "GlobeSt" },
  { url: "https://commercialobserver.com/feed/", source: "Commercial Observer" },
  { url: "https://credaily.com/feed/", source: "CRE Daily" },
  { url: "https://therealdeal.com/feed/", source: "The Real Deal" },
  { url: "https://bisnow.com/rss/south-florida", source: "Bisnow South Florida" },
  { url: "https://connectcre.com/feed/", source: "Connect CRE" },
  { url: "https://www.prnewswire.com/rss/news-releases-list.rss", source: "PR Newswire" },
  { url: "https://www.businesswire.com/rss/home", source: "Business Wire" },
  { url: "https://pere.privateequityinternational.com/feed/", source: "PERE / IPE Real Assets" },
];

const MONDAY_QUERIES = [
  "Brevard County Florida industrial real estate 2026",
  "Space Coast Florida industrial warehouse lease sale 2026",
  "Melbourne Florida industrial CRE deal transaction 2026",
  "Titusville Cocoa Palm Bay industrial property sale lease 2026",
  "Brevard County commercial real estate sold 2026",
  "Space Coast Florida industrial tenant move 2026",
  "Florida industrial real estate transaction news 2026",
];

const MONDAY_KEYWORDS = [
  "brevard", "space coast", "melbourne florida", "titusville", "palm bay", "cocoa",
  "kennedy space center", "cape canaveral", "port canaveral",
  "florida industrial", "flex space florida", "logistics florida",
  "sale comp", "sold", "lease signed", "new tenant", "absorption", "vacancy", "lease rate",
  "cap rate", "warehouse", "aerospace industrial", "defense contractor", "industrial property",
  "sq ft", "square feet", "per sf", "nnn", "industrial park", "flex building",
];

const SUBMARKET_QUERIES = [
  "Brevard County Florida industrial real estate 2025",
  "Space Coast Florida industrial warehouse lease sale",
  "Melbourne Florida industrial logistics flex space",
  "Titusville Palm Bay Cocoa industrial CRE",
  "Kennedy Space Center aerospace industrial real estate",
];

const SUBMARKET_KEYWORDS = [
  "brevard", "space coast", "melbourne florida", "titusville", "palm bay", "cocoa",
  "kennedy space center", "cape canaveral", "port canaveral",
  "florida industrial", "flex space florida", "logistics florida",
  "sale comp", "comparable", "absorption", "vacancy", "lease rate",
  "cap rate", "warehouse", "aerospace industrial", "defense contractor",
];

const FUND_QUERIES = [
  "Florida industrial CRE fund raise 2025",
  "Space Coast Florida industrial investment fund",
  "aerospace adjacent industrial real estate fund Florida",
  "EastGroup Properties Florida industrial acquisition",
  "Rockefeller Group Exeter GreenPointe Florida industrial fund",
  "industrial real estate fund IRR benchmarks LP 2025",
];

const FUND_KEYWORDS = [
  "fund raise", "fund launch", "capital raise", "equity raise",
  "private equity industrial", "industrial reit", "reit acquisition",
  "irr", "fund return", "distribution", "carried interest",
  "florida industrial fund", "space coast investment", "aerospace reit",
  "eastgroup", "exeter", "rockefeller group", "greenpointe",
  "lp appetite", "institutional capital", "industrial cre",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

interface NewsItem {
  title: string;
  link: string;
  pubDate: Date;
  source: string;
  summary?: string;
}

async function fetchNews(apifyQueries: string[], keywords: string[], excludeUrls?: Set<string>): Promise<NewsItem[]> {
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

  try {
    const run = await apify.actor("apify/google-news-scraper").call({ queries: apifyQueries, maxResultsPerQuery: 15, dateFilter: "week" });
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
    .filter((i) => { const text = `${i.title} ${i.summary ?? ""}`.toLowerCase(); return keywords.some((kw) => text.includes(kw)); })
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
    <p style="font-size:10px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#94a3b8;margin:0 0 10px;">ERP Funds &middot; Brevard / Space Coast &middot; Weekly</p>
    <h1 style="font-size:24px;font-weight:700;color:#0f172a;margin:0 0 6px;line-height:1.2;">&#127759; ${title}</h1>
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

// ── Exported generators ───────────────────────────────────────────────────────

export async function generateBrevardSubmarketBrief(period: string, opts?: { excludeUrls?: Set<string> }): Promise<{ subject: string; htmlBody: string; summary: string; newsItems: NewsItem[] }> {
  const [deepDive, news] = await Promise.all([
    runSubmarketIntelligence({ market: "brevard", period }),
    fetchNews(SUBMARKET_QUERIES, SUBMARKET_KEYWORDS, opts?.excludeUrls),
  ]);

  let newsSection = "";

  if (news.length > 0) {
    const articleList = news.map((a, i) => `${i + 1}. [${a.source}] ${a.title} (${a.pubDate.toLocaleDateString()})`).join("\n");

    const msg = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1500,
      messages: [{
        role: "user",
        content: `You are an industrial CRE analyst for ERP Funds. Write a 2-3 paragraph news summary covering these Brevard / Space Coast industrial articles from this week. Focus on: sale comps with $/SF and cap rates (include data vintage), named tenant moves, and any pricing or vacancy shifts. Be specific — named companies, addresses, figures. Every stat needs a date.

Articles:
${articleList}`,
      }],
    });

    const narrative = msg.content[0].type === "text" ? msg.content[0].text : "";
    const narrativeHtml = narrative.split("\n\n").map((p) => `<p style="line-height:1.7;color:#374151;margin:0 0 14px;">${p}</p>`).join("");

    newsSection = `
${SECTION_DIVIDER("This Week's News — Space Coast Industrial")}
${narrativeHtml}
<div style="margin-top:12px;">${articlesToHtml(news)}</div>
`;
  }

  if (deepDive.sourcesLine) {
    newsSection += `<p style="font-size:11px;color:#94a3b8;line-height:1.8;margin:20px 0 0;">${deepDive.sourcesLine}</p>`;
  }

  const subject = `Space Coast Submarket Brief — ${period}`;
  const htmlBody = HTML_SHELL(subject, `Deep dive + weekly news digest · Brevard County / Space Coast`, deepDive.bodyContent + newsSection);
  return { subject, htmlBody, summary: deepDive.summary, newsItems: news };
}

export async function generateBrevardFundCompetitorBrief(period: string, opts?: { excludeUrls?: Set<string> }): Promise<{ subject: string; htmlBody: string; summary: string; newsItems: NewsItem[] }> {
  const [compIntel, news] = await Promise.all([
    runCompetitorIntelligence({ market: "brevard", period }),
    fetchNews(FUND_QUERIES, FUND_KEYWORDS, opts?.excludeUrls),
  ]);

  let fundSection = "";

  if (news.length > 0) {
    const articleList = news.map((a, i) => `${i + 1}. [${a.source}] ${a.title} (${a.pubDate.toLocaleDateString()})`).join("\n");

    const msg = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1500,
      messages: [{
        role: "user",
        content: `You are a competitive intelligence analyst for ERP Funds, a Brevard County / Space Coast industrial CRE fund. Write a 2-3 paragraph fund landscape summary based on these articles from this week.

Focus on: Florida industrial fund raises and closings (name the funds and amounts), LP appetite signals for Florida / Space Coast industrial, and any benchmark data on IRR or equity multiples (include data vintage on every figure). Frame for Meghan preparing LP meetings — what is actionable this week?

Articles:
${articleList}`,
      }],
    });

    const narrative = msg.content[0].type === "text" ? msg.content[0].text : "";
    const narrativeHtml = narrative.split("\n\n").map((p) => `<p style="line-height:1.7;color:#374151;margin:0 0 14px;">${p}</p>`).join("");

    fundSection = `
${SECTION_DIVIDER("This Week's Fund Landscape — Florida Industrial")}
${narrativeHtml}
<div style="margin-top:12px;">${articlesToHtml(news)}</div>
`;
  }

  if (compIntel.sourcesLine) {
    fundSection += `<p style="font-size:11px;color:#94a3b8;line-height:1.8;margin:20px 0 0;">${compIntel.sourcesLine}</p>`;
  }

  const subject = `Space Coast Competitive & Fund Intelligence — ${period}`;
  const htmlBody = HTML_SHELL(subject, `Competitor tracker + fund landscape · Brevard County / Space Coast`, compIntel.bodyContent + fundSection);
  return { subject, htmlBody, summary: compIntel.summary, newsItems: news };
}

export async function generateBrevardMondayBrief(period: string, opts?: { excludeUrls?: Set<string> }): Promise<{ subject: string; htmlBody: string; summary: string; newsItems: NewsItem[] }> {
  const [brief, news] = await Promise.all([
    runWeeklyMarketUpdate({ market: "brevard", period }),
    fetchNews(MONDAY_QUERIES, MONDAY_KEYWORDS, opts?.excludeUrls),
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
      content: `You are an industrial CRE analyst for ERP Funds. Write a 2-3 paragraph news summary covering these Brevard County / Space Coast industrial CRE articles from this week. Focus on: sale comps with $/SF and cap rates (include data vintage), named tenant moves, lease signings, new developments, and any pricing or vacancy shifts. Be specific — named companies, addresses, dollar figures. Every stat needs a date.

Articles:
${articleList}`,
    }],
  });

  const narrative = msg.content[0].type === "text" ? msg.content[0].text : "";
  const narrativeHtml = narrative.split("\n\n").map((p) => `<p style="line-height:1.7;color:#374151;margin:0 0 14px;">${p}</p>`).join("");

  const newsSection = `
${SECTION_DIVIDER("This Week's News — Space Coast Industrial")}
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
