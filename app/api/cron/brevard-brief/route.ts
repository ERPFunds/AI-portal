import { NextResponse } from "next/server";
import { getGraphToken } from "@/lib/agents/graph-token";
import { generateBrevardMondayBrief, generateBrevardSubmarketBrief, generateBrevardFundCompetitorBrief } from "@/lib/agents/workflows/brevard-merged-briefs";
import { logAgentRun, getSeenNewsletterArticleUrls, recordNewsletterRun } from "@/lib/db";
import { saveNewsletterToSharePoint } from "@/lib/agents/file-handler";

export const maxDuration = 300;

const BASE_RECIPIENTS = ["mparad@erpfunds.com", "mberry@erpfunds.com", "wmeyer@erpfunds.com"];
const RECIPIENTS = process.env.OVERRIDE_EMAIL_RECIPIENT?.trim()
  ? [...new Set([...BASE_RECIPIENTS, process.env.OVERRIDE_EMAIL_RECIPIENT.trim()])]
  : BASE_RECIPIENTS;
const SENDER_MAILBOX = "mparad@erpfunds.com";

function getWeekPeriod(): string {
  const now = new Date();
  return `Week of ${now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;
}

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

  // Load this week's already-seen article URLs once. Articles are added to this
  // set after each brief so even within a single run there are no repeats.
  const seenUrls = await getSeenNewsletterArticleUrls().catch(() => new Set<string>());

  // ── 1. Monday Brief (weekly market update + live news digest) ─────────────
  try {
    const startMs = Date.now();
    const { subject, htmlBody, summary, newsItems } = await generateBrevardMondayBrief(period, { excludeUrls: seenUrls });
    const emailResult = await sendEmailViaGraph({ subject, htmlBody });
    saveNewsletterToSharePoint({ market: "Brevard", briefType: "Weekly Market Update", htmlBody }).catch(() => {});
    recordNewsletterRun({ agentName: "brevard-weekly", subject, articles: newsItems.map(n => ({ url: n.link, title: n.title, source: n.source, pubDate: n.pubDate })) }).catch(() => {});
    newsItems.forEach((n) => seenUrls.add(n.link));
    results["weekly-update"] = { success: emailResult.success, subject };
    logAgentRun({ agentId: "lp-intel", workflowId: "weekly-market-update", status: emailResult.success ? "success" : "error", summary, market, durationMs: Date.now() - startMs, errorMessage: emailResult.success ? undefined : emailResult.message }).catch(() => {});
  } catch (err) {
    results["weekly-update"] = { success: false, error: String(err) };
    console.error("[brevard-brief] weekly-update failed:", err);
  }

  // ── 2. Submarket Brief (deep dive + news digest) ──────────────────────────
  try {
    const startMs = Date.now();
    const { subject, htmlBody, summary, newsItems } = await generateBrevardSubmarketBrief(period, { excludeUrls: seenUrls });
    const emailResult = await sendEmailViaGraph({ subject, htmlBody });
    saveNewsletterToSharePoint({ market: "Brevard", briefType: "Submarket Intelligence", htmlBody }).catch(() => {});
    recordNewsletterRun({ agentName: "brevard-submarket", subject, articles: newsItems.map(n => ({ url: n.link, title: n.title, source: n.source, pubDate: n.pubDate })) }).catch(() => {});
    newsItems.forEach((n) => seenUrls.add(n.link));
    results["submarket"] = { success: emailResult.success, subject };
    logAgentRun({ agentId: "lp-intel", workflowId: "submarket-brief", status: emailResult.success ? "success" : "error", summary, market, durationMs: Date.now() - startMs, errorMessage: emailResult.success ? undefined : emailResult.message }).catch(() => {});
  } catch (err) {
    results["submarket"] = { success: false, error: String(err) };
    console.error("[brevard-brief] submarket failed:", err);
  }

  // ── 3. Competitive & Fund Brief (competitor intel + fund news) ────────────
  try {
    const startMs = Date.now();
    const { subject, htmlBody, summary, newsItems } = await generateBrevardFundCompetitorBrief(period, { excludeUrls: seenUrls });
    const emailResult = await sendEmailViaGraph({ subject, htmlBody });
    saveNewsletterToSharePoint({ market: "Brevard", briefType: "Competitive Intel", htmlBody }).catch(() => {});
    recordNewsletterRun({ agentName: "brevard-fund", subject, articles: newsItems.map(n => ({ url: n.link, title: n.title, source: n.source, pubDate: n.pubDate })) }).catch(() => {});
    newsItems.forEach((n) => seenUrls.add(n.link));
    results["fund-competitor"] = { success: emailResult.success, subject };
    logAgentRun({ agentId: "lp-intel", workflowId: "fund-competitor-brief", status: emailResult.success ? "success" : "error", summary, market, durationMs: Date.now() - startMs, errorMessage: emailResult.success ? undefined : emailResult.message }).catch(() => {});
  } catch (err) {
    results["fund-competitor"] = { success: false, error: String(err) };
    console.error("[brevard-brief] fund-competitor failed:", err);
  }

  const anySuccess = Object.values(results).some((r) => r.success);
  return NextResponse.json({ success: anySuccess, period, market, results });
}
