-- ============================================================
-- Infinius — Migration 002: shared_files + storage bucket
-- ============================================================

-- Table: shared_files
-- Records every file shared via the share_file tool.
-- The actual bytes live in Supabase Storage (bucket: workspace-files).

create table if not exists public.shared_files (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  session_id    text not null,
  name          text not null,
  size          bigint not null default 0,
  mime_type     text not null default 'application/octet-stream',
  storage_key   text not null,          -- path in Supabase Storage bucket
  url           text not null,          -- signed URL (refreshed on download)
  created_at    timestamptz not null default now()
);

create index if not exists shared_files_user_session_idx
  on public.shared_files(user_id, session_id);

-- RLS
alter table public.shared_files enable row level security;

create policy "Users can view own files"
  on public.shared_files for select
  using (auth.uid() = user_id);

create policy "Service role can insert files"
  on public.shared_files for insert
  with check (true);   -- service role bypasses RLS

-- Storage bucket (run once in Supabase dashboard or via API)
-- insert into storage.buckets (id, name, public)
-- values ('workspace-files', 'workspace-files', false);
--
-- Storage RLS: users can only access their own folder
-- create policy "Users access own workspace files"
--   on storage.objects for all
--   using (bucket_id = 'workspace-files' and auth.uid()::text = (storage.foldername(name))[1]);
