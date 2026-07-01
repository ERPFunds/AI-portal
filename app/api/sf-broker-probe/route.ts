import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Read-only Salesforce probe to find how a broker/advisor links to an LP Account.
// Usage: /api/sf-broker-probe?lp=<exact LP name>. Self-contained SF auth; session-authed.
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

  const lp = req.nextUrl.searchParams.get("lp");

  try {
    const { token, instance } = await sfToken();
    const q = async (soql: string) => {
      const r = await fetch(`${instance}/services/data/${API}/query?q=${encodeURIComponent(soql)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return { error: `${r.status}: ${(await r.text()).slice(0, 200)}` };
      const j = await r.json();
      return j.records ?? j;
    };

    if (!lp) {
      return NextResponse.json({
        hint: "Add ?lp=<exact LP name from the schedule> to trace how that LP links to its broker.",
        brokerRepsSample: await q("SELECT Name, Account.Name, Account.Type FROM Contact WHERE Account.Type IN ('Brokerage','Advisor','Broker Dealer') LIMIT 12"),
      });
    }

    const esc = lp.replace(/'/g, "\\'");
    const accRows = await q(`SELECT Id, Name, Type, ParentId, Parent.Name, Parent.Type FROM Account WHERE Name = '${esc}' LIMIT 1`);
    const a = Array.isArray(accRows) ? accRows[0] : null;
    if (!a) return NextResponse.json({ lp, found: false, note: "No Account with that exact name.", accRows });
    const id = (a as { Id: string }).Id;

    return NextResponse.json({
      lp,
      found: true,
      account: a, // includes Type + Parent (a broker could be the Parent Account)
      accountContactRelations: await q(`SELECT Contact.Name, Contact.Account.Name, Contact.Account.Type, Roles, IsDirect FROM AccountContactRelation WHERE AccountId = '${id}'`),
      contactsOnAccount: await q(`SELECT Name, Account.Name, Account.Type FROM Contact WHERE AccountId = '${id}'`),
      opportunities: await q(`SELECT Name, Type, Amount, Partner_Advisor__r.Name, Partner_Brokerage__r.Name, Partner_Broker_Dealer__r.Name, Partner_Advisor_Contact__r.Name FROM Opportunity WHERE AccountId = '${id}'`),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 500 });
  }
}
