-- 021_payroll_entry_fy_snapshot.sql
-- Wave 5 of PAYROLL_AUDIT.md — P-002 (mid-FY joiner TDS projection).
--
-- Snapshots the projected FY income context on each payroll_entries row at
-- process time. updatePayrollEntry reads them back so admin bonus edits use
-- the right monthly TDS divisor without an extra DB roundtrip.
--
--   annual_taxable_income — projected (gross × months_in_fy − PF × months_in_fy
--                                       − std deduction − allowed extra deductions)
--   months_in_fy           — number of months this employee earns salary in this FY
--                            (12 for old hires; less for joiners after April 1)
--
-- Both nullable: legacy entries (processed before this migration) keep null, and
-- the action falls back to the old gross×12 inline derivation when reading.

ALTER TABLE payroll_entries
  ADD COLUMN IF NOT EXISTS annual_taxable_income numeric;

ALTER TABLE payroll_entries
  ADD COLUMN IF NOT EXISTS months_in_fy integer;
