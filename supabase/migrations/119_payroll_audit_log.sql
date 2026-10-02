-- 119_payroll_audit_log.sql
-- Payroll engine §3: who changed what in payroll, when, from what, to what.
-- Written by every payroll mutation (settings, components, rules, salary
-- revisions and their component values, run entries, run transitions incl.
-- reopen, payroll exclusion).
--
-- Append-only, enforced by a trigger (a trigger, unlike a policy, also binds
-- the service role): UPDATE always fails; DELETE fails while the org still
-- exists, so only an org deletion's cascade can purge — same pattern as
-- announcement_ack_guard (109).
--
-- Additive and idempotent. RLS on, no policies (service role only).

create table if not exists public.payroll_audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  entity text not null check (entity in (
    'settings', 'component', 'rule', 'salary_revision', 'salary_component_value',
    'run', 'entry', 'line_item', 'employee_payroll_exclusion'
  )),
  entity_id uuid,
  action text not null check (action in ('create', 'update', 'delete', 'transition')),
  field text,
  old_value jsonb,
  new_value jsonb,
  actor_employee_id uuid references public.employees(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_payroll_audit_log_entity
  on public.payroll_audit_log (org_id, entity, entity_id, created_at desc);

create or replace function public.payroll_audit_log_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'payroll_audit_log is append-only';
  end if;
  if exists (select 1 from public.organizations where id = old.org_id) then
    raise exception 'payroll_audit_log is append-only';
  end if;
  return old;
end;
$$;

drop trigger if exists payroll_audit_log_immutable on public.payroll_audit_log;
create trigger payroll_audit_log_immutable
  before update or delete on public.payroll_audit_log
  for each row execute function public.payroll_audit_log_guard();

alter table public.payroll_audit_log enable row level security;
