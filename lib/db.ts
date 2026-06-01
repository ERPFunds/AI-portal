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

// ── Newsletter article deduplication ─────────────────────────────────────────

const NEWSLETTER_AGENTS = [
  // brevard-brief internal runs
  "brevard-weekly", "brevard-submarket", "brevard-fund",
  // standalone Brevard cron routes
  "brevard-submarket-watch", "brevard-fund-landscape",
  // Permian cron routes
  "permian-brief", "permian-submarket-watch", "permian-fund-landscape",
  // legacy route names (kept for backward compat)
  "submarket-watch", "fund-landscape-brief",
];

/**
 * Returns the set of article URLs already used in any newsletter brief
 * in the past 7 days. Used to suppress repeats across all newsletters
 * for the current week. Test sends never call this, so they're excluded.
 */
export async function getSeenNewsletterArticleUrls(): Promise<Set<string>> {
  try {
    const { rows } = await sql`
      SELECT DISTINCT ba.article_url
      FROM brief_articles ba
      JOIN briefs b ON b.id = ba.brief_id
      WHERE b.agent_name IN (
        'brevard-weekly', 'brevard-submarket', 'brevard-fund',
        'brevard-submarket-watch', 'brevard-fund-landscape',
        'permian-brief', 'permian-submarket-watch', 'permian-fund-landscape',
        'submarket-watch', 'fund-landscape-brief'
      )
        AND b.sent_at > NOW() - INTERVAL '7 days'
    `;
    return new Set(rows.map((r: any) => r.article_url));
  } catch {
    return new Set();
  }
}

/**
 * Records articles used by a Brevard brief (which doesn't call archiveBrief).
 * Creates a minimal brief stub so brief_articles FKs resolve.
 * Non-fatal — caller should .catch(() => {}).
 */
