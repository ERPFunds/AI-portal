/**
 * Utilities for reading specific SharePoint files that have versioned names
 * (e.g. "ERP Funds IV - Investor Presentation (5.26.26 DRAFT).pptx").
 *
 * Uses "find latest by extension in folder" so the agent always reads the
 * most-recently-modified version regardless of filename changes.
 */

import { getGraphToken } from "@/lib/agents/graph-token";
import { extractPptxText } from "@/lib/agents/pptx-parser";

// ── Folder constants ───────────────────────────────────────────────────────────
export const FUNDS_FOLDER = "ERP Funds IV";
export const DEAL_PIPELINES_FOLDER = "ERP Deal Pipelines";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SharePointFileInfo {
  itemId: string;
  name: string;
  webUrl: string;
  downloadUrl: string;
  lastModifiedDateTime: string;
}

// ── Core helpers ───────────────────────────────────────────────────────────────

/**
 * List all files in a SharePoint folder and return the most recently modified
 * one whose name ends with the given extension (e.g. ".pptx", ".xlsx").
 */
export async function findLatestFile(
  token: string,
  siteId: string,
  folder: string,
  extension: string
): Promise<SharePointFileInfo | null> {
  const encodedFolder = folder
    .split("/")
    .map(encodeURIComponent)
    .join("/");

  const url =
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodedFolder}:/children` +
    `?$select=id,name,webUrl,lastModifiedDateTime,@microsoft.graph.downloadUrl` +
    `&$orderby=lastModifiedDateTime desc` +
    `&$top=50`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;

  const data = await res.json();
  const items: Array<{
    id: string;
    name: string;
    webUrl: string;
    lastModifiedDateTime: string;
    "@microsoft.graph.downloadUrl"?: string;
  }> = data.value ?? [];

  // Exclude agent-generated files (e.g. "…-deck-builder-2026-05-30-1423.pptx") so we
  // always return the human-uploaded master file, not the agent's own prior output.
  const agentPattern = /-(deck-builder|om-writer|om-editor)-\d{4}-\d{2}-\d{2}/i;
  const match = items.find(
    (i) => i.name.toLowerCase().endsWith(extension.toLowerCase()) && !agentPattern.test(i.name)
  );
  if (!match) return null;

  // If download URL wasn't returned inline, fetch it separately
  let downloadUrl = match["@microsoft.graph.downloadUrl"] ?? "";
  if (!downloadUrl) {
    const itemRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${match.id}?$select=@microsoft.graph.downloadUrl`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (itemRes.ok) {
      const itemData = await itemRes.json();
      downloadUrl = itemData["@microsoft.graph.downloadUrl"] ?? "";
    }
  }

  return {
    itemId: match.id,
    name: match.name,
    webUrl: match.webUrl,
    downloadUrl,
    lastModifiedDateTime: match.lastModifiedDateTime,
  };
}

/**
 * Download a file as a Buffer using its pre-signed download URL
 * (no auth header required — the URL is already scoped).
 */
export async function downloadFileAsBuffer(downloadUrl: string): Promise<Buffer | null> {
  try {
    const res = await fetch(downloadUrl);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

// ── High-level file readers ────────────────────────────────────────────────────

export interface FundsDeckContent {
  name: string;
  webUrl: string;
  text: string;
  lastModifiedDateTime: string;
  error?: string;
}

/**
 * Find and extract text from the most recent LP investor deck PPTX
 * in the ERP Funds IV SharePoint folder.
 */
export async function readLatestFundsDeck(): Promise<FundsDeckContent> {
  let token: string | null;
  try {
    token = await getGraphToken();
  } catch (err) {
    return { name: "", webUrl: "", text: "", lastModifiedDateTime: "", error: `Auth failed: ${String(err)}` };
  }
  if (!token) {
    return { name: "", webUrl: "", text: "", lastModifiedDateTime: "", error: "AZURE credentials not configured." };
  }

  const siteId = process.env.SHAREPOINT_SITE_ID;
  if (!siteId) {
    return { name: "", webUrl: "", text: "", lastModifiedDateTime: "", error: "SHAREPOINT_SITE_ID not set." };
  }

  const fileInfo = await findLatestFile(token, siteId, FUNDS_FOLDER, ".pptx");
  if (!fileInfo) {
    return { name: "", webUrl: "", text: "", lastModifiedDateTime: "", error: `No .pptx file found in "${FUNDS_FOLDER}".` };
  }

  if (!fileInfo.downloadUrl) {
    return { name: fileInfo.name, webUrl: fileInfo.webUrl, text: "", lastModifiedDateTime: fileInfo.lastModifiedDateTime, error: "Download URL not available." };
  }

  const buffer = await downloadFileAsBuffer(fileInfo.downloadUrl);
  if (!buffer) {
    return { name: fileInfo.name, webUrl: fileInfo.webUrl, text: "", lastModifiedDateTime: fileInfo.lastModifiedDateTime, error: "File download failed." };
  }

  const base64 = buffer.toString("base64");
  const text = extractPptxText(base64);

  return {
    name: fileInfo.name,
    webUrl: fileInfo.webUrl,
    text,
    lastModifiedDateTime: fileInfo.lastModifiedDateTime,
  };
}

export interface CommitmentScheduleContent {
  name: string;
  webUrl: string;
  itemId: string;
  lastModifiedDateTime: string;
  error?: string;
}

/**
 * Find the most recent commitment schedule xlsx in the ERP Funds IV folder.
 * Returns metadata needed by excel-utils for read/append operations.
 */
export async function findCommitmentSchedule(): Promise<CommitmentScheduleContent> {
  let token: string | null;
  try {
    token = await getGraphToken();
  } catch (err) {
    return { name: "", webUrl: "", itemId: "", lastModifiedDateTime: "", error: `Auth failed: ${String(err)}` };
  }
  if (!token) {
    return { name: "", webUrl: "", itemId: "", lastModifiedDateTime: "", error: "AZURE credentials not configured." };
  }

  const siteId = process.env.SHAREPOINT_SITE_ID;
  if (!siteId) {
    return { name: "", webUrl: "", itemId: "", lastModifiedDateTime: "", error: "SHAREPOINT_SITE_ID not set." };
  }

  // Find all xlsx files in the folder; pick the one whose name includes "Commitment"
  const encodedFolder = encodeURIComponent(FUNDS_FOLDER);
  const url =
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodedFolder}:/children` +
    `?$select=id,name,webUrl,lastModifiedDateTime&$orderby=lastModifiedDateTime desc&$top=50`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    return { name: "", webUrl: "", itemId: "", lastModifiedDateTime: "", error: `Folder listing failed: ${await res.text()}` };
  }

  const data = await res.json();
  const items: Array<{ id: string; name: string; webUrl: string; lastModifiedDateTime: string }> =
    data.value ?? [];

  const match = items.find(
    (i) => i.name.toLowerCase().endsWith(".xlsx") && i.name.toLowerCase().includes("commitment")
  );

  if (!match) {
    return { name: "", webUrl: "", itemId: "", lastModifiedDateTime: "", error: `No commitment schedule xlsx found in "${FUNDS_FOLDER}".` };
  }

  return {
    name: match.name,
    webUrl: match.webUrl,
    itemId: match.id,
    lastModifiedDateTime: match.lastModifiedDateTime,
  };
}
