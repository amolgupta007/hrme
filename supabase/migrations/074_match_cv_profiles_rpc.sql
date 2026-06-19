-- 074: org + job scoped cosine ranking over cv_screening_profiles.
create or replace function public.match_cv_profiles(
  query_embedding vector(1024),
  p_org_id uuid,
  p_job_id uuid,
  match_count int default 20
) returns table (
  profile_id uuid,
  candidate_id uuid,
  application_id uuid,
  similarity float
)
language sql stable
as $$
  select
    p.id as profile_id,
    p.candidate_id,
    a.id as application_id,
    1 - (p.embedding <=> query_embedding) as similarity
  from public.cv_screening_profiles p
  join public.applications a
    on a.candidate_id = p.candidate_id
   and a.job_id = p_job_id
   and a.org_id = p_org_id
  where p.org_id = p_org_id
    and p.embedding is not null
  order by p.embedding <=> query_embedding
  limit match_count
$$;
