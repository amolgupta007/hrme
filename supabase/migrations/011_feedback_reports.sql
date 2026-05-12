-- supabase/migrations/011_feedback_reports.sql
-- Feedback / bug-report capture surface. Used by /dashboard/feedback (any role)
-- and /superadmin/feedback (founder-only via SUPERADMIN_SECRET cookie).

CREATE TABLE feedback_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  reporter_user_id TEXT NOT NULL,
  reporter_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  reporter_role TEXT NOT NULL CHECK (reporter_role IN ('owner','admin','manager','employee')),
  type TEXT NOT NULL CHECK (type IN ('bug','feature_request','feedback','other')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 2000),
  severity TEXT CHECK (severity IN ('low','medium','high','critical')),
  screenshot_url TEXT,
  page_url TEXT,
  user_agent TEXT,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','triaged','in_progress','resolved','wontfix')),
  priority TEXT CHECK (priority IN ('low','medium','high','critical')),
  admin_notes TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX feedback_reports_org_status_idx ON feedback_reports (org_id, status);
CREATE INDEX feedback_reports_reporter_idx  ON feedback_reports (org_id, reporter_user_id);
CREATE INDEX feedback_reports_created_idx   ON feedback_reports (created_at DESC);

CREATE TRIGGER feedback_reports_updated_at
  BEFORE UPDATE ON feedback_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS policies below are ADVISORY ONLY.
-- All server actions use createAdminSupabase() (service-role) which bypasses RLS.
-- These policies become enforceable if/when Clerk → Supabase JWT wiring is configured.
-- See: src/actions/feedback.ts for the actual auth checks (getCurrentUser, isSuperadminAuthenticated).
ALTER TABLE feedback_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY feedback_reporter_select_own ON feedback_reports
  FOR SELECT
  USING (
    org_id = (auth.jwt() -> 'org' ->> 'id')::uuid
    AND reporter_user_id = auth.jwt() ->> 'sub'
  );

CREATE POLICY feedback_insert_own_org ON feedback_reports
  FOR INSERT
  WITH CHECK (
    org_id = (auth.jwt() -> 'org' ->> 'id')::uuid
    AND reporter_user_id = auth.jwt() ->> 'sub'
  );
