import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const anthropic = new Anthropic();

export const dynamic = "force-dynamic";

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
