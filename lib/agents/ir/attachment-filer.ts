import Anthropic from "@anthropic-ai/sdk";
import { saveToOneDrive } from "@/lib/agents/file-handler";

const client = new Anthropic();

export type AttachmentDocType =
  | "subscription-agreement"
  | "k1-tax"
  | "wire-confirmation"
  | "signed-agreement"
  | "investor-id"
  | "accreditation"
  | "correspondence"
  | "unknown";

export interface FiledAttachment {
  filename: string;
  docType: AttachmentDocType;
  lpName: string | null;
  folder: string;
  saved: boolean;
  url: string | null;
  message: string;
}

export interface AttachmentFilerOutput {
  filedItems: FiledAttachment[];
  summary: string;
  outputType: "filed";
}

async function classifyAttachment(params: {
  filename: string;
  from: string;
  subject: string;
  contentPreview: string;
}): Promise<{ docType: AttachmentDocType; lpName: string | null }> {
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    system: `Classify investor email attachments for an industrial real estate PE fund.
Return JSON only: { "docType": one of subscription-agreement|k1-tax|wire-confirmation|signed-agreement|investor-id|accreditation|correspondence|unknown, "lpName": string or null }`,
    messages: [
      {
        role: "user",
        content: `Filename: ${params.filename}
From: ${params.from}
Subject: ${params.subject}
Content preview: ${params.contentPreview.slice(0, 500)}`,
      },
    ],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "{}";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { docType: "unknown", lpName: null };
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return { docType: "unknown", lpName: null };
  }
}

function buildIrFolder(docType: AttachmentDocType, lpName: string | null): string {
  const lp = lpName
    ? lpName.replace(/[^a-zA-Z0-9\s]/g, "").trim().replace(/\s+/g, "-").slice(0, 30)
    : "Unknown-LP";
  switch (docType) {
    case "subscription-agreement": return `/IR/Subscriptions/${lp}`;
    case "k1-tax":                 return `/IR/Tax-Docs/${lp}`;
    case "wire-confirmation":      return `/IR/Wires/${lp}`;
    case "signed-agreement":       return `/IR/Agreements/${lp}`;
    case "investor-id":
    case "accreditation":          return `/IR/KYC/${lp}`;
    default:                       return `/IR/Correspondence/${lp}`;
  }
}

export async function runAttachmentFiler(params: {
  from: string;
  subject: string;
  attachments?: Array<{ filename: string; contentType: string; contentBase64: string }>;
}): Promise<AttachmentFilerOutput> {
  if (!params.attachments?.length) {
    return { filedItems: [], summary: "No attachments found in this email.", outputType: "filed" };
  }

  const filed: FiledAttachment[] = [];

  for (const att of params.attachments) {
    let contentPreview = "";
    try {
      contentPreview = Buffer.from(att.contentBase64, "base64").toString("utf-8").slice(0, 500);
    } catch {
      contentPreview = att.filename;
    }

    const { docType, lpName } = await classifyAttachment({
      filename: att.filename,
      from: params.from,
      subject: params.subject,
      contentPreview,
    });

    const folder = buildIrFolder(docType, lpName);
    const date = new Date().toISOString().split("T")[0];
    const filename = att.filename.includes(".") ? att.filename : `${att.filename}-${date}.txt`;

    let content: string;
    try {
      content = Buffer.from(att.contentBase64, "base64").toString("utf-8");
    } catch {
      content = `[Binary file: ${att.filename}]`;
    }

    const result = await saveToOneDrive({ content, filename, folder });
    filed.push({ filename: att.filename, docType, lpName, folder, saved: result.saved, url: result.url, message: result.message });
  }

  const savedCount = filed.filter((f) => f.saved).length;
  const summary = `Filed ${savedCount}/${filed.length} attachment(s) from ${params.from}: ${filed.map((f) => `${f.filename} → ${f.folder}`).join("; ")}`;

  return { filedItems: filed, summary, outputType: "filed" };
}
