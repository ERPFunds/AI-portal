import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import Parser from "rss-parser";
import { ApifyClient } from "apify-client";
import { archiveBrief, getSeenNewsletterArticleUrls, logAgentRun } from "@/lib/db";
import { sendBriefEmail } from "@/lib/mailer";
import { saveNewsletterToSharePoint } from "@/lib/agents/file-handler";

const anthropic = new Anthropic();
const parser = new Parser();
const apify = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

const FEEDS = [
  { url: "https://www.globest.com/feed/", source: "GlobeSt" },
  { url: "https://commercialobserver.com/feed/", source: "Commercial Observer" },
  { url: "https://credaily.com/feed/", source: "CRE Daily" },
  { url: "https://therealdeal.com/feed/", source: "The Real Deal" },
  { url: "https://bisnow.com/rss/houston", source: "Bisnow Texas" },
  { url: "https://connectcre.com/feed/", source: "Connect CRE" },
];

const APIFY_QUERIES = [
  "Permian Basin industrial real estate sale 2025",
  "Midland Odessa industrial warehouse lease sale",
  "Permian Basin service yard industrial outdoor storage",
  "Texas industrial CRE submarket absorption vacancy 2025",
  "West Texas industrial sale comp 2025",
];

const KEYWORDS = [
  "permian", "midland", "odessa", "west texas",
  "industrial outdoor storage", "service yard", "ios",
  "permian basin industrial", "permian cre",
  "sale comp", "comparable", "absorption", "vacancy", "lease rate",
  "cap rate", "industrial cre", "warehouse texas",
];

interface NewsItem {
  title: string;
  link: string;
  pubDate: Date;
  source: string;
  summary?: string;
}

function isRelevant(item: NewsItem): boolean {
  const text = `${item.title} ${item.summary ?? ""}`.toLowerCase();
  return KEYWORDS.some((kw) => text.includes(kw));
}

