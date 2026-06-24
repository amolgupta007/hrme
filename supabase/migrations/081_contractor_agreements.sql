-- 081_contractor_agreements.sql
-- Contractor agreements / NDA / IP-assignment documents, e-signed via a public token link.
-- One row per issued document; re-issuing supersedes the prior 'sent' row and bumps version.

CREATE TABLE IF NOT EXISTS public.contractor_agreements (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                    UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contractor_engagement_id  UUID NOT NULL REFERENCES public.contractor_engagements(id) ON DELETE CASCADE,
  agreement_type            TEXT NOT NULL CHECK (agreement_type IN ('service','nda','ip_assignment')),
  ip_ownership              TEXT NOT NULL DEFAULT 'na' CHECK (ip_ownership IN ('work_for_hire','licensed','na')),
  title                     TEXT NOT NULL,
  body_text                 TEXT NOT NULL,
  version                   INTEGER NOT NULL DEFAULT 1,
  agreement_token           TEXT NOT NULL UNIQUE,
  status                    TEXT NOT NULL DEFAULT 'sent'
                              CHECK (status IN ('sent','signed','declined','expired','superseded')),
  sent_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  signed_at                 TIMESTAMPTZ,
  signed_by_name            TEXT,
  ip_address                TEXT,
  user_agent                TEXT,
  expires_at                TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contractor_agreements_engagement_idx
  ON public.contractor_agreements (contractor_engagement_id, agreement_type, created_at DESC);
CREATE INDEX IF NOT EXISTS contractor_agreements_org_idx
  ON public.contractor_agreements (org_id, status);

ALTER TABLE public.contractor_agreements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contractor_agreements_admin_all ON public.contractor_agreements;
CREATE POLICY contractor_agreements_admin_all ON public.contractor_agreements FOR ALL
  USING (auth.jwt() ->> 'org_id' = contractor_agreements.org_id::text AND auth.jwt() ->> 'org_role' IN ('org:owner','org:admin'))
  WITH CHECK (auth.jwt() ->> 'org_id' = contractor_agreements.org_id::text AND auth.jwt() ->> 'org_role' IN ('org:owner','org:admin'));

DROP TRIGGER IF EXISTS contractor_agreements_set_updated_at ON public.contractor_agreements;
CREATE TRIGGER contractor_agreements_set_updated_at BEFORE UPDATE ON public.contractor_agreements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
