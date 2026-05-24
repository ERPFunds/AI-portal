import { NextResponse } from "next/server";
import { getGraphToken } from "@/lib/agents/graph-token";

export const dynamic = "force-dynamic";

/**
 * GET /api/sharepoint-write-test
 * Tries to write a small test file to SharePoint under Newsletters/Test/
 * Returns the full Graph API response so we can diagnose permission errors.
 */
export async function GET() {
  let token: string | null;
  try {
    token = await getGraphToken();
  } catch (err) {
    return NextResponse.json({ step: "auth", error: String(err) }, { status: 500 });
  }

  if (!token) {
    return NextResponse.json({ step: "auth", error: "No token — check AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET" }, { status: 503 });
  }

  const siteId    = process.env.SHAREPOINT_SITE_ID;
  const userEmail = process.env.SMTP_USER;

  const driveBase = siteId
    ? `https://graph.microsoft.com/v1.0/sites/${siteId}/drive`
    : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userEmail ?? "")}/drive`;

  const now = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `write-test-${now}.txt`;
  const encodedPath = `Newsletters/Test/${encodeURIComponent(filename)}`;
  const uploadUrl = `${driveBase}/root:/${encodedPath}:/content`;

  const body = Buffer.from(`SharePoint write test — ${new Date().toISOString()}`, "utf-8");

  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Length": String(body.length),
    },
    body: new Uint8Array(body),
  });

  const responseText = await res.text();
  let responseJson: unknown = null;
  try { responseJson = JSON.parse(responseText); } catch { /* keep as text */ }

  return NextResponse.json({
    step: "write",
    ok: res.ok,
    status: res.status,
    uploadUrl,
    response: responseJson ?? responseText,
  });
}
