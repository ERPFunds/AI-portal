import { NextRequest, NextResponse } from "next/server";
import { classifyInvestorEmail } from "@/lib/agents/ir/email-classifier";
import { runAttachmentFiler } from "@/lib/agents/ir/attachment-filer";
import { runDialogueLogger } from "@/lib/agents/ir/dialogue-logger";
import { saveDraftToOutlook } from "@/lib/agents/ir/graph-mail";
import { saveToOneDrive, buildFilename } from "@/lib/agents/file-handler";
import { logIrEmailEntry, logDialogueEntry } from "@/lib/db";

interface Attachment {
  filename: string;
  contentType: string;
  contentBase64: string;
}

interface IrEmailPayload {
  from: string;
  subject: string;
  body: string;
  workflowId: "email-escalation" | "attachment-filer" | "dialogue-logger";
  attachments?: Attachment[];
}

function isAuthorized(req: NextRequest): boolean {
  const secret = req.headers.get("x-agent-secret");
  return !!process.env.AGENT_WEBHOOK_SECRET && secret === process.env.AGENT_WEBHOOK_SECRET;
}

function decodeAttachment(att: Attachment): string {
  try {
    return Buffer.from(att.contentBase64, "base64").toString("utf-8").slice(0, 8000);
  } catch {
    return `[Could not decode: ${att.filename}]`;
  }
}

const MEGHAN_EMAIL = "mberry@erpfunds.com";

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: IrEmailPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { from, subject, body, workflowId, attachments } = payload;

  try {
    switch (workflowId) {
      case "email-escalation": {
        const classification = await classifyInvestorEmail({ from, subject, body });

        // Save draft to Meghan's Outlook — never auto-send
        let draftResult = { success: false, draftId: null as string | null, message: "Skipped (escalation)" };
        if (!classification.isEscalation) {
          draftResult = await saveDraftToOutlook({
            toEmail: from,
            mailboxEmail: MEGHAN_EMAIL,
            subject: classification.draftSubject,
            htmlBody: classification.draftHtml,
          });
        }

        await logIrEmailEntry({
          fromEmail: from,
          subject,
          workflowId: "email-escalation",
          category: classification.category,
          isEscalation: classification.isEscalation,
          escalationReason: classification.escalationReason,
          lpName: classification.lpName,
          summary: classification.summary,
          draftSaved: draftResult.success,
          draftId: draftResult.draftId,
        }).catch((e) => console.error("ir_email_log insert failed:", e));

        return NextResponse.json({
          success: true,
          workflowId,
          category: classification.category,
          isEscalation: classification.isEscalation,
          escalationReason: classification.escalationReason ?? null,
          draftSaved: draftResult.success,
          summary: classification.summary,
        });
      }

      case "attachment-filer": {
        const result = await runAttachmentFiler({ from, subject, attachments });

        await logIrEmailEntry({
          fromEmail: from,
          subject,
          workflowId: "attachment-filer",
          category: "attachment",
          isEscalation: false,
          escalationReason: null,
          lpName: result.filedItems[0]?.lpName ?? null,
          summary: result.summary,
          draftSaved: false,
          draftId: null,
        }).catch((e) => console.error("ir_email_log insert failed:", e));

        return NextResponse.json({
          success: true,
          workflowId,
          filedCount: result.filedItems.filter((f) => f.saved).length,
          summary: result.summary,
        });
      }

      case "dialogue-logger": {
        const attachmentContent = attachments?.[0] ? decodeAttachment(attachments[0]) : undefined;
        const result = await runDialogueLogger({ from, subject, body, attachmentContent });

        const folder = `/IR/Dialogue-Log/${new Date().getFullYear()}`;
        const filename = buildFilename({ projectContext: result.entry.lpName, workflowId: "dialogue-log" });
        const fileResult = await saveToOneDrive({
          content: JSON.stringify(result.entry, null, 2),
          filename,
          folder,
        });

        await logDialogueEntry({
          fromEmail: from,
          lpName: result.entry.lpName,
          meetingDate: result.entry.meetingDate,
          medium: result.entry.medium,
          interestLevel: result.entry.interestLevel,
          stickingPoints: result.entry.stickingPoints,
          followUpCommitments: result.entry.followUpCommitments,
          relationshipContext: result.entry.relationshipContext,
          nextTouchSuggestion: result.entry.nextTouchSuggestion,
          oneDriveUrl: fileResult.url,
        }).catch((e) => console.error("ir_dialogue_log insert failed:", e));

        return NextResponse.json({
          success: true,
          workflowId,
          lpName: result.entry.lpName,
          interestLevel: result.entry.interestLevel,
          oneDriveUrl: fileResult.url,
          summary: result.summary,
        });
      }

      default:
        return NextResponse.json({ error: `Unknown workflowId: ${workflowId}` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: "workflow-failed", message: String(err) }, { status: 500 });
  }
}
