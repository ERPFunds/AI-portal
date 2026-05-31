import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import Parser from "rss-parser";
import { ApifyClient } from "apify-client";
import { archiveBrief, getSeenNewsletterArticleUrls, logAgentRun } from "@/lib/db";
import { getGraphToken } from "@/lib/agents/graph-token";
import { saveNewsletterToSharePoint } from "@/lib/agents/file-handler";

export const maxDuration = 300;

const anthropic = new Anthropic();
const parser = new Parser();
const apify = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

const BASE_RECIPIENTS = ["mparad@erpfunds.com", "mberry@erpfunds.com", "wmeyer@erpfunds.com", "bberry@erpfunds.com"];
const RECIPIENTS = process.env.OVERRIDE_EMAIL_RECIPIENT?.trim()
  ? [...new Set([...BASE_RECIPIENTS, process.env.OVERRIDE_EMAIL_RECIPIENT.trim()])]
  : BASE_RECIPIENTS;
const SENDER_MAILBOX = "team@erpfunds.com";

async function sendEmailViaGraph(params: { subject: string; htmlBody: string }): Promise<{ success: boolean; message: string }> {
  let token: string | null;
  try {
    token = await getGraphToken();
  } catch (err) {
    return { success: false, message: `Auth failed: ${String(err)}` };
  }
  if (!token) return { success: false, message: "AZURE credentials not configured" };

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(SENDER_MAILBOX)}/sendMail`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: params.subject,
          body: { contentType: "HTML", content: params.htmlBody },
          toRecipients: RECIPIENTS.map((address) => ({ emailAddress: { address } })),
        },
        saveToSentItems: true,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    return { success: false, message: `Graph API ${res.status}: ${err}` };
  }
  return { success: true, message: `Sent to ${RECIPIENTS.join(", ")}` };
}

const FUND_FEEDS = [
  { url: "https://pere.privateequityinternational.com/feed/", source: "PERE / IPE Real Assets" },
  { url: "https://www.prnewswire.com/rss/news-releases-list.rss", source: "PR Newswire" },
  { url: "https://www.businesswire.com/rss/home", source: "Business Wire" },
  { url: "https://therealdeal.com/feed/", source: "The Real Deal" },
  { url: "https://www.globest.com/feed/", source: "GlobeSt" },
];

const FUND_APIFY_QUERIES = [
  "industrial CRE private equity fund raise 2025",
  "industrial outdoor storage fund acquisition 2025",
  "Florida industrial REIT acquisition fund 2025",
  "industrial real estate fund benchmarks IRR 2025",
  "EQT Blackstone Prologis industrial fund raise",
];

const FUND_KEYWORDS = [
  "fund raise", "fund launch", "capital raise", "equity raise",
  "private equity industrial", "industrial reit", "reit acquisition",
  "irr", "fund return", "distribution", "carried interest",
  "industrial fund", "eim", "benchmark", "fund iv", "fund v",
  "prologis", "blackstone real estate", "eqt", "nuveen", "ares industrial",
  "istar", "link logistics", "duke realty", "logistics reit",
];

interface NewsItem {
  title: string;
  link: string;
  pubDate: Date;
  source: string;
  summary?: string;
}

function isFundRelevant(item: NewsItem): boolean {
  const text = `${item.title} ${item.summary ?? ""}`.toLowerCase();
  return FUND_KEYWORDS.some((kw) => text.includes(kw));
}

async function fetchFundNews(): Promise<NewsItem[]> {
  const items: NewsItem[] = [];

  await Promise.allSettled(
    FUND_FEEDS.map(async ({ url, source }) => {
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
        // skip
      }
    })
  );

  try {
    const run = await apify.actor("apify/google-news-scraper").call({
      queries: FUND_APIFY_QUERIES,
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
    .filter(isFundRelevant)
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
      fetchFundNews(),
      getSeenNewsletterArticleUrls().catch(() => new Set<string>()),
    ]);
    const news = rawNews.filter((item) => !seenUrls.has(item.link));

    if (news.length === 0) {
      return NextResponse.json({ message: "No new fund landscape articles this week." });
    }

    const articleList = news
      .slice(0, 20)
      .map((a, i) => `${i + 1}. [${a.source}] ${a.title} (${a.pubDate.toLocaleDateString()})`)
      .join("\n");

    const msg = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 3500,
      messages: [
        {
          role: "user",
          content: `You are a competitive intelligence analyst for ERP Industrials, an industrial CRE fund with assets in Florida (Brevard County / Space Coast). Write a Fund Landscape Brief (4-6 paragraphs) based on the following recent news.

