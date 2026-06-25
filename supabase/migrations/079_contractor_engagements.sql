-- 079_contractor_engagements.sql
-- Contractor-specific engagement data. One active engagement per contractor employee.
-- The worker still lives in `employees` with employment_type='contract'; this row holds
-- the rate + contract + TDS-classification metadata that salaried employees don't have.

CREATE TABLE IF NOT EXISTS public.contractor_engagements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  rate_type       TEXT NOT NULL CHECK (rate_type IN ('hourly','daily','monthly','milestone')),
  rate_amount     NUMERIC NOT NULL CHECK (rate_amount >= 0),
  tds_section     TEXT NOT NULL CHECK (tds_section IN ('194J','194C')),
  payee_type      TEXT NOT NULL DEFAULT 'individual_huf' CHECK (payee_type IN ('individual_huf','other')),
  has_pan         BOOLEAN NOT NULL DEFAULT TRUE,
  contract_start  DATE,
  contract_end    DATE,
  renewal_date    DATE,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One active engagement per (org, employee).
CREATE UNIQUE INDEX IF NOT EXISTS contractor_engagements_one_active
  ON public.contractor_engagements (org_id, employee_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS contractor_engagements_org_idx
  ON public.contractor_engagements (org_id, status);

ALTER TABLE public.contractor_engagements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contractor_engagements_admin_all ON public.contractor_engagements;
CREATE POLICY contractor_engagements_admin_all ON public.contractor_engagements FOR ALL
  USING (auth.jwt() ->> 'org_id' = contractor_engagements.org_id::text AND auth.jwt() ->> 'org_role' IN ('org:owner','org:admin'))
  WITH CHECK (auth.jwt() ->> 'org_id' = contractor_engagements.org_id::text AND auth.jwt() ->> 'org_role' IN ('org:owner','org:admin'));

DROP POLICY IF EXISTS contractor_engagements_self_read ON public.contractor_engagements;
CREATE POLICY contractor_engagements_self_read ON public.contractor_engagements FOR SELECT
  USING (auth.jwt() ->> 'org_id' = contractor_engagements.org_id::text AND auth.jwt() ->> 'employee_id' = contractor_engagements.employee_id::text);

DROP TRIGGER IF EXISTS contractor_engagements_set_updated_at ON public.contractor_engagements;
CREATE TRIGGER contractor_engagements_set_updated_at BEFORE UPDATE ON public.contractor_engagements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
