CREATE TABLE IF NOT EXISTS public.disbursement_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES public.disbursement_batches(id) ON DELETE SET NULL,
  item_id UUID REFERENCES public.disbursement_items(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  actor_role TEXT,
  action TEXT NOT NULL CHECK (action IN (
    'initiate', 'approve', 'cancel', 'retry', 'webhook_status_change',
    'preflight_run', 'wallet_check', 'bank_account_read'
  )),
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS disbursement_audit_log_batch_idx ON public.disbursement_audit_log (batch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS disbursement_audit_log_org_idx ON public.disbursement_audit_log (org_id, created_at DESC);

ALTER TABLE public.disbursement_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS disbursement_audit_log_admin_read ON public.disbursement_audit_log;
CREATE POLICY disbursement_audit_log_admin_read ON public.disbursement_audit_log FOR SELECT
  USING (auth.jwt() ->> 'org_id' = disbursement_audit_log.org_id::text AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin'));
