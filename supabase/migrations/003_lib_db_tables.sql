-- Server-side data-layer tables used by lib/db.ts and lib/loopnet-scraper.ts.
-- These were previously declared only in instrumentation.ts (app-startup DDL),
-- which never ran because the configured Postgres driver could not connect.
-- Schema now lives here and is applied via the Supabase migration workflow.
-- Accessed server-side via the postgres role (bypasses RLS); RLS is enabled with
-- no policies so the anon/authenticated API roles cannot read these tables.

create table if not exists public.agent_runs (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  agent_id      text not null,
  workflow_id   text not null,
  status        text not null default 'success',
  summary       text,
  market        text,
  duration_ms   integer,
  error_message text
);
create index if not exists agent_runs_created_at_idx on public.agent_runs (created_at desc);
create index if not exists agent_runs_agent_id_idx on public.agent_runs (agent_id);

create table if not exists public.ir_email_log (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  from_email        text not null,
  subject           text not null,
  workflow_id       text not null,
  category          text not null,
  is_escalation     boolean not null default false,
  escalation_reason text,
  lp_name           text,
  summary           text,
  draft_saved       boolean not null default false,
  draft_id          text
);
create index if not exists ir_email_log_created_at_idx on public.ir_email_log (created_at desc);
create index if not exists ir_email_log_lp_name_idx on public.ir_email_log (lp_name);

create table if not exists public.ir_dialogue_log (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz not null default now(),
  from_email            text not null,
  lp_name               text not null,
  meeting_date          date,
  medium                text,
  interest_level        text,
  sticking_points       jsonb not null default '[]'::jsonb,
  follow_up_commitments jsonb not null default '[]'::jsonb,
  relationship_context  text,
  next_touch_suggestion text,
  onedrive_url          text
);
create index if not exists ir_dialogue_log_created_at_idx on public.ir_dialogue_log (created_at desc);
create index if not exists ir_dialogue_log_lp_name_idx on public.ir_dialogue_log (lp_name);

create table if not exists public.ir_processed_messages (
  id                  uuid primary key default gen_random_uuid(),
  processed_at        timestamptz not null default now(),
  mailbox             text not null,
  message_id          text not null,
  internet_message_id text,
  is_investor         boolean not null default false,
  action              text,
  unique (mailbox, message_id)
);
create index if not exists ir_processed_messages_mailbox_idx on public.ir_processed_messages (mailbox);

create table if not exists public.loopnet_listings (
  id                   uuid primary key default gen_random_uuid(),
  created_at           timestamptz not null default now(),
  received_at          timestamptz not null default now(),
  market               text not null,
  address              text not null,
  property_name        text,
  size                 text,
  available_space      text,
  price                text,
  property_type        text,
  url                  text,
  description          text,
  source_email_subject text
);
create index if not exists loopnet_listings_market_idx on public.loopnet_listings (market);
create index if not exists loopnet_listings_received_at_idx on public.loopnet_listings (received_at desc);

alter table public.agent_runs enable row level security;
alter table public.ir_email_log enable row level security;
alter table public.ir_dialogue_log enable row level security;
alter table public.ir_processed_messages enable row level security;
alter table public.loopnet_listings enable row level security;
