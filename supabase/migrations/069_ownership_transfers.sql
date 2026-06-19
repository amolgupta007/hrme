-- 069: Ownership transfers. One pending transfer per org at a time.
CREATE TABLE IF NOT EXISTS ownership_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  from_employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  to_employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  to_email text,
  to_phone text,
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','cancelled','expired')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  created_placeholder boolean NOT NULL DEFAULT false,
  CONSTRAINT ownership_transfers_target_present CHECK (to_email IS NOT NULL OR to_phone IS NOT NULL)
);

ALTER TABLE ownership_transfers ADD COLUMN IF NOT EXISTS created_placeholder boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ownership_transfers_one_pending
  ON ownership_transfers (org_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_ownership_transfers_token ON ownership_transfers (token);

ALTER TABLE ownership_transfers ENABLE ROW LEVEL SECURITY;
-- Advisory RLS (service-role bypasses by design — gotcha #5); Clerk-JWT pattern.
DROP POLICY IF EXISTS ownership_transfers_admin ON ownership_transfers;
CREATE POLICY ownership_transfers_admin ON ownership_transfers
  FOR ALL TO authenticated
  USING (org_id::text = (auth.jwt() ->> 'org_id'))
  WITH CHECK (org_id::text = (auth.jwt() ->> 'org_id'));
