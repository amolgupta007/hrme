-- 014_application_loi_columns.sql
--
-- M4 Letter of Interest (LOI) flow.
-- Per docs/superpowers/plans/2026-05-16-jambahire-pipeline-drag-drop-and-transitions.md (Phase 3.4).
--
-- When admin drags Screening → Shortlisted, an LOI email is sent to the candidate.
-- The card visually stays in Screening with a `loi_status='pending'` chip until the
-- candidate clicks accept/decline on /loi/[token]. Accept advances the application
-- to `shortlisted` and notifies the hiring manager. Decline routes to `rejected`.
--
-- All columns nullable so existing applications are unaffected.
-- Run via Supabase Dashboard SQL Editor.

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS loi_sent_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS loi_status       TEXT,
  ADD COLUMN IF NOT EXISTS loi_responded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS loi_token        TEXT,
  ADD COLUMN IF NOT EXISTS loi_expires_at   TIMESTAMPTZ;

-- Enum-style CHECK constraint (NULL allowed for apps that never had an LOI).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'applications_loi_status_check'
  ) THEN
    ALTER TABLE public.applications
      ADD CONSTRAINT applications_loi_status_check
      CHECK (loi_status IS NULL OR loi_status IN ('pending', 'accepted', 'declined', 'expired'));
  END IF;
END$$;

-- Token must be unique across the org (URL-safe random, generated server-side).
CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_loi_token
  ON public.applications(loi_token)
  WHERE loi_token IS NOT NULL;

-- For the cron sweep (finds pending-and-overdue rows).
CREATE INDEX IF NOT EXISTS idx_applications_loi_pending_expiry
  ON public.applications(loi_expires_at)
  WHERE loi_status = 'pending';
