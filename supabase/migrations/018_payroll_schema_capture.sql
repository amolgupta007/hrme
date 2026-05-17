-- 018_payroll_schema_capture.sql
-- Captures the live DDL for payroll tables (originally created via SQL Editor per
-- CLAUDE.md gotcha #6) and adds defense-in-depth RLS + missing performance indexes.
--
-- All CREATE statements are idempotent (IF NOT EXISTS) — safe to re-run.
-- RLS policies follow the 009_jambahire_rls.sql pattern (advisory today; service
-- role bypasses, but activates if Clerk-JWT-to-Supabase integration lands or the
-- service-role key leaks).
--
-- Run via Supabase Dashboard SQL Editor or MCP apply_migration.

-- ============================================================================
-- payroll_runs
-- ============================================================================
CREATE TABLE IF NOT EXISTS payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  month text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'processed', 'paid')),
  working_days integer NOT NULL DEFAULT 26,
  total_gross numeric,
  total_deductions numeric,
  total_net numeric,
  employee_count integer,
  notes text,
  processed_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_runs_org_id_month_key UNIQUE (org_id, month)
);

-- ============================================================================
-- payroll_entries
-- ============================================================================
CREATE TABLE IF NOT EXISTS payroll_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id uuid NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  basic_monthly numeric NOT NULL,
  hra_monthly numeric NOT NULL,
  special_allowance_monthly numeric NOT NULL,
  gross_salary numeric NOT NULL,
  employee_pf numeric NOT NULL DEFAULT 0,
  professional_tax numeric NOT NULL DEFAULT 0,
  tds numeric NOT NULL DEFAULT 0,
  lop_days numeric NOT NULL DEFAULT 0,
  lop_deduction numeric NOT NULL DEFAULT 0,
  bonus numeric NOT NULL DEFAULT 0,
  total_deductions numeric NOT NULL,
  net_pay numeric NOT NULL,
  payslip_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- salary_structures
-- ============================================================================
CREATE TABLE IF NOT EXISTS salary_structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  ctc numeric NOT NULL,
  basic_monthly numeric NOT NULL,
  hra_monthly numeric NOT NULL,
  special_allowance_monthly numeric NOT NULL,
  employer_pf_monthly numeric NOT NULL DEFAULT 0,
  employer_gratuity_annual numeric NOT NULL DEFAULT 0,
  employee_pf_monthly numeric NOT NULL DEFAULT 0,
  professional_tax_monthly numeric NOT NULL DEFAULT 0,
  tds_monthly numeric NOT NULL DEFAULT 0,
  gross_monthly numeric NOT NULL,
  net_monthly numeric NOT NULL,
  state text NOT NULL DEFAULT 'other',
  is_metro boolean NOT NULL DEFAULT true,
  include_hra boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT salary_structures_org_id_employee_id_key UNIQUE (org_id, employee_id)
);

-- ============================================================================
-- Performance indexes (missing from live DB; observed only PKs + unique constraints)
-- ============================================================================
CREATE INDEX IF NOT EXISTS payroll_runs_org_id_idx ON payroll_runs (org_id);
CREATE INDEX IF NOT EXISTS payroll_entries_payroll_run_id_idx ON payroll_entries (payroll_run_id);
CREATE INDEX IF NOT EXISTS payroll_entries_employee_id_idx ON payroll_entries (employee_id);
CREATE INDEX IF NOT EXISTS payroll_entries_org_id_idx ON payroll_entries (org_id);

-- ============================================================================
-- RLS — defense-in-depth (service role bypasses; activates on JWT wiring)
-- ============================================================================
ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_structures ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- payroll_runs: admin/owner of the same org → full CRUD
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS payroll_runs_admin_all ON payroll_runs;
CREATE POLICY payroll_runs_admin_all ON payroll_runs
  FOR ALL
  USING (
    auth.jwt() ->> 'org_id' = payroll_runs.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  )
  WITH CHECK (
    auth.jwt() ->> 'org_id' = payroll_runs.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  );

-- ----------------------------------------------------------------------------
-- payroll_entries: admin/owner full CRUD + employee can read own
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS payroll_entries_admin_all ON payroll_entries;
DROP POLICY IF EXISTS payroll_entries_self_read ON payroll_entries;

CREATE POLICY payroll_entries_admin_all ON payroll_entries
  FOR ALL
  USING (
    auth.jwt() ->> 'org_id' = payroll_entries.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  )
  WITH CHECK (
    auth.jwt() ->> 'org_id' = payroll_entries.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  );

CREATE POLICY payroll_entries_self_read ON payroll_entries
  FOR SELECT
  USING (
    auth.jwt() ->> 'org_id' = payroll_entries.org_id::text
    AND auth.jwt() ->> 'employee_id' = payroll_entries.employee_id::text
  );

-- ----------------------------------------------------------------------------
-- salary_structures: admin/owner full CRUD + employee can read own
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS salary_structures_admin_all ON salary_structures;
DROP POLICY IF EXISTS salary_structures_self_read ON salary_structures;

CREATE POLICY salary_structures_admin_all ON salary_structures
  FOR ALL
  USING (
    auth.jwt() ->> 'org_id' = salary_structures.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  )
  WITH CHECK (
    auth.jwt() ->> 'org_id' = salary_structures.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  );

CREATE POLICY salary_structures_self_read ON salary_structures
  FOR SELECT
  USING (
    auth.jwt() ->> 'org_id' = salary_structures.org_id::text
    AND auth.jwt() ->> 'employee_id' = salary_structures.employee_id::text
  );

-- Sanity: list policies installed so the operator can verify in the SQL Editor
-- SELECT schemaname, tablename, policyname, cmd
--   FROM pg_policies
--  WHERE tablename IN ('payroll_runs', 'payroll_entries', 'salary_structures')
--  ORDER BY tablename, policyname;
