-- 114_payroll_settings.sql
-- Payroll engine (plan: docs/planning/payroll/payroll-engine-plan.md §1).
-- Per-org payroll settings, versioned by PAY MONTH: a run for month M uses the
-- newest row with effective_from_month <= M. An org with no row runs on the
-- legacy defaults (ctc_first / 26 fixed days / LOP as a deduction line), so
-- this migration changes nothing for anyone until a row is written.
--
-- Additive and idempotent. RLS on with no policies: service role only (the
-- posture of 110/113 — the Clerk-JWT policies of 018 can never match since
-- Clerk Organizations were decoupled).

create table if not exists public.payroll_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  effective_from_month text not null
    check (effective_from_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  input_mode text not null check (input_mode in ('gross_first', 'ctc_first')),
  day_basis text not null check (day_basis in ('calendar_days', 'fixed_days')),
  fixed_days smallint check (fixed_days between 1 and 31),
  lop_source text not null
    check (lop_source in ('off', 'unpaid_leave', 'negative_leave_balance')),
  lop_treatment text not null check (lop_treatment in ('prorate', 'deduction')),
  prorate_joiners_leavers boolean not null,
  line_rounding text not null default 'rupee' check (line_rounding in ('none', 'rupee')),
  net_rounding text not null default 'rupee' check (net_rounding in ('none', 'rupee')),
  -- Pay slip presentation: header address/query line, optional employer block, etc.
  payslip jsonb not null default '{}'::jsonb,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, effective_from_month),
  check (day_basis <> 'fixed_days' or fixed_days is not null)
);

create index if not exists idx_payroll_settings_org_month
  on public.payroll_settings (org_id, effective_from_month desc);

alter table public.payroll_settings enable row level security;
