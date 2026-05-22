-- loopnet_listings
-- Stores individual property listings parsed from LoopNet daily alert emails.
-- Populated by POST /api/loopnet-ingest (Power Automate → Claude extraction).
-- Consumed by weekly cron newsletters: /api/cron/brevard-vacancy and /api/cron/permian-vacancy.

CREATE TABLE IF NOT EXISTS loopnet_listings (
  id                   SERIAL PRIMARY KEY,
  market               VARCHAR(20)  NOT NULL CHECK (market IN ('brevard', 'permian')),
  address              TEXT         NOT NULL,
  property_name        TEXT,
  size                 TEXT,
  available_space      TEXT,
  price                TEXT,
  property_type        TEXT,
  url                  TEXT,
  description          TEXT,
  source_email_subject TEXT,
  received_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Fast weekly window query used by the cron newsletters
CREATE INDEX IF NOT EXISTS idx_loopnet_listings_market_received
  ON loopnet_listings (market, received_at DESC);
