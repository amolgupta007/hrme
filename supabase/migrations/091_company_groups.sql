-- 091_company_groups.sql — JambaHR-level grouping of organizations (superadmin-managed).
-- Grouping is a JambaHR concept on top of existing orgs; no Clerk org changes.

CREATE TABLE IF NOT EXISTS public.company_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by text NULL,               -- superadmin identifier (platform-level, no employees FK)
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.org_group_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.company_groups(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_org_one_group UNIQUE (org_id)  -- an org is in at most one group (v1)
);
CREATE INDEX IF NOT EXISTS idx_org_group_memberships_group
  ON public.org_group_memberships (group_id);

-- Platform-level wiring: written only via the service-role superadmin path.
-- RLS on with no authenticated policy => no tenant JWT can read/write group wiring
-- directly; service-role bypasses RLS by design (gotcha #5).
ALTER TABLE public.company_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_group_memberships ENABLE ROW LEVEL SECURITY;
