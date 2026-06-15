-- 063_late_punch_notifications.sql — idempotent delivery log (idempotent)
CREATE TABLE IF NOT EXISTS public.late_punch_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  attendance_record_id uuid NOT NULL REFERENCES public.attendance_records(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('late','threshold','warn')),
  channel text NOT NULL CHECK (channel IN ('whatsapp','email')),
  status text NOT NULL CHECK (status IN ('sent','failed','skipped')),
  provider text NULL,
  provider_message_id text NULL,
  error text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_late_punch_notifications_unique
  ON public.late_punch_notifications (attendance_record_id, kind, channel);

ALTER TABLE public.late_punch_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_late_punch_notifications_org ON public.late_punch_notifications;
CREATE POLICY p_late_punch_notifications_org ON public.late_punch_notifications FOR ALL
  USING (org_id::text = (auth.jwt() ->> 'org_id'))
  WITH CHECK (org_id::text = (auth.jwt() ->> 'org_id'));
