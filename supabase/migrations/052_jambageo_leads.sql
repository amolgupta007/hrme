-- 052_jambageo_leads.sql
-- JambaGeo Phase 1: lead entity (lightweight CRM)

CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact_phone text NULL,
  contact_email text NULL,
  company text NULL,
  lat numeric(9,6) NULL CHECK (lat IS NULL OR (lat BETWEEN -90 AND 90)),
  lng numeric(9,6) NULL CHECK (lng IS NULL OR (lng BETWEEN -180 AND 180)),
  address text NULL,
  assigned_to uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  stage text NOT NULL DEFAULT 'new'
    CHECK (stage IN ('new','contacted','visited','negotiation','converted','lost')),
  value_inr numeric(12,2) NULL CHECK (value_inr IS NULL OR value_inr >= 0),
  source text NULL,
  created_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_org_stage ON public.leads (org_id, stage);
CREATE INDEX IF NOT EXISTS idx_leads_org_assigned ON public.leads (org_id, assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_org_updated ON public.leads (org_id, updated_at DESC);

DROP TRIGGER IF EXISTS trg_leads_updated_at ON public.leads;
CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
