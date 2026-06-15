-- 061_late_policies.sql — Late-punch policy + targeting (idempotent)
CREATE TABLE IF NOT EXISTS public.late_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  name text NOT NULL DEFAULT 'Late Policy',
  threshold_days integer NOT NULL DEFAULT 3 CHECK (threshold_days >= 1 AND threshold_days <= 31),
  period text NOT NULL DEFAULT 'calendar_month' CHECK (period IN ('calendar_month')),
  late_definition text NOT NULL DEFAULT 'shift_grace' CHECK (late_definition IN ('shift_grace')),
  fallback_cutoff_time time NULL,
  notify_on_late boolean NOT NULL DEFAULT true,
  notify_on_threshold boolean NOT NULL DEFAULT true,
  warn_at integer NULL CHECK (warn_at IS NULL OR (warn_at >= 1 AND warn_at <= 31)),
  channel_whatsapp boolean NOT NULL DEFAULT false,
  channel_email boolean NOT NULL DEFAULT true,
  consequence text NOT NULL DEFAULT 'block_bonus' CHECK (consequence IN ('block_bonus')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_late_policies_org ON public.late_policies (org_id);

CREATE TABLE IF NOT EXISTS public.late_policy_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  policy_id uuid NOT NULL REFERENCES public.late_policies(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('department','employee')),
  target_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_late_policy_targets_unique
  ON public.late_policy_targets (policy_id, target_type, target_id);

ALTER TABLE public.late_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.late_policy_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_late_policies_org ON public.late_policies;
CREATE POLICY p_late_policies_org ON public.late_policies FOR ALL
  USING (org_id::text = (auth.jwt() ->> 'org_id'))
  WITH CHECK (org_id::text = (auth.jwt() ->> 'org_id'));
DROP POLICY IF EXISTS p_late_policy_targets_org ON public.late_policy_targets;
CREATE POLICY p_late_policy_targets_org ON public.late_policy_targets FOR ALL
  USING (org_id::text = (auth.jwt() ->> 'org_id'))
  WITH CHECK (org_id::text = (auth.jwt() ->> 'org_id'));
