import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { listConversationMessagesWithBody } from "@/lib/agents/ir/graph-mailbox";
import {
  listPendingOutcomes,
  updateOutcome,
  listAllCorrections,
  addCorrection,
  incrementCorrection,
  replaceCorrection,
  type CorrectionType,
  type DraftOutcome,
} from "@/lib/agents/ir/corrections-store";
import { regenerateCorrectionsDoc } from "@/lib/agents/ir/corrections-doc";

export const maxDuration = 300;

const client = new Anthropic();

const TEAM_INBOX = "team@erpfunds.com";
const MAX_PER_RUN = 12; // cap LLM work per run; the cron catches up over successive runs
const DISCARD_AFTER_DAYS = 7; // no sent reply after this → the draft wasn't used
const SENT_AS_IS = 0.95; // similarity at/above → the team sent our draft unchanged
const REPLACED_BELOW = 0.35; // similarity below → they wrote their own reply

function signerEmail(signer: string): string {
  return /william/i.test(signer) ? "wmeyer@erpfunds.com" : "mberry@erpfunds.com";
}

/** HTML/plain → normalized comparison text. */
function normalize(s: string): string {
  return s
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .toLowerCase()
    .replace(/[^a-z0-9$%.,@ -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Word-bigram Dice similarity (0..1) — robust to small edits, cheap, no deps. */
function similarity(a: string, b: string): number {
  const grams = (t: string): Set<string> => {
    const w = t.split(" ").filter(Boolean);
    const g = new Set<string>();
    for (let i = 0; i < w.length - 1; i++) g.add(`${w[i]} ${w[i + 1]}`);
    return g;
  };
  const ga = grams(a);
  const gb = grams(b);
  if (ga.size === 0 || gb.size === 0) return a === b ? 1 : 0;
  let overlap = 0;
  for (const g of ga) if (gb.has(g)) overlap++;
  return (2 * overlap) / (ga.size + gb.size);
}

/** Find the reply the IR team ACTUALLY sent on this conversation (earliest after the draft). */
async function findSentReply(row: DraftOutcome): Promise<{ mailbox: string; sentAt: string; text: string } | null> {
  if (!row.conversation_id) return null;
  const lead = signerEmail(row.signer);
  const mailboxes = [...new Set([row.mailbox, lead, TEAM_INBOX])];
  let best: { mailbox: string; sentAt: string; text: string } | null = null;
  for (const mb of mailboxes) {
    try {
      const msgs = await listConversationMessagesWithBody(mb, row.conversation_id, 20);
      for (const t of msgs) {
        const from = t.from.toLowerCase();
        if (t.isDraft || !t.bodyText.trim()) continue;
        if (from !== lead && from !== TEAM_INBOX) continue; // only the IR team's own reply counts
        if (t.receivedDateTime <= row.created_at) continue; // must post-date the draft
        if (!best || t.receivedDateTime < best.sentAt) best = { mailbox: mb, sentAt: t.receivedDateTime, text: t.bodyText };
      }
    } catch { /* a mailbox we can't read is non-fatal — try the others */ }
  }
  return best;
}

// ── Diff analyzer: extract MEANING changes only ─────────────────────────────────────────────

interface Learning { type: CorrectionType; learning: string; evidence: string }

const ANALYZER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["learnings"],
  properties: {
    learnings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "learning", "evidence"],
        properties: {
          type: { type: "string", enum: ["correction", "negative-rule", "kb-gap"] },
          learning: { type: "string" },
          evidence: { type: "string" },
        },
      },
    },
  },
} as const;

