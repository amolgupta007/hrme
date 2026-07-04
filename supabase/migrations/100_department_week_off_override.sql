-- 100_department_week_off_override.sql
-- Per-DEPARTMENT week-off override. Mirrors employee_week_off_override (040+099)
-- but keyed by department. Precedence at resolve time is:
--   employee override > department override > org week_off_policy.
-- Idempotent.

CREATE TABLE IF NOT EXISTS public.department_week_off_override (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  department_id UUID NOT NULL UNIQUE REFERENCES public.departments(id) ON DELETE CASCADE,
  week_type SMALLINT NOT NULL CHECK (week_type IN (5, 6)),
  off_days SMALLINT[] NOT NULL DEFAULT ARRAY[0]::SMALLINT[],
  alt_saturday_rule TEXT NOT NULL DEFAULT 'none' CHECK (alt_saturday_rule IN ('none', 'odd_off', 'even_off')),
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS department_week_off_override_org_idx
  ON public.department_week_off_override (org_id);

ALTER TABLE public.department_week_off_override ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS department_week_off_override_admin_all ON public.department_week_off_override;
CREATE POLICY department_week_off_override_admin_all ON public.department_week_off_override FOR ALL
  USING (
    auth.jwt() ->> 'org_id' = department_week_off_override.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  )
  WITH CHECK (
    auth.jwt() ->> 'org_id' = department_week_off_override.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  );

-- Any org member may read their org's department overrides (mirrors the
-- employee self-read intent: people can see the schedule that applies to them).
DROP POLICY IF EXISTS department_week_off_override_org_read ON public.department_week_off_override;
CREATE POLICY department_week_off_override_org_read ON public.department_week_off_override FOR SELECT
  USING (auth.jwt() ->> 'org_id' = department_week_off_override.org_id::text);

DROP TRIGGER IF EXISTS department_week_off_override_set_updated_at ON public.department_week_off_override;
CREATE TRIGGER department_week_off_override_set_updated_at
  BEFORE UPDATE ON public.department_week_off_override
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
