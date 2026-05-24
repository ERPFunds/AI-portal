import { NextResponse } from "next/server";
import { getGraphToken } from "@/lib/agents/graph-token";

export const dynamic = "force-dynamic";

/**
 * GET /api/sharepoint-sync
 * 1. Authenticates via Graph API
 * 2. Lists the root of the SharePoint drive to see what folders actually exist
 * 3. Counts items in the agent output folders (Research, Newsletters, Build, Write)
 *    — if those folders don't exist yet, reports the root structure so we can diagnose
 */
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

  const siteId   = process.env.SHAREPOINT_SITE_ID;
  const userEmail = process.env.SMTP_USER;

  const driveBase = siteId
    ? `https://graph.microsoft.com/v1.0/sites/${siteId}/drive`
    : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userEmail ?? "")}/drive`;

  // ── Step 1: list root folder to see what actually exists ───────────────────
  const rootRes = await fetch(`${driveBase}/root/children?$select=name,folder,file,size,webUrl,lastModifiedDateTime&$top=50`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!rootRes.ok) {
    const errText = await rootRes.text();
    return NextResponse.json(
      { error: `SharePoint drive listing failed (${rootRes.status}): ${errText.slice(0, 200)}` },
      { status: 500 }
    );
  }

  const rootData   = await rootRes.json();
  const rootItems: any[] = rootData.value ?? [];

  // Root folder names (lowercase for matching)
  const rootFolderNames = rootItems
    .filter((i: any) => i.folder)
    .map((i: any) => i.name as string);

  // ── Step 2: count items in known agent folders ─────────────────────────────
  const TARGET_FOLDERS = ["Research", "Newsletters", "Build", "Write"];
  const folderResults: { folder: string; count: number; exists: boolean; sample?: string }[] = [];
  let totalFiles = 0;

  for (const folder of TARGET_FOLDERS) {
    // Find case-insensitive match in actual root items
    const match = rootFolderNames.find(n => n.toLowerCase() === folder.toLowerCase());
    const actualName = match ?? folder;

    const res = await fetch(
      `${driveBase}/root:/${encodeURIComponent(actualName)}:/children?$select=name,folder,file,lastModifiedDateTime&$top=100`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (res.status === 404) {
      folderResults.push({ folder, count: 0, exists: false });
      continue;
    }

    if (!res.ok) {
      folderResults.push({ folder, count: -1, exists: false, sample: `Error ${res.status}` });
      continue;
    }

    const data = await res.json();
    const items: any[] = data.value ?? [];

    // Count files directly in folder + count subfolders' contents for depth-2
    let fileCount = items.filter((i: any) => i.file).length;
    const subfolders = items.filter((i: any) => i.folder);

    // For each subfolder, get its child count
    for (const sub of subfolders.slice(0, 10)) {
      const subRes = await fetch(
        `${driveBase}/root:/${encodeURIComponent(actualName)}/${encodeURIComponent(sub.name)}:/children?$select=name,folder,file&$top=100`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (subRes.ok) {
        const subData = await subRes.json();
        const subItems: any[] = subData.value ?? [];
        // Also go one level deeper for Newsletters/Market/Month structure
        for (const sub2 of subItems.filter((i: any) => i.folder).slice(0, 10)) {
          const sub2Res = await fetch(
            `${driveBase}/root:/${encodeURIComponent(actualName)}/${encodeURIComponent(sub.name)}/${encodeURIComponent(sub2.name)}:/children?$select=name,file&$top=100`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (sub2Res.ok) {
            const sub2Data = await sub2Res.json();
            fileCount += (sub2Data.value ?? []).filter((i: any) => i.file).length;
          }
        }
        fileCount += subItems.filter((i: any) => i.file).length;
      }
    }

    totalFiles += fileCount;
    const latestFile = items.find((i: any) => i.file)?.name ?? subfolders[0]?.name;
    folderResults.push({
      folder: actualName,
      count: fileCount,
      exists: true,
      sample: latestFile,
    });
  }

  // ── Build response ──────────────────────────────────────────────────────────
  const foundFolders = folderResults.filter(f => f.exists && f.count > 0);
  const missingFolders = TARGET_FOLDERS.filter(
    f => !folderResults.find(r => r.folder.toLowerCase() === f.toLowerCase() && r.exists)
  );

  let message: string;
  if (totalFiles > 0) {
    message = `SharePoint connected · ${foundFolders.map(f => `${f.folder} (${f.count} file${f.count !== 1 ? 's' : ''})`).join(", ")}`;
  } else if (rootItems.length > 0) {
    // Connected, drive accessible, but none of our folders exist yet
    const rootNames = rootFolderNames.slice(0, 8).join(", ");
    message = `SharePoint connected — agent output folders not yet created. Drive root contains: ${rootNames || "(empty)"}. Folders will be created automatically when agents save their first file.`;
  } else {
    message = "SharePoint connected — drive appears empty.";
  }

  return NextResponse.json({
    ok: true,
    count: totalFiles,
    message,
    folders: folderResults,
    rootFolders: rootFolderNames,
    missingFolders,
  });
}
