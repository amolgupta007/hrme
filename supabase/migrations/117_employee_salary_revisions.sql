-- 117_employee_salary_revisions.sql
-- Payroll engine §3: per-employee salary with real history.
--
--   employee_salary_revisions        — one row per employee per effective MONTH:
--                                      the monthly gross (gross-first orgs) or
--                                      annual CTC (ctc-first orgs) + tax inputs.
--                                      A revision never overwrites an older one.
--   employee_salary_component_values — that revision's overrides of the org's
--                                      component defaults (e.g. LTA ₹15,000,
--                                      HRA 40%).
--
-- salary_structures stays as-is and keeps serving today's readers (run
-- processing, insights, late-penalty bands, document variables) until the
-- engine is wired in; it becomes a derived "current" cache after that.
--
-- Additive and idempotent. RLS on, no policies (service role only).

create table if not exists public.employee_salary_revisions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  effective_from_month text not null
    check (effective_from_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  monthly_gross numeric(12,2) check (monthly_gross >= 0),
  annual_ctc numeric(14,2) check (annual_ctc >= 0),
  tax_regime text not null default 'new' check (tax_regime in ('new', 'old')),
  declared_deductions_annual numeric(12,2) not null default 0
    check (declared_deductions_annual >= 0),
  -- PT / LWF jurisdiction, lower-case state key (matches statutory_rules).
  pt_state text check (pt_state is null or pt_state = lower(trim(pt_state))),
  notes text,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (employee_id, effective_from_month),
  check (monthly_gross is not null or annual_ctc is not null)
);

create index if not exists idx_salary_revisions_org_month
  on public.employee_salary_revisions (org_id, effective_from_month desc);

create table if not exists public.employee_salary_component_values (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  revision_id uuid not null references public.employee_salary_revisions(id) on delete cascade,
  component_code text not null check (component_code ~ '^[A-Z][A-Z0-9_]{1,31}$'),
  amount numeric(12,2),
  pct numeric(7,4),
  created_at timestamptz not null default now(),
  unique (revision_id, component_code),
  check (amount is not null or pct is not null)
);

create index if not exists idx_salary_component_values_org
  on public.employee_salary_component_values (org_id);

alter table public.employee_salary_revisions enable row level security;
alter table public.employee_salary_component_values enable row level security;
