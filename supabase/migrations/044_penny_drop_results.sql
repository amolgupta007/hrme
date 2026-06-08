-- 044_penny_drop_results.sql — Payroll Phase 2: cache penny-drop verification
-- results 30 days per (account_hash). Penny-drop costs ~₹2-3 per check; cache
-- aggressively. Idempotent.

CREATE TABLE IF NOT EXISTS public.penny_drop_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_hash TEXT NOT NULL, -- sha256(ifsc + '|' + account_number)
  fund_account_id TEXT,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL CHECK (status IN ('verified', 'name_mismatch', 'invalid_account', 'unsupported_bank', 'error')),
  registered_holder_name TEXT,
  declared_holder_name TEXT NOT NULL,
  name_match_score NUMERIC(3,2),
  raw_response JSONB,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, account_hash)
);

CREATE INDEX IF NOT EXISTS penny_drop_results_hash_idx
  ON public.penny_drop_results (account_hash);

CREATE INDEX IF NOT EXISTS penny_drop_results_expires_idx
  ON public.penny_drop_results (expires_at);

ALTER TABLE public.penny_drop_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS penny_drop_results_admin_all ON public.penny_drop_results;
CREATE POLICY penny_drop_results_admin_all ON public.penny_drop_results FOR ALL
  USING (
    auth.jwt() ->> 'org_id' = penny_drop_results.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  )
  WITH CHECK (
    auth.jwt() ->> 'org_id' = penny_drop_results.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  );
