import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const category = req.nextUrl.searchParams.get("category");
    let query = supabase
      .from("uploaded_files")
      .select("id, file_id, filename, size_bytes, mime_type, project_tag, category, uploaded_by, expires_at, created_at")
      .order("created_at", { ascending: false });
    if (category) query = query.eq("category", category);
    const { data, error } = await query;
    if (error) {
      console.error("File list error:", error);
      return NextResponse.json({ files: [] });
    }
    return NextResponse.json({ files: data ?? [] });
  } catch (error) {
    console.error("File list error:", error);
    return NextResponse.json({ files: [] });
  }
}
