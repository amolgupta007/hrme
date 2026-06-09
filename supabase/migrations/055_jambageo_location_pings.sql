-- 055_jambageo_location_pings.sql
-- JambaGeo Phase 1: GPS pings (mobile writes Phase 2; retention sweep ready)

CREATE TABLE IF NOT EXISTS public.location_pings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.duty_sessions(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lat numeric(9,6) NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng numeric(9,6) NOT NULL CHECK (lng BETWEEN -180 AND 180),
  accuracy_m numeric(7,2) NULL CHECK (accuracy_m IS NULL OR accuracy_m >= 0),
  battery_pct integer NULL CHECK (battery_pct IS NULL OR (battery_pct BETWEEN 0 AND 100)),
  captured_at timestamptz NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_location_pings_session_time
  ON public.location_pings (session_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_location_pings_org_captured
  ON public.location_pings (org_id, captured_at);
