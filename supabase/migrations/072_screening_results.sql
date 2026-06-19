-- 072: one current screening result per application.
create table if not exists public.screening_results (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  stage1_similarity numeric,
  score int check (score between 0 and 100),
  tier text check (tier in ('strong','possible','weak')),
  coverage jsonb not null default '[]'::jsonb,
  rationale text,
  model_version text,
  criteria_snapshot jsonb,
  screened_at timestamptz not null default now(),
  screened_by uuid references public.employees(id)
);

create unique index if not exists idx_screening_results_app on public.screening_results (application_id);
create index if not exists idx_screening_results_job on public.screening_results (job_id);
create index if not exists idx_screening_results_org on public.screening_results (org_id);

alter table public.screening_results enable row level security;

drop policy if exists screening_results_admin_all on public.screening_results;
create policy screening_results_admin_all on public.screening_results
  for all to authenticated
  using (org_id::text = (auth.jwt() ->> 'org_id') and (auth.jwt() ->> 'org_role') in ('org:owner','org:admin'))
  with check (org_id::text = (auth.jwt() ->> 'org_id') and (auth.jwt() ->> 'org_role') in ('org:owner','org:admin'));
