import { createAdminClient } from "@/lib/supabase/admin";

// General KB retrieval layer: chunk documents, embed them with Voyage AI, store the vectors in
// `document_chunks`, and retrieve the top-k relevant chunks for a query. Used by the DD responder,
// Fund Q&A, and any KB-grounded agent so they send only relevant passages instead of whole docs.

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = process.env.VOYAGE_MODEL || "voyage-4";
const EMBED_DIM = 1024; // must match the vector(1024) column + match_document_chunks signature

const CHUNK_CHARS = 1500;
const CHUNK_OVERLAP = 200;
const EMBED_BATCH = 64;

export function voyageConfigured(): boolean {
  return !!process.env.VOYAGE_API_KEY;
}

/** Embed a batch of texts with Voyage. input_type "document" for stored chunks, "query" for searches. */
export async function embed(texts: string[], inputType: "document" | "query"): Promise<number[][]> {
  if (!process.env.VOYAGE_API_KEY) throw new Error("VOYAGE_API_KEY not set");
  if (texts.length === 0) return [];
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH);
    const res = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input: batch, model: VOYAGE_MODEL, input_type: inputType, output_dimension: EMBED_DIM }),
    });
    if (!res.ok) throw new Error(`Voyage ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const rows = (data.data ?? []) as { embedding: number[]; index: number }[];
    rows.sort((a, b) => a.index - b.index);
    for (const r of rows) out.push(r.embedding);
  }
  return out;
}

/** Split text into overlapping character windows, preferring paragraph/line boundaries. */
export function chunkText(text: string): string[] {
  const clean = (text || "").replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  if (clean.length <= CHUNK_CHARS) return [clean];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + CHUNK_CHARS, clean.length);
    if (end < clean.length) {
      // back off to the nearest paragraph/newline/space so we don't split mid-word
      const slice = clean.slice(start, end);
      const brk = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf("\n"), slice.lastIndexOf(". "));
      if (brk > CHUNK_CHARS * 0.5) end = start + brk + 1;
    }
    const piece = clean.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= clean.length) break;
    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }
  return chunks;
}

/** Re-embed one document: replace its chunks in document_chunks with freshly embedded ones. */
export async function embedAndStoreChunks(p: {
  fileId: string;
  filename: string;
  category: string | null;
  text: string;
}): Promise<number> {
  const chunks = chunkText(p.text);
  const admin = createAdminClient();
  // Idempotent: clear any prior chunks for this file, then insert the current set.
  await admin.from("document_chunks").delete().eq("file_id", p.fileId);
  if (chunks.length === 0) return 0;
  const vectors = await embed(chunks, "document");
  const rows = chunks.map((content, i) => ({
    file_id: p.fileId,
    category: p.category ?? null,
    filename: p.filename,
    chunk_index: i,
    content,
    embedding: JSON.stringify(vectors[i]), // pgvector accepts the "[..]" text form via PostgREST
  }));
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await admin.from("document_chunks").insert(rows.slice(i, i + 200));
    if (error) throw new Error(`document_chunks insert: ${error.message}`);
  }
  return rows.length;
}

export interface RetrievedChunk {
  file_id: string;
  filename: string;
  category: string | null;
  chunk_index: number;
  content: string;
  similarity: number;
}

/** Embed the query and return the top-k most similar chunks, optionally scoped to categories. */
export async function retrieveChunks(query: string, categories: string[] | null, k = 8): Promise<RetrievedChunk[]> {
  if (!voyageConfigured()) return [];
  const [qvec] = await embed([query], "query");
  if (!qvec) return [];
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("match_document_chunks", {
    query_embedding: JSON.stringify(qvec),
    match_count: k,
    filter_categories: categories && categories.length ? categories : null,
  });
  if (error) throw new Error(`match_document_chunks: ${error.message}`);
  return (data ?? []) as RetrievedChunk[];
}