async function extractLearnings(row: DraftOutcome, sentText: string): Promise<Learning[]> {
  const msg = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 3000,
    output_config: { format: { type: "json_schema", schema: ANALYZER_SCHEMA } },
    system: [{ type: "text" as const, text:
`You compare an AI-drafted investor-relations reply (DRAFT) against the reply a human at ERP Industrials ACTUALLY SENT (SENT) on the same email thread. The human's sent version is ground truth. Your job: extract ONLY the SUBSTANTIVE differences — things that change what is being said — as generalized learnings for future drafts.

Learning types:
- "correction": a fact, figure, answer, process, or routing the draft got wrong and the human fixed (state the CORRECT version as the learning).
- "negative-rule": content the draft included that the human removed — claims, offers, details, or commitments the agent must not make.
- "kb-gap": a question the draft couldn't answer (punted/deferred) but the human answered from knowledge the agent lacks — phrase it as "Asked but not answerable from the KB: <question>. The team's answer was: <answer>."

STRICT rules:
- IGNORE tone, warmth, length, phrasing, greetings, sign-offs, formatting, and reordering. If the only differences are stylistic, return an empty learnings array — that is a good outcome, not a failure.
- GENERALIZE: learnings must be reusable for future emails. Never include the investor's name, email, account details, or anything specific to this one person — unless the fact itself is general fund information (fund terms, schedules, contacts, processes).
- Do NOT generalize a one-off accommodation (e.g. a special arrangement for this investor) into a rule — skip those.
- Each learning is one or two sentences, self-contained, starting with the fact/rule itself.
- evidence: a compact quote pair — what the draft said vs what was sent.
- Quality over quantity: 0-4 learnings is typical. Empty array if nothing substantive changed.` }],
    messages: [{ role: "user", content:
`Thread subject: ${row.subject || "(none)"}
Category: ${row.category || "unknown"}${row.is_dd ? " (due-diligence reply)" : ""}

=== DRAFT (what the agent wrote) ===
${normalize(row.draft_html).slice(0, 6000)}

=== SENT (what the human actually sent — ground truth) ===
${normalize(sentText).slice(0, 6000)}` }],
  });
  const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
  if (!text) return [];
  return (JSON.parse(text) as { learnings: Learning[] }).learnings ?? [];
}

// ── Updater: merge new learnings into the corrections store (dedupe / contradiction / tombstones) ──

const UPDATER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["actions"],
  properties: {
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["action", "entryNumber", "type", "learning", "evidence"],
        properties: {
          action: { type: "string", enum: ["add", "increment", "replace", "skip"] },
          entryNumber: { anyOf: [{ type: "integer" }, { type: "null" }], description: "Existing entry # for increment/replace/skip-tombstoned; null for add" },
          type: { type: "string", enum: ["correction", "negative-rule", "kb-gap"] },
          learning: { type: "string" },
          evidence: { anyOf: [{ type: "string" }, { type: "null" }] },
        },
      },
    },
  },
} as const;