Focus on:
1. Competitor fund activity â€” who's raising, who closed, fund sizes, target IRRs
2. Fund benchmarks â€” what are institutional investors expecting from industrial CRE funds? (IRR, equity multiples, fee structures)
3. Competitive positioning â€” how does ERP's Fund IV strategy compare to what larger players are doing?
4. LP appetite signals â€” what asset types and markets are attracting capital right now?
5. Any market shifts that could affect ERP's Fund IV fundraising pitch

Articles:
${articleList}

Be specific about fund names, sizes, and metrics where available. Flag intelligence gaps honestly. Frame the analysis for Meghan (head of fundraising) preparing LP meetings.`,
        },
      ],
    });

    const narrative = msg.content[0].type === "text" ? msg.content[0].text : "";

    const subject = `Brevard Fund Landscape Brief â€” ${new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
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
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#94a3b8;margin-bottom:6px;">ERP Industrials Â· Agent 1 Â· Fund Landscape Brief</div>
        <div style="font-size:22px;font-weight:700;color:#fff;line-height:1.3;">${subject}</div>
        <div style="font-size:13px;color:#cbd5e1;margin-top:6px;">Competitor activity &amp; fund benchmarks Â· Florida Industrial</div>
      </td></tr>
      <tr><td style="padding:28px 32px;">
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#6b7280;margin-bottom:14px;">Landscape Brief</div>
        ${narrativeHtml}
      </td></tr>
      <tr><td style="padding:0 32px;"><hr style="border:none;border-top:2px solid #e5e7eb;margin:0;"></td></tr>
      <tr><td style="padding:24px 32px;">
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#6b7280;margin-bottom:14px;">Source Articles (${news.length})</div>
        <table width="100%" cellpadding="0" cellspacing="0">${articlesHtml}</table>
      </td></tr>
      <tr><td style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e5e7eb;text-align:center;">
        <div style="font-size:12px;color:#9ca3af;">ERP Funds AI Portal Â· Brevard Fund Landscape Brief Â· Weekly</div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

    archiveBrief({ agentName: "brevard-fund-landscape", subject, html, narrative, macro: {}, news }).catch(() => {});
    const emailResult = await sendEmailViaGraph({ subject, htmlBody: html });
    saveNewsletterToSharePoint({ market: "Brevard", briefType: "Fund Landscape", htmlBody: html }).catch(() => {});
    logAgentRun({ agentId: "lp-intel", workflowId: "brevard-fund-landscape", status: emailResult.success ? "success" : "error", summary: narrative.slice(0, 300), market: "brevard", durationMs: Date.now() - startMs, errorMessage: emailResult.success ? undefined : emailResult.message }).catch(() => {});

    return NextResponse.json({ success: emailResult.success, articles: news.length, subject });
  } catch (error) {
    console.error("Brevard Fund Landscape Brief error:", error);
    logAgentRun({ agentId: "lp-intel", workflowId: "brevard-fund-landscape", status: "error", market: "brevard", durationMs: Date.now() - startMs, errorMessage: String(error) }).catch(() => {});
    return NextResponse.json({ error: "Brevard Fund Landscape Brief generation failed" }, { status: 500 });
  }
}
