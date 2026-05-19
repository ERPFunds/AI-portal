import { NextRequest, NextResponse } from "next/server";
import { getGraphToken } from "@/lib/agents/graph-token";
import { runCompetitorIntelligence } from "@/lib/agents/workflows/competitor-intelligence";
import { runWeeklyMarketUpdate } from "@/lib/agents/workflows/weekly-market-update";
import { runSubmarketIntelligence } from "@/lib/agents/workflows/submarket-intelligence";
import { logAgentRun } from "@/lib/db";

type Market = "permian" | "brevard";
type ReportType = "weekly-update" | "submarket-intelligence" | "competitor-intelligence";

interface SendBriefPayload {
  market: Market;
  reportType: ReportType;
}

const RECIPIENTS = process.env.OVERRIDE_EMAIL_RECIPIENT
  ? [process.env.OVERRIDE_EMAIL_RECIPIENT]
  : ["mberry@erpfunds.com", "wmeyer@erpfunds.com"];
const SENDER_MAILBOX = "mberry@erpfunds.com";

function isAuthorized(req: NextRequest): boolean {
  const secret = req.headers.get("x-agent-secret");
  return !!process.env.AGENT_WEBHOOK_SECRET && secret === process.env.AGENT_WEBHOOK_SECRET;
}

function getCurrentPeriod(): string {
  const now = new Date();
  return now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

async function sendEmailViaGraph(params: {
  subject: string;
  htmlBody: string;
  toAddresses: string[];
  mailboxEmail: string;
}): Promise<{ success: boolean; message: string }> {
  let token: string | null;
  try {
    token = await getGraphToken();
  } catch (err) {
    return { success: false, message: `Auth failed: ${String(err)}` };
  }

  if (!token) {
    return { success: false, message: "AZURE credentials not configured" };
  }

  const toRecipients = params.toAddresses.map((address) => ({
    emailAddress: { address },
  }));

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(params.mailboxEmail)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject: params.subject,
          body: { contentType: "HTML", content: params.htmlBody },
          toRecipients,
        },
        saveToSentItems: true,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    return { success: false, message: `Graph API ${res.status}: ${err}` };
  }

  // sendMail returns 202 with no body
  return { success: true, message: `Email sent to ${params.toAddresses.join(", ")}` };
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: SendBriefPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const { market, reportType } = payload;

  if (!market || !["permian", "brevard"].includes(market)) {
    return NextResponse.json(
      { error: "Invalid market. Must be 'permian' or 'brevard'." },
      { status: 400 }
    );
  }

  if (
    !reportType ||
    !["weekly-update", "submarket-intelligence", "competitor-intelligence"].includes(reportType)
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid reportType. Must be 'weekly-update', 'submarket-intelligence', or 'competitor-intelligence'.",
      },
      { status: 400 }
    );
  }

  const period = getCurrentPeriod();
  const workflowId = reportType === "weekly-update" ? "weekly-market-update" : reportType;
  const startMs = Date.now();

  let subject: string;
  let htmlBody: string;
  let summary: string;

  try {
    if (reportType === "competitor-intelligence") {
      const result = await runCompetitorIntelligence({ market, period });
      subject = result.subject;
      htmlBody = result.htmlBody;
      summary = result.summary;
    } else if (reportType === "weekly-update") {
      const result = await runWeeklyMarketUpdate({ market, period });
      subject = result.subject;
      htmlBody = result.htmlBody;
      summary = result.summary;
    } else {
      const result = await runSubmarketIntelligence({ market, period });
      subject = result.subject;
      htmlBody = result.htmlBody;
      summary = result.summary;
    }
  } catch (err) {
    logAgentRun({ agentId: "lp-intel", workflowId, status: "error", market, durationMs: Date.now() - startMs, errorMessage: String(err) }).catch(() => {});
    return NextResponse.json(
      { error: "workflow-failed", message: String(err) },
      { status: 500 }
    );
  }

  const emailResult = await sendEmailViaGraph({
    subject,
    htmlBody,
    toAddresses: RECIPIENTS,
    mailboxEmail: SENDER_MAILBOX,
  });

  if (!emailResult.success) {
    logAgentRun({ agentId: "lp-intel", workflowId, status: "error", market, durationMs: Date.now() - startMs, errorMessage: emailResult.message }).catch(() => {});
    return NextResponse.json(
      { error: "email-send-failed", message: emailResult.message },
      { status: 500 }
    );
  }

  logAgentRun({ agentId: "lp-intel", workflowId, status: "success", summary, market, durationMs: Date.now() - startMs }).catch(() => {});

  return NextResponse.json({
    success: true,
    market,
    reportType,
    subject,
    summary,
    recipients: RECIPIENTS,
    testMode: !!process.env.OVERRIDE_EMAIL_RECIPIENT,
  });
}
