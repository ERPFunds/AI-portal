-- Newsletter briefs archive — all newsletter sends write here
-- Run once against your Vercel Postgres database.

CREATE TABLE IF NOT EXISTS briefs (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  sent_at      timestamptz  NOT NULL DEFAULT now(),
  agent_name   text         NOT NULL,   -- e.g. brevard-weekly, permian-fund-landscape
  subject      text         NOT NULL,
  html         text         NOT NULL,
  narrative    text         NOT NULL,
  macro_data   jsonb        NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS briefs_agent_name_idx ON briefs (agent_name);
CREATE INDEX IF NOT EXISTS briefs_sent_at_idx    ON briefs (sent_at DESC);

-- ── brief_articles: one row per article used in a brief ──────────────────────

CREATE TABLE IF NOT EXISTS brief_articles (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id    uuid         NOT NULL REFERENCES briefs(id) ON DELETE CASCADE,
  article_url text         NOT NULL,
  source      text,
  title       text,
  pub_date    timestamptz
);

CREATE INDEX IF NOT EXISTS brief_articles_brief_id_idx    ON brief_articles (brief_id);
CREATE INDEX IF NOT EXISTS brief_articles_article_url_idx ON brief_articles (article_url);
