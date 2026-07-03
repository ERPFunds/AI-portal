import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDocText } from "@/lib/agents/ir/markdown-store";
import { embedAndStoreChunks, voyageConfigured } from "@/lib/agents/ir/embeddings";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Backfill the KB retrieval layer: chunk + embed every uploaded document into `document_chunks`.
 * Idempotent — skips docs that already have chunks unless ?force=1. Optional ?category=A&category=B
 * to scope. POST only.
 */
export async function POST(req: NextRequest) {
  if (!voyageConfigured()) {
    return NextResponse.json({ error: "VOYAGE_API_KEY not set" }, { status: 400 });
  }

  const force = req.nextUrl.searchParams.get("force") === "1";
  const categories = req.nextUrl.searchParams.getAll("category");
  const admin = createAdminClient();

  let q = admin.from("uploaded_files").select("file_id, filename, mime_type, category");
  if (categories.length) q = q.in("category", categories);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const files = (data ?? []) as { file_id: string; filename: string; mime_type: string | null; category: string | null }[];

  let embedded = 0, skipped = 0, chunks = 0;
  const errors: string[] = [];
  for (const f of files) {
    try {
      if (!force) {
        const { count } = await admin.from("document_chunks").select("id", { count: "exact", head: true }).eq("file_id", f.file_id);
        if ((count ?? 0) > 0) { skipped++; continue; }
      }
      const text = await getDocText({ fileId: f.file_id, filename: f.filename, mimeType: f.mime_type, category: f.category }, 200_000);
      if (!text.trim()) { skipped++; continue; }
      const n = await embedAndStoreChunks({ fileId: f.file_id, filename: f.filename, category: f.category, text });
      embedded++; chunks += n;
    } catch (e) {
      errors.push(`${f.filename}: ${String(e).slice(0, 120)}`);
    }
  }

  return NextResponse.json({ totalFiles: files.length, embedded, skipped, chunks, errors });
}
