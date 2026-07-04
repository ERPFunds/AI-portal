import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Team-wide saved KB searches: a growing internal FAQ. All access is gated on an authed session;
// every signed-in user sees the whole list.

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { data, error } = await supabase
    .from("kb_saved_searches")
    .select("id, query, answer, sources, saved_by, saved_at")
    .order("saved_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const query = (body.query ?? "").toString().trim();
  const answer = (body.answer ?? "").toString();
  const sources = Array.isArray(body.sources) ? body.sources : [];
  if (!query || !answer) return NextResponse.json({ error: "query and answer required" }, { status: 400 });

  const { data, error } = await supabase
    .from("kb_saved_searches")
    .insert({ query, answer, sources, saved_by: user.email ?? user.id })
    .select("id, query, answer, sources, saved_by, saved_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase.from("kb_saved_searches").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
