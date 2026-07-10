import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listAllCorrections, deleteCorrection, restoreCorrection } from "@/lib/agents/ir/corrections-store";
import { regenerateCorrectionsDoc } from "@/lib/agents/ir/corrections-doc";

export const dynamic = "force-dynamic";

// Review surface for the draft-vs-sent learnings. GET lists active (default) or deleted entries;
// PATCH tombstones or restores one, then rebuilds the "IR Agent Corrections" KB doc so what the
// drafter sees and what the KB shows stay in sync with the human's pruning.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const status = req.nextUrl.searchParams.get("status") === "deleted" ? "deleted" : "active";
  try {
    const all = await listAllCorrections();
    return NextResponse.json({ items: all.filter((c) => c.status === status) });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { id?: string; action?: "delete" | "restore" };
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (body.action !== "delete" && body.action !== "restore") {
    return NextResponse.json({ error: "action must be 'delete' or 'restore'" }, { status: 400 });
  }
  try {
    if (body.action === "delete") await deleteCorrection(body.id);
    else await restoreCorrection(body.id);
    // Keep the KB doc + drafter grounding consistent with the change.
    const doc = await regenerateCorrectionsDoc();
    return NextResponse.json({ ok: true, doc: { ok: doc.ok, count: doc.count } });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
