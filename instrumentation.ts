/**
 * Next.js instrumentation hook — runs once on server startup (Node.js runtime only).
 * Applies all Vercel Postgres migrations using CREATE TABLE IF NOT EXISTS,
 * so it's safe to run on every cold start / deploy.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { sql } = await import("@vercel/postgres");

    await sql`
      CREATE TABLE IF NOT EXISTS briefs (
        id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
        sent_at      timestamptz  NOT NULL DEFAULT now(),
        agent_name   text         NOT NULL,
        subject      text         NOT NULL,
        html         text         NOT NULL,
        narrative    text         NOT NULL,
        macro_data   jsonb        NOT NULL DEFAULT '{}'::jsonb
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS briefs_agent_name_idx ON briefs (agent_name)`;
    await sql`CREATE INDEX IF NOT EXISTS briefs_sent_at_idx    ON briefs (sent_at DESC)`;

    await sql`
      CREATE TABLE IF NOT EXISTS brief_articles (
        id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
        brief_id    uuid         NOT NULL REFERENCES briefs(id) ON DELETE CASCADE,
        article_url text         NOT NULL,
        source      text,
        title       text,
        pub_date    timestamptz
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS brief_articles_brief_id_idx    ON brief_articles (brief_id)`;
    await sql`CREATE INDEX IF NOT EXISTS brief_articles_article_url_idx ON brief_articles (article_url)`;

    await sql`
      CREATE TABLE IF NOT EXISTS agent_runs (
        id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at    timestamptz  NOT NULL DEFAULT now(),
        agent_id      text         NOT NULL,
        workflow_id   text         NOT NULL,
        status        text         NOT NULL DEFAULT 'success',
        summary       text,
        market        text,
        duration_ms   integer,
        error_message text
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS agent_runs_created_at_idx  ON agent_runs (created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS agent_runs_agent_id_idx    ON agent_runs (agent_id)`;
    await sql`CREATE INDEX IF NOT EXISTS agent_runs_workflow_id_idx ON agent_runs (workflow_id)`;

    await sql`
      CREATE TABLE IF NOT EXISTS research_log (
        id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at       timestamptz NOT NULL DEFAULT now(),
        from_email       text        NOT NULL,
        subject          text        NOT NULL,
        prefix           text        NOT NULL,
        workflow_id      text        NOT NULL,
        email_body       text,
        output_summary   text,
        onedrive_url     text,
        onedrive_version text,
        raw_payload      jsonb       NOT NULL DEFAULT '{}'::jsonb
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS research_log_created_at_idx  ON research_log (created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS research_log_workflow_id_idx ON research_log (workflow_id)`;
    await sql`CREATE INDEX IF NOT EXISTS research_log_prefix_idx      ON research_log (prefix)`;

    await sql`
      CREATE TABLE IF NOT EXISTS ir_email_log (
        id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at        timestamptz NOT NULL DEFAULT now(),
        from_email        text        NOT NULL,
        subject           text        NOT NULL,
        workflow_id       text        NOT NULL,
        category          text        NOT NULL,
        is_escalation     boolean     NOT NULL DEFAULT false,
        escalation_reason text,
        lp_name           text,
        summary           text,
        draft_saved       boolean     NOT NULL DEFAULT false,
        draft_id          text
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS ir_email_log_created_at_idx    ON ir_email_log (created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS ir_email_log_lp_name_idx       ON ir_email_log (lp_name)`;
    await sql`CREATE INDEX IF NOT EXISTS ir_email_log_is_escalation_idx ON ir_email_log (is_escalation)`;
    await sql`CREATE INDEX IF NOT EXISTS ir_email_log_workflow_id_idx   ON ir_email_log (workflow_id)`;

    await sql`
      CREATE TABLE IF NOT EXISTS ir_dialogue_log (
        id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at            timestamptz NOT NULL DEFAULT now(),
        from_email            text        NOT NULL,
        lp_name               text        NOT NULL,
        meeting_date          date,
        medium                text,
        interest_level        text,
        sticking_points       jsonb       NOT NULL DEFAULT '[]'::jsonb,
        follow_up_commitments jsonb       NOT NULL DEFAULT '[]'::jsonb,
        relationship_context  text,
        next_touch_suggestion text,
        onedrive_url          text
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS ir_dialogue_log_created_at_idx     ON ir_dialogue_log (created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS ir_dialogue_log_lp_name_idx        ON ir_dialogue_log (lp_name)`;
    await sql`CREATE INDEX IF NOT EXISTS ir_dialogue_log_interest_level_idx ON ir_dialogue_log (interest_level)`;

    await sql`
      CREATE TABLE IF NOT EXISTS uploaded_files (
        id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at  timestamptz NOT NULL DEFAULT now(),
        file_id     text        UNIQUE NOT NULL,
        filename    text        NOT NULL,
        size_bytes  integer,
        mime_type   text,
        project_tag text,
        uploaded_by text,
        expires_at  timestamptz
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS uploaded_files_created_at_idx  ON uploaded_files (created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS uploaded_files_project_tag_idx ON uploaded_files (project_tag)`;

    console.log("[instrumentation] Vercel Postgres migrations applied successfully");
  } catch (err) {
    // Non-fatal — app continues even if migrations fail (e.g. no DB configured locally)
    console.warn("[instrumentation] Migration warning:", err);
  }
}
