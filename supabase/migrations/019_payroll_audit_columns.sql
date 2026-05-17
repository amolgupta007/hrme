-- 019_payroll_audit_columns.sql
-- Wave 3b of PAYROLL_AUDIT.md — audit-trail columns:
--   P-015: payroll_runs.paid_by         — who marked the run as paid
--   P-017: payroll_entries.edited_by    — last admin who edited the entry
--          payroll_entries.edited_at    — when the edit happened
--          payroll_entries.previous_net_pay — net_pay captured BEFORE the edit
--   P-019: salary_structures.computed_at — when the breakdown was last computed
--                                          (drift detection vs ctc.ts logic changes)
--
-- All ALTERs are idempotent (ADD COLUMN IF NOT EXISTS). FKs reference employees(id)
-- with ON DELETE SET NULL — preserves the audit row if the actor is later terminated.

ALTER TABLE payroll_runs
  ADD COLUMN IF NOT EXISTS paid_by uuid REFERENCES employees(id) ON DELETE SET NULL;

ALTER TABLE payroll_entries
  ADD COLUMN IF NOT EXISTS edited_by uuid REFERENCES employees(id) ON DELETE SET NULL;

ALTER TABLE payroll_entries
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;

ALTER TABLE payroll_entries
  ADD COLUMN IF NOT EXISTS previous_net_pay numeric;

ALTER TABLE salary_structures
  ADD COLUMN IF NOT EXISTS computed_at timestamptz NOT NULL DEFAULT now();
