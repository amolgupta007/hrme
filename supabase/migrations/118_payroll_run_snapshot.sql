-- 118_payroll_run_snapshot.sql
-- Payroll engine §5: frozen snapshots on runs and entries, plus line-item
-- fields for one-off adjustments and next-month corrections.
--
-- payroll_entries.snapshot holds every computed line (code, label, kind,
-- amount, base, rate, rule id, order, show flag), the employee's details at the
-- time, days, the settings version and the rule versions + params used. Pay
-- slips render ONLY from it once a run is processed. NULL = a pre-engine entry,
-- rendered from its existing columns by the legacy adapter. The existing amount
-- columns keep being written so totals, disbursement and insights keep working.
--
-- Additive except two guards that live data already satisfies (checked
-- 2026-10-02: 0 duplicate (run, employee) pairs, 0 malformed months).
-- Idempotent.

alter table public.payroll_entries
  add column if not exists snapshot jsonb,
  add column if not exists engine_version smallint,
  add column if not exists employer_contributions_total numeric(12,2),
  add column if not exists ctc_monthly numeric(12,2),
  add column if not exists days_paid numeric(5,2);

create unique index if not exists uq_payroll_entries_run_employee
  on public.payroll_entries (payroll_run_id, employee_id);

alter table public.payroll_runs
  add column if not exists settings_snapshot jsonb,
  add column if not exists rule_versions jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payroll_runs_month_format') then
    alter table public.payroll_runs
      add constraint payroll_runs_month_format check (month ~ '^\d{4}-(0[1-9]|1[0-2])$');
  end if;
end $$;

-- One-off adjustments: a deduction direction (recoveries), an optional link to
-- the component being adjusted, and a pointer to the processed entry a
-- next-month correction fixes. Existing rows default to 'earning' — exactly how
-- every current reader already treats them.
alter table public.payroll_line_items
  add column if not exists direction text not null default 'earning',
  add column if not exists component_code text,
  add column if not exists corrects_entry_id uuid
    references public.payroll_entries(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payroll_line_items_direction_check') then
    alter table public.payroll_line_items
      add constraint payroll_line_items_direction_check check (direction in ('earning', 'deduction'));
  end if;
end $$;
