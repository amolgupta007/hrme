-- 012_application_stage_add_shortlisted.sql
--
-- Adds 'shortlisted' to the applications.stage CHECK constraint.
-- Stage sits between 'screening' and 'interview_1'.
-- Run via Supabase Dashboard SQL Editor (per CLAUDE.md convention — no CLI on Windows).
--
-- Safe to re-run: drops the constraint by its known name before recreating.

ALTER TABLE public.applications
  DROP CONSTRAINT IF EXISTS applications_stage_check;

ALTER TABLE public.applications
  ADD CONSTRAINT applications_stage_check
  CHECK (stage IN (
    'applied',
    'screening',
    'shortlisted',
    'interview_1',
    'interview_2',
    'final_round',
    'offer',
    'hired',
    'rejected'
  ));
