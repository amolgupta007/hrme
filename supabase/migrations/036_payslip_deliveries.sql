-- 036_payslip_deliveries.sql — Payroll PRD 02 Phase 1: Track per-employee
-- payslip email send status (sent / failed / queued). One row per (entry, channel).
-- Idempotent.

CREATE TABLE IF NOT EXISTS public.payslip_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  payroll_entry_id UUID NOT NULL REFERENCES public.payroll_entries(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'sent', 'failed')),
  sent_at TIMESTAMPTZ,
  error TEXT,
  resend_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (payroll_entry_id, channel)
);

CREATE INDEX IF NOT EXISTS payslip_deliveries_entry_idx
  ON public.payslip_deliveries (payroll_entry_id);

CREATE INDEX IF NOT EXISTS payslip_deliveries_org_status_idx
  ON public.payslip_deliveries (org_id, status);

ALTER TABLE public.payslip_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payslip_deliveries_admin_all ON public.payslip_deliveries;
CREATE POLICY payslip_deliveries_admin_all ON public.payslip_deliveries FOR ALL
  USING (
    auth.jwt() ->> 'org_id' = payslip_deliveries.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  )
  WITH CHECK (
    auth.jwt() ->> 'org_id' = payslip_deliveries.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  );

DROP POLICY IF EXISTS payslip_deliveries_self_read ON public.payslip_deliveries;
CREATE POLICY payslip_deliveries_self_read ON public.payslip_deliveries FOR SELECT
  USING (
    auth.jwt() ->> 'org_id' = payslip_deliveries.org_id::text
    AND EXISTS (
      SELECT 1 FROM public.payroll_entries pe
       WHERE pe.id = payslip_deliveries.payroll_entry_id
         AND auth.jwt() ->> 'employee_id' = pe.employee_id::text
    )
  );
