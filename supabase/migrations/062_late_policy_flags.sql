-- 062_late_policy_flags.sql — monthly bonus-ineligibility verdict (idempotent)
CREATE TABLE IF NOT EXISTS public.late_policy_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  policy_id uuid NOT NULL REFERENCES public.late_policies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  month text NOT NULL,                       -- YYYY-MM (IST)
  late_days_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'flagged' CHECK (status IN ('flagged','overridden')),
  override_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  override_reason text NULL,
  overridden_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_late_policy_flags_unique
  ON public.late_policy_flags (org_id, employee_id, month);

ALTER TABLE public.late_policy_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_late_policy_flags_org ON public.late_policy_flags;
CREATE POLICY p_late_policy_flags_org ON public.late_policy_flags FOR ALL
  USING (org_id::text = (auth.jwt() ->> 'org_id'))
  WITH CHECK (org_id::text = (auth.jwt() ->> 'org_id'));
