import { NextResponse } from "next/server";
import { getRecentResearchLog } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await getRecentResearchLog(50);
    return NextResponse.json({ rows });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
