import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import Parser from "rss-parser";
import { ApifyClient } from "apify-client";
import { getGraphToken } from "@/lib/agents/graph-token";
import { runWeeklyMarketUpdate } from "@/lib/agents/workflows/weekly-market-update";
import { runSubmarketIntelligence } from "@/lib/agents/workflows/submarket-intelligence";
import { runCompetitorIntelligence } from "@/lib/agents/workflows/competitor-intelligence";
import { logAgentRun } from "@/lib/db";

export const maxDuration = 300;

const anthropic = new Anthropic();
const rssParser = new Parser();
const apify = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

const BASE_RECIPIENTS = ["mparad@erpfunds.com", "mberry@erpfunds.com", "wmeyer@erpfunds.com"];
const RECIPIENTS = process.env.OVERRIDE_EMAIL_RECIPIENT?.trim()
  ? [...new Set([...BASE_RECIPIENTS, process.env.OVERRIDE_EMAIL_RECIPIENT.trim()])]
  : BASE_RECIPIENTS;
const SENDER_MAILBOX = "mparad@erpfunds.com";

// ── Shared feeds ──────────────────────────────────────────────────────────────
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

// ── Keyword & query sets ──────────────────────────────────────────────────────
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

interface NewsItem {
  title: string;
  link: string;
  pubDate: Date;
  source: string;
  summary?: string;
}

function getWeekPeriod(): string {
  const now = new Date();
  return `Week of ${now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;
}

async function fetchNews(apifyQueries: string[], keywords: string[]): Promise<NewsItem[]> {
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
    .filter((i) => { const text = `${i.title} ${i.summary ?? ""}`.toLowerCase(); return keywords.some((kw) => text.includes(kw)); })
    .filter((i) => { if (seen.has(i.link)) return false; seen.add(i.link); return true; })
    .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime())
    .slice(0, 20);
}

function articlesToHtml(news: NewsItem[]): string {
  return news.map((a) =>
    `<tr><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;vertical-align:top;">
      <a href="${a.link}" style="color:#1d4ed8;font-weight:500;text-decoration:none;">${a.title}</a>
      <div style="font-size:12px;color:#6b7280;margin-top:3px;">${a.source} &middot; ${a.pubDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
    </td></tr>`
  ).join("");
}

// Shared outer HTML shell used for all merged briefs
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

// Visual divider between merged sections
const SECTION_DIVIDER = (label: string) =>
  `<div style="border-top:3px solid #0f172a;margin:36px 0 24px;padding-top:16px;">
    <p style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#0f172a;margin:0;">${label}</p>
  </div>`;

// ── Report generators ─────────────────────────────────────────────────────────

async function generateSubmarketBrief(period: string): Promise<{ subject: string; htmlBody: string; summary: string }> {
  // Deep dive from research agent
  const deepDive = await runSubmarketIntelligence({ market: "brevard", period });

  // News digest for this week
  const news = await fetchNews(SUBMARKET_QUERIES, SUBMARKET_KEYWORDS);
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
<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">${articlesToHtml(news)}</table>
`;
  }

  if (deepDive.sourcesLine) {
    newsSection += `<p style="font-size:11px;color:#94a3b8;line-height:1.8;margin:20px 0 0;">${deepDive.sourcesLine}</p>`;
  }

  const subject = `Space Coast Submarket Brief — ${period}`;
  const htmlBody = HTML_SHELL(
    subject,
    `Deep dive + weekly news digest · Brevard County / Space Coast`,
    deepDive.bodyContent + newsSection
  );

  return { subject, htmlBody, summary: deepDive.summary };
}

async function generateFundCompetitorBrief(period: string): Promise<{ subject: string; htmlBody: string; summary: string }> {
  // Structured competitor intelligence
  const compIntel = await runCompetitorIntelligence({ market: "brevard", period });

  // Fund landscape news digest
  const news = await fetchNews(FUND_QUERIES, FUND_KEYWORDS);
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
<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">${articlesToHtml(news)}</table>
`;
  }

  if (compIntel.sourcesLine) {
    fundSection += `<p style="font-size:11px;color:#94a3b8;line-height:1.8;margin:20px 0 0;">${compIntel.sourcesLine}</p>`;
  }

  const subject = `Space Coast Competitive & Fund Intelligence — ${period}`;
  const htmlBody = HTML_SHELL(
    subject,
    `Competitor tracker + fund landscape · Brevard County / Space Coast`,
    compIntel.bodyContent + fundSection
  );

  return { subject, htmlBody, summary: compIntel.summary };
}

// ── Email sender ──────────────────────────────────────────────────────────────

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

// ── Cron handler ──────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const period = getWeekPeriod();
  const market = "brevard";
  const results: Record<string, { success: boolean; subject?: string; error?: string }> = {};

  // ── 1. Weekly Market Update ───────────────────────────────────────────────
  try {
    const startMs = Date.now();
    const { subject, htmlBody, summary } = await runWeeklyMarketUpdate({ market, period });
    const emailResult = await sendEmailViaGraph({ subject, htmlBody });
    results["weekly-update"] = { success: emailResult.success, subject };
    logAgentRun({ agentId: "lp-intel", workflowId: "weekly-market-update", status: emailResult.success ? "success" : "error", summary, market, durationMs: Date.now() - startMs, errorMessage: emailResult.success ? undefined : emailResult.message }).catch(() => {});
  } catch (err) {
    results["weekly-update"] = { success: false, error: String(err) };
    console.error("[brevard-brief] weekly-update failed:", err);
  }

  // ── 2. Submarket Watch + Submarket Intelligence (merged) ──────────────────
  try {
    const startMs = Date.now();
    const { subject, htmlBody, summary } = await generateSubmarketBrief(period);
    const emailResult = await sendEmailViaGraph({ subject, htmlBody });
    results["submarket"] = { success: emailResult.success, subject };
    logAgentRun({ agentId: "lp-intel", workflowId: "submarket-brief", status: emailResult.success ? "success" : "error", summary, market, durationMs: Date.now() - startMs, errorMessage: emailResult.success ? undefined : emailResult.message }).catch(() => {});
  } catch (err) {
    results["submarket"] = { success: false, error: String(err) };
    console.error("[brevard-brief] submarket failed:", err);
  }

  // ── 3. Competitor Intelligence + Fund Landscape (merged) ──────────────────
  try {
    const startMs = Date.now();
    const { subject, htmlBody, summary } = await generateFundCompetitorBrief(period);
    const emailResult = await sendEmailViaGraph({ subject, htmlBody });
    results["fund-competitor"] = { success: emailResult.success, subject };
    logAgentRun({ agentId: "lp-intel", workflowId: "fund-competitor-brief", status: emailResult.success ? "success" : "error", summary, market, durationMs: Date.now() - startMs, errorMessage: emailResult.success ? undefined : emailResult.message }).catch(() => {});
  } catch (err) {
    results["fund-competitor"] = { success: false, error: String(err) };
    console.error("[brevard-brief] fund-competitor failed:", err);
  }

  const anySuccess = Object.values(results).some((r) => r.success);
  return NextResponse.json({ success: anySuccess, period, market, results });
}
