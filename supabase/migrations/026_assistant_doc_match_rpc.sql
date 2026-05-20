-- Migration 026: org-scoped cosine similarity over doc_chunks.
create or replace function public.match_doc_chunks(
  query_embedding vector(1024),
  p_org_id uuid,
  match_count int default 6
) returns table (
  chunk_id uuid,
  document_id uuid,
  content text,
  page_or_section text,
  similarity float
)
language sql stable
as $$
  select
    id as chunk_id,
    document_id,
    content,
    page_or_section,
    1 - (embedding <=> query_embedding) as similarity
  from public.doc_chunks
  where org_id = p_org_id
  order by embedding <=> query_embedding
  limit match_count
$$;
