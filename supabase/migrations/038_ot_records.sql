-- 038_ot_records.sql — Attendance Phase 2: overtime records, per (employee, date).
-- Idempotent.

CREATE TABLE IF NOT EXISTS public.ot_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  attendance_record_id UUID REFERENCES public.attendance_records(id) ON DELETE SET NULL,
  shift_id UUID REFERENCES public.shifts(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  ot_minutes INTEGER NOT NULL CHECK (ot_minutes >= 0),
  multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.5 CHECK (multiplier > 0 AND multiplier <= 5),
  threshold_mode TEXT NOT NULL DEFAULT 'per_day' CHECK (threshold_mode IN ('per_day', 'weekly')),
  hourly_rate INTEGER, -- paise; null = unknown (computed at push-to-payroll time)
  amount INTEGER, -- paise; ot_minutes * multiplier * hourly_rate, computed at push time
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','pushed')),
  approved_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejected_reason TEXT,
  payroll_line_item_id UUID REFERENCES public.payroll_line_items(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, date)
);

CREATE INDEX IF NOT EXISTS ot_records_org_status_date_idx
  ON public.ot_records (org_id, status, date DESC);

CREATE INDEX IF NOT EXISTS ot_records_employee_date_idx
  ON public.ot_records (employee_id, date DESC);

ALTER TABLE public.ot_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ot_records_admin_all ON public.ot_records;
CREATE POLICY ot_records_admin_all ON public.ot_records FOR ALL
  USING (
    auth.jwt() ->> 'org_id' = ot_records.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  )
  WITH CHECK (
    auth.jwt() ->> 'org_id' = ot_records.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  );

DROP POLICY IF EXISTS ot_records_self_read ON public.ot_records;
CREATE POLICY ot_records_self_read ON public.ot_records FOR SELECT
  USING (
    auth.jwt() ->> 'org_id' = ot_records.org_id::text
    AND auth.jwt() ->> 'employee_id' = ot_records.employee_id::text
  );
