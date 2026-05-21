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

// ── Shared feeds used by both Submarket Watch and Fund Landscape ─────────────
const SHARED_FEEDS = [
  { url: "https://www.globest.com/feed/", source: "GlobeSt" },
  { url: "https://commercialobserver.com/feed/", source: "Commercial Observer" },
  { url: "https://credaily.com/feed/", source: "CRE Daily" },
  { url: "https://therealdeal.com/feed/", source: "The Real Deal" },
  { url: "https://bisnow.com/rss/south-florida", source: "Bisnow South Florida" },
  { url: "https://connectcre.com/feed/", source: "Connect CRE" },
  { url: "https://www.prnewswire.com/rss/news-releases-list.rss", source: "PR Newswire" },
  { url: "https://www.businesswire.com/rss/home", source: "Business Wire" },
];

// ── Brevard Submarket Watch ───────────────────────────────────────────────────
const BREVARD_SUBMARKET_QUERIES = [
  "Brevard County Florida industrial real estate 2025",
  "Space Coast Florida industrial warehouse lease sale",
  "Melbourne Florida industrial logistics flex space",
  "Titusville Palm Bay Cocoa industrial CRE",
  "Kennedy Space Center aerospace industrial real estate",
  "Florida I-95 industrial corridor East Orange County",
];

const BREVARD_SUBMARKET_KEYWORDS = [
  "brevard", "space coast", "melbourne florida", "titusville", "palm bay", "cocoa",
  "kennedy space center", "cape canaveral", "port canaveral",
  "florida industrial", "flex space florida", "logistics florida",
  "industrial outdoor storage", "service yard",
  "sale comp", "comparable", "absorption", "vacancy", "lease rate",
  "cap rate", "warehouse", "aerospace industrial", "defense contractor",
  "rockefeller group", "exeter", "greenpointe", "cabot",
];

// ── Brevard Fund Landscape ────────────────────────────────────────────────────
const BREVARD_FUND_QUERIES = [
  "Florida industrial CRE fund raise 2025",
  "Space Coast Florida industrial investment fund",
  "aerospace adjacent industrial real estate fund Florida",
  "EastGroup Properties Florida industrial acquisition",
  "Rockefeller Group Exeter GreenPointe Florida industrial fund",
  "industrial real estate fund IRR benchmarks LP 2025",
];

const BREVARD_FUND_KEYWORDS = [
  "fund raise", "fund launch", "capital raise", "equity raise",
  "private equity industrial", "industrial reit", "reit acquisition",
  "irr", "fund return", "distribution", "carried interest",
  "florida industrial fund", "space coast investment", "aerospace reit",
  "eastgroup", "exeter", "rockefeller group", "greenpointe",
  "prologis florida", "industrial fund florida",
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

async function fetchNews(apifyQueries: string[], keywords: string[], dateFilter: string): Promise<NewsItem[]> {
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
    const run = await apify.actor("apify/google-news-scraper").call({ queries: apifyQueries, maxResultsPerQuery: 15, dateFilter });
    const { items: apifyItems } = await apify.dataset(run.defaultDatasetId).listItems();
    for (const i of apifyItems as Record<string, unknown>[]) {
      if (i.url && i.title && i.publishedAt) {
        items.push({ title: String(i.title), link: String(i.url), pubDate: new Date(String(i.publishedAt)), source: String(i.source ?? "Google News"), summary: i.description ? String(i.description) : undefined });
      }
    }
  } catch { /* Apify optional */ }

  const seen = new Set<string>();
  const cutoff = new Date(Date.now() - (dateFilter === "week" ? 7 : 30) * 24 * 60 * 60 * 1000);

  return items
    .filter((i) => i.pubDate > cutoff)
    .filter((i) => {
      const text = `${i.title} ${i.summary ?? ""}`.toLowerCase();
      return keywords.some((kw) => text.includes(kw));
    })
    .filter((i) => { if (seen.has(i.link)) return false; seen.add(i.link); return true; })
    .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime())
    .slice(0, 25);
}

