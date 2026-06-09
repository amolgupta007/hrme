-- 053_jambageo_lead_visits.sql
-- JambaGeo Phase 1: visit log (manual web entries Phase 1; mobile writes Phase 2)

CREATE TABLE IF NOT EXISTS public.lead_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  session_id uuid NULL,  -- FK added in 054 once duty_sessions exists
  lat numeric(9,6) NULL CHECK (lat IS NULL OR (lat BETWEEN -90 AND 90)),
  lng numeric(9,6) NULL CHECK (lng IS NULL OR (lng BETWEEN -180 AND 180)),
  notes text NULL,
  outcome text NOT NULL
    CHECK (outcome IN ('in_progress','converted','pending','follow_up','lost')),
  follow_up_date date NULL,
  photo_url text NULL,  -- Phase 2
  source text NOT NULL DEFAULT 'web' CHECK (source IN ('web','mobile')),
  system boolean NOT NULL DEFAULT false,  -- true = kanban-drag stage-transition row (immutable)
  visited_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_visits_lead_time ON public.lead_visits (lead_id, visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_visits_org_time ON public.lead_visits (org_id, visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_visits_followup
  ON public.lead_visits (org_id, follow_up_date) WHERE follow_up_date IS NOT NULL;
