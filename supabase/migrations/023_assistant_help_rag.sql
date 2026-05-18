-- Migration 023: AI Assistant Phase 1 — global app-help RAG storage.
-- Enables pgvector (now available on Supabase Pro). app_help_chunks is global —
-- no org_id, no RLS scoping — because help content is the same for every tenant.

create extension if not exists "vector";

create table if not exists public.app_help_chunks (
  id uuid primary key default gen_random_uuid(),
  article_id text not null,
  step_n int,
  content text not null,
  token_count int not null,
  embedding vector(1024) not null,
  created_at timestamptz not null default now()
);

create index if not exists app_help_chunks_article_idx
  on public.app_help_chunks(article_id);

-- ivfflat for cosine similarity. lists=20 is right for <1k chunks.
-- Bump to 100 once we cross 50k chunks (will not happen in Phase 1).
create index if not exists app_help_chunks_embedding_idx
  on public.app_help_chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 20);

alter table public.app_help_chunks enable row level security;

-- Help content is global; any authenticated user can read. RLS still on as defence-in-depth.
create policy "app_help_chunks_read_all"
  on public.app_help_chunks for select
  using (true);
