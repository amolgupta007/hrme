-- 070: parsed CV + embedding, one row per candidate (latest CV).
create extension if not exists vector;

create table if not exists public.cv_screening_profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  source_document_path text,
  raw_text text,
  parsed jsonb not null default '{}'::jsonb,
  parse_confidence numeric,
  parse_status text not null default 'ok' check (parse_status in ('ok','needs_review','unsupported')),
  embedding vector(1024),
  model_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_cv_profiles_candidate on public.cv_screening_profiles (candidate_id);
create index if not exists idx_cv_profiles_org on public.cv_screening_profiles (org_id);

alter table public.cv_screening_profiles enable row level security;

drop policy if exists cv_profiles_admin_all on public.cv_screening_profiles;
create policy cv_profiles_admin_all on public.cv_screening_profiles
  for all to authenticated
  using (org_id::text = (auth.jwt() ->> 'org_id') and (auth.jwt() ->> 'org_role') in ('org:owner','org:admin'))
  with check (org_id::text = (auth.jwt() ->> 'org_id') and (auth.jwt() ->> 'org_role') in ('org:owner','org:admin'));
