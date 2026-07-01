-- 088_attendance_records_worked_minutes.sql
-- Net worked time (breaks excluded) + review flags on the daily rollup. Idempotent.

ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS worked_minutes integer NULL,
  ADD COLUMN IF NOT EXISTS break_minutes integer NULL,
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_pending_punches boolean NOT NULL DEFAULT false;

-- Backfill: legacy rows keep total_minutes as their worked figure (no break data).
UPDATE public.attendance_records
  SET worked_minutes = total_minutes
  WHERE worked_minutes IS NULL AND total_minutes IS NOT NULL;
