-- 009_jambahire_rls.sql
-- Defense-in-depth RLS for JambaHire tables.
--
-- Today the app uses createAdminSupabase() (service role) which bypasses RLS by design
-- (CLAUDE.md gotcha #5: Clerk-JWT-to-Supabase integration is not yet wired). These
-- policies are advisory: they activate the moment the app is migrated to use the
-- anon/authenticated client paths or if the service-role key ever leaks.
--
-- Policy shape:
--   admin/owner of the same org → full CRUD
--   anon → SELECT on jobs.status='active' only (powers the public /careers feed)
--
-- The RLS check looks for these JWT claims (provided when Clerk JWT integration is enabled):
--   auth.jwt() ->> 'org_id'   -- Supabase organizations.id (UUID, NOT clerk_org_id)
--   auth.jwt() ->> 'org_role' -- one of 'org:owner' | 'org:admin' | 'org:manager' | 'org:employee'
--
-- Run via Supabase Dashboard SQL Editor.

-- ---------------------------------------------------------------------------
-- Helper expressions inlined per policy. We don't define functions so the
-- migration stays purely declarative and easy to revoke.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- jobs
-- ===========================================================================
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS jobs_admin_all ON jobs;
DROP POLICY IF EXISTS jobs_public_read_active ON jobs;

CREATE POLICY jobs_admin_all ON jobs
  FOR ALL
  USING (
    auth.jwt() ->> 'org_id' = jobs.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  )
  WITH CHECK (
    auth.jwt() ->> 'org_id' = jobs.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  );

-- Public can read active jobs (powers /careers/[slug])
CREATE POLICY jobs_public_read_active ON jobs
  FOR SELECT
  USING (status = 'active');

-- ===========================================================================
-- candidates
-- ===========================================================================
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS candidates_admin_all ON candidates;

CREATE POLICY candidates_admin_all ON candidates
  FOR ALL
  USING (
    auth.jwt() ->> 'org_id' = candidates.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  )
  WITH CHECK (
    auth.jwt() ->> 'org_id' = candidates.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  );

-- ===========================================================================
-- applications
-- ===========================================================================
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS applications_admin_all ON applications;

CREATE POLICY applications_admin_all ON applications
  FOR ALL
  USING (
    auth.jwt() ->> 'org_id' = applications.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  )
  WITH CHECK (
    auth.jwt() ->> 'org_id' = applications.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  );

-- ===========================================================================
-- interview_schedules
-- ===========================================================================
ALTER TABLE interview_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS interview_schedules_admin_all ON interview_schedules;
DROP POLICY IF EXISTS interview_schedules_interviewer_read ON interview_schedules;

CREATE POLICY interview_schedules_admin_all ON interview_schedules
  FOR ALL
  USING (
    auth.jwt() ->> 'org_id' = interview_schedules.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  )
  WITH CHECK (
    auth.jwt() ->> 'org_id' = interview_schedules.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  );

-- Interviewer can read their own assigned schedules.
-- Activates when the JWT carries an `employee_id` claim (not wired today).
CREATE POLICY interview_schedules_interviewer_read ON interview_schedules
  FOR SELECT
  USING (
    auth.jwt() ->> 'org_id' = interview_schedules.org_id::text
    AND auth.jwt() ->> 'employee_id' = interview_schedules.interviewer_id::text
  );

-- ===========================================================================
-- interview_feedback
-- ===========================================================================
ALTER TABLE interview_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS interview_feedback_admin_all ON interview_feedback;
DROP POLICY IF EXISTS interview_feedback_interviewer_own ON interview_feedback;

CREATE POLICY interview_feedback_admin_all ON interview_feedback
  FOR ALL
  USING (
    auth.jwt() ->> 'org_id' = interview_feedback.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  )
  WITH CHECK (
    auth.jwt() ->> 'org_id' = interview_feedback.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  );

-- Interviewer can read AND insert/update their OWN feedback rows only.
CREATE POLICY interview_feedback_interviewer_own ON interview_feedback
  FOR ALL
  USING (
    auth.jwt() ->> 'org_id' = interview_feedback.org_id::text
    AND auth.jwt() ->> 'employee_id' = interview_feedback.interviewer_id::text
  )
  WITH CHECK (
    auth.jwt() ->> 'org_id' = interview_feedback.org_id::text
    AND auth.jwt() ->> 'employee_id' = interview_feedback.interviewer_id::text
  );

-- ===========================================================================
-- offers
-- ===========================================================================
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS offers_admin_all ON offers;

CREATE POLICY offers_admin_all ON offers
  FOR ALL
  USING (
    auth.jwt() ->> 'org_id' = offers.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  )
  WITH CHECK (
    auth.jwt() ->> 'org_id' = offers.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  );

-- Note: offers token-based public access (/offers/[token]) is currently served
-- via service-role from getOfferByToken. RLS does not need a public-read carve-out
-- here. Add one only if/when that endpoint is ever migrated to anon-auth.

-- ---------------------------------------------------------------------------
-- Sanity: list policies installed so the operator can verify in the SQL Editor
-- ---------------------------------------------------------------------------
-- SELECT schemaname, tablename, policyname, cmd
--   FROM pg_policies
--  WHERE tablename IN (
--    'jobs','candidates','applications',
--    'interview_schedules','interview_feedback','offers'
--  )
--  ORDER BY tablename, policyname;
