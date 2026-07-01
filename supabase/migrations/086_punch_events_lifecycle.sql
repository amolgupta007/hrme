-- 086_punch_events_lifecycle.sql
-- Status/type/void/approve columns for the punch redesign. Idempotent.

ALTER TABLE public.attendance_punch_events
  ADD COLUMN IF NOT EXISTS punch_type text NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS created_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS rejected_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason text NULL,
  ADD COLUMN IF NOT EXISTS voided_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS voided_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS void_reason text NULL,
  ADD COLUMN IF NOT EXISTS superseded_by uuid NULL REFERENCES public.attendance_punch_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS note text NULL;

DO $$ BEGIN
  ALTER TABLE public.attendance_punch_events
    ADD CONSTRAINT punch_events_type_check
    CHECK (punch_type IS NULL OR punch_type IN ('in','out','break_out','break_in'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.attendance_punch_events
    ADD CONSTRAINT punch_events_status_check
    CHECK (status IN ('approved','pending','rejected','voided','duplicate'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Existing rows are trusted device punches.
UPDATE public.attendance_punch_events SET status = 'approved' WHERE status IS NULL;

CREATE INDEX IF NOT EXISTS idx_punch_events_status
  ON public.attendance_punch_events (org_id, employee_id, status);
