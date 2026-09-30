// Plain module — NOT "use server" (gotcha #85): takes raw org/employee ids.
//
// The ONE loader for "which late arrivals count this month". Used by the
// per-day evaluator, the nightly reconcile cron and payroll, so the monthly
// count is identical everywhere. Lateness itself (is_late) is decided by
// computeLateness in late-evaluation.ts; this only applies the exclusions
// (excused, week-off, holiday, approved leave, before the policy's go-live).

import {
  countableLates,
  expandLeaveDates,
  monthBounds,
  type LateDay,
} from "@jambahr/shared/attendance/late-eligibility";
import { resolveEffectiveWeekOff, type WeekOffPolicy } from "@jambahr/shared/attendance/week-off";

type Supabase = { from: (table: string) => any };

const toPolicy = (r: any): WeekOffPolicy | null =>
  r ? { week_type: r.week_type, off_days: r.off_days ?? [], alt_saturday_rule: r.alt_saturday_rule ?? "none" } : null;

export async function loadCountableLates(
  supabase: Supabase,
  params: { orgId: string; month: string; employeeIds: string[]; evaluateFrom: string | null }
): Promise<Map<string, LateDay[]>> {
  const { orgId, month, employeeIds, evaluateFrom } = params;
  const out = new Map<string, LateDay[]>(employeeIds.map((id) => [id, []]));
  if (employeeIds.length === 0) return out;
  const { start, end } = monthBounds(month);

  const [records, holidays, orgWeekOff, emps, empOverrides, leaves] = await Promise.all([
    supabase
      .from("attendance_records")
      .select("id, employee_id, date, is_late, late_minutes, late_excused, clock_in_at")
      .eq("org_id", orgId)
      .eq("is_late", true)
      .in("employee_id", employeeIds)
      .gte("date", start)
      .lte("date", end),
    supabase
      .from("holidays")
      .select("date")
      .eq("org_id", orgId)
      .eq("is_optional", false)
      .gte("date", start)
      .lte("date", end),
    supabase
      .from("week_off_policy")
      .select("week_type, off_days, alt_saturday_rule, effective_from")
      .eq("org_id", orgId)
      .lte("effective_from", end)
      .order("effective_from", { ascending: false })
      .limit(1),
    supabase.from("employees").select("id, department_id").eq("org_id", orgId).in("id", employeeIds),
    supabase
      .from("employee_week_off_override")
      .select("employee_id, week_type, off_days, alt_saturday_rule")
      .eq("org_id", orgId)
      .in("employee_id", employeeIds),
    supabase
      .from("leave_requests")
      .select("employee_id, start_date, end_date")
      .eq("org_id", orgId)
      .eq("status", "approved")
      .in("employee_id", employeeIds)
      .lte("start_date", end)
      .gte("end_date", start),
  ]);
  if (records.error) throw new Error(`late counting: ${records.error.message}`);

  const deptOf = new Map<string, string | null>(((emps.data ?? []) as any[]).map((e) => [e.id, e.department_id]));
  const deptIds = [...new Set([...deptOf.values()].filter(Boolean))] as string[];
  const { data: deptOverrides } = deptIds.length
    ? await supabase
        .from("department_week_off_override")
        .select("department_id, week_type, off_days, alt_saturday_rule")
        .eq("org_id", orgId)
        .in("department_id", deptIds)
    : { data: [] };

  const holidaySet = new Set<string>(((holidays.data ?? []) as any[]).map((h) => h.date));
  const orgPolicy = toPolicy(((orgWeekOff.data ?? []) as any[])[0]);
  const empOv = new Map(((empOverrides.data ?? []) as any[]).map((o) => [o.employee_id, toPolicy(o)]));
  const deptOv = new Map(((deptOverrides ?? []) as any[]).map((o) => [o.department_id, toPolicy(o)]));

  for (const id of employeeIds) {
    const dept = deptOf.get(id) ?? null;
    const employeeOverride = empOv.get(id) ?? null;
    const departmentOverride = dept ? (deptOv.get(dept) ?? null) : null;
    const weekOff = orgPolicy
      ? resolveEffectiveWeekOff(orgPolicy, departmentOverride, employeeOverride)
      : (employeeOverride ?? departmentOverride);
    const leaveDates = expandLeaveDates(
      ((leaves.data ?? []) as any[]).filter((l) => l.employee_id === id),
      start,
      end
    );
    const days = ((records.data ?? []) as any[])
      .filter((r) => r.employee_id === id)
      .map(
        (r): LateDay => ({
          id: r.id,
          date: r.date,
          is_late: !!r.is_late,
          late_minutes: r.late_minutes ?? null,
          late_excused: !!r.late_excused,
          clock_in_at: r.clock_in_at ?? null,
        })
      );
    out.set(id, countableLates(days, { weekOff, holidays: holidaySet, leaveDates, evaluateFrom }));
  }
  return out;
}
