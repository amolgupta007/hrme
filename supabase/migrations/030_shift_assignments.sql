-- 030_shift_assignments.sql — Attendance Phase 1: Per-employee shift assignment.
-- Idempotent.

CREATE TABLE IF NOT EXISTS public.shift_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  shift_id UUID NOT NULL REFERENCES public.shifts(id) ON DELETE RESTRICT,
  date_from DATE NOT NULL,
  date_to DATE,  -- null = open-ended
  assigned_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (date_to IS NULL OR date_to >= date_from)
);

CREATE INDEX IF NOT EXISTS shift_assignments_employee_range_idx
  ON public.shift_assignments (org_id, employee_id, date_from DESC);

CREATE INDEX IF NOT EXISTS shift_assignments_shift_idx
  ON public.shift_assignments (shift_id);

ALTER TABLE public.shift_assignments ENABLE ROW LEVEL SECURITY;

-- Follows 009_jambahire_rls.sql / 018_payroll_schema_capture.sql admin pattern.
-- Service-role bypasses today (CLAUDE.md gotcha #5).
DROP POLICY IF EXISTS shift_assignments_admin_all ON public.shift_assignments;
CREATE POLICY shift_assignments_admin_all ON public.shift_assignments FOR ALL
  USING (
    auth.jwt() ->> 'org_id' = shift_assignments.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  )
  WITH CHECK (
    auth.jwt() ->> 'org_id' = shift_assignments.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  );

-- Employees can SELECT their own assignments (powers the "Today's shift" chip).
DROP POLICY IF EXISTS shift_assignments_self_read ON public.shift_assignments;
CREATE POLICY shift_assignments_self_read ON public.shift_assignments FOR SELECT
  USING (
    auth.jwt() ->> 'org_id' = shift_assignments.org_id::text
    AND auth.jwt() ->> 'employee_id' = shift_assignments.employee_id::text
  );
