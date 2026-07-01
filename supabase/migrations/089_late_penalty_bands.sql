-- 089_late_penalty_bands.sql
-- Graduated salary-deduction bands for the late-punch policy + consequence options.

CREATE TABLE IF NOT EXISTS public.late_penalty_bands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  policy_id uuid NOT NULL REFERENCES public.late_policies(id) ON DELETE CASCADE,
  min_late_days integer NOT NULL CHECK (min_late_days >= 1 AND min_late_days <= 31),
  max_late_days integer NULL CHECK (max_late_days IS NULL OR (max_late_days >= min_late_days AND max_late_days <= 31)),
  deduction_days numeric(4,2) NOT NULL CHECK (deduction_days >= 0 AND deduction_days <= 31),
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_late_penalty_bands_policy
  ON public.late_penalty_bands (org_id, policy_id, sort);

ALTER TABLE public.late_penalty_bands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_late_penalty_bands_org ON public.late_penalty_bands;
CREATE POLICY p_late_penalty_bands_org ON public.late_penalty_bands
  FOR ALL TO authenticated
  USING (org_id::text = auth.jwt() ->> 'org_id')
  WITH CHECK (org_id::text = auth.jwt() ->> 'org_id');

-- Extend the consequence CHECK from ('block_bonus') to include salary deduction.
ALTER TABLE public.late_policies DROP CONSTRAINT IF EXISTS late_policies_consequence_check;
ALTER TABLE public.late_policies
  ADD CONSTRAINT late_policies_consequence_check
  CHECK (consequence IN ('block_bonus','salary_deduction','both','none'));
