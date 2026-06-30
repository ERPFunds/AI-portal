import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { salesforcePing } from "@/lib/agents/ir/salesforce";

export const dynamic = "force-dynamic";

// GET /api/ir-sf-test — read-only Salesforce connectivity check (writes nothing).
// Visit while signed in to confirm the Connected App credentials authenticate.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await salesforcePing();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
