-- 092_guest_and_unresolved_punches.sql
-- Host-org visibility log for cross-org (group) punches + ambiguity review queue.
-- guest_punch_logs is read by NO attendance/payroll/OT code, so a guest punch can
-- never affect the host org's numbers.

CREATE TABLE IF NOT EXISTS public.guest_punch_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,   -- where the device is
  guest_org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,  -- payroll org
  guest_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  device_id uuid NULL REFERENCES public.devices(id) ON DELETE SET NULL,
  location_id uuid NULL REFERENCES public.locations(id) ON DELETE SET NULL,
  punched_at timestamptz NOT NULL,
  punch_event_id uuid NULL REFERENCES public.attendance_punch_events(id) ON DELETE SET NULL,
  pin text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_guest_punch_logs_host
  ON public.guest_punch_logs (host_org_id, punched_at);

CREATE TABLE IF NOT EXISTS public.unresolved_punches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  device_id uuid NULL REFERENCES public.devices(id) ON DELETE SET NULL,
  pin text NOT NULL,
  punched_at timestamptz NOT NULL,
  reason text NOT NULL CHECK (reason IN ('ambiguous_group_pin','no_group_match')),
  candidate_org_ids uuid[] NULL,      -- orgs that matched on ambiguity
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_unresolved_punches_host
  ON public.unresolved_punches (host_org_id, resolved, punched_at);

-- guest_punch_logs: host-org admins may read their own guests (audit).
ALTER TABLE public.guest_punch_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS guest_punch_logs_host_admin ON public.guest_punch_logs;
CREATE POLICY guest_punch_logs_host_admin ON public.guest_punch_logs
  FOR SELECT TO authenticated
  USING (host_org_id::text = auth.jwt() ->> 'org_id'
    AND auth.jwt() ->> 'org_role' IN ('org:owner','org:admin'));

-- unresolved_punches: superadmin/service-role triage only; no authenticated policy.
ALTER TABLE public.unresolved_punches ENABLE ROW LEVEL SECURITY;
