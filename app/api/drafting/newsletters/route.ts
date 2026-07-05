import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sql } from "@vercel/postgres";

const AGENT_LABELS: Record<string, string> = {
  "brevard-weekly":           "Brevard Weekly Market Update",
  "brevard-submarket":        "Brevard Submarket Watch",
  "brevard-fund":             "Brevard Fund Landscape",
  "brevard-submarket-watch":  "Brevard Submarket Watch",
  "brevard-fund-landscape":   "Brevard Fund Landscape",
  "brevard-vacancy":          "Brevard Vacancy Report",
  "permian-brief":            "Permian Weekly Market Update",
  "permian-submarket-watch":  "Permian Submarket Watch",
  "permian-fund-landscape":   "Permian Fund Landscape",
  "permian-vacancy":          "Permian Vacancy Report",
  "submarket-watch":          "Submarket Watch",
  "fund-landscape-brief":     "Fund Landscape Brief",
};

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { rows } = await sql`
      SELECT id, agent_name, subject, sent_at, narrative
      FROM briefs
      ORDER BY sent_at DESC
      LIMIT 60
    `;

    const briefs = rows.map((r) => ({
      id: r.id as string,
      agentName: r.agent_name as string,
      label: AGENT_LABELS[r.agent_name as string] ?? (r.agent_name as string),
      subject: r.subject as string,
      sentAt: r.sent_at as string,
      narrative: r.narrative as string,
    }));

    return NextResponse.json({ briefs });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
