import { NextResponse } from "next/server";
import { getGraphToken } from "@/lib/agents/graph-token";

export const dynamic = "force-dynamic";

interface SPFile {
  name: string;
  webUrl: string;
  lastModifiedDateTime: string;
  size: number;
  folder: string;   // top-level agent folder (Research, Newsletters, etc.)
  path: string;     // full relative path, e.g. "Newsletters/Brevard/May 2026"
}

export async function GET() {
  // ── Auth ────────────────────────────────────────────────────────────────────
  let token: string | null;
  try {
    token = await getGraphToken();
  } catch (err) {
    return NextResponse.json(
      { error: `SharePoint auth failed: ${String(err)}` },
      { status: 500 }
    );
  }

  if (!token) {
    return NextResponse.json(
      { error: "SharePoint not configured — AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET must all be set in Vercel environment variables." },
      { status: 503 }
    );
  }

  const siteId    = process.env.SHAREPOINT_SITE_ID;
  const userEmail = process.env.SMTP_USER;

  const driveBase = siteId
    ? `https://graph.microsoft.com/v1.0/sites/${siteId}/drive`
    : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userEmail ?? "")}/drive`;

  const headers = { Authorization: `Bearer ${token}` };

  // ── List drive root ──────────────────────────────────────────────────────────
  const rootRes = await fetch(
    `${driveBase}/root/children?$select=name,folder,file,size,webUrl,lastModifiedDateTime&$top=50`,
    { headers }
  );

  if (!rootRes.ok) {
    const errText = await rootRes.text();
    return NextResponse.json(
      { error: `SharePoint drive listing failed (${rootRes.status}): ${errText.slice(0, 200)}` },
      { status: 500 }
    );
  }

  const rootData  = await rootRes.json();
  const rootItems: any[] = rootData.value ?? [];
  const rootFolderNames  = rootItems.filter((i: any) => i.folder).map((i: any) => i.name as string);

  // ── Collect files from agent folders (up to 3 levels deep) ──────────────────
  const TARGET_FOLDERS = ["Research", "Newsletters", "Build", "Write"];
  const allFiles: SPFile[] = [];
  const folderSummary: { folder: string; count: number; exists: boolean }[] = [];

  async function collectFiles(pathSegments: string[], depth: number) {
    const encodedPath = pathSegments.map(encodeURIComponent).join("/");
    const url = `${driveBase}/root:/${encodedPath}:/children?$select=name,folder,file,size,webUrl,lastModifiedDateTime&$top=200`;
    const res = await fetch(url, { headers });
    if (!res.ok) return;
    const data = await res.json();
    const items: any[] = data.value ?? [];

    for (const item of items) {
      if (item.file) {
        allFiles.push({
          name: item.name,
          webUrl: item.webUrl,
          lastModifiedDateTime: item.lastModifiedDateTime,
          size: item.size ?? 0,
          folder: pathSegments[0],
          path: pathSegments.join("/"),
        });
      } else if (item.folder && depth < 3) {
        await collectFiles([...pathSegments, item.name], depth + 1);
      }
    }
  }

  for (const folder of TARGET_FOLDERS) {
    const match = rootFolderNames.find(n => n.toLowerCase() === folder.toLowerCase());
    if (!match) {
      folderSummary.push({ folder, count: 0, exists: false });
      continue;
    }

    const beforeCount = allFiles.length;
    await collectFiles([match], 1);
    const added = allFiles.length - beforeCount;
    folderSummary.push({ folder: match, count: added, exists: true });
  }

  // Sort newest first
  allFiles.sort((a, b) =>
    new Date(b.lastModifiedDateTime).getTime() - new Date(a.lastModifiedDateTime).getTime()
  );

  // ── Build response message ───────────────────────────────────────────────────
  const totalFiles = allFiles.length;
  const foundFolders = folderSummary.filter(f => f.exists && f.count > 0);
  const missingFolders = TARGET_FOLDERS.filter(
    f => !folderSummary.find(r => r.folder.toLowerCase() === f.toLowerCase() && r.exists)
  );

  let message: string;
  if (totalFiles > 0) {
    message = `SharePoint connected · ${foundFolders.map(f => `${f.folder} (${f.count} file${f.count !== 1 ? "s" : ""})`).join(", ")}`;
  } else if (rootItems.length > 0) {
    const rootNames = rootFolderNames.slice(0, 8).join(", ");
    message = `SharePoint connected — agent output folders not yet created. Drive root contains: ${rootNames || "(empty)"}. Folders will be created automatically when agents save their first file.`;
  } else {
    message = "SharePoint connected — drive appears empty.";
  }

  return NextResponse.json({
    ok: true,
    count: totalFiles,
    message,
    files: allFiles,
    folders: folderSummary,
    rootFolders: rootFolderNames,
    missingFolders,
  });
}
