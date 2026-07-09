import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { salesforceConfigured, deleteAccountsByName } from "@/lib/agents/ir/salesforce";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// One-time: remove investors that transferred out (Commerce Street ERP Feeder Fund, LivingTree
// Capital) from BOTH Salesforce (account + children → Recycle Bin) and the LP directory (their
// lp_prior_contacts rows, which drive the prior-fund overlay). Read-only unless ?apply=1&confirm=YES.
const TARGETS = ["Commerce Street ERP Feeder Fund, LP", "LivingTree Capital Corporation"];
const TARGET_KEYS = ["commerce street erp feeder fund lp", "livingtree capital corporation"];

export async function GET(req: NextRequest) {
  if (!salesforceConfigured()) return NextResponse.json({ error: "Salesforce not configured" }, { status: 503 });
  const apply = req.nextUrl.searchParams.get("apply") === "1" && req.nextUrl.searchParams.get("confirm") === "YES";

  const salesforce = await deleteAccountsByName(TARGETS, { apply });

  const admin = createAdminClient();
  let directoryRemoved: number | string = 0;
  if (apply) {
    const { data, error } = await admin.from("lp_prior_contacts").delete().in("investor_key", TARGET_KEYS).select("id");
    directoryRemoved = error ? `error: ${error.message}` : (data?.length ?? 0);
  } else {
    const { count } = await admin.from("lp_prior_contacts").select("id", { count: "exact", head: true }).in("investor_key", TARGET_KEYS);
    directoryRemoved = `${count ?? 0} rows would be removed`;
  }

  return NextResponse.json({ mode: apply ? "APPLIED" : "read-only (preview)", salesforce, directoryRemoved });
}
