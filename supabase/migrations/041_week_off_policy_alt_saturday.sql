-- 041_week_off_policy_alt_saturday.sql — Attendance Phase 2: alternate-Saturday
-- support on the org-level week-off policy.
-- Idempotent.

ALTER TABLE public.week_off_policy
  ADD COLUMN IF NOT EXISTS alt_saturday_rule TEXT NOT NULL DEFAULT 'none';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'week_off_policy_alt_saturday_check'
  ) THEN
    ALTER TABLE public.week_off_policy
      ADD CONSTRAINT week_off_policy_alt_saturday_check
      CHECK (alt_saturday_rule IN ('none', 'odd_off', 'even_off'));
  END IF;
END $$;

COMMENT ON COLUMN public.week_off_policy.alt_saturday_rule IS
  'odd_off = 1st + 3rd Saturdays off; even_off = 2nd + 4th Saturdays off; none = no Saturday rule (use off_days directly).';
