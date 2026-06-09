-- 057_jambageo_rls.sql
-- JambaGeo Phase 1: RLS policies (service-role bypass per gotcha #5; advisory until Clerk-JWT wired)

ALTER TABLE public.geofences        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_visits      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duty_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_pings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_consents     ENABLE ROW LEVEL SECURITY;

-- geofences: read all org; write admin/owner only
DROP POLICY IF EXISTS p_geofences_read ON public.geofences;
CREATE POLICY p_geofences_read ON public.geofences FOR SELECT
  USING (org_id::text = auth.jwt() ->> 'org_id');

DROP POLICY IF EXISTS p_geofences_write ON public.geofences;
CREATE POLICY p_geofences_write ON public.geofences FOR ALL
  USING (
    org_id::text = auth.jwt() ->> 'org_id'
    AND (auth.jwt() ->> 'org_role') IN ('org:owner','org:admin')
  )
  WITH CHECK (
    org_id::text = auth.jwt() ->> 'org_id'
    AND (auth.jwt() ->> 'org_role') IN ('org:owner','org:admin')
  );

-- TODO (Clerk-JWT activation): replace the broad org-scoped policies below with finer per-role scope:
--   leads: admin ALL + manager-dept-scoped SELECT/INSERT/UPDATE + employee own-assigned SELECT/UPDATE(stage only)
--   lead_visits: follows parent lead scope
--   duty_sessions: admin ALL + manager dept-scoped SELECT + employee own SELECT
--   location_pings: admin/manager SELECT only (no direct employee access)
--   geo_consents: admin ALL + employee own SELECT
-- Until then, service-role bypass (gotcha #5) means these policies are advisory.

-- leads / lead_visits / duty_sessions / location_pings / geo_consents: org-scoped (further refined in app code via getManagerScopedEmployeeIds)
DROP POLICY IF EXISTS p_leads_org ON public.leads;
CREATE POLICY p_leads_org ON public.leads FOR ALL
  USING (org_id::text = auth.jwt() ->> 'org_id')
  WITH CHECK (org_id::text = auth.jwt() ->> 'org_id');

DROP POLICY IF EXISTS p_lead_visits_org ON public.lead_visits;
CREATE POLICY p_lead_visits_org ON public.lead_visits FOR ALL
  USING (org_id::text = auth.jwt() ->> 'org_id')
  WITH CHECK (org_id::text = auth.jwt() ->> 'org_id');

DROP POLICY IF EXISTS p_duty_sessions_org ON public.duty_sessions;
CREATE POLICY p_duty_sessions_org ON public.duty_sessions FOR ALL
  USING (org_id::text = auth.jwt() ->> 'org_id')
  WITH CHECK (org_id::text = auth.jwt() ->> 'org_id');

DROP POLICY IF EXISTS p_location_pings_org ON public.location_pings;
CREATE POLICY p_location_pings_org ON public.location_pings FOR ALL
  USING (org_id::text = auth.jwt() ->> 'org_id')
  WITH CHECK (org_id::text = auth.jwt() ->> 'org_id');

DROP POLICY IF EXISTS p_geo_consents_org ON public.geo_consents;
CREATE POLICY p_geo_consents_org ON public.geo_consents FOR ALL
  USING (org_id::text = auth.jwt() ->> 'org_id')
  WITH CHECK (org_id::text = auth.jwt() ->> 'org_id');
