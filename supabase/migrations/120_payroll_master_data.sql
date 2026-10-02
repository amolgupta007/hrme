-- 120_payroll_master_data.sql
-- Payroll engine §6 + D9: the fields the October-format pay slip needs, and the
-- "not on this company's payroll" flag.
--
-- employees:      uan, pf_number, esic_number, work_location (pay slip block);
--                 payroll_excluded + reason (e.g. staff on another entity's
--                 payroll — skipped explicitly by runs and listed on the run).
-- organizations:  address, PF establishment code, ESI code, PAN, TAN (pay slip
--                 header / statutory identifiers).
--
-- Additive and idempotent; all nullable or defaulted, so nothing existing
-- changes.

alter table public.employees
  add column if not exists uan text,
  add column if not exists pf_number text,
  add column if not exists esic_number text,
  add column if not exists work_location text,
  add column if not exists payroll_excluded boolean not null default false,
  add column if not exists payroll_excluded_reason text;

alter table public.organizations
  add column if not exists address jsonb,
  add column if not exists pf_establishment_code text,
  add column if not exists esi_code text,
  add column if not exists pan text,
  add column if not exists tan text;
