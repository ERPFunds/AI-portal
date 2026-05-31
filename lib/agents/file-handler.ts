export interface FileHandlerResult {
  url: string | null;
  version: string | null;
  saved: boolean;
  message: string;
}

import { getGraphToken } from "@/lib/agents/graph-token";
import { buildDocx } from "@/lib/agents/docx-builder";

export async function saveToOneDrive(params: {
  content: string;
  filename: string;
  folder: string; // e.g. "/Decks/Q2 LP Deck" or "/OMs/Tampa Property"
  title?: string;  // used as the Word doc title heading
  contentType?: string;
}): Promise<FileHandlerResult> {
  let token: string | null;
  try {
    token = await getGraphToken();
  } catch (err) {
    return {
      url: null,
      version: null,
      saved: false,
      message: `Shared Drive auth failed: ${String(err)}. Output saved to portal log only.`,
    };
  }

  if (!token) {
    return {
      url: null,
      version: null,
      saved: false,
      message: "Shared Drive not configured — AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET not set. Output saved to portal log only.",
    };
  }

  try {
    // Ensure folder path starts with /
    const folderPath = params.folder.startsWith("/") ? params.folder : `/${params.folder}`;
    const fullPath = `${folderPath}/${params.filename}`;

    // Encode path segments individually, preserving slashes
    const encodedPath = fullPath
      .split("/")
      .filter(Boolean)
      .map((seg) => encodeURIComponent(seg))
      .join("/");

    // Build upload URL: SharePoint site drive if configured, else personal OneDrive
    const siteId = process.env.SHAREPOINT_SITE_ID;
    let uploadUrl: string;
    if (siteId) {
      // siteId format: "hostname,site-collection-id,web-id" — do NOT encodeURIComponent,
      // the commas must remain literal for Graph API to parse the compound site identifier correctly
      uploadUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodedPath}:/content`;
    } else {
      const userEmail = process.env.SMTP_USER;
      if (!userEmail) throw new Error("Either SHAREPOINT_SITE_ID or SMTP_USER must be set");
      uploadUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userEmail)}/drive/root:/${encodedPath}:/content`;
    }

    // Build body: Word doc for .docx files, plain text otherwise
    let bodyBuffer: Buffer;
    let contentType: string;
    if (params.filename.endsWith(".docx")) {
      bodyBuffer = await buildDocx({ title: params.title ?? params.filename, content: params.content });
      contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    } else {
      bodyBuffer = Buffer.from(params.content, "utf-8");
      contentType = params.contentType ?? "text/plain; charset=utf-8";
    }

    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": contentType,
        "Content-Length": String(bodyBuffer.length),
      },
      body: new Uint8Array(bodyBuffer),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Graph API ${res.status}: ${errText}`);
    }

    const fileData = await res.json();
    return {
      url: fileData.webUrl ?? null,
      version: fileData.eTag ?? fileData.id ?? null,
      saved: true,
      message: `Saved to Shared Drive: ${fileData.webUrl ?? fullPath}`,
    };
  } catch (err) {
    return {
      url: null,
      version: null,
      saved: false,
      message: `Shared Drive save failed: ${String(err)}. Output saved to portal log only.`,
    };
  }
}

/**
 * Upload a binary Buffer directly to SharePoint / OneDrive.
 * Used for .pptx and other non-text outputs.
 */
export async function saveBufferToOneDrive(params: {
  buffer: Buffer;
  filename: string;
  folder: string;
  contentType: string;
}): Promise<FileHandlerResult> {
  let token: string | null;
  try {
    token = await getGraphToken();
  } catch (err) {
    return { url: null, version: null, saved: false, message: `Auth failed: ${String(err)}` };
  }
  if (!token) {
    return { url: null, version: null, saved: false, message: "AZURE credentials not configured." };
  }

  try {
    const folderPath = params.folder.startsWith("/") ? params.folder : `/${params.folder}`;
    const fullPath = `${folderPath}/${params.filename}`;
    const encodedPath = fullPath
      .split("/")
      .filter(Boolean)
      .map((seg) => encodeURIComponent(seg))
      .join("/");

    const siteId = process.env.SHAREPOINT_SITE_ID;
    let uploadUrl: string;
    if (siteId) {
      uploadUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodedPath}:/content`;
    } else {
      const userEmail = process.env.SMTP_USER;
      if (!userEmail) throw new Error("Either SHAREPOINT_SITE_ID or SMTP_USER must be set");
      uploadUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userEmail)}/drive/root:/${encodedPath}:/content`;
    }

    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": params.contentType,
        "Content-Length": String(params.buffer.length),
      },
      body: new Uint8Array(params.buffer),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Graph API ${res.status}: ${errText}`);
    }

    const fileData = await res.json();
    return {
      url: fileData.webUrl ?? null,
      version: fileData.eTag ?? fileData.id ?? null,
      saved: true,
      message: `Saved to Shared Drive: ${fileData.webUrl ?? fullPath}`,
    };
  } catch (err) {
    return { url: null, version: null, saved: false, message: `Save failed: ${String(err)}` };
  }
}

