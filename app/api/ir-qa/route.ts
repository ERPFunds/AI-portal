import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listQa, updateQa, type QaStatus } from "@/lib/agents/ir/qa-store";

export const dynamic = "force-dynamic";

const STATUSES: QaStatus[] = ["pending", "approved", "rejected"];

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const statusParam = req.nextUrl.searchParams.get("status") as QaStatus | null;
  const status = statusParam && STATUSES.includes(statusParam) ? statusParam : undefined;
  try {
    return NextResponse.json({ items: await listQa(status) });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { id?: string; status?: QaStatus; question?: string; answer?: string; category?: string };
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (body.status && !STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }
  try {
    await updateQa(body.id, {
      status: body.status,
      question: body.question,
      answer: body.answer,
      category: body.category,
      reviewedBy: user.email ?? user.id,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
