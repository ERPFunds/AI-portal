import { NextRequest, NextResponse } from "next/server";
import { runReportFormatter, runReportEmailDrafter, type ReportType } from "@/lib/agents/ir/report-formatter";
import { saveDraftToOutlook } from "@/lib/agents/ir/graph-mail";
import { saveToOneDrive, buildFilename } from "@/lib/agents/file-handler";

interface ReportPayload {
  rawContent: string;
  reportType: ReportType;
  period: string;
  fundName?: string;
  draftEmail?: boolean;
}

function isAuthorized(req: NextRequest): boolean {
  const secret = req.headers.get("x-agent-secret");
  return !!process.env.AGENT_WEBHOOK_SECRET && secret === process.env.AGENT_WEBHOOK_SECRET;
}

const MEGHAN_EMAIL = "mberry@erpfunds.com";
// IR drafts are stored in the shared team hub so they surface in the portal Agent Inbox.
const TEAM_INBOX = "team@erpfunds.com";

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: ReportPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const report = await runReportFormatter({
      rawContent: payload.rawContent,
      reportType: payload.reportType,
      period: payload.period,
      fundName: payload.fundName,
    });

    const folder = payload.reportType === "dst-monthly"
      ? `/IR/DST-Reports/${payload.period}`
      : `/IR/Quarterly-Reports/${payload.period}`;
    const filename = buildFilename({ projectContext: payload.period, workflowId: payload.reportType });
    const fileResult = await saveToOneDrive({ content: report.formattedReport, filename, folder });

    let emailDraftResult: { subject: string; summary: string } | null = null;
    if (payload.draftEmail) {
      const emailDraft = await runReportEmailDrafter({
        formattedReport: report.formattedReport,
        period: payload.period,
        reportType: payload.reportType,
        fundName: payload.fundName,
      });

      await saveDraftToOutlook({
        toEmail: MEGHAN_EMAIL,
        mailboxEmail: TEAM_INBOX,
        subject: `[DRAFT] ${emailDraft.subject}`,
        htmlBody: emailDraft.htmlBody,
      });

      emailDraftResult = { subject: emailDraft.subject, summary: emailDraft.summary };
    }

    return NextResponse.json({
      success: true,
      reportType: payload.reportType,
      period: payload.period,
      oneDriveUrl: fileResult.url,
      emailDraft: emailDraftResult,
      summary: report.summary,
    });
  } catch (err) {
    return NextResponse.json({ error: "report-failed", message: String(err) }, { status: 500 });
  }
}
