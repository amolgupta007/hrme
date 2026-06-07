-- 031_week_off_policy.sql — Attendance Phase 1: Org-level week-off policy.
-- One row per org. Idempotent.

CREATE TABLE IF NOT EXISTS public.week_off_policy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  week_type SMALLINT NOT NULL CHECK (week_type IN (5, 6)),
  -- ISO day-of-week: 0=Sunday, 1=Monday, ..., 6=Saturday
  off_days SMALLINT[] NOT NULL DEFAULT ARRAY[0]::SMALLINT[],
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.week_off_policy ENABLE ROW LEVEL SECURITY;

-- Admin write (org-scoped, Clerk-JWT pattern from 009_jambahire_rls.sql).
DROP POLICY IF EXISTS week_off_policy_admin_all ON public.week_off_policy;
CREATE POLICY week_off_policy_admin_all ON public.week_off_policy FOR ALL
  USING (
    auth.jwt() ->> 'org_id' = week_off_policy.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  )
  WITH CHECK (
    auth.jwt() ->> 'org_id' = week_off_policy.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  );

-- Any authenticated user in the org can READ the org's policy (it affects
-- everyone's calendar — no PII).
DROP POLICY IF EXISTS week_off_policy_org_read ON public.week_off_policy;
CREATE POLICY week_off_policy_org_read ON public.week_off_policy FOR SELECT
  USING (auth.jwt() ->> 'org_id' = week_off_policy.org_id::text);

DROP TRIGGER IF EXISTS week_off_policy_set_updated_at ON public.week_off_policy;
CREATE TRIGGER week_off_policy_set_updated_at
  BEFORE UPDATE ON public.week_off_policy
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
