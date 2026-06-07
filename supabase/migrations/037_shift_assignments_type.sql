-- 037_shift_assignments_type.sql — Attendance Phase 2: distinguish fixed vs
-- rotational (tentative) assignments. Default 'fixed' keeps existing rows valid.
-- Idempotent.

ALTER TABLE public.shift_assignments
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'fixed';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shift_assignments_type_check'
  ) THEN
    ALTER TABLE public.shift_assignments
      ADD CONSTRAINT shift_assignments_type_check
      CHECK (type IN ('fixed', 'rotational'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS shift_assignments_type_idx
  ON public.shift_assignments (org_id, type);

COMMENT ON COLUMN public.shift_assignments.type IS
  'Phase 2: fixed = committed assignment; rotational = tentative placeholder shown in the roster grid as a lighter chip. Drag-to-fix or setAssignmentType promotes to fixed.';
