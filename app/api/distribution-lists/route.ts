import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendMailAs } from "@/lib/agents/ir/graph-mailbox";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Distribution lists for IR blasts. First list: brokers/advisors (from Salesforce Opportunity
// partner-contact records). GET returns the deduped list; POST sends a BCC blast as Meghan/William.
const API = "v60.0";
const SEND_AS = { Meghan: "mberry@erpfunds.com", William: "wmeyer@erpfunds.com" } as const;

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

const rel = (v: unknown): string | null => {
  const o = v as { Name?: unknown } | null | undefined;
  return o?.Name != null && String(o.Name).trim() ? String(o.Name) : null;
};

// Unique broker/advisor reps (with email) drawn from the Opportunity partner-contact records.
async function brokerList(): Promise<{ rep: string | null; firm: string | null; email: string }[]> {
  const { token, instance } = await sfToken();
  const soql =
    "SELECT Partner_Advisor_Contact__r.Name, Partner_Advisor_Contact__r.Email, " +
    "Partner_Broker_Dealer__r.Name, Partner_Advisor__r.Name, Partner_Brokerage__r.Name " +
    "FROM Opportunity WHERE Partner_Advisor_Contact__r.Email != null";
  const byEmail = new Map<string, { rep: string | null; firm: string | null; email: string }>();
  let url: string | null = `${instance}/services/data/${API}/query?q=${encodeURIComponent(soql)}`;
  let guard = 0;
  while (url && guard++ < 30) {
    const r: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`SF query ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    for (const o of ((j.records ?? []) as Record<string, unknown>[])) {
      const c = o.Partner_Advisor_Contact__r as { Email?: unknown } | null;
      const email = c?.Email != null ? String(c.Email).trim().toLowerCase() : "";
      if (!email || byEmail.has(email)) continue;
      byEmail.set(email, {
        rep: rel(o.Partner_Advisor_Contact__r),
        firm: rel(o.Partner_Broker_Dealer__r) || rel(o.Partner_Advisor__r) || rel(o.Partner_Brokerage__r),
        email,
      });
    }
    url = j.done === false && j.nextRecordsUrl ? `${instance}${j.nextRecordsUrl}` : null;
  }
  return [...byEmail.values()].sort((a, b) => (a.firm || "").localeCompare(b.firm || "") || (a.rep || "").localeCompare(b.rep || ""));
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!(process.env.SF_TOKEN_URL && process.env.SF_CLIENT_ID && process.env.SF_CLIENT_SECRET)) {
    return NextResponse.json({ error: "Salesforce not configured" }, { status: 503 });
  }
  try {
    const brokers = await brokerList();
    return NextResponse.json({ brokers, count: brokers.length });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  let body: { from?: string; subject?: string; body?: string; emails?: string[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const emails = [...new Set((body.emails ?? []).map((e) => (e || "").trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))];
  if (emails.length === 0) return NextResponse.json({ error: "No valid recipient emails" }, { status: 400 });
  const content = (body.body || "").trim();
  if (!content) return NextResponse.json({ error: "Message body is required" }, { status: 400 });
  const subject = (body.subject || "").trim() || "ERP Industrials";
  const fromMailbox = body.from === "William" ? SEND_AS.William : SEND_AS.Meghan;

  try {
    // BCC the whole list so recipients don't see each other; the To is the sender's own mailbox.
    await sendMailAs(fromMailbox, { to: [fromMailbox], bcc: emails, subject, content, contentType: "Text" });
    return NextResponse.json({ ok: true, sent: emails.length, from: fromMailbox });
  } catch (e) {
    return NextResponse.json({ error: `Send failed: ${String(e).slice(0, 200)}` }, { status: 500 });
  }
}
