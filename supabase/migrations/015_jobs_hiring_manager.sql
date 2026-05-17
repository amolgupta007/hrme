-- 015_jobs_hiring_manager.sql
--
-- M5 — adds nullable jobs.hiring_manager_id (FK → employees).
-- Drives manager-scoped permissions (canMoveStage) and is the future
-- recipient of the manager-shortlist-notify email (currently goes to all admins).
--
-- Run via Supabase Dashboard SQL Editor.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS hiring_manager_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'jobs_hiring_manager_id_fkey'
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_hiring_manager_id_fkey
      FOREIGN KEY (hiring_manager_id)
      REFERENCES public.employees(id)
      ON DELETE SET NULL;
  END IF;
END$$;

-- Speed up the manager-scoped pipeline query.
CREATE INDEX IF NOT EXISTS idx_jobs_hiring_manager
  ON public.jobs(hiring_manager_id)
  WHERE hiring_manager_id IS NOT NULL;
