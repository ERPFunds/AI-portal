import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractAndStoreMarkdown } from "@/lib/agents/ir/markdown-store";

const anthropic = new Anthropic();

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const projectTag = formData.get("projectTag") as string | null;
    const category = formData.get("category") as string | null;
    const uploadedBy = formData.get("uploadedBy") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const uploaded = await (anthropic.beta as any).files.upload({ file });

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const row = {
      file_id:     uploaded.id,
      filename:    file.name,
      size_bytes:  file.size,
      mime_type:   file.type || null,
      project_tag: projectTag ?? null,
      category:    category ?? null,
      uploaded_by: uploadedBy ?? null,
      expires_at:  expiresAt,
    };

    const supabase = await createClient();
    let { error } = await supabase.from("uploaded_files").insert(row);

    // Fall back to the service-role client when the session insert is blocked by RLS
    // (e.g. an unauthenticated/programmatic upload with no Supabase session cookie).
    if (error) {
      try {
        const admin = createAdminClient();
        ({ error } = await admin.from("uploaded_files").insert(row));
      } catch (e) {
        console.error("Admin insert fallback failed:", e);
      }
    }

    if (error) {
      console.error("File metadata save error:", error);
      return NextResponse.json({ error: "Failed to save file metadata" }, { status: 500 });
    }

    // Workflow 7: extract the document to text/markdown and store it (best-effort; never fails the upload).
    try {
      const bytes = Buffer.from(await file.arrayBuffer());
      await extractAndStoreMarkdown({ fileId: uploaded.id, filename: file.name, mimeType: file.type || null, category: category ?? undefined, bytes });
    } catch (e) {
      console.error("Markdown extraction (WF7) failed:", e);
    }

    return NextResponse.json({
      fileId:     uploaded.id,
      filename:   file.name,
      sizeBytes:  file.size,
      mimeType:   file.type,
      projectTag,
      category,
      expiresAt,
    });
  } catch (error) {
    console.error("File upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
