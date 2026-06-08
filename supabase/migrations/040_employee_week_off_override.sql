-- 040_employee_week_off_override.sql — Attendance Phase 2: per-employee
-- override of org week-off policy. Idempotent.

CREATE TABLE IF NOT EXISTS public.employee_week_off_override (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL UNIQUE REFERENCES public.employees(id) ON DELETE CASCADE,
  week_type SMALLINT NOT NULL CHECK (week_type IN (5, 6)),
  off_days SMALLINT[] NOT NULL DEFAULT ARRAY[0]::SMALLINT[],
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employee_week_off_override_org_idx
  ON public.employee_week_off_override (org_id);

ALTER TABLE public.employee_week_off_override ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_week_off_override_admin_all ON public.employee_week_off_override;
CREATE POLICY employee_week_off_override_admin_all ON public.employee_week_off_override FOR ALL
  USING (
    auth.jwt() ->> 'org_id' = employee_week_off_override.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  )
  WITH CHECK (
    auth.jwt() ->> 'org_id' = employee_week_off_override.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  );

DROP POLICY IF EXISTS employee_week_off_override_self_read ON public.employee_week_off_override;
CREATE POLICY employee_week_off_override_self_read ON public.employee_week_off_override FOR SELECT
  USING (
    auth.jwt() ->> 'org_id' = employee_week_off_override.org_id::text
    AND auth.jwt() ->> 'employee_id' = employee_week_off_override.employee_id::text
  );

DROP TRIGGER IF EXISTS employee_week_off_override_set_updated_at ON public.employee_week_off_override;
CREATE TRIGGER employee_week_off_override_set_updated_at
  BEFORE UPDATE ON public.employee_week_off_override
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
