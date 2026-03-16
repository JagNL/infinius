-- ============================================================
-- Infinius — Initial Schema
-- Supabase (PostgreSQL + pgvector)
-- ============================================================

-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "vector";       -- pgvector: semantic memory
create extension if not exists "pg_cron";      -- optional: DB-level cron

-- ============================================================
-- Users (mirrors auth.users — extend with profile data)
-- ============================================================
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text unique not null,
  display_name  text,
  avatar_url    text,
  memory_enabled boolean default true,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ============================================================
-- Sessions (conversation threads)
-- Each session = one continuous agent conversation
-- ============================================================
create table if not exists public.sessions (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  title         text,
  model_id      text default 'claude-3-5-sonnet-20241022',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  last_message_at timestamptz default now()
);

create index idx_sessions_user_id on public.sessions(user_id);
create index idx_sessions_last_message on public.sessions(last_message_at desc);

-- ============================================================
-- Messages (conversation history per session)
-- ============================================================
create table if not exists public.session_messages (
  id            uuid primary key default uuid_generate_v4(),
  session_id    uuid not null references public.sessions(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  role          text not null check (role in ('user', 'assistant', 'tool')),
  content       text not null,
  tool_calls    jsonb,          -- tool calls made in this message
  tool_results  jsonb,          -- results of tool calls
  model_id      text,
  created_at    timestamptz default now()
);

create index idx_messages_session on public.session_messages(session_id, created_at);

-- ============================================================
-- Tool Activity (the "activity timeline" shown in the UI)
-- Every visible tool call generates a row here
-- ============================================================
create table if not exists public.tool_activity (
  id              uuid primary key default uuid_generate_v4(),
  session_id      uuid not null references public.sessions(id) on delete cascade,
  message_id      uuid references public.session_messages(id) on delete cascade,
  tool_name       text not null,
  user_description text,
  input           jsonb,
  output          jsonb,
  status          text default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  started_at      timestamptz default now(),
  completed_at    timestamptz,
  error           text
);

create index idx_tool_activity_session on public.tool_activity(session_id, started_at);

-- ============================================================
-- Memory (pgvector — the semantic memory store)
-- ============================================================
create table if not exists public.memories (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  session_id  uuid references public.sessions(id) on delete set null,
  category    text not null check (category in ('identity', 'preferences', 'projects', 'history', 'corrections')),
  content     text not null,
  -- text-embedding-3-small = 1536 dimensions
  embedding   vector(1536),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index idx_memories_user on public.memories(user_id, category);
-- IVFFlat index for fast approximate nearest-neighbour search
create index idx_memories_embedding on public.memories
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ============================================================
-- Memory search function (used by MemoryClient.semanticSearch)
-- ============================================================
create or replace function match_memories(
  p_user_id   uuid,
  p_embedding vector(1536),
  p_threshold float default 0.70,
  p_limit     int   default 10,
  p_category  text  default null
)
returns table (
  id          uuid,
  user_id     uuid,
  session_id  uuid,
  category    text,
  content     text,
  created_at  timestamptz,
  updated_at  timestamptz,
  similarity  float
)
language plpgsql
as $$
begin
  return query
  select
    m.id,
    m.user_id,
    m.session_id,
    m.category,
    m.content,
    m.created_at,
    m.updated_at,
    1 - (m.embedding <=> p_embedding) as similarity
  from public.memories m
  where
    m.user_id = p_user_id
    and (p_category is null or m.category = p_category)
    and 1 - (m.embedding <=> p_embedding) > p_threshold
  order by m.embedding <=> p_embedding
  limit p_limit;
end;
$$;

-- ============================================================
-- Connected Accounts (OAuth connector tokens)
-- ============================================================
create table if not exists public.connected_accounts (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  source_id       text not null,          -- e.g. "gmail", "slack", "github"
  account_id      text not null,          -- provider-side account ID
  access_token    text not null,          -- encrypted in production
  refresh_token   text,
  expires_at      timestamptz,
  metadata        jsonb,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique(user_id, source_id)
);

-- ============================================================
-- Scheduled Jobs (cron + delayed — mirrors Computer's scheduler)
-- ============================================================
create table if not exists public.scheduled_jobs (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  type            text not null check (type in ('cron', 'delayed')),
  name            text,
  task            text not null,
  cron_expression text,               -- for type = 'cron'
  run_at          timestamptz,        -- for type = 'delayed'
  status          text default 'active' check (status in ('active', 'paused', 'completed', 'failed')),
  last_run_at     timestamptz,
  next_run_at     timestamptz,
  run_count       int default 0,
  metadata        jsonb,
  created_at      timestamptz default now()
);

create index idx_scheduled_jobs_user on public.scheduled_jobs(user_id, status);

-- ============================================================
-- Workspace Files (files created in agent sessions)
-- Tracks files for the "share file" UX
-- ============================================================
create table if not exists public.workspace_files (
  id              uuid primary key default uuid_generate_v4(),
  session_id      uuid not null references public.sessions(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  filename        text not null,
  path            text not null,
  mime_type       text,
  size_bytes      bigint,
  storage_url     text,               -- Supabase Storage URL
  asset_name      text,               -- logical name for version grouping
  created_at      timestamptz default now()
);

create index idx_workspace_files_session on public.workspace_files(session_id);

-- ============================================================
-- Notifications
-- ============================================================
create table if not exists public.notifications (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  title           text not null,
  body            text not null,
  url             text,
  schedule_description text,
  read            boolean default false,
  created_at      timestamptz default now()
);

create index idx_notifications_user on public.notifications(user_id, read, created_at desc);

-- ============================================================
-- Row-Level Security
-- ============================================================
alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.session_messages enable row level security;
alter table public.tool_activity enable row level security;
alter table public.memories enable row level security;
alter table public.connected_accounts enable row level security;
alter table public.scheduled_jobs enable row level security;
alter table public.workspace_files enable row level security;
alter table public.notifications enable row level security;

-- Users can only access their own data
create policy "own_data" on public.profiles for all using (auth.uid() = id);
create policy "own_data" on public.sessions for all using (auth.uid() = user_id);
create policy "own_data" on public.session_messages for all using (auth.uid() = user_id);
create policy "own_data" on public.tool_activity for all
  using (exists (select 1 from public.sessions s where s.id = session_id and s.user_id = auth.uid()));
create policy "own_data" on public.memories for all using (auth.uid() = user_id);
create policy "own_data" on public.connected_accounts for all using (auth.uid() = user_id);
create policy "own_data" on public.scheduled_jobs for all using (auth.uid() = user_id);
create policy "own_data" on public.workspace_files for all using (auth.uid() = user_id);
create policy "own_data" on public.notifications for all using (auth.uid() = user_id);
