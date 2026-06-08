CREATE TABLE IF NOT EXISTS public.disbursement_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  payroll_run_id UUID NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'preflight' CHECK (status IN (
    'preflight', 'awaiting_approval', 'approved', 'processing', 'completed', 'partial_failed', 'cancelled'
  )),
  total_amount INTEGER NOT NULL,
  total_fees_paise INTEGER NOT NULL DEFAULT 0,
  override_wallet_shortfall BOOLEAN NOT NULL DEFAULT FALSE,
  idempotency_key TEXT NOT NULL UNIQUE,
  maker_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  initiated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checker_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_reason TEXT,
  razorpayx_batch_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS disbursement_batches_run_idx ON public.disbursement_batches (payroll_run_id);
CREATE INDEX IF NOT EXISTS disbursement_batches_status_idx ON public.disbursement_batches (org_id, status);

ALTER TABLE public.disbursement_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS disbursement_batches_admin_all ON public.disbursement_batches;
CREATE POLICY disbursement_batches_admin_all ON public.disbursement_batches FOR ALL
  USING (auth.jwt() ->> 'org_id' = disbursement_batches.org_id::text AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin'))
  WITH CHECK (auth.jwt() ->> 'org_id' = disbursement_batches.org_id::text AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin'));

DROP TRIGGER IF EXISTS disbursement_batches_set_updated_at ON public.disbursement_batches;
CREATE TRIGGER disbursement_batches_set_updated_at BEFORE UPDATE ON public.disbursement_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
