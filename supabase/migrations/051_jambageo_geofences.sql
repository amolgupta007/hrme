-- 051_jambageo_geofences.sql
-- JambaGeo Phase 1: geofence master (admin-defined zones around client sites / office)

CREATE TABLE IF NOT EXISTS public.geofences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('client','office')),
  center_lat numeric(9,6) NOT NULL CHECK (center_lat BETWEEN -90 AND 90),
  center_lng numeric(9,6) NOT NULL CHECK (center_lng BETWEEN -180 AND 180),
  radius_m integer NOT NULL CHECK (radius_m BETWEEN 1 AND 5000),
  is_active boolean NOT NULL DEFAULT true,
  notes text NULL,
  created_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_geofences_org_active ON public.geofences (org_id, is_active);
CREATE INDEX IF NOT EXISTS idx_geofences_org_type ON public.geofences (org_id, type);

DROP TRIGGER IF EXISTS trg_geofences_updated_at ON public.geofences;
CREATE TRIGGER trg_geofences_updated_at
  BEFORE UPDATE ON public.geofences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
