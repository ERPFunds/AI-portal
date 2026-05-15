-- Agent 1 Phase 1 — research_log table
-- Run once against your Vercel Postgres database.
-- Purpose: raw log of every email-triggered workflow (Router → Workflow → Reply loop).
-- Phase 2 will add tags + structured metadata on top of this table.

CREATE TABLE IF NOT EXISTS research_log (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz   NOT NULL DEFAULT now(),
  from_email      text          NOT NULL,
  subject         text          NOT NULL,
  prefix          text          NOT NULL,           -- RESEARCH | BUILD | WRITE
  workflow_id     text          NOT NULL,           -- market-update-digest | deck-builder | etc.
  email_body      text,
  output_summary  text,
  onedrive_url    text,
  onedrive_version text,
  raw_payload     jsonb         NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS research_log_created_at_idx ON research_log (created_at DESC);
CREATE INDEX IF NOT EXISTS research_log_workflow_id_idx ON research_log (workflow_id);
CREATE INDEX IF NOT EXISTS research_log_prefix_idx ON research_log (prefix);
