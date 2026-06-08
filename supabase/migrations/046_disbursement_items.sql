CREATE TABLE IF NOT EXISTS public.disbursement_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.disbursement_batches(id) ON DELETE CASCADE,
  payroll_entry_id UUID NOT NULL REFERENCES public.payroll_entries(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  fund_account_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  fee_paise INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'queued', 'processing', 'paid', 'failed', 'cancelled', 'reversed'
  )),
  razorpayx_payout_id TEXT,
  failure_reason TEXT,
  retry_count SMALLINT NOT NULL DEFAULT 0,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (batch_id, payroll_entry_id)
);

CREATE INDEX IF NOT EXISTS disbursement_items_batch_idx ON public.disbursement_items (batch_id);
CREATE INDEX IF NOT EXISTS disbursement_items_razorpayx_payout_idx ON public.disbursement_items (razorpayx_payout_id);
CREATE INDEX IF NOT EXISTS disbursement_items_status_idx ON public.disbursement_items (org_id, status);

ALTER TABLE public.disbursement_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS disbursement_items_admin_all ON public.disbursement_items;
CREATE POLICY disbursement_items_admin_all ON public.disbursement_items FOR ALL
  USING (auth.jwt() ->> 'org_id' = disbursement_items.org_id::text AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin'))
  WITH CHECK (auth.jwt() ->> 'org_id' = disbursement_items.org_id::text AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin'));

DROP POLICY IF EXISTS disbursement_items_self_read ON public.disbursement_items;
CREATE POLICY disbursement_items_self_read ON public.disbursement_items FOR SELECT
  USING (auth.jwt() ->> 'org_id' = disbursement_items.org_id::text AND auth.jwt() ->> 'employee_id' = disbursement_items.employee_id::text);

DROP TRIGGER IF EXISTS disbursement_items_set_updated_at ON public.disbursement_items;
CREATE TRIGGER disbursement_items_set_updated_at BEFORE UPDATE ON public.disbursement_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
