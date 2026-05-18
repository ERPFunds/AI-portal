-- Anthropic Files API tracking table
-- Run once in Vercel Postgres console

CREATE TABLE IF NOT EXISTS uploaded_files (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  file_id       text        UNIQUE NOT NULL,  -- Anthropic Files API id
  filename      text        NOT NULL,
  size_bytes    integer,
  mime_type     text,
  project_tag   text,        -- e.g. "Tampa OM", "Q2 LP Deck"
  uploaded_by   text,
  expires_at    timestamptz  -- Anthropic files expire after 30 days
);

CREATE INDEX IF NOT EXISTS uploaded_files_created_at_idx ON uploaded_files (created_at DESC);
CREATE INDEX IF NOT EXISTS uploaded_files_project_tag_idx ON uploaded_files (project_tag);
