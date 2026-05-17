-- 020_tax_regime.sql
-- Wave 4 of PAYROLL_AUDIT.md — P-003 (tax regime toggle).
--
-- Adds:
--   salary_structures.tax_regime                 — 'new' (default) | 'old'
--   salary_structures.additional_deductions_annual — catch-all ₹/yr for old-regime
--                                                    80C/80D/24/HRA-actual totals
--                                                    that the admin computes externally.
--                                                    Ignored in new regime.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS). Existing rows default to 'new' regime
-- with zero additional deductions — matches the codebase's prior implicit assumption.

ALTER TABLE salary_structures
  ADD COLUMN IF NOT EXISTS tax_regime text NOT NULL DEFAULT 'new'
    CHECK (tax_regime IN ('new', 'old'));

ALTER TABLE salary_structures
  ADD COLUMN IF NOT EXISTS additional_deductions_annual numeric NOT NULL DEFAULT 0;
