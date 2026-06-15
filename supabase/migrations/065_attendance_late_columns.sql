-- 065_attendance_late_columns.sql — lateness + opt-in columns (idempotent)
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS is_late boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS late_minutes integer NULL,
  ADD COLUMN IF NOT EXISTS late_policy_id uuid NULL REFERENCES public.late_policies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_records_late
  ON public.attendance_records (org_id, employee_id, is_late) WHERE is_late = true;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_at timestamptz NULL;
