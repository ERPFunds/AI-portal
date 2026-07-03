import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Read-only probe to verify IR Salesforce logging end-to-end. Lists the most recent IR Tasks
// (the "Email: …" inbound logs and "Reply: …" sent-reply logs we create on investor Contacts).
// Usage: /api/sf-tasks-probe  (optional ?limit=N, ?email=<contact email> to scope to one contact).
// Session-authed; self-contained SF auth (client-credentials).
const API = "v60.0";

async function sfToken(): Promise<{ token: string; instance: string }> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.SF_CLIENT_ID!,
    client_secret: process.env.SF_CLIENT_SECRET!,
  });
  const res = await fetch(process.env.SF_TOKEN_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`SF auth ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const d = await res.json();
  return { token: d.access_token, instance: String(d.instance_url).replace(/\/$/, "") };
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!(process.env.SF_TOKEN_URL && process.env.SF_CLIENT_ID && process.env.SF_CLIENT_SECRET)) {
    return NextResponse.json({ error: "Salesforce not configured" }, { status: 503 });
  }

  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit")) || 50, 1), 200);
  const email = req.nextUrl.searchParams.get("email")?.trim();

  try {
    const { token, instance } = await sfToken();
    const where = email
      ? `Who.Email = '${email.replace(/'/g, "\\'")}'`
      : `(Subject LIKE 'Email:%' OR Subject LIKE 'Reply:%')`;
    const soql =
      `SELECT Id, Subject, Status, ActivityDate, CreatedDate, Who.Name, Who.Email, Description ` +
      `FROM Task WHERE ${where} ORDER BY CreatedDate DESC LIMIT ${limit}`;
    const r = await fetch(`${instance}/services/data/${API}/query?q=${encodeURIComponent(soql)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return NextResponse.json({ error: `${r.status}: ${(await r.text()).slice(0, 200)}` }, { status: 502 });
    const recs = ((await r.json()).records ?? []) as Record<string, any>[];

    const tasks = recs.map((t) => ({
      subject: t.Subject as string,
      kind: /^Reply:/i.test(t.Subject) ? "reply-sent" : /^Email:/i.test(t.Subject) ? "inbound" : "other",
      status: t.Status as string,
      contact: t.Who?.Name ?? null,
      email: t.Who?.Email ?? null,
      activityDate: t.ActivityDate as string,
      createdAt: t.CreatedDate as string,
      preview: ((t.Description as string) || "").replace(/\s+/g, " ").slice(0, 220),
    }));

    return NextResponse.json({
      count: tasks.length,
      summary: {
        inbound: tasks.filter((t) => t.kind === "inbound").length,
        replies: tasks.filter((t) => t.kind === "reply-sent").length,
        mostRecent: tasks[0]?.createdAt ?? null,
      },
      tasks,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 500 });
  }
}
