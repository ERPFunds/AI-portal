import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { salesforceConfigured, describeFields, listCustomObjects } from "@/lib/agents/ir/salesforce";

export const dynamic = "force-dynamic";

// Read-only Salesforce schema discovery — used once to find the custom field API names
// (LP Type, Capital Called, Distributions, …) so the LP directory can map them correctly.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!salesforceConfigured()) {
    return NextResponse.json({ error: "Salesforce not configured (SF_TOKEN_URL / SF_CLIENT_ID / SF_CLIENT_SECRET)" }, { status: 503 });
  }

  // Surface custom fields + anything whose name hints at LP financials, on Contact and Account.
  const relevant = /type|called|capital|distribut|commit|fund|invest|lp|subscrib|class|series/i;
  const pick = (fields: unknown) =>
    Array.isArray(fields)
      ? fields.filter((f: { name: string; custom: boolean }) => f.custom || relevant.test(f.name))
      : fields;

  try {
    const [contact, account, customObjects] = await Promise.all([
      describeFields("Contact").catch((e) => ({ error: String(e) })),
      describeFields("Account").catch((e) => ({ error: String(e) })),
      listCustomObjects().catch((e) => ({ error: String(e) })),
    ]);
    return NextResponse.json({
      ok: true,
      contactFields: pick(contact),
      accountFields: pick(account),
      customObjects,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
