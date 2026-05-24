import { NextResponse } from "next/server";
import { getGraphToken } from "@/lib/agents/graph-token";

export const dynamic = "force-dynamic";

/**
 * GET /api/sharepoint-sync
 * Lists files from the SharePoint agent output folders (Research, Newsletters, Build, Write)
 * and returns a count + sample of what's there. Used to verify the SharePoint connection
 * is working and to show what's been saved.
 */
export async function GET() {
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
      { error: "SharePoint not configured — AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET not set in Vercel environment variables." },
      { status: 503 }
    );
  }

  const siteId = process.env.SHAREPOINT_SITE_ID;
  const userEmail = process.env.SMTP_USER;

  if (!siteId && !userEmail) {
    return NextResponse.json(
      { error: "Neither SHAREPOINT_SITE_ID nor SMTP_USER is set — cannot determine SharePoint drive." },
      { status: 503 }
    );
  }

  // Build the base drive URL
  const driveBase = siteId
    ? `https://graph.microsoft.com/v1.0/sites/${siteId}/drive`
    : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userEmail!)}/drive`;

  // Folders to check
  const folders = ["Research", "Newsletters", "Build", "Write"];
  const results: { folder: string; count: number; latest?: string }[] = [];
  let totalCount = 0;

  for (const folder of folders) {
    try {
      const res = await fetch(
        `${driveBase}/root:/${encodeURIComponent(folder)}:/children?$select=name,createdDateTime,webUrl&$orderby=createdDateTime desc&$top=5`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.status === 404) {
        // Folder doesn't exist yet — that's fine
        results.push({ folder, count: 0 });
        continue;
      }

      if (!res.ok) {
        const errText = await res.text();
        results.push({ folder, count: -1, latest: `Error: ${res.status} ${errText.slice(0, 80)}` });
        continue;
      }

      const data = await res.json();
      const items: any[] = data.value ?? [];
      // Get total count via separate call
      const countRes = await fetch(
        `${driveBase}/root:/${encodeURIComponent(folder)}:/children?$count=true&$select=id`,
        { headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: "eventual" } }
      );
      let count = items.length;
      if (countRes.ok) {
        const countData = await countRes.json();
        count = countData["@odata.count"] ?? items.length;
      }
      totalCount += count;
      results.push({
        folder,
        count,
        latest: items[0]?.name ?? undefined,
      });
    } catch (err) {
      results.push({ folder, count: -1, latest: String(err) });
    }
  }

  const connected = results.some(r => r.count >= 0);
  const folderSummary = results
    .filter(r => r.count > 0)
    .map(r => `${r.folder} (${r.count})`)
    .join(", ");

  return NextResponse.json({
    ok: connected,
    count: totalCount,
    message: connected
      ? totalCount > 0
        ? `SharePoint connected · ${folderSummary || "folders found, no files yet"}`
        : "SharePoint connected — no agent output files found yet"
      : "SharePoint reachable but folder listing failed",
    folders: results,
  });
}
