import { createClient } from "@/lib/supabase/server";

// Draft-vs-sent learning loop, SEPARATE from the Learned Q&A (ir_qa) pipeline.
// ir_draft_outcomes: a snapshot of every draft the sweep creates, later matched against the
//   reply the IR team actually sent on that conversation.
// ir_agent_corrections: what the agent has learned from the diffs — factual corrections,
//   negative rules ("never claim X"), and KB gaps. Rendered into every draft's grounding and
//   published to the KB as "IR Agent Corrections.md".

export type OutcomeStatus = "pending" | "sent-as-is" | "edited" | "replaced" | "discarded" | "error";
export type CorrectionType = "correction" | "negative-rule" | "kb-gap";

export interface DraftOutcome {
  id: string;
  created_at: string;
  mailbox: string;
  signer: string;
  conversation_id: string | null;
  original_message_id: string | null;
  from_address: string | null;
  subject: string | null;
  category: string | null;
  route: string | null;
  is_dd: boolean;
  draft_html: string;
  status: OutcomeStatus;
}

export interface AgentCorrection {
  id: string;
  created_at: string;
  updated_at: string;
  type: CorrectionType;
  learning: string;
  evidence: string | null;
  source_subject: string | null;
  occurrences: number;
  status: "active" | "deleted";
}

/** Snapshot a freshly created draft (non-fatal for the sweep — caller wraps in try/catch). */
export async function insertDraftSnapshot(p: {
  mailbox: string;
  signer: string;
  conversationId: string | null;
  originalMessageId: string;
  originalInternetMessageId: string | null;
  fromAddress: string;
  subject: string;
  category: string;
  route: string;
  isDd: boolean;
  draftHtml: string;
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("ir_draft_outcomes").insert({
    mailbox: p.mailbox,
    signer: p.signer,
    conversation_id: p.conversationId,
    original_message_id: p.originalMessageId,
    original_internet_message_id: p.originalInternetMessageId,
    from_address: p.fromAddress,
    subject: p.subject,
    category: p.category,
    route: p.route,
    is_dd: p.isDd,
    draft_html: p.draftHtml,
  });
  if (error) throw new Error(`ir_draft_outcomes insert: ${error.message}`);
}

export async function listPendingOutcomes(limit = 15): Promise<DraftOutcome[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ir_draft_outcomes")
    .select("id, created_at, mailbox, signer, conversation_id, original_message_id, from_address, subject, category, route, is_dd, draft_html, status")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`ir_draft_outcomes list: ${error.message}`);
  return (data ?? []) as DraftOutcome[];
}

export async function updateOutcome(
  id: string,
  patch: { status: OutcomeStatus; sentAt?: string | null; sentMailbox?: string | null; sentText?: string | null; similarity?: number | null; lessons?: number | null }
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("ir_draft_outcomes")
    .update({
      status: patch.status,
      sent_at: patch.sentAt ?? null,
      sent_mailbox: patch.sentMailbox ?? null,
      sent_text: patch.sentText ? patch.sentText.slice(0, 20000) : null,
      similarity: patch.similarity ?? null,
      lessons: patch.lessons ?? null,
      analyzed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(`ir_draft_outcomes update: ${error.message}`);
}

/** All corrections including tombstones — the updater needs deleted ones so it never re-adds them. */
export async function listAllCorrections(): Promise<AgentCorrection[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ir_agent_corrections")
    .select("id, created_at, updated_at, type, learning, evidence, source_subject, occurrences, status")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`ir_agent_corrections list: ${error.message}`);
  return (data ?? []) as AgentCorrection[];
}

export async function addCorrection(p: { type: CorrectionType; learning: string; evidence?: string | null; sourceSubject?: string | null }): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("ir_agent_corrections").insert({
    type: p.type,
    learning: p.learning,
    evidence: p.evidence ?? null,
    source_subject: p.sourceSubject ?? null,
  });
  if (error) throw new Error(`ir_agent_corrections insert: ${error.message}`);
}

/** Same learning seen again: bump occurrences (activates provisional negative rules at 2). */
export async function incrementCorrection(id: string, sourceSubject?: string | null): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.from("ir_agent_corrections").select("occurrences").eq("id", id).maybeSingle();
  const { error } = await supabase
    .from("ir_agent_corrections")
    .update({
      occurrences: ((data?.occurrences as number) ?? 1) + 1,
      updated_at: new Date().toISOString(),
      ...(sourceSubject ? { source_subject: sourceSubject } : {}),
    })
    .eq("id", id);
  if (error) throw new Error(`ir_agent_corrections increment: ${error.message}`);
}

/** New learning contradicts/supersedes an existing entry: overwrite it in place (keeps id + count). */
export async function replaceCorrection(id: string, p: { type: CorrectionType; learning: string; evidence?: string | null; sourceSubject?: string | null }): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.from("ir_agent_corrections").select("occurrences").eq("id", id).maybeSingle();
  const { error } = await supabase
    .from("ir_agent_corrections")
    .update({
      type: p.type,
      learning: p.learning,
      evidence: p.evidence ?? null,
      source_subject: p.sourceSubject ?? null,
      occurrences: ((data?.occurrences as number) ?? 1) + 1,
      status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(`ir_agent_corrections replace: ${error.message}`);
}

/** Human pruning: tombstone (never hard-delete) so the miner can't re-add it later. */
export async function deleteCorrection(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("ir_agent_corrections")
    .update({ status: "deleted", deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`ir_agent_corrections delete: ${error.message}`);
}

/** Undo a tombstone: bring a deleted correction back to active (it applies to drafts again). */
export async function restoreCorrection(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("ir_agent_corrections")
    .update({ status: "active", deleted_at: null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`ir_agent_corrections restore: ${error.message}`);
}

/**
 * Corrections rendered for the drafter prompts. Active entries only; negative rules must have
 * been seen at least twice (a single deletion may have been context-specific). KB gaps are for
 * humans, not the drafter, so they're excluded here. Size-capped, newest first.
 */
export async function getCorrectionsForPrompt(maxChars = 8000): Promise<string> {
  const all = await listAllCorrections();
  const usable = all.filter(
    (c) => c.status === "active" && c.type !== "kb-gap" && (c.type !== "negative-rule" || c.occurrences >= 2)
  );
  if (usable.length === 0) return "";
  const lines: string[] = [];
  let used = 0;
  for (const c of usable) {
    const line = `- ${c.type === "negative-rule" ? "[RULE] " : ""}${c.learning}`;
    if (used + line.length > maxChars) break;
    lines.push(line);
    used += line.length + 1;
  }
  return lines.join("\n");
}