async function mergeLearnings(learnings: Learning[], sourceSubject: string | null): Promise<number> {
  if (learnings.length === 0) return 0;
  const existing = await listAllCorrections();
  const numbered = existing.map((c, i) => ({ n: i + 1, c }));
  const existingList = numbered
    .map(({ n, c }) => `${n}. [${c.type}]${c.status === "deleted" ? " [DELETED BY HUMAN — never re-add]" : ""} (seen ${c.occurrences}x) ${c.learning}`)
    .join("\n") || "(none yet)";

  const msg = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 2500,
    output_config: { format: { type: "json_schema", schema: UPDATER_SCHEMA } },
    system: [{ type: "text" as const, text:
`You maintain the "IR Agent Corrections" store — learnings mined from comparing AI drafts against what the IR team actually sent. Given the EXISTING entries and NEW candidate learnings, emit one action per candidate:
- "add": genuinely new — no existing entry covers it. entryNumber=null.
- "increment": an existing ACTIVE entry already says the same thing — reference its entryNumber (repetition strengthens it; keep the existing wording, put it in "learning" anyway).
- "replace": the new learning CONTRADICTS or supersedes an existing ACTIVE entry (e.g. a fact changed) — reference its entryNumber and provide the corrected learning text.
- "skip": the candidate matches an entry marked [DELETED BY HUMAN] (a human pruned it — it must never come back), or it is too investor-specific / not reusable. Reference the tombstoned entryNumber if applicable, else null.
Keep learnings concise and general. Never merge different facts into one entry.` }],
    messages: [{ role: "user", content:
`=== EXISTING ENTRIES ===
${existingList}

=== NEW CANDIDATE LEARNINGS ===
${learnings.map((l, i) => `${i + 1}. [${l.type}] ${l.learning}\n   evidence: ${l.evidence}`).join("\n")}` }],
  });
  const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
  if (!text) return 0;
  const actions = (JSON.parse(text) as { actions: { action: string; entryNumber: number | null; type: CorrectionType; learning: string; evidence: string | null }[] }).actions ?? [];

  let applied = 0;
  for (const a of actions) {
    try {
      const target = a.entryNumber != null ? numbered.find((x) => x.n === a.entryNumber)?.c : undefined;
      if (a.action === "add") {
        await addCorrection({ type: a.type, learning: a.learning, evidence: a.evidence, sourceSubject });
        applied++;
      } else if (a.action === "increment" && target) {
        await incrementCorrection(target.id, sourceSubject);
        applied++;
      } else if (a.action === "replace" && target) {
        await replaceCorrection(target.id, { type: a.type, learning: a.learning, evidence: a.evidence, sourceSubject });
        applied++;
      } // skip → nothing
    } catch (e) {
      console.log("[ir-draft-outcomes] action-fail", a.action, String(e).slice(0, 200));
    }
  }
  return applied;
}

export async function GET(req: NextRequest) {
  const isCron = req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCron) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const pending = await listPendingOutcomes(MAX_PER_RUN);
    const details: string[] = [];
    let correctionsChanged = 0;

    for (const row of pending) {
      try {
        const sent = await findSentReply(row);
        if (!sent) {
          const ageDays = (Date.now() - new Date(row.created_at).getTime()) / 86_400_000;
          if (ageDays > DISCARD_AFTER_DAYS) {
            await updateOutcome(row.id, { status: "discarded" });
            details.push(`DISCARDED ${row.subject} (${Math.round(ageDays)}d, no sent reply)`);
          }
          continue; // still pending — check again next run
        }

        const sim = similarity(normalize(row.draft_html), normalize(sent.text));
        if (sim >= SENT_AS_IS) {
          await updateOutcome(row.id, { status: "sent-as-is", sentAt: sent.sentAt, sentMailbox: sent.mailbox, sentText: sent.text, similarity: sim, lessons: 0 });
          details.push(`SENT-AS-IS ${row.subject} (sim ${sim.toFixed(2)})`);
          continue;
        }

        const learnings = await extractLearnings(row, sent.text);
        const applied = await mergeLearnings(learnings, row.subject);
        correctionsChanged += applied;
        await updateOutcome(row.id, {
          status: sim < REPLACED_BELOW ? "replaced" : "edited",
          sentAt: sent.sentAt,
          sentMailbox: sent.mailbox,
          sentText: sent.text,
          similarity: sim,
          lessons: applied,
        });
        details.push(`${sim < REPLACED_BELOW ? "REPLACED" : "EDITED"} ${row.subject} (sim ${sim.toFixed(2)}, ${applied} learning${applied === 1 ? "" : "s"})`);
      } catch (e) {
        await updateOutcome(row.id, { status: "error" }).catch(() => {});
        details.push(`ERROR ${row.subject} — ${String(e).slice(0, 120)}`);
      }
    }

    // Refresh the KB doc only when the corrections actually changed.
    let doc: { ok: boolean; count: number; error?: string } | null = null;
    if (correctionsChanged > 0) doc = await regenerateCorrectionsDoc();

    console.log("[ir-draft-outcomes]", JSON.stringify({ pending: pending.length, correctionsChanged, details }));
    return NextResponse.json({ ok: true, processed: pending.length, correctionsChanged, doc, details });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
