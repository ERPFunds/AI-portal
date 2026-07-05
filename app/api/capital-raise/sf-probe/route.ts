import { NextResponse } from "next/server";
import { opportunityPipelineProbe } from "@/lib/agents/ir/salesforce";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Read-only diagnostic: inspect the org's Opportunity funnel to design the Capital Raising sync.
// Writes nothing. Temporary — remove once the sync mapping is set.
export async function GET() {
  try {
    return NextResponse.json(await opportunityPipelineProbe());
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 500 });
  }
}
