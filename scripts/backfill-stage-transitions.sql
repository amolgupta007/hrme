-- backfill-stage-transitions.sql
--
-- One-shot backfill: insert a synthetic 'initial' transition row per existing
-- application at its current stage. Makes the M2 activity timeline render a
-- starting point for pre-cutover applications instead of an empty list.
--
-- Safe to re-run: skips applications that already have any transition row.
-- Run via Supabase Dashboard SQL Editor AFTER 013_candidate_stage_transitions.sql.

INSERT INTO public.candidate_stage_transitions (
  org_id,
  application_id,
  from_stage,
  to_stage,
  direction,
  actor_id,
  actor_type,
  created_at
)
SELECT
  a.org_id,
  a.id,
  NULL,
  a.stage,
  'initial',
  NULL,
  'system',
  a.applied_at
FROM public.applications a
WHERE NOT EXISTS (
  SELECT 1 FROM public.candidate_stage_transitions cst
  WHERE cst.application_id = a.id
);
