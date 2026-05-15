import { sql } from "@vercel/postgres";
import type { FeedItem } from "./rss";

export async function getPreviouslyPublishedUrls(agentName: string): Promise<Set<string>> {
  const { rows } = await sql`
    SELECT DISTINCT ba.article_url
    FROM brief_articles ba
    JOIN briefs b ON b.id = ba.brief_id
    WHERE b.agent_name = ${agentName}
  `;
  return new Set(rows.map((r: any) => r.article_url));
}

export async function archiveBrief(params: {
  agentName: string;
  subject: string;
  html: string;
  narrative: string;
  macro: any;
  news: FeedItem[];
}) {
  const { rows } = await sql`
    INSERT INTO briefs (agent_name, subject, html, narrative, macro_data)
    VALUES (${params.agentName}, ${params.subject}, ${params.html},
            ${params.narrative}, ${JSON.stringify(params.macro)})
    RETURNING id
  `;
  const briefId = rows[0].id;

  for (const item of params.news) {
    await sql`
      INSERT INTO brief_articles (brief_id, article_url, source, title, pub_date)
      VALUES (${briefId}, ${item.link}, ${item.source}, ${item.title},
              ${item.pubDate.toISOString()})
    `;
  }
  return briefId;
}

export async function getLatestBrief(agentName: string) {
  const { rows } = await sql`
    SELECT * FROM briefs WHERE agent_name = ${agentName}
    ORDER BY sent_at DESC LIMIT 1
  `;
  return rows[0];
}

// ── research_log — Agent 1 email-triggered workflow log ───────────────────

export async function logResearchEntry(params: {
  fromEmail: string;
  subject: string;
  prefix: string;
  workflowId: string;
  emailBody?: string;
  outputSummary?: string;
  oneDriveUrl?: string | null;
  oneDriveVersion?: string | null;
  rawPayload?: Record<string, unknown>;
}) {
  await sql`
    INSERT INTO research_log (
      from_email, subject, prefix, workflow_id,
      email_body, output_summary, onedrive_url, onedrive_version, raw_payload
    ) VALUES (
      ${params.fromEmail},
      ${params.subject},
      ${params.prefix},
      ${params.workflowId},
      ${params.emailBody ?? null},
      ${params.outputSummary ?? null},
      ${params.oneDriveUrl ?? null},
      ${params.oneDriveVersion ?? null},
      ${JSON.stringify(params.rawPayload ?? {})}
    )
  `;
}

export async function getRecentResearchLog(limit = 20) {
  const { rows } = await sql`
    SELECT id, created_at, from_email, subject, prefix, workflow_id, output_summary, onedrive_url
    FROM research_log
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows;
}

// ── ir_email_log — Agent 2 IR email workflow log ─────────────────────────────

export async function logIrEmailEntry(params: {
  fromEmail: string;
  subject: string;
  workflowId: string;
  category: string;
  isEscalation: boolean;
  escalationReason: string | null;
  lpName: string | null;
  summary: string;
  draftSaved: boolean;
  draftId: string | null;
}) {
  await sql`
    INSERT INTO ir_email_log (
      from_email, subject, workflow_id, category,
      is_escalation, escalation_reason, lp_name,
      summary, draft_saved, draft_id
    ) VALUES (
      ${params.fromEmail},
      ${params.subject},
      ${params.workflowId},
      ${params.category},
      ${params.isEscalation},
      ${params.escalationReason},
      ${params.lpName},
      ${params.summary},
      ${params.draftSaved},
      ${params.draftId}
    )
  `;
}

export async function getRecentIrEmailLog(limit = 20) {
  const { rows } = await sql`
    SELECT id, created_at, from_email, subject, workflow_id, category,
           is_escalation, lp_name, summary, draft_saved
    FROM ir_email_log
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows;
}

// ── ir_dialogue_log — Agent 2 relationship intelligence log ──────────────────

export async function logDialogueEntry(params: {
  fromEmail: string;
  lpName: string;
  meetingDate: string | null;
  medium: string;
  interestLevel: string;
  stickingPoints: string[];
  followUpCommitments: string[];
  relationshipContext: string;
  nextTouchSuggestion: string;
  oneDriveUrl: string | null;
}) {
  await sql`
    INSERT INTO ir_dialogue_log (
      from_email, lp_name, meeting_date, medium,
      interest_level, sticking_points, follow_up_commitments,
      relationship_context, next_touch_suggestion, onedrive_url
    ) VALUES (
      ${params.fromEmail},
      ${params.lpName},
      ${params.meetingDate},
      ${params.medium},
      ${params.interestLevel},
      ${JSON.stringify(params.stickingPoints)},
      ${JSON.stringify(params.followUpCommitments)},
      ${params.relationshipContext},
      ${params.nextTouchSuggestion},
      ${params.oneDriveUrl}
    )
  `;
}

export async function getDialogueLog(limit = 50) {
  const { rows } = await sql`
    SELECT id, created_at, lp_name, meeting_date, medium,
           interest_level, next_touch_suggestion, onedrive_url
    FROM ir_dialogue_log
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows;
}
