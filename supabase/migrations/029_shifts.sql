-- 029_shifts.sql — Attendance Phase 1: Shift master
-- Idempotent. Apply via Supabase MCP / SQL Editor.

CREATE TABLE IF NOT EXISTS public.shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  total_hours NUMERIC(4,2) NOT NULL,
  break_minutes INTEGER NOT NULL DEFAULT 0,
  grace_minutes INTEGER NOT NULL DEFAULT 0,
  half_day_threshold_minutes INTEGER NOT NULL DEFAULT 240,
  is_overnight BOOLEAN NOT NULL DEFAULT FALSE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  ot_eligible BOOLEAN NOT NULL DEFAULT TRUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- At most one default per org (Phase 1 invariant).
CREATE UNIQUE INDEX IF NOT EXISTS shifts_one_default_per_org
  ON public.shifts (org_id)
  WHERE is_default;

CREATE INDEX IF NOT EXISTS shifts_org_active_idx
  ON public.shifts (org_id, active);

-- Org-uniqueness: shift name unique within an org (case-insensitive) so the
-- picker can't show two "Morning" entries.
CREATE UNIQUE INDEX IF NOT EXISTS shifts_org_name_unique
  ON public.shifts (org_id, lower(name));

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

-- Admin policy follows the codebase pattern (009_jambahire_rls.sql,
-- 018_payroll_schema_capture.sql). Service-role bypasses RLS today
-- (CLAUDE.md gotcha #5); this activates when Clerk-JWT-to-Supabase is wired.
DROP POLICY IF EXISTS shifts_admin_all ON public.shifts;
CREATE POLICY shifts_admin_all ON public.shifts FOR ALL
  USING (
    auth.jwt() ->> 'org_id' = shifts.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  )
  WITH CHECK (
    auth.jwt() ->> 'org_id' = shifts.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  );

-- Reuse the shared updated_at trigger function (created in migration 001).
DROP TRIGGER IF EXISTS shifts_set_updated_at ON public.shifts;
CREATE TRIGGER shifts_set_updated_at
  BEFORE UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
