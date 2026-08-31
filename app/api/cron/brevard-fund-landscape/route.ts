import { NextResponse } from "next/server";
import { getGraphToken } from "@/lib/agents/graph-token";
import { generateBrevardFundCompetitorBrief } from "@/lib/agents/workflows/brevard-merged-briefs";
import { logAgentRun, getSeenNewsletterArticleUrls, archiveBrief } from "@/lib/db";
import { saveNewsletterToSharePoint } from "@/lib/agents/file-handler";

export const maxDuration = 300;

const BASE_RECIPIENTS = ["mparad@erpfunds.com", "mberry@erpfunds.com", "wmeyer@erpfunds.com", "bberry@erpfunds.com"];
const RECIPIENTS = process.env.OVERRIDE_EMAIL_RECIPIENT?.trim()
  ? [...new Set([...BASE_RECIPIENTS, process.env.OVERRIDE_EMAIL_RECIPIENT.trim()])]
  : BASE_RECIPIENTS;
const SENDER_MAILBOX = "mparad@erpfunds.com";

function getWeekPeriod(): string {
  const now = new Date();
  return now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
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
  const seenUrls = await getSeenNewsletterArticleUrls("brevard-fund-landscape").catch(() => new Set<string>());

  try {
    const startMs = Date.now();
    const { subject, htmlBody, summary, newsItems } = await generateBrevardFundCompetitorBrief(period, { excludeUrls: seenUrls });
    const emailResult = await sendEmailViaGraph({ subject, htmlBody });
    await saveNewsletterToSharePoint({ market: "Brevard", briefType: "Fund Landscape", htmlBody }).catch(() => {});
    await archiveBrief({ agentName: "brevard-fund-landscape", subject, html: htmlBody, narrative: summary, macro: {}, news: newsItems }).catch(() => {});
    await logAgentRun({ agentId: "lp-intel", workflowId: "brevard-fund-landscape", status: emailResult.success ? "success" : "error", summary, market: "brevard", durationMs: Date.now() - startMs, errorMessage: emailResult.success ? undefined : emailResult.message }).catch(() => {});
    return NextResponse.json({ success: emailResult.success, period, articles: newsItems.length, subject });
  } catch (err) {
    console.error("[brevard-fund-landscape] failed:", err);
    await logAgentRun({ agentId: "lp-intel", workflowId: "brevard-fund-landscape", status: "error", market: "brevard", errorMessage: String(err) }).catch(() => {});
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
