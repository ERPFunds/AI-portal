-- Agent 2 Phase 1 — IR tables
-- Run once against your Vercel Postgres database.

CREATE TABLE IF NOT EXISTS ir_email_log (
  id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz  NOT NULL DEFAULT now(),
  from_email        text         NOT NULL,
  subject           text         NOT NULL,
  workflow_id       text         NOT NULL,   -- email-escalation | attachment-filer | dialogue-logger | lp-onboarding
  category          text         NOT NULL,   -- portal-access | k1-tax-docs | escalation-* | attachment | onboarding | etc.
  is_escalation     boolean      NOT NULL DEFAULT false,
  escalation_reason text,
  lp_name           text,
  summary           text,
  draft_saved       boolean      NOT NULL DEFAULT false,
  draft_id          text                     -- Outlook message ID of the saved draft
);

CREATE INDEX IF NOT EXISTS ir_email_log_created_at_idx   ON ir_email_log (created_at DESC);
CREATE INDEX IF NOT EXISTS ir_email_log_lp_name_idx      ON ir_email_log (lp_name);
CREATE INDEX IF NOT EXISTS ir_email_log_is_escalation_idx ON ir_email_log (is_escalation);
CREATE INDEX IF NOT EXISTS ir_email_log_workflow_id_idx  ON ir_email_log (workflow_id);

CREATE TABLE IF NOT EXISTS ir_dialogue_log (
  id                      uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at              timestamptz  NOT NULL DEFAULT now(),
  from_email              text         NOT NULL,
  lp_name                 text         NOT NULL,
  meeting_date            date,
  medium                  text,          -- call | in-person | email | voice-memo | unknown
  interest_level          text,          -- hot | warm | cool | neutral | unknown
  sticking_points         jsonb        NOT NULL DEFAULT '[]'::jsonb,
  follow_up_commitments   jsonb        NOT NULL DEFAULT '[]'::jsonb,
  relationship_context    text,
  next_touch_suggestion   text,
  onedrive_url            text
);

CREATE INDEX IF NOT EXISTS ir_dialogue_log_created_at_idx    ON ir_dialogue_log (created_at DESC);
CREATE INDEX IF NOT EXISTS ir_dialogue_log_lp_name_idx       ON ir_dialogue_log (lp_name);
CREATE INDEX IF NOT EXISTS ir_dialogue_log_interest_level_idx ON ir_dialogue_log (interest_level);
