-- 115_payroll_components.sql
-- Payroll engine §2: the per-org component master (earnings, deductions,
-- employer contributions). Versioned by PAY MONTH like payroll_settings: a
-- change is a new row for (org, code, effective_from_month); processed runs
-- keep their own snapshot. An org with no rows runs on the legacy component set
-- (Basic % of CTC, HRA, special, PF, PT, TDS, employer PF, gratuity).
--
-- Additive and idempotent. RLS on, no policies (service role only).

create table if not exists public.payroll_components (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  code text not null check (code ~ '^[A-Z][A-Z0-9_]{1,31}$'),
  effective_from_month text not null
    check (effective_from_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  label text not null check (length(trim(label)) between 1 and 60),
  kind text not null check (kind in ('earning', 'deduction', 'employer_contribution')),
  method text not null check (method in ('fixed', 'pct_of', 'balancing', 'statutory', 'manual')),
  base text,                 -- pct_of: a component code, or GROSS / CTC
  pct numeric(7,4),          -- pct_of: the default percentage
  amount numeric(12,2),      -- fixed: the default monthly amount
  rule text check (rule in ('epf', 'esi', 'pt', 'lwf', 'tds')),
  prorate boolean not null default true,
  taxable boolean not null default true,
  enabled boolean not null default true,
  show_on_payslip boolean not null default true,
  display_order integer not null default 100,
  -- System components (statutory ones, Basic, the balancing line) can be
  -- disabled and relabelled but not deleted.
  is_system boolean not null default false,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, code, effective_from_month),
  check (method <> 'pct_of' or (base is not null and pct is not null)),
  check (method <> 'statutory' or rule is not null),
  check (method = 'statutory' or rule is null),
  check (method <> 'balancing' or kind = 'earning'),
  check (rule is null or rule not in ('pt', 'tds') or kind = 'deduction')
);

create index if not exists idx_payroll_components_org_month
  on public.payroll_components (org_id, effective_from_month desc);

alter table public.payroll_components enable row level security;
