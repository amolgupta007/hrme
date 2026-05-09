-- 010_candidate_referrals.sql
-- Employee referral programme. Employees submit candidates against open jobs;
-- candidate gets a tokenised apply link; admins see the full inbox; employees
-- see only their own submissions with COARSE status (mapping lives in
-- src/lib/referrals/status.ts — the DB stores fine-grained status only).
--
-- RLS: defense-in-depth (service-role still bypasses today, per CLAUDE.md #5).
-- Run via Supabase Dashboard SQL Editor.

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS candidate_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,

  referrer_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  referrer_clerk_user_id TEXT NOT NULL,

  candidate_name TEXT NOT NULL,
  candidate_email TEXT NOT NULL,
  candidate_phone TEXT,
  resume_url TEXT,
  linkedin_url TEXT,
  note_to_recruiter TEXT,

  tracking_token TEXT NOT NULL UNIQUE,

  status TEXT NOT NULL DEFAULT 'pending_apply'
    CHECK (status IN ('pending_apply','applied','in_review','interview','offer','hired','rejected','withdrawn')),

  application_id UUID REFERENCES applications(id) ON DELETE SET NULL,

  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 2. Indexes
-- ---------------------------------------------------------------------------

-- "My referrals" listing (per-referrer, newest first)
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_created
  ON candidate_referrals (org_id, referrer_employee_id, created_at DESC);

-- Admin inbox (per-org, by status, newest first)
CREATE INDEX IF NOT EXISTS idx_referrals_org_status
  ON candidate_referrals (org_id, status, created_at DESC);

-- Backref from application to referral (for "is this a referred candidate?" lookups)
CREATE INDEX IF NOT EXISTS idx_referrals_application
  ON candidate_referrals (application_id) WHERE application_id IS NOT NULL;

-- Block duplicate ACTIVE referrals for the same candidate on the same job.
-- Once status moves to rejected/withdrawn, a fresh referral is allowed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_referrals_unique_active
  ON candidate_referrals (org_id, job_id, lower(candidate_email))
  WHERE status NOT IN ('rejected', 'withdrawn');

-- ---------------------------------------------------------------------------
-- 3. updated_at trigger (function created in 001_initial_schema.sql)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_referrals_updated ON candidate_referrals;
CREATE TRIGGER trg_referrals_updated
  BEFORE UPDATE ON candidate_referrals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 4. RLS — defense-in-depth (service-role bypasses today)
-- ---------------------------------------------------------------------------
ALTER TABLE candidate_referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS referrals_admin_all ON candidate_referrals;
DROP POLICY IF EXISTS referrals_referrer_select ON candidate_referrals;
DROP POLICY IF EXISTS referrals_referrer_insert ON candidate_referrals;

-- Admins / owners: full CRUD within their org
CREATE POLICY referrals_admin_all ON candidate_referrals
  FOR ALL
  USING (
    auth.jwt() ->> 'org_id' = candidate_referrals.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  )
  WITH CHECK (
    auth.jwt() ->> 'org_id' = candidate_referrals.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  );

-- Employees: read ONLY their own referrals
CREATE POLICY referrals_referrer_select ON candidate_referrals
  FOR SELECT
  USING (
    auth.jwt() ->> 'sub' = candidate_referrals.referrer_clerk_user_id
  );

-- Employees: insert ONLY rows where they are the referrer
CREATE POLICY referrals_referrer_insert ON candidate_referrals
  FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'sub' = candidate_referrals.referrer_clerk_user_id
    AND auth.jwt() ->> 'org_id' = candidate_referrals.org_id::text
  );

-- Note: tokenised public access via /apply/r/[token] runs as service-role from the
-- server action (getReferralByToken). RLS does not need a public-read carve-out.

-- ---------------------------------------------------------------------------
-- 5. Verification (run after the migration to sanity-check)
-- ---------------------------------------------------------------------------
-- SELECT schemaname, tablename, policyname, cmd
--   FROM pg_policies
--  WHERE tablename = 'candidate_referrals'
--  ORDER BY policyname;
