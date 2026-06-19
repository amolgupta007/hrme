-- 073: append-only screening decision + cost log.
create table if not exists public.screening_audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  application_id uuid references public.applications(id) on delete set null,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  cost_inr_paise int not null default 0,
  actor_id uuid references public.employees(id),
  actor_type text not null default 'admin',
  created_at timestamptz not null default now()
);

create index if not exists idx_screening_audit_org_created on public.screening_audit_log (org_id, created_at);

alter table public.screening_audit_log enable row level security;

drop policy if exists screening_audit_admin_all on public.screening_audit_log;
create policy screening_audit_admin_all on public.screening_audit_log
  for all to authenticated
  using (org_id::text = (auth.jwt() ->> 'org_id') and (auth.jwt() ->> 'org_role') in ('org:owner','org:admin'))
  with check (org_id::text = (auth.jwt() ->> 'org_id') and (auth.jwt() ->> 'org_role') in ('org:owner','org:admin'));
