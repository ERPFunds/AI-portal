import { NextRequest, NextResponse } from "next/server";
import Anthropic, { toFile } from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getGraphToken } from "@/lib/agents/graph-token";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const anthropic = new Anthropic();

// SharePoint source folder (site = ERPAgentOutput, default drive) and target KB category.
const SP_FOLDER = "Investor Relations";
const KB_CATEGORY = "Investor Relations (SharePoint)";
const SYNC_TAG = "sharepoint-sync"; // uploaded_by marker for sync-managed rows
const MAX_DEPTH = 3;
const REFRESH_WINDOW_MS = 8 * 24 * 60 * 60 * 1000; // re-upload if a row expires within 8 days
const EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

interface SPFile {
  id: string;
  name: string;
  size: number;
  mimeType: string | null;
  downloadUrl: string | null;
  lastModifiedDateTime: string;
}

interface KbRow {
  file_id: string;
  filename: string;
  size_bytes: number | null;
  expires_at: string | null;
  uploaded_by: string | null;
}

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";

  // ── Graph token + drive base ──────────────────────────────────────────────────
  let token: string | null;
  try {
    token = await getGraphToken();
  } catch (e) {
    return NextResponse.json({ error: `Graph auth failed: ${String(e)}` }, { status: 500 });
  }
  if (!token) {
    return NextResponse.json({ error: "AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET not set" }, { status: 503 });
  }
  const siteId = process.env.SHAREPOINT_SITE_ID;
  if (!siteId) return NextResponse.json({ error: "SHAREPOINT_SITE_ID not set" }, { status: 503 });
  const driveBase = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive`;
  const headers = { Authorization: `Bearer ${token}` };

  // ── Enumerate the Investor Relations folder (recursively) ──────────────────────
  const files: SPFile[] = [];
  async function walk(pathSegments: string[], depth: number) {
    const encoded = pathSegments.map(encodeURIComponent).join("/");
    const url =
      `${driveBase}/root:/${encoded}:/children` +
      `?$select=id,name,size,file,folder,lastModifiedDateTime,@microsoft.graph.downloadUrl&$top=200`;
    const res = await fetch(url, { headers });
    if (!res.ok) return;
    const data = await res.json();
    for (const item of (data.value ?? []) as any[]) {
      if (item.file) {
        files.push({
          id: item.id,
          name: item.name,
          size: item.size ?? 0,
          mimeType: item.file?.mimeType ?? null,
          downloadUrl: item["@microsoft.graph.downloadUrl"] ?? null,
          lastModifiedDateTime: item.lastModifiedDateTime,
        });
      } else if (item.folder && depth < MAX_DEPTH) {
        await walk([...pathSegments, item.name], depth + 1);
      }
    }
  }
  try {
    await walk([SP_FOLDER], 1);
  } catch (e) {
    return NextResponse.json({ error: `SharePoint listing failed: ${String(e)}` }, { status: 500 });
  }

  // ── Existing KB rows for this category ─────────────────────────────────────────
  const supabase = await createClient();
  const { data: existingData, error: readErr } = await supabase
    .from("uploaded_files")
    .select("file_id, filename, size_bytes, expires_at, uploaded_by")
    .eq("category", KB_CATEGORY);
  if (readErr) return NextResponse.json({ error: `DB read failed: ${readErr.message}` }, { status: 500 });
  const kbRows = (existingData ?? []) as KbRow[];
  const syncByName = new Map<string, KbRow>();   // sync-managed rows, keyed by filename
  const manualNames = new Set<string>();          // filenames added manually (not by sync)
  const nameCounts = new Map<string, number>();
  for (const r of kbRows) {
    nameCounts.set(r.filename, (nameCounts.get(r.filename) ?? 0) + 1);
    if (r.uploaded_by === SYNC_TAG) syncByName.set(r.filename, r);
    else manualNames.add(r.filename);
  }
  const existingDuplicatesInKb = [...nameCounts.entries()].filter(([, n]) => n > 1).map(([name, n]) => ({ name, count: n }));

  // ── Classify each SharePoint file ──────────────────────────────────────────────
  const added: string[] = [];
  const updated: string[] = [];      // changed content (size differs) or refreshed before expiry
  const unchanged: string[] = [];
  const skippedManualDup: string[] = []; // a manually-uploaded doc with the same name already exists
  const errors: { name: string; error: string }[] = [];
  const seen = new Set<string>();
  const spNames = new Set(files.map((f) => f.name));

  async function uploadFile(f: SPFile): Promise<string> {
    let buffer: Buffer;
    if (f.downloadUrl) {
      const dl = await fetch(f.downloadUrl);
      if (!dl.ok) throw new Error(`download ${dl.status}`);
      buffer = Buffer.from(await dl.arrayBuffer());
    } else {
      const dl = await fetch(`${driveBase}/items/${f.id}/content`, { headers });
      if (!dl.ok) throw new Error(`content ${dl.status}`);
      buffer = Buffer.from(await dl.arrayBuffer());
    }
    const uploaded = await (anthropic.beta as any).files.upload({
      file: await toFile(new Uint8Array(buffer), f.name, { type: f.mimeType ?? "application/octet-stream" }),
    });
    await supabase.from("uploaded_files").insert({
      file_id: uploaded.id,
      filename: f.name,
      size_bytes: f.size,
      mime_type: f.mimeType ?? null,
      category: KB_CATEGORY,
      uploaded_by: SYNC_TAG,
      expires_at: new Date(Date.now() + EXPIRY_MS).toISOString(),
    });
    return uploaded.id;
  }

  async function deleteRow(fileId: string) {
    try { await (anthropic.beta as any).files.delete(fileId); } catch { /* file may already be gone */ }
    await supabase.from("uploaded_files").delete().eq("file_id", fileId);
  }

  for (const f of files) {
    if (seen.has(f.name)) continue; // same name twice in the folder — handle once
    seen.add(f.name);

    const existing = syncByName.get(f.name);
    if (!existing) {
      if (manualNames.has(f.name)) { skippedManualDup.push(f.name); continue; }
      try { if (!dryRun) await uploadFile(f); added.push(f.name); }
      catch (e) { errors.push({ name: f.name, error: String(e).slice(0, 120) }); }
      continue;
    }

    const sizeChanged = (existing.size_bytes ?? -1) !== f.size;
    const nearExpiry = !existing.expires_at || new Date(existing.expires_at).getTime() < Date.now() + REFRESH_WINDOW_MS;
    if (sizeChanged || nearExpiry) {
      try {
        if (!dryRun) { await deleteRow(existing.file_id); await uploadFile(f); }
        updated.push(f.name);
      } catch (e) { errors.push({ name: f.name, error: String(e).slice(0, 120) }); }
    } else {
      unchanged.push(f.name);
    }
  }

  // Sync-managed rows whose source file no longer exists in SharePoint (flag, don't auto-delete).
  const removedFromSource = [...syncByName.keys()].filter((name) => !spNames.has(name));

  return NextResponse.json({
    ok: true,
    dryRun,
    ranAt: new Date().toISOString(),
    source: `${siteId} :: ${SP_FOLDER}`,
    category: KB_CATEGORY,
    sharePointFileCount: files.length,
    added,
    updated,
    unchanged: unchanged.length, // count only — usually the bulk, no need to list
    duplicates: {
      skippedManualDup,           // same-name doc was uploaded manually — sync left it alone
      existingDuplicatesInKb,     // names that appear 2+ times in the KB — prune these via the ✕ button
      removedFromSource,          // sync-added docs no longer in SharePoint — review/remove if desired
    },
    errors,
  });
}
