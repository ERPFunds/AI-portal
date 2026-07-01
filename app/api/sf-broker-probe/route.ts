import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Read-only Salesforce probe to find how brokers/advisors are modeled + linked to LP Accounts.
// Self-contained SF auth (doesn't touch salesforce.ts). Session-authed; exposes no secrets.
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

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!(process.env.SF_TOKEN_URL && process.env.SF_CLIENT_ID && process.env.SF_CLIENT_SECRET)) {
    return NextResponse.json({ error: "Salesforce not configured" }, { status: 503 });
  }

  try {
    const { token, instance } = await sfToken();
    const q = async (soql: string) => {
      const r = await fetch(`${instance}/services/data/${API}/query?q=${encodeURIComponent(soql)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return { error: `${r.status}: ${(await r.text()).slice(0, 150)}` };
      return r.json();
    };

    // 1) Account.Type picklist values + Account lookup fields (a self-lookup would be the LP→broker link).
    const descRes = await fetch(`${instance}/services/data/${API}/sobjects/Account/describe`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const desc = descRes.ok ? await descRes.json() : { fields: [] };
    const typeField = (desc.fields ?? []).find((f: { name: string }) => f.name === "Type");
    const typeValues = (typeField?.picklistValues ?? []).map((p: { value: string }) => p.value);
    const accountLookups = (desc.fields ?? [])
      .filter((f: { type: string; referenceTo?: string[] }) => f.type === "reference" && (f.referenceTo ?? []).length)
      .map((f: { label: string; name: string; referenceTo: string[] }) => `${f.label} (${f.name}) -> ${f.referenceTo.join("/")}`);

    // 2) Counts per Account Type.
    const typeCounts = await q("SELECT Type, COUNT(Id) c FROM Account GROUP BY Type ORDER BY COUNT(Id) DESC");

    // 3) Sample broker/advisor accounts + how many child accounts each has (ParentId link).
    const brokers = await q("SELECT Id, Name, Type, (SELECT Name FROM ChildAccounts LIMIT 3) FROM Account WHERE Type LIKE '%Broker%' OR Type LIKE '%Advisor%' OR Type LIKE '%Dealer%' OR Type LIKE '%RIA%' OR Type LIKE '%Wealth%' LIMIT 15");

    // 4) Is AccountContactRelation available (a common LP<->broker link)?
    const acr = await q("SELECT Id, Account.Name, Contact.Name, Roles FROM AccountContactRelation LIMIT 5");

    return NextResponse.json({
      accountTypeValues: typeValues,
      accountLookupFields: accountLookups, // watch for a Broker/Advisor lookup here
      typeCounts: typeCounts.records ?? typeCounts,
      brokerAccountsSample: brokers.records ?? brokers,
      accountContactRelationSample: acr.records ?? acr,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 500 });
  }
}
