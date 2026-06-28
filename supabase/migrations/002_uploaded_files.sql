-- uploaded_files: tracks files uploaded to the Anthropic Files API so they can
-- be referenced by agents and listed in the portal (Deal Documents + SOP folders).
-- Backs both the "Deal Documents" card and the per-category SOP upload cards.
create table if not exists public.uploaded_files (
  id          uuid primary key default gen_random_uuid(),
  file_id     text unique not null,           -- Anthropic Files API id (file_...)
  filename    text not null,
  size_bytes  bigint,
  mime_type   text,
  project_tag text,
  category    text,                            -- e.g. 'Deal Documents', 'Claude Training and Assets'
  uploaded_by text,
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);

-- For an existing table created before this column was introduced.
alter table public.uploaded_files add column if not exists category text;

create index if not exists uploaded_files_category_idx on public.uploaded_files (category);
create index if not exists uploaded_files_created_at_idx on public.uploaded_files (created_at desc);