export function buildOneDriveFolder(params: {
  prefix: string;
  projectContext: string;
  workflowId: string;
  ask?: string; // used for BUILD keyword routing
}): string {
  const month = new Date().toLocaleString("en-US", { month: "long", year: "numeric" });
  if (params.prefix === "BUILD") {
    // Route to the correct SharePoint library based on keywords in the ask/subject
    const haystack = `${params.ask ?? ""} ${params.projectContext}`.toLowerCase();
    const isFund = /fund|lp |investor|capital raise|fundrais|erp iv|fund iv/.test(haystack);
    return isFund ? `ERP Funds IV` : `ERP Deal Pipelines`;
  }
  if (params.prefix === "WRITE") {
    return `/Write`;
  }
  // RESEARCH (including save-file-only) → monthly subfolder
  return `/Research/${month}`;
}

// ── Newsletter archiving ──────────────────────────────────────────────────────

/**
 * Save a newsletter HTML file to SharePoint under:
 *   Newsletters/{Market}/{Month Year}/{briefType} - {YYYY-MM-DD}.html
 *
 * Examples:
 *   Newsletters/Brevard/May 2026/Brevard Weekly Market Update - 2026-05-22.html
 *   Newsletters/Permian/May 2026/Permian Submarket Watch - 2026-05-22.html
 *
 * Failures are non-fatal — the caller can fire-and-forget with .catch().
 */
export async function saveNewsletterToSharePoint(params: {
  market: string;       // e.g. "Brevard" or "Permian"
  briefType: string;    // e.g. "Weekly Market Update", "Submarket Watch"
  htmlBody: string;
}): Promise<FileHandlerResult> {
  const now = new Date();
  const monthYear = now.toLocaleDateString("en-US", { month: "long", year: "numeric" }); // e.g. "May 2026"
  const dateStr = now.toISOString().split("T")[0]; // e.g. "2026-05-22"
  const filename = `${params.market} ${params.briefType} - ${dateStr}.html`;
  const folder = `Newsletters/${params.market}/${monthYear}`;
  return saveToOneDrive({ content: params.htmlBody, filename, folder, contentType: "text/html; charset=utf-8" });
}

export function buildFilename(params: {
  projectContext: string;
  workflowId: string;
}): string {
  const slug = params.projectContext
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40);
  const now = new Date();
  const date = now.toISOString().split("T")[0]; // YYYY-MM-DD
  const hhmm = now.toISOString().slice(11, 16).replace(":", ""); // HHmm
  const ext = params.workflowId === "deck-builder" ? "pptx" : "docx";
  return `${slug}-${params.workflowId}-${date}-${hhmm}.${ext}`;
}
