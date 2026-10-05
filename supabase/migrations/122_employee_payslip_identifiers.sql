-- 122_employee_payslip_identifiers.sql
-- Employee fields the October-format pay slip can show and that didn't exist:
--   employee_code: the company's own employee number (e.g. "007"). Separate
--                  from device_code, the biometric PIN: at Medialoop they differ.
--                  Unique within an org when set.
--   pran:          NPS Permanent Retirement Account Number.
--   nationality:   e.g. "Indian".
-- Which fields a slip shows (and their labels) is per org, in
-- organizations.settings.payslip.employeeFields.
--
-- Additive and idempotent; all nullable, so nothing existing changes.

alter table public.employees
  add column if not exists employee_code text,
  add column if not exists pran text,
  add column if not exists nationality text;

create unique index if not exists uq_employees_org_employee_code
  on public.employees (org_id, employee_code)
  where employee_code is not null;
