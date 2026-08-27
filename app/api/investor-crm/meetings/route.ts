import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Meeting history for one investor, sourced from the IR dialogue log (ir_dialogue_log) —
// the same table the LP Directory reads for "last interaction". Matched by LP name
// (case-insensitive), optionally narrowed by the investor's known email.
// RLS-locked → service-role client.

const COLS = "id, created_at, from_email, lp_name, meeting_date, medium, interest_level, sticking_points, follow_up_commitments, relationship_context, next_touch_suggestion, onedrive_url";

export async function GET(req: NextRequest) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createAdminClient();

  const investor = (req.nextUrl.searchParams.get("investor") ?? "").trim();
  const email = (req.nextUrl.searchParams.get("email") ?? "").trim().toLowerCase();
  if (!investor && !email) return NextResponse.json({ error: "investor or email required" }, { status: 400 });

  let query = supabase.from("ir_dialogue_log").select(COLS);
  if (investor && email) {
    query = query.or(`lp_name.ilike.${investor},from_email.ilike.${email}`);
  } else if (investor) {
    query = query.ilike("lp_name", investor);
  } else {
    query = query.ilike("from_email", email);
  }

  const { data, error } = await query
    .order("meeting_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ meetings: data ?? [] });
}