function buildEmailHtml(params: { headerLabel: string; subject: string; subtitle: string; narrativeHtml: string; articlesHtml: string; footerLabel: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" style="max-width:640px;background:#fff;border-radius:8px;overflow:hidden;">
      <tr><td style="background:#0f172a;padding:28px 32px;">
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#94a3b8;margin-bottom:6px;">${params.headerLabel}</div>
        <div style="font-size:22px;font-weight:700;color:#fff;line-height:1.3;">${params.subject}</div>
        <div style="font-size:13px;color:#cbd5e1;margin-top:6px;">${params.subtitle}</div>
      </td></tr>
      <tr><td style="padding:28px 32px;">${params.narrativeHtml}</td></tr>
      <tr><td style="padding:0 32px;"><hr style="border:none;border-top:2px solid #e5e7eb;margin:0;"></td></tr>
      <tr><td style="padding:24px 32px;">
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#6b7280;margin-bottom:14px;">Source Articles This Week</div>
        <table width="100%" cellpadding="0" cellspacing="0">${params.articlesHtml}</table>
      </td></tr>
      <tr><td style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e5e7eb;text-align:center;">
        <div style="font-size:12px;color:#9ca3af;">${params.footerLabel}</div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function articlesToHtml(news: NewsItem[]): string {
  return news.slice(0, 20).map((a) =>
    `<tr><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;vertical-align:top;">
      <a href="${a.link}" style="color:#1d4ed8;font-weight:500;text-decoration:none;">${a.title}</a>
      <div style="font-size:12px;color:#6b7280;margin-top:3px;">${a.source} &middot; ${a.pubDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
    </td></tr>`
  ).join("");
}

// ── Generators ────────────────────────────────────────────────────────────────

async function generateSubmatchWatch(period: string): Promise<{ subject: string; htmlBody: string }> {
  const news = await fetchNews(BREVARD_SUBMARKET_QUERIES, BREVARD_SUBMARKET_KEYWORDS, "week");
  const subject = `Space Coast Submarket Watch — ${period}`;

  if (news.length === 0) {
    return {
      subject,
      htmlBody: buildEmailHtml({
        headerLabel: "ERP Industrials · Agent 1 · Brevard / Space Coast",
        subject,
        subtitle: "Sale comps, tenant activity &amp; market shifts · Space Coast / Brevard County",
        narrativeHtml: `<p style="color:#94a3b8;font-style:italic;">No new Brevard / Space Coast industrial articles found this week.</p>`,
        articlesHtml: "",
        footerLabel: "ERP Funds AI Portal · Brevard Submarket Watch · Weekly",
      }),
    };
  }

  const articleList = news.slice(0, 20).map((a, i) => `${i + 1}. [${a.source}] ${a.title} (${a.pubDate.toLocaleDateString()})`).join("\n");

  const msg = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 3000,
    messages: [{
      role: "user",
      content: `You are an industrial CRE market analyst for ERP Funds, a Brevard County / Space Coast industrial investor. Write a Submarket Watch brief (4-5 paragraphs) based on the following news from this week.

Focus on:
1. Sale comparable transactions in Brevard County — what are assets trading at? Cap rates, price/SF, price/acre? Include data vintage in every figure (e.g. "5.8% cap rate, CoStar Jan 2026").
2. Tenant activity — who's leasing, expanding, or contracting? Name specific aerospace, defense, logistics, and flex tenants. 'SLB opened a 40k SF facility in Melbourne (Jan 2026)' is useful. 'Industrial demand is strong' is not.
3. Submarket trends — vacancy, absorption, asking rents for Brevard / Space Coast vs I-4 corridor. Flag the spread.
4. Local developer activity — any new permits, groundbreakings, or deliveries from Cuhaci & Peterson, Bravar Industrial, or local family offices.
5. OM implications — what does this week's activity mean for ERP's active Brevard deals?

Every statistic must include its source and date. Flag any market shifts affecting pricing or demand narratives.

Articles:
${articleList}`,
    }],
  });

  const narrative = msg.content[0].type === "text" ? msg.content[0].text : "";
  const narrativeHtml = narrative.split("\n\n").map((p) => `<p style="line-height:1.7;color:#374151;margin:0 0 16px;">${p}</p>`).join("");

  return {
    subject,
    htmlBody: buildEmailHtml({
      headerLabel: "ERP Industrials · Agent 1 · Brevard / Space Coast",
      subject,
      subtitle: "Sale comps, tenant activity &amp; market shifts · Space Coast / Brevard County",
      narrativeHtml,
      articlesHtml: articlesToHtml(news),
      footerLabel: "ERP Funds AI Portal · Brevard Submarket Watch · Weekly",
    }),
  };
}

