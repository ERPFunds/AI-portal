import { NextRequest, NextResponse } from "next/server";
import Anthropic, { toFile } from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getGraphToken } from "@/lib/agents/graph-token";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const anthropic = new Anthropic();

// SharePoint source folders (site = ERPAgentOutput, default drive) → target KB categories.
const SYNC_MAP: { folder: string; category: string }[] = [
  { folder: "Investor Relations", category: "Investor Relations (SharePoint)" },
  { folder: "ERP Funds IV", category: "Capital KB" },
];
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

async function runSync(dryRun: boolean): Promise<{ status: number; body: any }> {
  let token: string | null;
  try {
    token = await getGraphToken();
  } catch (e) {
    return { status: 500, body: { error: `Graph auth failed: ${String(e)}` } };
  }
  if (!token) {
    return { status: 503, body: { error: "AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET not set" } };
  }
  const siteId = process.env.SHAREPOINT_SITE_ID;
  if (!siteId) return { status: 503, body: { error: "SHAREPOINT_SITE_ID not set" } };
  const driveBase = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive`;
  const headers = { Authorization: `Bearer ${token}` };
  const supabase = await createClient();

  // Sync one SharePoint folder → one KB category. Per-folder errors are captured, not fatal.
  async function syncFolder(spFolder: string, kbCategory: string): Promise<any> {
    // ── Enumerate the folder (recursively) ──────────────────────────────────────
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
    await walk([spFolder], 1);

    // ── Existing KB rows for this category (proven Supabase-client path) ──────────
    const { data: existingData, error: readErr } = await supabase
      .from("uploaded_files")
      .select("file_id, filename, size_bytes, expires_at, uploaded_by")
      .eq("category", kbCategory);
    if (readErr) throw new Error(`DB read failed: ${readErr.message}`);
    const kbRows = (existingData ?? []) as KbRow[];

    const syncByName = new Map<string, KbRow>();
    const manualNames = new Set<string>();
    const nameCounts = new Map<string, number>();
    for (const r of kbRows) {
      nameCounts.set(r.filename, (nameCounts.get(r.filename) ?? 0) + 1);
      if (r.uploaded_by === SYNC_TAG) syncByName.set(r.filename, r);
      else manualNames.add(r.filename);
    }
    const existingDuplicatesInKb = [...nameCounts.entries()].filter(([, n]) => n > 1).map(([name, n]) => ({ name, count: n }));

    const added: string[] = [];
    const updated: string[] = [];
    let unchanged = 0;
    const skippedManualDup: string[] = [];
    const errors: { name: string; error: string }[] = [];
    const seen = new Set<string>();
    const spNames = new Set(files.map((f) => f.name));

    async function uploadFile(f: SPFile): Promise<void> {
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
        category: kbCategory,
        uploaded_by: SYNC_TAG,
        expires_at: new Date(Date.now() + EXPIRY_MS).toISOString(),
      });
    }

    async function deleteRow(fileId: string) {
      try { await (anthropic.beta as any).files.delete(fileId); } catch { /* may already be gone */ }
      await supabase.from("uploaded_files").delete().eq("file_id", fileId);
    }

    for (const f of files) {
      if (seen.has(f.name)) continue;
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
        unchanged++;
      }
    }

    const removedFromSource = [...syncByName.keys()].filter((name) => !spNames.has(name));

    return {
      folder: spFolder,
      category: kbCategory,
      sharePointFileCount: files.length,
      added,
      updated,
      unchanged,
      duplicates: { skippedManualDup, existingDuplicatesInKb, removedFromSource },
      errors,
    };
  }

  // Run every folder→category mapping; one failing folder doesn't abort the others.
  const results: any[] = [];
  for (const m of SYNC_MAP) {
    try {
      results.push(await syncFolder(m.folder, m.category));
    } catch (e) {
      results.push({ folder: m.folder, category: m.category, error: String(e).slice(0, 200) });
    }
  }

  return {
    status: 200,
    body: { ok: true, dryRun, ranAt: new Date().toISOString(), site: siteId, results },
  };
}

// Cron / scripted trigger — Vercel injects the CRON_SECRET bearer automatically.
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";
  const { status, body } = await runSync(dryRun);
  return NextResponse.json(body, { status });
}

// UI "Sync from SharePoint" button — any signed-in portal user can trigger a live sync.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { status, body } = await runSync(false);
  return NextResponse.json(body, { status });
}
