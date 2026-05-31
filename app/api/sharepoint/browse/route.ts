import { NextRequest, NextResponse } from "next/server";
import { getGraphToken } from "@/lib/agents/graph-token";

export const dynamic = "force-dynamic";

export interface BrowseItem {
  id: string;
  name: string;
  type: "file" | "folder";
  extension: string;     // ".xlsx", ".pptx", etc. — empty for folders
  size: number;
  webUrl: string;
  lastModifiedDateTime: string;
}

export interface BrowseResponse {
  folder: string;        // the folder path that was listed
  items: BrowseItem[];
  error?: string;
}

export async function GET(req: NextRequest) {
  // ?folder=ERP+Funds+IV  (empty = drive root)
  const folderParam = req.nextUrl.searchParams.get("folder") ?? "";

  let token: string | null;
  try {
    token = await getGraphToken();
  } catch (err) {
    return NextResponse.json({ error: `Auth failed: ${String(err)}`, items: [] }, { status: 500 });
  }

  if (!token) {
    return NextResponse.json(
      { error: "SharePoint not configured — AZURE credentials not set.", items: [] },
      { status: 503 }
    );
  }

  const siteId = process.env.SHAREPOINT_SITE_ID;
  const userEmail = process.env.SMTP_USER;
  const driveBase = siteId
    ? `https://graph.microsoft.com/v1.0/sites/${siteId}/drive`
    : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userEmail ?? "")}/drive`;

  const headers = { Authorization: `Bearer ${token}` };

  // Build the listing URL
  const select = "$select=id,name,folder,file,size,webUrl,lastModifiedDateTime";
  const listUrl = folderParam.trim()
    ? `${driveBase}/root:/${folderParam.split("/").map(encodeURIComponent).join("/")}:/children?${select}&$top=200&$orderby=name asc`
    : `${driveBase}/root/children?${select}&$top=200&$orderby=name asc`;

  const res = await fetch(listUrl, { headers });
  if (!res.ok) {
    const errText = await res.text();
    return NextResponse.json(
      { error: `Graph API ${res.status}: ${errText.slice(0, 200)}`, items: [] },
      { status: 500 }
    );
  }

  const data = await res.json();
  const raw: any[] = data.value ?? [];

  const items: BrowseItem[] = raw.map((item) => {
    const isFolder = !!item.folder;
    const ext = isFolder ? "" : ("." + (item.name.split(".").pop() ?? "")).toLowerCase();
    return {
      id: item.id,
      name: item.name,
      type: isFolder ? "folder" : "file",
      extension: ext,
      size: item.size ?? 0,
      webUrl: item.webUrl ?? "",
      lastModifiedDateTime: item.lastModifiedDateTime ?? "",
    };
  });

  // Sort: folders first, then files; both groups alphabetically
  items.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return NextResponse.json({ folder: folderParam, items } satisfies BrowseResponse);
}
