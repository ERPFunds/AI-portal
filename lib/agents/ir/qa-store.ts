import { createClient } from "@/lib/supabase/server";

export type QaStatus = "pending" | "approved" | "rejected";

export interface QaEntry {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  status: QaStatus;
  source_subject: string | null;
  source_mailbox: string | null;
  source_sent_at: string | null;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

export interface QaCandidate {
  question: string;
  answer: string;
  category?: string | null;
  sourceSubject?: string | null;
  sourceMailbox?: string | null;
  sourceSentAt?: string | null;
}

/** Normalized question → idempotency key (so the same question is never added twice, even across runs/statuses). */
export function qaDedupKey(question: string): string {
  return question.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim().slice(0, 300);
}

/** Insert new Q&A as 'pending'; existing dedup keys (any status) are skipped. Returns count actually inserted. */
export async function insertPendingQa(items: QaCandidate[]): Promise<number> {
  if (items.length === 0) return 0;
  const supabase = await createClient();
  const rows = items.map((i) => ({
    question: i.question,
    answer: i.answer,
    category: i.category ?? null,
    status: "pending" as const,
    source_subject: i.sourceSubject ?? null,
    source_mailbox: i.sourceMailbox ?? null,
    source_sent_at: i.sourceSentAt ?? null,
    dedup_key: qaDedupKey(i.question),
  }));
  const { data, error } = await supabase
    .from("ir_qa")
    .upsert(rows, { onConflict: "dedup_key", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(`ir_qa insert: ${error.message}`);
  return data?.length ?? 0;
}

export async function listQa(status?: QaStatus): Promise<QaEntry[]> {
  const supabase = await createClient();
  let q = supabase
    .from("ir_qa")
    .select("id, question, answer, category, status, source_subject, source_mailbox, source_sent_at, created_at, reviewed_by, reviewed_at")
    .order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw new Error(`ir_qa list: ${error.message}`);
  return (data ?? []) as QaEntry[];
}

export async function updateQa(
  id: string,
  patch: { status?: QaStatus; question?: string; answer?: string; category?: string; reviewedBy?: string }
): Promise<void> {
  const supabase = await createClient();
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.question !== undefined) row.question = patch.question;
  if (patch.answer !== undefined) row.answer = patch.answer;
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.status !== undefined) {
    row.status = patch.status;
    row.reviewed_at = new Date().toISOString();
    if (patch.reviewedBy) row.reviewed_by = patch.reviewedBy;
  }
  if (patch.question !== undefined) row.dedup_key = qaDedupKey(patch.question);
  const { error } = await supabase.from("ir_qa").update(row).eq("id", id);
  if (error) throw new Error(`ir_qa update: ${error.message}`);
}

/** Approved Q&A rendered for the drafter prompt. Empty string if none. */
export async function getApprovedQaForPrompt(): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ir_qa")
    .select("question, answer, category")
    .eq("status", "approved")
    .order("created_at", { ascending: true });
  if (error || !data?.length) return "";
  return data
    .map((r) => `Q: ${r.question}\nA: ${r.answer}${r.category ? `  [${r.category}]` : ""}`)
    .join("\n\n");
}

// ── Sent-message dedup ledger (so each sent reply is scanned for Q&A only once) ──

export async function filterUnprocessedSentIds(mailbox: string, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ir_qa_processed")
    .select("message_id")
    .eq("mailbox", mailbox)
    .in("message_id", ids);
  if (error) throw new Error(`ir_qa_processed read: ${error.message}`);
  const seen = new Set((data ?? []).map((r: { message_id: string }) => r.message_id));
  return new Set(ids.filter((id) => !seen.has(id)));
}

export async function markSentProcessed(p: {
  mailbox: string;
  messageId: string;
  internetMessageId?: string | null;
  extracted: number;
}): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("ir_qa_processed")
    .upsert(
      {
        mailbox: p.mailbox,
        message_id: p.messageId,
        internet_message_id: p.internetMessageId ?? null,
        extracted: p.extracted,
      },
      { onConflict: "mailbox,message_id", ignoreDuplicates: true }
    );
}
