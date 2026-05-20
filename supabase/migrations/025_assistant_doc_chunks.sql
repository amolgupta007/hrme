-- Migration 025: AI Assistant Phase 2 — tenant document chunks (org-scoped RAG).
create extension if not exists "vector";

create table if not exists public.doc_chunks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  content text not null,
  page_or_section text,
  token_count int not null,
  embedding vector(1024) not null,
  created_at timestamptz not null default now()
);

create index if not exists doc_chunks_org_idx on public.doc_chunks(org_id);
create index if not exists doc_chunks_document_idx on public.doc_chunks(document_id);
create index if not exists doc_chunks_embedding_idx
  on public.doc_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 20);

alter table public.doc_chunks enable row level security;

-- Advisory policy (service-role bypasses; activates when Clerk-JWT-to-Supabase wiring lands).
create policy "doc_chunks_own_org"
  on public.doc_chunks for select
  using (org_id::text = current_setting('request.jwt.claims', true)::jsonb->>'org_id');

-- Ingestion state on the documents table.
alter table public.documents add column if not exists index_status text;       -- null | 'pending' | 'indexed' | 'unsupported' | 'failed'
alter table public.documents add column if not exists indexed_at timestamptz;
alter table public.documents add column if not exists index_error text;
