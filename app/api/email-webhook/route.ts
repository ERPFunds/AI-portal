import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

import { routeEmail } from "@/lib/agents/router";
import { runResearchAgent } from "@/lib/agents/research";
import { saveToOneDrive, saveBufferToOneDrive, buildOneDriveFolder, buildFilename } from "@/lib/agents/file-handler";
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
import { runCompetitiveIntelXls } from "@/lib/agents/workflows/competitive-intel-xls";
import { runUpdateBuyerList } from "@/lib/agents/workflows/update-buyer-list";
import { runUpdatePipelineComps } from "@/lib/agents/workflows/update-pipeline-comps";
import { runUpdateCommitmentSchedule } from "@/lib/agents/workflows/update-commitment-schedule";
import type { ResearchBundle } from "@/lib/agents/research";
import { extractPptxText, extractPptText, extractOfficeFile } from "@/lib/agents/pptx-parser";

// Normalised attachment shape (PA uses name/contentBytes; direct posts use filename/contentBase64)
interface Attachment {
  filename: string;
  contentType: string;
  contentBase64: string;
}

// Raw shape Power Automate sends — field names differ from our internal interface
interface RawAttachment {
  filename?: string;
  name?: string;           // PA field
  contentType?: string;
  contentBase64?: string;
  contentBytes?: string;   // PA field
}

interface EmailPayload {
  from: string;
  subject: string;
  body: string;
  attachments?: RawAttachment[];
}

// Normalise PA field names → internal Attachment shape
function normaliseAttachment(raw: RawAttachment): Attachment {
  return {
    filename: raw.filename ?? raw.name ?? "attachment",
    contentType: raw.contentType ?? "application/octet-stream",
    contentBase64: raw.contentBase64 ?? raw.contentBytes ?? "",
  };
}

// Power Automate posts to this endpoint with x-agent-secret header
function isAuthorized(req: NextRequest): boolean {
  const secret = req.headers.get("x-agent-secret");
  return !!process.env.AGENT_WEBHOOK_SECRET && secret === process.env.AGENT_WEBHOOK_SECRET;
}

