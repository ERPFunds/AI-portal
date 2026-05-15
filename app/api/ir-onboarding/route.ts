import { NextRequest, NextResponse } from "next/server";
import { runLpOnboarding } from "@/lib/agents/ir/lp-onboarding";
import { saveDraftToOutlook } from "@/lib/agents/ir/graph-mail";
import { saveToOneDrive, buildFilename } from "@/lib/agents/file-handler";
import { logIrEmailEntry } from "@/lib/db";

interface OnboardingPayload {
  lpName: string;
  entityName?: string;
  investmentAmount?: string;
  signedDate?: string;
  fundName?: string;
}

function isAuthorized(req: NextRequest): boolean {
  const secret = req.headers.get("x-agent-secret");
  return !!process.env.AGENT_WEBHOOK_SECRET && secret === process.env.AGENT_WEBHOOK_SECRET;
}

const MEGHAN_EMAIL = "mberry@erpfunds.com";

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: OnboardingPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const result = await runLpOnboarding(payload);

    // Save all three drafts to Meghan's Outlook for her review and send
    const draftResults = await Promise.all(
      result.emails.map((email) =>
        saveDraftToOutlook({
          toEmail: MEGHAN_EMAIL,
          mailboxEmail: MEGHAN_EMAIL,
          subject: `[DRAFT – Day ${email.day}] ${email.subject}`,
          htmlBody: email.htmlBody,
        })
      )
    );

    // Archive full sequence to OneDrive
    const folder = `/IR/Onboarding/${result.lpName.replace(/[^a-zA-Z0-9\s]/g, "").trim().replace(/\s+/g, "-")}`;
    const content = result.emails
      .map((e) => `=== Day ${e.day} ===\nSubject: ${e.subject}\n\n${e.htmlBody}`)
      .join("\n\n---\n\n");
    const filename = buildFilename({ projectContext: result.lpName, workflowId: "lp-onboarding" });
    const fileResult = await saveToOneDrive({ content, filename, folder });

    await logIrEmailEntry({
      fromEmail: "docusign-trigger",
      subject: `LP Onboarding: ${result.lpName}`,
      workflowId: "lp-onboarding",
      category: "onboarding",
      isEscalation: false,
      escalationReason: null,
      lpName: result.lpName,
      summary: result.summary,
      draftSaved: draftResults.every((d) => d.success),
      draftId: null,
    }).catch((e) => console.error("ir_email_log insert failed:", e));

    return NextResponse.json({
      success: true,
      lpName: result.lpName,
      emailsGenerated: result.emails.length,
      draftsInOutlook: draftResults.filter((d) => d.success).length,
      oneDriveUrl: fileResult.url,
      summary: result.summary,
    });
  } catch (err) {
    return NextResponse.json({ error: "onboarding-failed", message: String(err) }, { status: 500 });
  }
}
