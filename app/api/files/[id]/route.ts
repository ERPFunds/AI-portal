import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { deleteUploadedFileRecord } from "@/lib/db";

const anthropic = new Anthropic();

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const fileId = params.id;
  try {
    await (anthropic.beta as any).files.delete(fileId);
  } catch {
    // File may have already expired — still remove our DB record
  }

  try {
    await deleteUploadedFileRecord(fileId);
  } catch (error) {
    console.error("DB delete error:", error);
    return NextResponse.json({ error: "DB delete failed" }, { status: 500 });
  }

  return NextResponse.json({ deleted: true, fileId });
}
