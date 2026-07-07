import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const anthropic = new Anthropic();

export const dynamic = "force-dynamic";

// Return a file's extracted text for viewing. Anthropic's Files API can't return the original
// upload bytes, but WF7 stores the extracted markdown in document_markdown (keyed by file_id).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: fileId } = await params;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("document_markdown")
      .select("filename, category, markdown, extracted_at")
      .eq("file_id", fileId)
      .maybeSingle();

    if (!data || !data.markdown) {
      return NextResponse.json({ error: "not_extracted", fileId }, { status: 404 });
    }

    return NextResponse.json({
      fileId,
      filename: data.filename,
      category: data.category,
      markdown: data.markdown,
      extractedAt: data.extracted_at,
    });
  } catch (error) {
    console.error("File content fetch error:", error);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: fileId } = await params;
  try {
    await (anthropic.beta as any).files.delete(fileId);
  } catch {
    // File may have already expired — still remove our DB record
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("uploaded_files").delete().eq("file_id", fileId);
    if (error) throw error;
  } catch (error) {
    console.error("DB delete error:", error);
    return NextResponse.json({ error: "DB delete failed" }, { status: 500 });
  }

  return NextResponse.json({ deleted: true, fileId });
}
