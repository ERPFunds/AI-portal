import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGraphToken } from "@/lib/agents/graph-token";
import { extractAndStoreMarkdown } from "@/lib/agents/ir/markdown-store";
import { embedAndStoreChunks, voyageConfigured } from "@/lib/agents/ir/embeddings";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// KB-sync SharePoint folders → categories (mirror of ir-kb-sync). We re-fetch bytes from SharePoint
// because Anthropic won't let us download user-uploaded files back, so this is the only text source.
const SYNC_MAP: { folder: string; category: string }[] = [
  { folder: "Investor Relations", category: "Investor Relations (SharePoint)" },
  { folder: "ERP Funds IV", category: "Capital KB" },
  { folder: "SOPs/Claude Training and Assets", category: "Claude Training and Assets" },
  { folder: "SOPs/Agent Working Guides", category: "Agent Working Guides" },
];
const MAX_DEPTH = 4;

interface SPFile { name: string; mimeType: string | null; downloadUrl: string | null; id: string }

/**
 * Reindex the KB retrieval layer: for each SharePoint KB file that matches an existing uploaded_files
 * row, download the bytes, extract text, and (re)embed into document_chunks under the existing file_id.
 * Idempotent-ish; ?force=1 re-embeds even docs that already have chunks. POST only.
 */
export async function POST(req: NextRequest) {
  if (!voyageConfigured()) return NextResponse.json({ error: "VOYAGE_API_KEY not set" }, { status: 400 });
  const token = await getGraphToken().catch(() => null);
  if (!token) return NextResponse.json({ error: "Graph auth failed" }, { status: 503 });
  const siteId = process.env.SHAREPOINT_SITE_ID;
  if (!siteId) return NextResponse.json({ error: "SHAREPOINT_SITE_ID not set" }, { status: 503 });

  const force = req.nextUrl.searchParams.get("force") === "1";
  const driveBase = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive`;
  const headers = { Authorization: `Bearer ${token}` };
  const admin = createAdminClient();

  const results: Record<string, unknown>[] = [];
  const debug: Record<string, unknown>[] = [];
  let embedded = 0, skipped = 0, chunks = 0;
  const errors: string[] = [];

  for (const { folder, category } of SYNC_MAP) {
    // Existing rows for this category, keyed by filename (prefer the sync-managed copy).
    const { data } = await admin.from("uploaded_files").select("file_id, filename, mime_type").eq("category", category);
    const rowByName = new Map<string, { file_id: string; filename: string; mime_type: string | null }>();
    for (const r of (data ?? []) as { file_id: string; filename: string; mime_type: string | null }[]) {
      if (!rowByName.has(r.filename)) rowByName.set(r.filename, r);
    }

    // Walk the SharePoint folder.
    const files: SPFile[] = [];
    async function walk(pathSegments: string[], depth: number) {
      const encoded = pathSegments.map(encodeURIComponent).join("/");
      const url = `${driveBase}/root:/${encoded}:/children?$select=id,name,file,folder,@microsoft.graph.downloadUrl&$top=200`;
      const res = await fetch(url, { headers });
      if (!res.ok) return;
      const j = await res.json();
      for (const item of (j.value ?? []) as Record<string, unknown>[]) {
        if (item.file) files.push({ name: String(item.name), mimeType: (item.file as { mimeType?: string })?.mimeType ?? null, downloadUrl: (item["@microsoft.graph.downloadUrl"] as string) ?? null, id: String(item.id) });
        else if (item.folder && depth < MAX_DEPTH) await walk([...pathSegments, String(item.name)], depth + 1);
      }
    }
    try { await walk(folder.split("/"), 1); } catch (e) { errors.push(`${folder}: walk ${String(e).slice(0, 80)}`); }

    for (const f of files) {
      const row = rowByName.get(f.name);
      if (!row) { skipped++; if (debug.length < 20) debug.push({ name: f.name, reason: "no matching KB row" }); continue; }
      try {
        if (!force) {
          const { count } = await admin.from("document_chunks").select("id", { count: "exact", head: true }).eq("file_id", row.file_id);
          if ((count ?? 0) > 0) { skipped++; continue; }
        }
        const dl = f.downloadUrl ? await fetch(f.downloadUrl) : await fetch(`${driveBase}/items/${f.id}/content`, { headers });
        const buf = Buffer.from(await dl.arrayBuffer());
        const text = await extractAndStoreMarkdown({ fileId: row.file_id, filename: f.name, mimeType: row.mime_type ?? f.mimeType, category, bytes: buf });
        if (!text.trim()) {
          skipped++;
          if (debug.length < 20) debug.push({ name: f.name, reason: "empty text", dlOk: dl.ok, dlStatus: dl.status, bytes: buf.length, mime: row.mime_type ?? f.mimeType });
          continue;
        }
        const n = await embedAndStoreChunks({ fileId: row.file_id, filename: f.name, category, text });
        embedded++; chunks += n;
      } catch (e) {
        errors.push(`${f.name}: ${String(e).slice(0, 160)}`);
      }
    }
    results.push({ folder, category, sharePointFiles: files.length, kbRows: rowByName.size });
  }

  return NextResponse.json({ embedded, skipped, chunks, results, debug, errors });
}
