-- 032_attendance_records_shift_columns.sql — Attendance Phase 1:
-- Wire attendance records to shift master. Additive + nullable.

ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS shift_id UUID NULL REFERENCES public.shifts(id) ON DELETE SET NULL;

ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS attributed_date DATE NULL;

-- attributed_date is only set when the row is recorded under a shift; for
-- legacy / no-shift orgs we leave it null and continue using `date`.
CREATE INDEX IF NOT EXISTS attendance_records_attributed_date_idx
  ON public.attendance_records (org_id, attributed_date)
  WHERE attributed_date IS NOT NULL;
