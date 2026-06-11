import { NextRequest, NextResponse } from "next/server";
import { getGraphToken } from "@/lib/agents/graph-token";

export const maxDuration = 120;

interface HarvestedMessage {
  subject: string;
  sentDateTime: string;
  to: string[];
  bodyText: string;
}

function isAuthorized(req: NextRequest): boolean {
  const secret = req.headers.get("x-harvest-secret");
  return !!process.env.HARVEST_SECRET && secret === process.env.HARVEST_SECRET;
}

function isExternal(addresses: string[]): boolean {
  return addresses.some((a) => !a.toLowerCase().endsWith("@erpfunds.com"));
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const mailbox = params.get("mailbox") || "mberry@erpfunds.com";
  const months = Math.min(Number(params.get("months")) || 12, 24);
  const maxMessages = Math.min(Number(params.get("max")) || 200, 500);
  const externalOnly = params.get("externalOnly") !== "false";

  let token: string | null;
  try {
    token = await getGraphToken();
  } catch (err) {
    return NextResponse.json({ error: `Auth failed: ${String(err)}` }, { status: 502 });
  }
  if (!token) {
    return NextResponse.json({ error: "AZURE credentials not configured" }, { status: 503 });
  }

  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const sinceIso = since.toISOString().split(".")[0] + "Z";

  const messages: HarvestedMessage[] = [];
  let url: string | null =
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/mailFolders/sentitems/messages` +
    `?$filter=sentDateTime ge ${sinceIso}` +
    `&$select=subject,sentDateTime,toRecipients,body` +
    `&$orderby=sentDateTime desc&$top=50`;

  while (url && messages.length < maxMessages) {
    const res: Response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Prefer: 'outlook.body-content-type="text"',
      },
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json(
        { error: `Graph API ${res.status}: ${err}`, harvested: messages.length },
        { status: res.status === 403 ? 403 : 502 }
      );
    }

    const data = await res.json();
    for (const m of data.value || []) {
      const to = (m.toRecipients || []).map(
        (r: { emailAddress: { address: string } }) => r.emailAddress.address
      );
      if (externalOnly && !isExternal(to)) continue;
      messages.push({
        subject: m.subject || "",
        sentDateTime: m.sentDateTime,
        to,
        bodyText: (m.body?.content || "").slice(0, 6000),
      });
      if (messages.length >= maxMessages) break;
    }
    url = data["@odata.nextLink"] || null;
  }

  return NextResponse.json({ mailbox, since: sinceIso, count: messages.length, messages });
}
