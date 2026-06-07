-- 033_salary_structure_config.sql — Payroll PRD 02 Phase 1: Owner-configurable
-- salary structure ratios (Basic %, HRA % metro, HRA % non-metro, Gratuity %).
-- Append-only by (org_id, effective_from). Newest effective_from <= today
-- is the org's active config.
-- Idempotent.

CREATE TABLE IF NOT EXISTS public.salary_structure_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  basic_pct NUMERIC(5,2) NOT NULL CHECK (basic_pct >= 10 AND basic_pct <= 80),
  hra_pct_metro NUMERIC(5,2) NOT NULL CHECK (hra_pct_metro >= 0 AND hra_pct_metro <= 100),
  hra_pct_non_metro NUMERIC(5,2) NOT NULL CHECK (hra_pct_non_metro >= 0 AND hra_pct_non_metro <= 100),
  gratuity_pct NUMERIC(5,3) NOT NULL CHECK (gratuity_pct >= 0 AND gratuity_pct <= 20),
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One config per org per effective_from. Re-saving the same effective_from
  -- replaces via upsert in the server action.
  UNIQUE (org_id, effective_from)
);

CREATE INDEX IF NOT EXISTS salary_structure_config_org_active_idx
  ON public.salary_structure_config (org_id, effective_from DESC);

ALTER TABLE public.salary_structure_config ENABLE ROW LEVEL SECURITY;

-- Admin write (org-scoped, Clerk-JWT pattern from 009_jambahire_rls.sql).
-- Service-role bypasses today (CLAUDE.md gotcha #5).
DROP POLICY IF EXISTS salary_structure_config_admin_all ON public.salary_structure_config;
CREATE POLICY salary_structure_config_admin_all ON public.salary_structure_config FOR ALL
  USING (
    auth.jwt() ->> 'org_id' = salary_structure_config.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  )
  WITH CHECK (
    auth.jwt() ->> 'org_id' = salary_structure_config.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  );

-- Any authenticated user in the org can READ the org's active config (used by
-- employee My Compensation view to interpret their structure). No PII.
DROP POLICY IF EXISTS salary_structure_config_org_read ON public.salary_structure_config;
CREATE POLICY salary_structure_config_org_read ON public.salary_structure_config FOR SELECT
  USING (auth.jwt() ->> 'org_id' = salary_structure_config.org_id::text);