async function generateFundLandscape(period: string): Promise<{ subject: string; htmlBody: string }> {
  const news = await fetchNews(BREVARD_FUND_QUERIES, BREVARD_FUND_KEYWORDS, "week");
  const subject = `Space Coast Fund Landscape — ${period}`;

  if (news.length === 0) {
    return {
      subject,
      htmlBody: buildEmailHtml({
        headerLabel: "ERP Industrials · Agent 1 · Brevard / Space Coast",
        subject,
        subtitle: "Competitor activity, LP appetite &amp; fund benchmarks · Florida Industrial",
        narrativeHtml: `<p style="color:#94a3b8;font-style:italic;">No new fund landscape articles found for Florida / Space Coast industrial this week.</p>`,
        articlesHtml: "",
        footerLabel: "ERP Funds AI Portal · Brevard Fund Landscape · Weekly",
      }),
    };
  }

  const articleList = news.slice(0, 20).map((a, i) => `${i + 1}. [${a.source}] ${a.title} (${a.pubDate.toLocaleDateString()})`).join("\n");

  const msg = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 3500,
    messages: [{
      role: "user",
      content: `You are a competitive intelligence analyst for ERP Funds, a Brevard County / Space Coast industrial CRE fund. Write a Fund Landscape Brief (4-5 paragraphs) based on the following news from this week.

Focus on:
1. Florida industrial competitor fund activity — who is raising capital, who closed, fund sizes, target returns. Name specific firms: Rockefeller Group, Exeter, Cabot/Centerbridge, GreenPointe, EastGroup.
2. LP appetite signals for Florida / Space Coast industrial — what asset types and markets are attracting institutional capital? Flex, R&D, logistics, aerospace-adjacent?
3. Fund benchmarks — what are institutional LPs expecting from Florida industrial CRE funds? (Target IRR, equity multiples, fee structures, fund terms.)
4. Competitive positioning — how does ERP's Brevard / Space Coast strategy compare to what Florida-active players are doing? What is ERP's differentiated angle for LPs?
5. Any signals affecting ERP's LP fundraising pitch — cap rate trends, occupancy data, macro tailwinds from Space Force / NASA / defense spending.

Include data vintage on every figure (e.g. "7.2% target IRR, PERE Q4 2025"). Frame analysis for Meghan preparing LP meetings. Be specific; flag intelligence gaps honestly.

Articles:
${articleList}`,
    }],
  });

  const narrative = msg.content[0].type === "text" ? msg.content[0].text : "";
  const narrativeHtml = narrative.split("\n\n").map((p) => `<p style="line-height:1.7;color:#374151;margin:0 0 16px;">${p}</p>`).join("");

  return {
    subject,
    htmlBody: buildEmailHtml({
      headerLabel: "ERP Industrials · Agent 1 · Brevard / Space Coast",
      subject,
      subtitle: "Competitor activity, LP appetite &amp; fund benchmarks · Florida Industrial",
      narrativeHtml,
      articlesHtml: articlesToHtml(news),
      footerLabel: "ERP Funds AI Portal · Brevard Fund Landscape · Weekly",
    }),
  };
}

// ── Cron Handler ──────────────────────────────────────────────────────────────

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

  // ── 2. Submarket Intelligence ─────────────────────────────────────────────
  try {
    const startMs = Date.now();
    const { subject, htmlBody, summary } = await runSubmarketIntelligence({ market, period });
    const emailResult = await sendEmailViaGraph({ subject, htmlBody });
    results["submarket-intelligence"] = { success: emailResult.success, subject };
    logAgentRun({ agentId: "lp-intel", workflowId: "submarket-intelligence", status: emailResult.success ? "success" : "error", summary, market, durationMs: Date.now() - startMs, errorMessage: emailResult.success ? undefined : emailResult.message }).catch(() => {});
  } catch (err) {
    results["submarket-intelligence"] = { success: false, error: String(err) };
    console.error("[brevard-brief] submarket-intelligence failed:", err);
  }

  // ── 3. Competitor Intelligence ────────────────────────────────────────────
  try {
    const startMs = Date.now();
    const { subject, htmlBody, summary } = await runCompetitorIntelligence({ market, period });
    const emailResult = await sendEmailViaGraph({ subject, htmlBody });
    results["competitor-intelligence"] = { success: emailResult.success, subject };
    logAgentRun({ agentId: "lp-intel", workflowId: "competitor-intelligence", status: emailResult.success ? "success" : "error", summary, market, durationMs: Date.now() - startMs, errorMessage: emailResult.success ? undefined : emailResult.message }).catch(() => {});
  } catch (err) {
    results["competitor-intelligence"] = { success: false, error: String(err) };
    console.error("[brevard-brief] competitor-intelligence failed:", err);
  }

  // ── 4. Submarket Watch (news digest) ─────────────────────────────────────
  try {
    const startMs = Date.now();
    const { subject, htmlBody } = await generateSubmatchWatch(period);
    const emailResult = await sendEmailViaGraph({ subject, htmlBody });
    results["submarket-watch"] = { success: emailResult.success, subject };
    logAgentRun({ agentId: "lp-intel", workflowId: "submarket-watch", status: emailResult.success ? "success" : "error", summary: subject, market, durationMs: Date.now() - startMs, errorMessage: emailResult.success ? undefined : emailResult.message }).catch(() => {});
  } catch (err) {
    results["submarket-watch"] = { success: false, error: String(err) };
    console.error("[brevard-brief] submarket-watch failed:", err);
  }

  // ── 5. Fund Landscape ─────────────────────────────────────────────────────
  try {
    const startMs = Date.now();
    const { subject, htmlBody } = await generateFundLandscape(period);
    const emailResult = await sendEmailViaGraph({ subject, htmlBody });
    results["fund-landscape"] = { success: emailResult.success, subject };
    logAgentRun({ agentId: "lp-intel", workflowId: "fund-landscape", status: emailResult.success ? "success" : "error", summary: subject, market, durationMs: Date.now() - startMs, errorMessage: emailResult.success ? undefined : emailResult.message }).catch(() => {});
  } catch (err) {
    results["fund-landscape"] = { success: false, error: String(err) };
    console.error("[brevard-brief] fund-landscape failed:", err);
  }

  const anySuccess = Object.values(results).some((r) => r.success);
  return NextResponse.json({ success: anySuccess, period, market, results });
}
