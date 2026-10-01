-- 113_work_arrangement_and_wfh.sql
-- Work-from-home as its OWN request (not a leave type — a WFH day is a working
-- day; leave means not working, and attendance/lateness/insights treat it so).
-- Plan: docs/planning/2026-10-01-work-from-home-requests.md
--
-- 1. employees.work_arrangement — office (default) | hybrid | remote.
--    Remote staff never need a WFH request.
-- 2. wfh_requests — one row per requested DAY (monthly quotas stay simple).
--    over_quota = requested beyond the monthly allowance → only an owner/admin
--    can approve it; within quota the reporting manager(s) approve.
-- Policy lives in organizations.settings.attendance.wfh (no column needed).
-- Additive and idempotent.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS work_arrangement text NOT NULL DEFAULT 'office';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employees_work_arrangement_check'
  ) THEN
    ALTER TABLE public.employees
      ADD CONSTRAINT employees_work_arrangement_check
      CHECK (work_arrangement IN ('office', 'hybrid', 'remote'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.wfh_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date date NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  over_quota boolean NOT NULL DEFAULT false,
  reason text,
  decided_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_note text,
  created_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One live request per employee per day (rejected/cancelled can be re-requested).
CREATE UNIQUE INDEX IF NOT EXISTS uq_wfh_requests_active_day
  ON public.wfh_requests (employee_id, date)
  WHERE status IN ('pending', 'approved');

CREATE INDEX IF NOT EXISTS idx_wfh_requests_org_date
  ON public.wfh_requests (org_id, date);

CREATE INDEX IF NOT EXISTS idx_wfh_requests_org_status
  ON public.wfh_requests (org_id, status);

DROP TRIGGER IF EXISTS update_wfh_requests_updated_at ON public.wfh_requests;
CREATE TRIGGER update_wfh_requests_updated_at
  BEFORE UPDATE ON public.wfh_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS on with no policies: only the service role (server actions) reads/writes,
-- the same posture migration 110 set for tables the anon key must never reach.
ALTER TABLE public.wfh_requests ENABLE ROW LEVEL SECURITY;
