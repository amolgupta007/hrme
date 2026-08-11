-- 104_account_deletion_requests.sql
-- Mobile Phase D Slice 3, Stage C: account-deletion REQUEST flow.
-- JambaHR is B2B — "Delete my account" on mobile does NOT hard-delete the
-- employees/attendance/payroll history. It records a request + notifies the
-- org's owners/admins, who offboard via the existing terminate flow. This
-- satisfies Apple's App Store account-deletion requirement without data loss.
-- Spec: docs/superpowers/plans/2026-08-11-mobile-phase-d-slice3.md (Stage C)
-- Decision: Amol 2026-08-11 — option (a) request-deletion → notify admin.
-- Idempotent.

CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'handled', 'cancelled')),
  note TEXT NULL,
  handled_by UUID NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  handled_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS account_deletion_requests_org_idx
  ON public.account_deletion_requests (org_id);

-- One OPEN request per person (dedupe): a second "Delete my account" tap while
-- a request is still pending is an idempotent no-op, not a duplicate row.
CREATE UNIQUE INDEX IF NOT EXISTS uq_account_deletion_requests_pending
  ON public.account_deletion_requests (employee_id)
  WHERE status = 'pending';

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

-- RLS is advisory (service-role bypasses it per CLAUDE.md gotcha #5); the BFF
-- enforces self-only insert + org scope in the route handler.
DROP POLICY IF EXISTS account_deletion_requests_admin_all ON public.account_deletion_requests;
CREATE POLICY account_deletion_requests_admin_all ON public.account_deletion_requests FOR ALL
  USING (
    auth.jwt() ->> 'org_id' = account_deletion_requests.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  )
  WITH CHECK (
    auth.jwt() ->> 'org_id' = account_deletion_requests.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  );

-- Any org member may read their org's rows (an employee sees their own request
-- status; the app's pending-state banner reads this).
DROP POLICY IF EXISTS account_deletion_requests_org_read ON public.account_deletion_requests;
CREATE POLICY account_deletion_requests_org_read ON public.account_deletion_requests FOR SELECT
  USING (auth.jwt() ->> 'org_id' = account_deletion_requests.org_id::text);
