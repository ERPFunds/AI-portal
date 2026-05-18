import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { saveUploadedFile } from "@/lib/db";

const anthropic = new Anthropic();

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const projectTag = formData.get("projectTag") as string | null;
    const uploadedBy = formData.get("uploadedBy") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const uploaded = await (anthropic.beta as any).files.upload({ file });

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await saveUploadedFile({
      fileId:     uploaded.id,
      filename:   file.name,
      sizeBytes:  file.size,
      mimeType:   file.type,
      projectTag: projectTag ?? undefined,
      uploadedBy: uploadedBy ?? undefined,
      expiresAt,
    });

    return NextResponse.json({
      fileId:     uploaded.id,
      filename:   file.name,
      sizeBytes:  file.size,
      mimeType:   file.type,
      projectTag,
      expiresAt,
    });
  } catch (error) {
    console.error("File upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
