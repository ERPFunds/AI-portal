-- Unified agent run log — all agent executions write here
-- Run once against your Vercel Postgres database.

CREATE TABLE IF NOT EXISTS agent_runs (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz  NOT NULL DEFAULT now(),
  agent_id     text         NOT NULL,   -- matches AGENTS id: lp-intel | ir | acq-research | etc.
  workflow_id  text         NOT NULL,   -- workflow name: weekly-market-update | email-escalation | etc.
  status       text         NOT NULL DEFAULT 'success',  -- success | error
  summary      text,
  market       text,                    -- permian | brevard | null
  duration_ms  integer,
  error_message text
);

CREATE INDEX IF NOT EXISTS agent_runs_created_at_idx  ON agent_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS agent_runs_agent_id_idx    ON agent_runs (agent_id);
CREATE INDEX IF NOT EXISTS agent_runs_workflow_id_idx ON agent_runs (workflow_id);
