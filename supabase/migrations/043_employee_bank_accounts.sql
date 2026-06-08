-- 043_employee_bank_accounts.sql — Payroll PRD 02 Phase 2: per-employee bank
-- account for disbursement. Account number + IFSC encrypted at rest;
-- account_number_hash is a non-reversible dedupe key.
-- Idempotent.

CREATE TABLE IF NOT EXISTS public.employee_bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL UNIQUE REFERENCES public.employees(id) ON DELETE CASCADE,
  holder_name TEXT NOT NULL,
  account_number_encrypted TEXT NOT NULL,
  account_number_last4 TEXT NOT NULL CHECK (char_length(account_number_last4) = 4),
  account_number_hash TEXT NOT NULL, -- sha256(ifsc + '|' + account_number) for dedupe + cache key
  ifsc_encrypted TEXT NOT NULL,
  ifsc_first4 TEXT NOT NULL CHECK (char_length(ifsc_first4) = 4), -- bank code, e.g. FDRL — safe to expose
  account_type TEXT NOT NULL DEFAULT 'savings' CHECK (account_type IN ('savings', 'current')),
  -- RazorpayX-side identifiers (populated by syncBeneficiary)
  razorpayx_contact_id TEXT,
  razorpayx_fund_account_id TEXT,
  beneficiary_sync_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (beneficiary_sync_status IN ('pending', 'synced', 'failed')),
  beneficiary_sync_error TEXT,
  beneficiary_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employee_bank_accounts_org_idx
  ON public.employee_bank_accounts (org_id);

CREATE INDEX IF NOT EXISTS employee_bank_accounts_hash_idx
  ON public.employee_bank_accounts (account_number_hash);

ALTER TABLE public.employee_bank_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_bank_accounts_admin_all ON public.employee_bank_accounts;
CREATE POLICY employee_bank_accounts_admin_all ON public.employee_bank_accounts FOR ALL
  USING (
    auth.jwt() ->> 'org_id' = employee_bank_accounts.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  )
  WITH CHECK (
    auth.jwt() ->> 'org_id' = employee_bank_accounts.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  );

DROP POLICY IF EXISTS employee_bank_accounts_self_all ON public.employee_bank_accounts;
CREATE POLICY employee_bank_accounts_self_all ON public.employee_bank_accounts FOR ALL
  USING (
    auth.jwt() ->> 'org_id' = employee_bank_accounts.org_id::text
    AND auth.jwt() ->> 'employee_id' = employee_bank_accounts.employee_id::text
  )
  WITH CHECK (
    auth.jwt() ->> 'org_id' = employee_bank_accounts.org_id::text
    AND auth.jwt() ->> 'employee_id' = employee_bank_accounts.employee_id::text
  );

DROP TRIGGER IF EXISTS employee_bank_accounts_set_updated_at ON public.employee_bank_accounts;
CREATE TRIGGER employee_bank_accounts_set_updated_at
  BEFORE UPDATE ON public.employee_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