async function decodeAttachment(att: Attachment): Promise<string> {
  const name = att.filename.toLowerCase();

  // PowerPoint
  if (name.endsWith(".pptx")) {
    return extractPptxText(att.contentBase64);
  }
  if (name.endsWith(".ppt")) {
    return extractPptText(att.contentBase64);
  }

  // Excel, PDF, Word — all handled by officeparser
  if (
    name.endsWith(".xlsx") || name.endsWith(".xls") ||
    name.endsWith(".pdf") ||
    name.endsWith(".docx") || name.endsWith(".doc")
  ) {
    return extractOfficeFile(att.contentBase64, att.filename);
  }

  // Plain text fallback (.txt, .csv, .md, etc.)
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

  const { from, subject, body } = payload;
  // Normalise attachment field names (Power Automate uses name/contentBytes)
  const attachments: Attachment[] | undefined = payload.attachments?.map(normaliseAttachment);

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
    (prefix === "RESEARCH" && workflowId !== "save-file-only") ||
    prefix === "WRITE" ||
    workflowId === "competitive-intel-xls" ||
    workflowId === "update-buyer-list" ||
    workflowId === "update-pipeline-comps";

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
        const attachmentContent = attachments?.length
          ? (await Promise.all(attachments.map((a, i) => decodeAttachment(a).then((text) => `--- Document ${i + 1}: ${a.filename} ---\n${text}`))))
              .join("\n\n")
          : undefined;
        output = await runDeckBuilder({
          ask,
          projectContext,
          researchFindings: research?.findings,
          attachmentContent,
          mode: isEdit ? "edit-existing" : "new-draft",
        });
        break;
      }

      case "om-editor": {
        const isInsert = /add|insert|append/i.test(ask);
        const isEdit = /edit|tighten|revise|update/i.test(ask);
        const attachmentContent = attachments?.length
          ? (await Promise.all(attachments.map((a, i) => decodeAttachment(a).then((text) => `--- Document ${i + 1}: ${a.filename} ---\n${text}`))))
              .join("\n\n")
          : undefined;
        output = await runOmEditor({
          ask,
          projectContext,
          researchFindings: research?.findings,
          attachmentContent,
          mode: isInsert ? "insert-section" : isEdit ? "edit-existing" : "new-draft",
        });
        break;
      }

      case "om-writer": {
        const section = detectSection(ask);
        const attachmentContent = attachments?.length
          ? (await Promise.all(attachments.map((a, i) => decodeAttachment(a).then((text) => `--- Document ${i + 1}: ${a.filename} ---\n${text}`))))
              .join("\n\n")
          : undefined;
        output = await runOmWriter({
          ask,
          projectContext,
          section,
          researchFindings: research?.findings,
          attachmentContent,
        });
        break;
      }

      case "competitive-intel-xls": {
        const attachmentContent = attachments?.length
          ? (await Promise.all(attachments.map((a, i) => decodeAttachment(a).then((text) => `--- Document ${i + 1}: ${a.filename} ---\n${text}`))))
              .join("\n\n")
          : undefined;
        output = await runCompetitiveIntelXls({
          ask,
          projectContext,
          research,
          attachmentContent,
        });
        break;
      }

      case "update-buyer-list": {
        const attachmentContent = attachments?.length
          ? (await Promise.all(attachments.map((a, i) => decodeAttachment(a).then((text) => `--- Document ${i + 1}: ${a.filename} ---\n${text}`))))
              .join("\n\n")
          : undefined;
        output = await runUpdateBuyerList({
          ask,
          projectContext,
          research,
          attachmentContent,
        });
        break;
      }

      case "update-pipeline-comps": {
        const attachmentContent = attachments?.length
          ? (await Promise.all(attachments.map((a, i) => decodeAttachment(a).then((text) => `--- Document ${i + 1}: ${a.filename} ---\n${text}`))))
              .join("\n\n")
          : undefined;
        output = await runUpdatePipelineComps({
          ask,
          projectContext,
          research,
          attachmentContent,
        });
        break;
      }

      case "update-commitment-schedule": {
        const attachmentContent = attachments?.length
          ? (await Promise.all(attachments.map((a, i) => decodeAttachment(a).then((text) => `--- Document ${i + 1}: ${a.filename} ---\n${text}`))))
              .join("\n\n")
          : undefined;
        output = await runUpdateCommitmentSchedule({
          ask,
          projectContext,
          attachmentContent,
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

  // Workflows that write directly to SharePoint Excel files — no secondary .docx needed.
  // The Excel URL (if returned by the workflow) is used as the file link in the reply.
  const EXCEL_DIRECT_WORKFLOWS = new Set([
    "update-pipeline-comps",
    "update-buyer-list",
    "competitive-intel-xls",
    "update-commitment-schedule",
  ]);

  let fileResult: import("@/lib/agents/file-handler").FileHandlerResult;

  if (EXCEL_DIRECT_WORKFLOWS.has(workflowId)) {
    // Data already written to Excel — skip the secondary file save
    const xlsUrl = (output as { xlsUrl?: string }).xlsUrl ?? null;
    fileResult = {
      saved: true,
      url: xlsUrl,
      version: null,
      message: "Written directly to SharePoint Excel file.",
    };
  } else {
    const folder = buildOneDriveFolder({ prefix, projectContext, workflowId, ask });
    const filename = buildFilename({ projectContext, workflowId }); // already .pptx for deck-builder
    const pptxBuffer = (output as { pptxBuffer?: Buffer }).pptxBuffer;

    if (pptxBuffer) {
      // Upload the real binary .pptx
      fileResult = await saveBufferToOneDrive({
        buffer: pptxBuffer,
        filename,
        folder,
        contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      });
    } else if (workflowId === "deck-builder") {
      // pptxgenjs failed — save the text outline as a .txt so it's still accessible,
      // but name it .pptx so the link intent is clear
      console.error("[email-webhook] pptxBuffer missing for deck-builder — saving text fallback");
      fileResult = await saveToOneDrive({
        content: outputContent,
        filename: filename.replace(/\.pptx$/, "-outline.txt"),
        folder,
        contentType: "text/plain; charset=utf-8",
      });
    } else {
      fileResult = await saveToOneDrive({ content: outputContent, filename, folder });
    }
  }

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
  // Action workflows reply with a summary of what was done, not raw content.
  // Research/write workflows include the generated content block.
  const ACTION_OUTPUT_TYPES = new Set([
    "filed",
    "buyer-list",
    "pipeline-comps",
    "competitive-intel",
    "commitment",
    "deck",   // reply uses summary+changelog, not raw slide text
    "info",
    "error",
  ]);
  const emailOutputContent = ACTION_OUTPUT_TYPES.has(output.outputType)
    ? null
    : outputContent?.slice(0, 3000) ?? null;

  // If the file save failed, append the reason to the summary so it's visible in the reply
  const replySummary = fileResult.saved
    ? output.summary
    : `${output.summary}\n\n⚠️ File save failed: ${fileResult.message}`;

  await sendReplyEmail({
    to: from,
    originalSubject: subject,
    workflowId,
    projectContext,
    summary: replySummary,
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
