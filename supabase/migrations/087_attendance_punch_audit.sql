-- 087_attendance_punch_audit.sql
-- Who/when/why for every punch mutation (manual add, approve, reject, void, dedupe, edit).

CREATE TABLE IF NOT EXISTS public.attendance_punch_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  punch_event_id uuid NULL REFERENCES public.attendance_punch_events(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('manual_add','approve','reject','void','dedupe','edit')),
  actor_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  actor_role text NULL,
  reason text NULL,
  metadata jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_punch_audit_event
  ON public.attendance_punch_audit (org_id, punch_event_id);

ALTER TABLE public.attendance_punch_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS punch_audit_admin_all ON public.attendance_punch_audit;
CREATE POLICY punch_audit_admin_all ON public.attendance_punch_audit
  FOR ALL TO authenticated
  USING (org_id::text = auth.jwt() ->> 'org_id'
    AND auth.jwt() ->> 'org_role' IN ('org:owner','org:admin'))
  WITH CHECK (org_id::text = auth.jwt() ->> 'org_id'
    AND auth.jwt() ->> 'org_role' IN ('org:owner','org:admin'));
