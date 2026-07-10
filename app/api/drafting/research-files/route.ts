import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGraphToken } from "@/lib/agents/graph-token";

export const dynamic = "force-dynamic";

// Live-browse source for the Drafting Workspace: the "Newsletters" research folder on the
// ERPAgentOutput SharePoint site (same site the KB sync reads). Unlike the KB picker (which lists
// pre-synced documents), this lists SharePoint files directly so the newest research is always
// available without waiting for a sync. Selected files are extracted on the fly at draft time.
const RESEARCH_FOLDER = process.env.DRAFTING_RESEARCH_FOLDER || "Newsletters";
const MAX_DEPTH = 3;
// Only surface files we can extract text from for grounding.
const READABLE = /\.(pdf|docx|pptx|xlsx|xls|txt|md|csv|html?)$/i;

export interface ResearchFile {
  id: string;
  name: string;
  extension: string;
  size: number;
  lastModifiedDateTime: string;
  webUrl: string;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized", files: [] }, { status: 401 });

  let token: string | null;
  try {
    token = await getGraphToken();
  } catch (e) {
    return NextResponse.json({ error: `Auth failed: ${String(e)}`, files: [] }, { status: 500 });
  }
  if (!token) return NextResponse.json({ error: "SharePoint not configured — AZURE credentials not set.", files: [] }, { status: 503 });

  const siteId = process.env.SHAREPOINT_SITE_ID;
  if (!siteId) return NextResponse.json({ error: "SHAREPOINT_SITE_ID not set", files: [] }, { status: 503 });
  const driveBase = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive`;
  const headers = { Authorization: `Bearer ${token}` };

  const folderParam = (req.nextUrl.searchParams.get("folder") || RESEARCH_FOLDER).trim();
  const files: ResearchFile[] = [];

  async function walk(pathSegments: string[], depth: number) {
    const encoded = pathSegments.map(encodeURIComponent).join("/");
    const url =
      `${driveBase}/root:/${encoded}:/children` +
      `?$select=id,name,size,file,folder,webUrl,lastModifiedDateTime&$top=200`;
    const res = await fetch(url, { headers });
    if (!res.ok) return;
    const data = await res.json();
    for (const item of (data.value ?? []) as any[]) {
      if (item.file) {
        const ext = ("." + (item.name.split(".").pop() ?? "")).toLowerCase();
        if (!READABLE.test(item.name)) continue;
        files.push({
          id: item.id,
          name: item.name,
          extension: ext,
          size: item.size ?? 0,
          lastModifiedDateTime: item.lastModifiedDateTime ?? "",
          webUrl: item.webUrl ?? "",
        });
      } else if (item.folder && depth < MAX_DEPTH) {
        await walk([...pathSegments, item.name], depth + 1);
      }
    }
  }

  try {
    await walk(folderParam.split("/"), 1);
  } catch (e) {
    return NextResponse.json({ error: `Graph list failed: ${String(e).slice(0, 200)}`, files: [] }, { status: 500 });
  }

  // Newest first.
  files.sort((a, b) => (b.lastModifiedDateTime || "").localeCompare(a.lastModifiedDateTime || ""));
  return NextResponse.json({ folder: folderParam, files });
}