export async function recordNewsletterRun(params: {
  agentName: string;
  subject: string;
  articles: Array<{ url: string; title: string; source: string; pubDate: Date }>;
}): Promise<void> {
  const { rows } = await sql`
    INSERT INTO briefs (agent_name, subject, html, narrative, macro_data)
    VALUES (${params.agentName}, ${params.subject}, '', '', '{}')
    RETURNING id
  `;
  const briefId = rows[0].id;
  for (const a of params.articles) {
    await sql`
      INSERT INTO brief_articles (brief_id, article_url, source, title, pub_date)
      VALUES (${briefId}, ${a.url}, ${a.source}, ${a.title}, ${a.pubDate.toISOString()})
      ON CONFLICT DO NOTHING
    `;
  }
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

// ── LP last-interaction lookup (used by LP Directory) ────────────────────────

export interface LpLastInteraction {
  lpName: string;
  date: string;
  note: string;
  source: "ir";
}

/**
 * For each LP name in the commitment schedule, return the most recent entry
 * from ir_dialogue_log or ir_email_log (whichever is newer), keyed by
 * lowercase LP name for easy lookup.
 */
export async function getLpLastInteractions(): Promise<Record<string, LpLastInteraction>> {
  try {
    const { rows } = await sql`
      SELECT DISTINCT ON (lower(lp_name))
        lp_name,
        created_at,
        note
      FROM (
        SELECT
          lp_name,
          created_at,
          COALESCE(
            NULLIF(TRIM(interest_level), '') || CASE WHEN next_touch_suggestion IS NOT NULL AND TRIM(next_touch_suggestion) <> '' THEN ' · ' || next_touch_suggestion ELSE '' END,
            next_touch_suggestion,
            'Dialogue logged'
          ) AS note
        FROM ir_dialogue_log
        WHERE lp_name IS NOT NULL AND TRIM(lp_name) <> ''
        UNION ALL
        SELECT
          lp_name,
          created_at,
          COALESCE(NULLIF(TRIM(summary), ''), 'Email logged') AS note
        FROM ir_email_log
        WHERE lp_name IS NOT NULL AND TRIM(lp_name) <> ''
      ) combined
      ORDER BY lower(lp_name), created_at DESC
    `;
    const map: Record<string, LpLastInteraction> = {};
    for (const r of rows) {
      map[String(r.lp_name).toLowerCase().trim()] = {
        lpName: r.lp_name,
        date: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        note: String(r.note),
        source: "ir",
      };
    }
    return map;
  } catch {
    return {};
  }
}

// ── uploaded_files — Anthropic Files API tracking ────────────────────────────

export interface UploadedFile {
  id: string;
  file_id: string;
  filename: string;
  size_bytes: number | null;
  mime_type: string | null;
  project_tag: string | null;
  uploaded_by: string | null;
  expires_at: string | null;
  created_at: string;
}

export async function saveUploadedFile(params: {
  fileId: string;
  filename: string;
  sizeBytes?: number;
  mimeType?: string;
  projectTag?: string;
  uploadedBy?: string;
  expiresAt?: string;
}) {
  await sql`
    INSERT INTO uploaded_files (file_id, filename, size_bytes, mime_type, project_tag, uploaded_by, expires_at)
    VALUES (
      ${params.fileId},
      ${params.filename},
      ${params.sizeBytes ?? null},
      ${params.mimeType ?? null},
      ${params.projectTag ?? null},
      ${params.uploadedBy ?? null},
      ${params.expiresAt ?? null}
    )
    ON CONFLICT (file_id) DO NOTHING
  `;
}

export async function listUploadedFiles(): Promise<UploadedFile[]> {
  const { rows } = await sql`
    SELECT id, file_id, filename, size_bytes, mime_type, project_tag, uploaded_by, expires_at, created_at
    FROM uploaded_files
    ORDER BY created_at DESC
  `;
  return rows as UploadedFile[];
}

export async function deleteUploadedFileRecord(fileId: string) {
  await sql`DELETE FROM uploaded_files WHERE file_id = ${fileId}`;
}

// ── agent_runs — unified run log for all agents ───────────────────────────────

export async function logAgentRun(params: {
  agentId: string;
  workflowId: string;
  status: "success" | "error";
  summary?: string;
  market?: string;
  durationMs?: number;
  errorMessage?: string;
}) {
  await sql`
    INSERT INTO agent_runs (agent_id, workflow_id, status, summary, market, duration_ms, error_message)
    VALUES (
      ${params.agentId},
      ${params.workflowId},
      ${params.status},
      ${params.summary ?? null},
      ${params.market ?? null},
      ${params.durationMs ?? null},
      ${params.errorMessage ?? null}
    )
  `;
}

export async function getRecentAgentRuns(limit = 40) {
  // Unified feed: agent_runs + research_log (lp-intel) + ir_email_log (ir)
  try {
    const { rows } = await sql`
      SELECT agent_id, workflow_id, status, summary, market, created_at, NULL AS prefix
      FROM agent_runs
      UNION ALL
      SELECT 'lp-intel' AS agent_id, workflow_id, 'success' AS status,
             output_summary AS summary, NULL AS market, created_at, prefix
      FROM research_log
      UNION ALL
      SELECT 'ir' AS agent_id, workflow_id, 'success' AS status,
             summary, NULL AS market, created_at, NULL AS prefix
      FROM ir_email_log
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return rows;
  } catch {
    return [];
  }
}

export async function getAgentRunStats(days = 7): Promise<
  Record<string, { runs: number; last: string | null }>
> {
  try {
    const { rows } = await sql`
      SELECT agent_id, COUNT(*)::int AS runs, MAX(created_at) AS last
      FROM (
        SELECT agent_id, created_at FROM agent_runs
          WHERE created_at > NOW() - (${days} || ' days')::interval
        UNION ALL
        SELECT 'lp-intel' AS agent_id, created_at FROM research_log
          WHERE created_at > NOW() - (${days} || ' days')::interval
        UNION ALL
        SELECT 'ir' AS agent_id, created_at FROM ir_email_log
          WHERE created_at > NOW() - (${days} || ' days')::interval
      ) combined
      GROUP BY agent_id
    `;
    return Object.fromEntries(
      rows.map((r: any) => [r.agent_id, { runs: r.runs, last: r.last }])
    );
  } catch {
    return {};
  }
}
