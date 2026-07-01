import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { draftFundContent } from "@/lib/agents/ir/fund-content-agent";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { instruction, sectionTitles } = (await req.json()) as { instruction?: string; sectionTitles?: string[] };
  if (!instruction || !instruction.trim()) return NextResponse.json({ error: "instruction required" }, { status: 400 });

  try {
    return NextResponse.json(await draftFundContent({
      instruction: instruction.trim(),
      sectionTitles: Array.isArray(sectionTitles) ? sectionTitles : [],
    }));
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 500 });
  }
}
