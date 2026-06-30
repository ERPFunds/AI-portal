import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractAndStoreMarkdown } from "@/lib/agents/ir/markdown-store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_PER_RUN = 20; // bound work/cost per run; backlog clears over successive runs

// Workflow 7: backfill the document_markdown layer for any uploaded file that hasn't been
// extracted yet (covers SharePoint-synced docs and anything the on-upload hook missed).
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = await createClient();

  const { data: files, error } = await supabase
    .from("uploaded_files")
    .select("file_id, filename, mime_type, category");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: done } = await supabase.from("document_markdown").select("file_id");
  const have = new Set((done ?? []).map((d: { file_id: string }) => d.file_id));

  const todo = (files ?? [])
    .filter((f: { file_id: string }) => !have.has(f.file_id))
    .slice(0, MAX_PER_RUN) as { file_id: string; filename: string; mime_type: string | null; category: string | null }[];

  const extracted: string[] = [];
  const failed: string[] = [];
  for (const f of todo) {
    try {
      const md = await extractAndStoreMarkdown({ fileId: f.file_id, filename: f.filename, mimeType: f.mime_type, category: f.category });
      (md ? extracted : failed).push(f.filename);
    } catch {
      failed.push(f.filename);
    }
  }

  return NextResponse.json({
    ok: true,
    totalFiles: files?.length ?? 0,
    alreadyExtracted: have.size,
    pending: (files?.length ?? 0) - have.size,
    processed: todo.length,
    extracted,
    failed,
  });
}
