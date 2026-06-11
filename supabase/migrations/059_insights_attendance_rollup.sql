-- 059: Monthly attendance rollup for the Insights module.
--
-- attendance_records grows ~180k rows/yr at 500 employees — far too large
-- to pull into a server action for JS aggregation. This function does the
-- GROUP BY in Postgres and returns 12 rows.
--
-- Called via supabase.rpc('insights_attendance_monthly', ...) from
-- src/actions/insights.ts using the service-role client (bypasses RLS by
-- design — CLAUDE.md gotcha #5), so no SECURITY DEFINER is needed.
--
-- Idempotent: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION insights_attendance_monthly(
  p_org_id uuid,
  p_from date,
  p_to date
)
RETURNS TABLE (
  month text,
  present_days bigint,
  distinct_employees bigint,
  avg_clock_in_minutes_ist numeric,
  auto_closed_days bigint,
  total_worked_minutes bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    to_char(date_trunc('month', a.date), 'YYYY-MM') AS month,
    count(*) FILTER (WHERE a.clock_in_at IS NOT NULL) AS present_days,
    count(DISTINCT a.employee_id) AS distinct_employees,
    avg(
      extract(hour FROM (a.clock_in_at AT TIME ZONE 'Asia/Kolkata')) * 60 +
      extract(minute FROM (a.clock_in_at AT TIME ZONE 'Asia/Kolkata'))
    ) FILTER (WHERE a.clock_in_at IS NOT NULL) AS avg_clock_in_minutes_ist,
    count(*) FILTER (WHERE a.auto_closed) AS auto_closed_days,
    coalesce(sum(a.total_minutes), 0)::bigint AS total_worked_minutes
  FROM attendance_records a
  WHERE a.org_id = p_org_id
    AND a.date >= p_from
    AND a.date <= p_to
  GROUP BY 1
  ORDER BY 1;
$$;
