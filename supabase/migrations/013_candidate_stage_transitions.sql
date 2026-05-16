-- 013_candidate_stage_transitions.sql
--
-- Audit log for every application stage move (drag, dropdown, bulk, reject, undo).
-- Per M2 of docs/superpowers/plans/2026-05-16-jambahire-pipeline-drag-drop-and-transitions.md (Phase 4.6).
--
-- One row inserted per stage change. Renders the per-application activity timeline.
-- Run via Supabase Dashboard SQL Editor.
--
-- After this migration: run scripts/backfill-stage-transitions.sql to seed
-- a single 'initial' row per existing application so the timeline UI isn't
-- empty for legacy records.

CREATE TABLE IF NOT EXISTS public.candidate_stage_transitions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  application_id      UUID        NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  from_stage          TEXT,                                              -- NULL on direction='initial'
  to_stage            TEXT        NOT NULL,
  direction           TEXT        NOT NULL CHECK (direction IN ('forward','backward','reject','undo','initial')),
  actor_id            UUID        REFERENCES public.employees(id) ON DELETE SET NULL, -- NULL for system/candidate actions
  actor_type          TEXT        NOT NULL CHECK (actor_type IN ('admin','manager','system','candidate')),
  comment             TEXT,                                              -- required on direction='backward' (enforced in app)
  side_effects_status JSONB       NOT NULL DEFAULT '{}'::jsonb,          -- per-action {sent|skipped|failed} once M3 wires emails
  undone_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cst_application ON public.candidate_stage_transitions(application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cst_org         ON public.candidate_stage_transitions(org_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS (advisory — service role bypasses, same posture as 009_jambahire_rls)
-- ---------------------------------------------------------------------------
ALTER TABLE public.candidate_stage_transitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS candidate_stage_transitions_admin_all ON public.candidate_stage_transitions;
CREATE POLICY candidate_stage_transitions_admin_all ON public.candidate_stage_transitions
  FOR ALL
  USING (
    auth.jwt() ->> 'org_id' = candidate_stage_transitions.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  )
  WITH CHECK (
    auth.jwt() ->> 'org_id' = candidate_stage_transitions.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  );
