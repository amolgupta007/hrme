-- 056_jambageo_geo_consents.sql
-- JambaGeo Phase 1: DPDP consent ledger (mobile writes Phase 2)

CREATE TABLE IF NOT EXISTS public.geo_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  granted_at timestamptz NULL,
  revoked_at timestamptz NULL,
  retention_days integer NOT NULL DEFAULT 90
    CHECK (retention_days BETWEEN 1 AND 365),
  app_version text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_geo_consents_active_unique
  ON public.geo_consents (org_id, employee_id)
  WHERE revoked_at IS NULL;

DROP TRIGGER IF EXISTS trg_geo_consents_updated_at ON public.geo_consents;
CREATE TRIGGER trg_geo_consents_updated_at
  BEFORE UPDATE ON public.geo_consents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
