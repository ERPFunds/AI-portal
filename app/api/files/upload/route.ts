import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { extractAndStoreMarkdown } from "@/lib/agents/ir/markdown-store";
import { embedAndStoreChunks, voyageConfigured } from "@/lib/agents/ir/embeddings";

const anthropic = new Anthropic();

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    const { error } = await supabase.from("uploaded_files").insert(row);

    if (error) {
      console.error("File metadata save error:", error);
      return NextResponse.json({ error: "Failed to save file metadata" }, { status: 500 });
    }

    // Workflow 7: extract the document to text/markdown and store it (best-effort; never fails the upload).
    // Then chunk + embed it into the KB retrieval layer so agents can retrieve just the relevant passages.
    try {
      const bytes = Buffer.from(await file.arrayBuffer());
      const md = await extractAndStoreMarkdown({ fileId: uploaded.id, filename: file.name, mimeType: file.type || null, category: category ?? undefined, bytes });
      if (md && voyageConfigured()) {
        try {
          await embedAndStoreChunks({ fileId: uploaded.id, filename: file.name, category: category ?? null, text: md });
        } catch (e) {
          console.error("KB embedding failed:", e);
        }
      }
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
