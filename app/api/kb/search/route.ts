import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { retrieveChunks, voyageConfigured } from "@/lib/agents/ir/embeddings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const anthropic = new Anthropic();

/**
 * Semantic search over the knowledge base: embed the question, retrieve the most relevant chunks
 * (pgvector), and return a short cited answer + the source passages. One Voyage query-embed per call.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  if (!voyageConfigured()) return NextResponse.json({ error: "Search is not configured (VOYAGE_API_KEY missing)" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const q: string = (body.q ?? "").toString().trim();
  if (!q) return NextResponse.json({ error: "query required" }, { status: 400 });

  let chunks;
  try {
    chunks = await retrieveChunks(q, null, 10); // null = across the whole embedded KB
  } catch (e) {
    return NextResponse.json({ error: `Search failed: ${String(e).slice(0, 200)}` }, { status: 500 });
  }

  if (!chunks.length) {
    return NextResponse.json({ answer: "No matching content found in the knowledge base yet.", sources: [] });
  }

  const context = chunks.map((c, i) => `[${i + 1}] (${c.filename})\n${c.content}`).join("\n\n");
  let answer = "";
  try {
    const msg = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 700,
      system: "You answer questions using ONLY the provided knowledge-base excerpts. Be concise and specific — quote figures, names, and terms exactly as written. Cite the source document name in parentheses after each fact. If the excerpts don't contain the answer, say so plainly rather than guessing.",
      messages: [{ role: "user", content: `Question: ${q}\n\n=== KNOWLEDGE BASE EXCERPTS ===\n${context}` }],
    });
    answer = msg.content[0]?.type === "text" ? msg.content[0].text : "";
  } catch (e) {
    answer = `(Answer synthesis unavailable: ${String(e).slice(0, 120)}) — see the matching passages below.`;
  }

  // Dedupe sources by filename, keep the best-scoring snippet per doc.
  const seen = new Set<string>();
  const sources = chunks
    .filter((c) => (seen.has(c.filename) ? false : (seen.add(c.filename), true)))
    .map((c) => ({ filename: c.filename, category: c.category, similarity: Math.round(c.similarity * 100) / 100, snippet: c.content.slice(0, 300) }));

  return NextResponse.json({ answer, sources });
}
