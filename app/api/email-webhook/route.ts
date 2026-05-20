import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

import { routeEmail } from "@/lib/agents/router";
import { runResearchAgent } from "@/lib/agents/research";
import { saveToOneDrive, buildOneDriveFolder, buildFilename } from "@/lib/agents/file-handler";
import { sendReplyEmail } from "@/lib/agents/reply";
import { logResearchEntry } from "@/lib/db";
import { runMarketUpdateDigest } from "@/lib/agents/workflows/market-update-digest";
import { runLpReadySummary } from "@/lib/agents/workflows/lp-ready-summary";
import { runSubSectorDeepDive } from "@/lib/agents/workflows/sub-sector-deep-dive";
import { runSaleCompsPull } from "@/lib/agents/workflows/sale-comps-pull";
import { runSaveFileOnly } from "@/lib/agents/workflows/save-file-only";
import { runDeckBuilder } from "@/lib/agents/workflows/deck-builder";
import { runOmEditor } from "@/lib/agents/workflows/om-editor";
import { runOmWriter, detectSection } from "@/lib/agents/workflows/om-writer";
import type { ResearchBundle } from "@/lib/agents/research";

interface Attachment {
  filename: string;
  contentType: string;
  contentBase64: string;
}

interface EmailPayload {
  from: string;
  subject: string;
  body: string;
  attachments?: Attachment[];
}

// Power Automate posts to this endpoint with x-agent-secret header
function isAuthorized(req: NextRequest): boolean {
  const secret = req.headers.get("x-agent-secret");
  return !!process.env.AGENT_WEBHOOK_SECRET && secret === process.env.AGENT_WEBHOOK_SECRET;
}

function decodeAttachment(att: Attachment): string {
  try {
    return Buffer.from(att.contentBase64, "base64").toString("utf-8").slice(0, 8000);
  } catch {
    return `[Could not decode attachment: ${att.filename}]`;
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: EmailPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const { from, subject, body, attachments } = payload;

  // ── Step 1: Router Agent ──────────────────────────────────────────────────
  const route = await routeEmail({ from, subject, body });

  if ("error" in route) {
    if (route.error !== "unauthorized") {
      // Still try to reply if we know who to reply to
      await sendReplyEmail({
        to: from,
        originalSubject: subject,
        workflowId: "router",
        projectContext: "—",
        summary: route.message,
        isError: true,
      }).catch(() => {});
    }
    return NextResponse.json({ error: route.error, message: route.message }, { status: 400 });
  }

  const { prefix, workflowId, projectContext, ask } = route;

  // ── Step 2: Research Agent ────────────────────────────────────────────────
  // RESEARCH: workflows pull external data (except save-file-only)
  // WRITE: workflows also need research context
  const needsExternalResearch =
    (prefix === "RESEARCH" && workflowId !== "save-file-only") || prefix === "WRITE";

  let research: ResearchBundle | null = null;
  if (needsExternalResearch) {
    research = await runResearchAgent({ ask, projectContext, workflowId });
  }

  // ── Step 3: Workflow Agent ────────────────────────────────────────────────
  type AnyOutput = {
    summary: string;
    outputType: string;
    brief?: string;
    slideContent?: string;
    prose?: string;
    omContent?: string;
    section?: string;
  };
  let output: AnyOutput;

  try {
    switch (workflowId) {
      case "market-update-digest":
        output = await runMarketUpdateDigest({ ask, projectContext, research: research! });
        break;

      case "lp-ready-summary":
        output = await runLpReadySummary({ ask, projectContext, research: research! });
        break;

      case "sub-sector-deep-dive":
        output = await runSubSectorDeepDive({ ask, projectContext, research: research! });
        break;

      case "sale-comps-pull":
        output = await runSaleCompsPull({ ask, projectContext, research: research! });
        break;

      case "save-file-only":
        output = await runSaveFileOnly({ ask, projectContext, attachments });
        break;

      case "deck-builder": {
        const isEdit = /tighten|edit|update|revise|change/i.test(ask);
        output = await runDeckBuilder({
          ask,
          projectContext,
          researchFindings: research?.findings,
          attachmentContent: attachments?.[0] ? decodeAttachment(attachments[0]) : undefined,
          mode: isEdit ? "edit-existing" : "new-draft",
        });
        break;
      }

      case "om-editor": {
        const isInsert = /add|insert|append/i.test(ask);
        const isEdit = /edit|tighten|revise|update/i.test(ask);
        output = await runOmEditor({
          ask,
          projectContext,
          researchFindings: research?.findings,
          attachmentContent: attachments?.[0] ? decodeAttachment(attachments[0]) : undefined,
          mode: isInsert ? "insert-section" : isEdit ? "edit-existing" : "new-draft",
        });
        break;
      }

      case "om-writer": {
        const section = detectSection(ask);
        output = await runOmWriter({
          ask,
          projectContext,
          section,
          researchFindings: research?.findings,
          attachmentContent: attachments?.[0] ? decodeAttachment(attachments[0]) : undefined,
        });
        break;
      }

      default:
        output = {
          summary: `Workflow "${workflowId}" not yet implemented.`,
          outputType: "error",
        };
    }
  } catch (err) {
    const errMsg = `Workflow ${workflowId} failed: ${String(err)}`;
    await sendReplyEmail({
      to: from,
      originalSubject: subject,
      workflowId,
      projectContext,
      summary: errMsg,
      isError: true,
    }).catch(() => {});
    return NextResponse.json({ error: "workflow-failed", message: errMsg }, { status: 500 });
  }

  // ── Step 4: File Handler ──────────────────────────────────────────────────
  const outputContent =
    output.brief ?? output.slideContent ?? output.prose ?? output.omContent ?? output.summary;

  const folder = buildOneDriveFolder({ prefix, projectContext, workflowId });
  const filename = buildFilename({ projectContext, workflowId });

  const fileResult = await saveToOneDrive({ content: outputContent, filename, folder });

  // ── Step 5: Log to Vercel Postgres ────────────────────────────────────────
  await logResearchEntry({
    fromEmail: from,
    subject,
    prefix,
    workflowId,
    emailBody: body,
    outputSummary: output.summary,
    oneDriveUrl: fileResult.url,
    oneDriveVersion: fileResult.version,
    rawPayload: {
      ask,
      projectContext,
      researchQuery: research?.query ?? null,
      attachmentCount: attachments?.length ?? 0,
    },
  }).catch((err) => console.error("research_log insert failed:", err));

  // ── Step 6: Reply Agent ───────────────────────────────────────────────────
  // For filed-only, omit the content block — just confirm what was saved
  const emailOutputContent =
    output.outputType === "filed" ? null : outputContent?.slice(0, 3000) ?? null;

  await sendReplyEmail({
    to: from,
    originalSubject: subject,
    workflowId,
    projectContext,
    summary: output.summary,
    oneDriveUrl: fileResult.url,
    outputContent: emailOutputContent,
  }).catch((err) => console.error("[email-webhook] reply send failed:", err));

  return NextResponse.json({
    success: true,
    workflowId,
    projectContext,
    oneDriveUrl: fileResult.url,
    oneDriveSaved: fileResult.saved,
    summary: output.summary,
  });
}
