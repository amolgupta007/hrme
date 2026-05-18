-- Migration 024: AI Assistant Phase 1 — cosine-similarity RPC over app_help_chunks.
-- Called by the app_help.search tool with an embedded query vector.

create or replace function public.match_help_chunks(
  query_embedding vector(1024),
  match_count int default 5
) returns table (
  article_id text,
  content text,
  similarity float
)
language sql stable
as $$
  select
    article_id,
    content,
    1 - (embedding <=> query_embedding) as similarity
  from public.app_help_chunks
  order by embedding <=> query_embedding
  limit match_count
$$;
