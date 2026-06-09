-- 054_jambageo_duty_sessions.sql
-- JambaGeo Phase 1: duty session shell (mobile writes Phase 2)

CREATE TABLE IF NOT EXISTS public.duty_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  shift_id uuid NULL REFERENCES public.shifts(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','ended','auto_ended')),
  last_ping_at timestamptz NULL,
  last_lat numeric(9,6) NULL CHECK (last_lat IS NULL OR (last_lat BETWEEN -90 AND 90)),
  last_lng numeric(9,6) NULL CHECK (last_lng IS NULL OR (last_lng BETWEEN -180 AND 180)),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_duty_sessions_org_active
  ON public.duty_sessions (org_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_duty_sessions_employee_time
  ON public.duty_sessions (employee_id, started_at DESC);

-- Add deferred FK on lead_visits.session_id now that duty_sessions exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lead_visits_session_id_fkey'
  ) THEN
    ALTER TABLE public.lead_visits
      ADD CONSTRAINT lead_visits_session_id_fkey
      FOREIGN KEY (session_id) REFERENCES public.duty_sessions(id) ON DELETE SET NULL;
  END IF;
END $$;
