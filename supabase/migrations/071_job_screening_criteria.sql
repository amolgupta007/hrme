-- 071: per-job screening configuration.
create table if not exists public.job_screening_criteria (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  must_haves jsonb not null default '[]'::jsonb,
  nice_to_haves jsonb not null default '[]'::jsonb,
  top_k int not null default 20 check (top_k between 1 and 100),
  criteria_source text not null default 'manual' check (criteria_source in ('jd','manual')),
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_job_criteria_job on public.job_screening_criteria (job_id);
create index if not exists idx_job_criteria_org on public.job_screening_criteria (org_id);

alter table public.job_screening_criteria enable row level security;

drop policy if exists job_criteria_admin_all on public.job_screening_criteria;
create policy job_criteria_admin_all on public.job_screening_criteria
  for all to authenticated
  using (org_id::text = (auth.jwt() ->> 'org_id') and (auth.jwt() ->> 'org_role') in ('org:owner','org:admin'))
  with check (org_id::text = (auth.jwt() ->> 'org_id') and (auth.jwt() ->> 'org_role') in ('org:owner','org:admin'));
