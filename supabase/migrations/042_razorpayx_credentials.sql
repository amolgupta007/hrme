-- 042_razorpayx_credentials.sql — Payroll PRD 02 Phase 2: per-org RazorpayX
-- credentials. API secret + webhook secret encrypted at rest.
-- account_id is RazorpayX's merchant identifier — used by the webhook handler
-- to look up the org from incoming events.
-- Idempotent.

CREATE TABLE IF NOT EXISTS public.razorpayx_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  key_id TEXT NOT NULL,
  key_secret_encrypted TEXT NOT NULL,
  webhook_secret_encrypted TEXT NOT NULL,
  account_id TEXT NOT NULL,
  account_number TEXT NOT NULL,
  is_test_mode BOOLEAN NOT NULL DEFAULT TRUE,
  single_person_approval_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  connected_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_test_at TIMESTAMPTZ,
  last_test_ok BOOLEAN,
  last_test_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS razorpayx_credentials_account_id_idx
  ON public.razorpayx_credentials (account_id);

ALTER TABLE public.razorpayx_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS razorpayx_credentials_admin_all ON public.razorpayx_credentials;
CREATE POLICY razorpayx_credentials_admin_all ON public.razorpayx_credentials FOR ALL
  USING (
    auth.jwt() ->> 'org_id' = razorpayx_credentials.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  )
  WITH CHECK (
    auth.jwt() ->> 'org_id' = razorpayx_credentials.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  );

DROP TRIGGER IF EXISTS razorpayx_credentials_set_updated_at ON public.razorpayx_credentials;
CREATE TRIGGER razorpayx_credentials_set_updated_at
  BEFORE UPDATE ON public.razorpayx_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
