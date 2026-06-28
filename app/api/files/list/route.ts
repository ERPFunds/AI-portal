import { NextRequest, NextResponse } from "next/server";
import { listUploadedFiles } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const category = req.nextUrl.searchParams.get("category") ?? undefined;
    const files = await listUploadedFiles(category);
    return NextResponse.json({ files });
  } catch (error) {
    console.error("File list error:", error);
    return NextResponse.json({ files: [] });
  }
}