async function fetchNews(): Promise<NewsItem[]> {
  const items: NewsItem[] = [];

  await Promise.allSettled(
    FEEDS.map(async ({ url, source }) => {
      try {
        const feed = await parser.parseURL(url);
        for (const item of feed.items) {
          if (item.link && item.title && item.pubDate) {
            items.push({
              title: item.title,
              link: item.link,
              pubDate: new Date(item.pubDate),
              source,
              summary: item.contentSnippet,
            });
          }
        }
      } catch {
        // skip failing feeds
      }
    })
  );

  try {
    const run = await apify.actor("apify/google-news-scraper").call({
      queries: APIFY_QUERIES,
      maxResultsPerQuery: 15,
      dateFilter: "month",
    });
    const { items: apifyItems } = await apify.dataset(run.defaultDatasetId).listItems();
    for (const i of apifyItems as any[]) {
      if (i.url && i.title && i.publishedAt) {
        items.push({
          title: i.title,
          link: i.url,
          pubDate: new Date(i.publishedAt),
          source: i.source ?? "Google News",
          summary: i.description,
        });
      }
    }
  } catch {
    // Apify optional
  }

  const seen = new Set<string>();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  return items
    .filter((i) => i.pubDate > thirtyDaysAgo)
    .filter(isRelevant)
    .filter((i) => {
      if (seen.has(i.link)) return false;
      seen.add(i.link);
      return true;
    })
    .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime())
    .slice(0, 25);
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startMs = Date.now();

  try {
    const [rawNews, seenUrls] = await Promise.all([
      fetchNews(),
      getSeenNewsletterArticleUrls().catch(() => new Set<string>()),
    ]);
    const news = rawNews.filter((item) => !seenUrls.has(item.link));

    if (news.length === 0) {
      return NextResponse.json({ message: "No new Permian submarket articles this month." });
    }

    const articleList = news
      .slice(0, 20)
      .map((a, i) => `${i + 1}. [${a.source}] ${a.title} (${a.pubDate.toLocaleDateString()})`)
      .join("\n");

    const msg = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 3000,
      messages: [
        {
          role: "user",
          content: `You are an industrial CRE market analyst for ERP Industrials. Write a Submarket Watch brief (4-5 paragraphs) covering the following news focused on the Permian Basin industrial market — Midland, Odessa, and surrounding West Texas.

Focus on:
1. Sale comparable transactions — what are assets trading at? Cap rates, price/SF, price/acre?
2. Tenant activity — who's leasing, expanding, contracting in Permian Basin industrial markets?
3. Submarket trends — vacancy, absorption, asking rents, any notable market shifts
4. OM implications — what does this month's activity mean for ERP's active Permian deals?

Articles:
${articleList}

Write with data density and specificity. Flag any market shifts that could affect OM pricing or demand driver narratives.`,
        },
      ],
    });

    const narrative = msg.content[0].type === "text" ? msg.content[0].text : "";

    const subject = `Permian Submarket Watch — ${new Date().toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    })}`;

    const narrativeHtml = narrative
      .split("\n\n")
      .map((p) => `<p style="line-height:1.7;color:#374151;margin:0 0 16px;">${p}</p>`)
      .join("");

    const articlesHtml = news
      .slice(0, 20)
      .map(
        (a) => `<tr>
          <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;vertical-align:top;">
            <a href="${a.link}" style="color:#1d4ed8;font-weight:500;text-decoration:none;">${a.title}</a>
            <div style="font-size:12px;color:#6b7280;margin-top:3px;">${a.source} &middot; ${a.pubDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
          </td>
        </tr>`
      )
      .join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" style="max-width:640px;background:#fff;border-radius:8px;overflow:hidden;">
      <tr><td style="background:#0f172a;padding:28px 32px;">
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#94a3b8;margin-bottom:6px;">ERP Industrials · Agent 1 · Submarket Watch</div>
        <div style="font-size:22px;font-weight:700;color:#fff;line-height:1.3;">${subject}</div>
        <div style="font-size:13px;color:#cbd5e1;margin-top:6px;">Sale comps &amp; tenant activity · Permian Basin Industrial</div>
      </td></tr>
      <tr><td style="padding:28px 32px;">
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#6b7280;margin-bottom:14px;">Market Narrative</div>
        ${narrativeHtml}
      </td></tr>
      <tr><td style="padding:0 32px;"><hr style="border:none;border-top:2px solid #e5e7eb;margin:0;"></td></tr>
      <tr><td style="padding:24px 32px;">
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#6b7280;margin-bottom:14px;">Articles This Month (${news.length})</div>
        <table width="100%" cellpadding="0" cellspacing="0">${articlesHtml}</table>
      </td></tr>
      <tr><td style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e5e7eb;text-align:center;">
        <div style="font-size:12px;color:#9ca3af;">ERP Funds AI Portal · Permian Submarket Watch · Monthly</div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

    await archiveBrief({ agentName: "permian-submarket-watch", subject, html, narrative, macro: {}, news });
    await sendBriefEmail({ subject, html });
    saveNewsletterToSharePoint({ market: "Permian", briefType: "Submarket Watch", htmlBody: html }).catch(() => {});
    logAgentRun({ agentId: "lp-intel", workflowId: "permian-submarket-watch", status: "success", summary: narrative.slice(0, 300), market: "permian", durationMs: Date.now() - startMs }).catch(() => {});

    return NextResponse.json({ success: true, articles: news.length, subject });
  } catch (error) {
    console.error("Permian Submarket Watch error:", error);
    logAgentRun({ agentId: "lp-intel", workflowId: "permian-submarket-watch", status: "error", market: "permian", durationMs: Date.now() - startMs, errorMessage: String(error) }).catch(() => {});
    return NextResponse.json({ error: "Permian Submarket Watch generation failed" }, { status: 500 });
  }
}
