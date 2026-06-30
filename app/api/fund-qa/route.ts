import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { answerFundQuestion } from "@/lib/agents/ir/fund-qa-agent";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { question } = (await req.json()) as { question?: string };
  if (!question || !question.trim()) return NextResponse.json({ error: "question required" }, { status: 400 });

  try {
    return NextResponse.json(await answerFundQuestion(question.trim()));
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 500 });
  }
}
