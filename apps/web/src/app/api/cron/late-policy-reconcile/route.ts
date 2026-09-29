import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { monthBounds } from "@jambahr/shared/attendance/late-eligibility";
import {
  evaluateDayLateness,
  evaluateLateMonth,
  loadCoveredEmployeeIds,
  type LatePolicyRow,
} from "@/lib/attendance/late-evaluation";

export const maxDuration = 300;

/** IST "today" and the months to reconcile: this month, plus last month during the first 5 days. */
function monthsToReconcile(now = new Date()): string[] {
  const ist = new Date(now.getTime() + 5.5 * 3600 * 1000);
  const month = ist.toISOString().slice(0, 7);
  if (ist.getUTCDate() > 5) return [month];
  const prev = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  return [prev, month];
}

/**
 * Nightly safety net + source of truth for late policies. For every enabled
 * policy it re-derives each covered employee's lateness for the month (from
 * the policy's go-live date; catches punches that arrived out of order or
 * shift changes), then re-runs the month: flags + alerts, or the ladder.
 * Idempotent — safe to re-run.
 */
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sb = createAdminSupabase();
  const months = monthsToReconcile();
  const { data: policies } = await sb.from("late_policies").select("*").eq("enabled", true);

  let employeesEvaluated = 0;
  const errors: string[] = [];
  for (const policy of (policies ?? []) as LatePolicyRow[]) {
    try {
      const covered = await loadCoveredEmployeeIds(sb, policy);
      if (covered.size === 0) continue;
      for (const month of months) {
        const { start, end } = monthBounds(month);
        const from = policy.evaluate_from && policy.evaluate_from > start ? policy.evaluate_from : start;
        if (from > end) continue;
        const { data: records } = await sb
          .from("attendance_records")
          .select("employee_id, date")
          .eq("org_id", policy.org_id)
          .in("employee_id", [...covered])
          .gte("date", from)
          .lte("date", end);
        const rows = (records ?? []) as Array<{ employee_id: string; date: string }>;
        for (const r of rows) {
          await evaluateDayLateness(sb, policy.org_id, r.employee_id, r.date, { policy, covered, skipMonth: true });
        }
        for (const employeeId of new Set(rows.map((r) => r.employee_id))) {
          await evaluateLateMonth(sb, policy, employeeId, month, { covered });
          employeesEvaluated++;
        }
      }
    } catch (e) {
      errors.push(`${policy.org_id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (errors.length) console.error("[late-policy-reconcile]", errors);
  return NextResponse.json({ ok: errors.length === 0, months, employeesEvaluated, errors: errors.length });
}
