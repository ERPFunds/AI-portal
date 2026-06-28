import { NextRequest, NextResponse } from "next/server";
import Anthropic, { toFile } from "@anthropic-ai/sdk";
import { sql } from "@vercel/postgres";
import { getGraphToken } from "@/lib/agents/graph-token";
import { saveUploadedFile } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const anthropic = new Anthropic();

// SharePoint source folder (site = ERPAgentOutput, default drive) and target KB category.
const SP_FOLDER = "Investor Relations";
const KB_CATEGORY = "Investor Relations KB";
const MAX_DEPTH = 3;

interface SPFile {
  id: string;
  name: string;
  size: number;
  mimeType: string | null;
  downloadUrl: string | null;
  webUrl: string;
  path: string;
  lastModifiedDateTime: string;
}

export async function GET(req: NextRequest) {
  // ── Auth (same bearer as the other cron/sync routes) ──────────────────────────
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
      `?$select=id,name,size,file,folder,webUrl,lastModifiedDateTime,@microsoft.graph.downloadUrl&$top=200`;
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
          webUrl: item.webUrl,
          path: pathSegments.join("/"),
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

  // ── Existing KB docs (for dedup + existing-duplicate report) ───────────────────
  const { rows } = await sql`SELECT filename FROM uploaded_files WHERE category = ${KB_CATEGORY}`;
  const existing = new Map<string, number>(); // filename -> count already in KB
  for (const r of rows as { filename: string }[]) {
    existing.set(r.filename, (existing.get(r.filename) ?? 0) + 1);
  }
  // Filenames that already appear 2+ times in the KB — user should prune these.
  const existingDuplicates = [...existing.entries()].filter(([, n]) => n > 1).map(([name, n]) => ({ name, count: n }));

  // ── Sync ───────────────────────────────────────────────────────────────────────
  const synced: { name: string; fileId?: string; size: number }[] = [];
  const alreadyInKb: string[] = []; // skipped because a same-name doc is already in the KB
  const dupInSharePoint: string[] = []; // same filename appears twice in the SharePoint folder
  const errors: { name: string; error: string }[] = [];
  const seenThisRun = new Set<string>();

  for (const f of files) {
    if (existing.has(f.name)) {
      alreadyInKb.push(f.name);
      continue;
    }
    if (seenThisRun.has(f.name)) {
      dupInSharePoint.push(f.name);
      continue;
    }
    seenThisRun.add(f.name);

    if (dryRun) {
      synced.push({ name: f.name, size: f.size });
      continue;
    }

    try {
      // download from SharePoint
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

      // upload to Anthropic Files
      const uploaded = await (anthropic.beta as any).files.upload({
        file: await toFile(new Uint8Array(buffer), f.name, { type: f.mimeType ?? "application/octet-stream" }),
      });

      await saveUploadedFile({
        fileId: uploaded.id,
        filename: f.name,
        sizeBytes: f.size,
        mimeType: f.mimeType ?? undefined,
        category: KB_CATEGORY,
        uploadedBy: "sharepoint-sync",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

      synced.push({ name: f.name, fileId: uploaded.id, size: f.size });
    } catch (e) {
      errors.push({ name: f.name, error: String(e).slice(0, 120) });
    }
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    source: `${siteId} :: ${SP_FOLDER}`,
    category: KB_CATEGORY,
    sharePointFileCount: files.length,
    syncedCount: synced.length,
    synced,
    duplicates: {
      alreadyInKb,            // same-name doc already present in the KB — skipped this run
      duplicateInSharePoint: dupInSharePoint, // same name appears twice in the SharePoint folder
      existingDuplicatesInKb: existingDuplicates, // names that already appear 2+ times in the KB — prune these
    },
    errors,
  });
}
