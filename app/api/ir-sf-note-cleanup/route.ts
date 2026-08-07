import { NextRequest, NextResponse } from "next/server";
import { salesforceConfigured, reviewAgentCorrespondenceTasks } from "@/lib/agents/ir/salesforce";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// One-time: review the correspondence notes (Tasks) the IR agent logged to Salesforce and remove the
// ones that don't meet the current policy (day-to-day). Read-only preview unless ?apply=1&confirm=YES.
export async function GET(req: NextRequest) {
  if (!salesforceConfigured()) return NextResponse.json({ error: "Salesforce not configured" }, { status: 503 });
  const apply = req.nextUrl.searchParams.get("apply") === "1" && req.nextUrl.searchParams.get("confirm") === "YES";
  const limit = Number(req.nextUrl.searchParams.get("limit")) || 800;

  const r = await reviewAgentCorrespondenceTasks({ apply, limit });
  return NextResponse.json({
    mode: apply ? "APPLIED (deleted → Recycle Bin)" : "read-only (preview)",
    scanned: r.scanned,
    toDeleteCount: r.deleted.length,
    keptCount: r.kept.length,
    errors: r.errors,
    toDelete: r.deleted.map((d) => ({ subject: d.subject, contact: d.contact, email: d.email, created: d.created, category: d.category, reason: d.reason })),
  });
}
