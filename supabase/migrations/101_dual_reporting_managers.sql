-- 101_dual_reporting_managers.sql
-- Second reporting manager (equal powers) + review submitted-by audit.
-- Spec: docs/superpowers/specs/2026-07-15-dual-reporting-managers-design.md
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS reporting_manager_2_id uuid NULL REFERENCES employees(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE employees
    ADD CONSTRAINT employees_rm2_not_self
    CHECK (reporting_manager_2_id IS NULL OR reporting_manager_2_id <> id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE employees
    ADD CONSTRAINT employees_rm2_not_duplicate
    CHECK (reporting_manager_2_id IS NULL OR reporting_manager_2_id IS DISTINCT FROM reporting_manager_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_employees_reporting_manager_2 ON employees(reporting_manager_2_id);

ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS manager_review_submitted_by uuid NULL REFERENCES employees(id);
