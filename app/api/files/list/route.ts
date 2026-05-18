import { NextResponse } from "next/server";
import { listUploadedFiles } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const files = await listUploadedFiles();
    return NextResponse.json({ files });
  } catch (error) {
    console.error("File list error:", error);
    return NextResponse.json({ files: [] });
  }
}
