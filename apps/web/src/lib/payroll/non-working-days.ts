// Plain module — NOT "use server" (gotcha #85): takes raw org/employee ids.
//
// Each employee's non-working days in a pay month (effective week-off —
// employee > department > org — plus non-optional holidays). The engine uses
// them so joining on the month's first working day pays the whole month.

import { isWeekOff, resolveEffectiveWeekOff, type WeekOffPolicy } from "@jambahr/shared/attendance/week-off";
import { daysInMonth } from "@jambahr/shared/payroll/engine";

type Supabase = { from: (table: string) => any };

const toPolicy = (r: any): WeekOffPolicy | null =>
  r ? { week_type: r.week_type, off_days: r.off_days ?? [], alt_saturday_rule: r.alt_saturday_rule ?? "none" } : null;

/** Dates of `month` (YYYY-MM-DD) that are a week-off under `weekOff` or a holiday. */
export function nonWorkingDatesInMonth(month: string, weekOff: WeekOffPolicy | null, holidays: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (let d = 1; d <= daysInMonth(month); d++) {
    const date = `${month}-${String(d).padStart(2, "0")}`;
    if (holidays.has(date) || (weekOff && isWeekOff(date, weekOff))) out.push(date);
  }
  return out;
}

/**
 * Non-working dates per employee. `hasWeekOff` is false for employees with no
 * week-off at any level — their proration falls back to the joining date.
 */
export async function loadNonWorkingDates(
  supabase: Supabase,
  params: { orgId: string; month: string; employees: { id: string; department_id: string | null }[] },
): Promise<Map<string, { dates: string[]; hasWeekOff: boolean }>> {
  const { orgId, month, employees } = params;
  const out = new Map<string, { dates: string[]; hasWeekOff: boolean }>();
  if (employees.length === 0) return out;
  const start = `${month}-01`;
  const end = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const ids = employees.map((e) => e.id);
  const deptIds = [...new Set(employees.map((e) => e.department_id).filter(Boolean))] as string[];

  const [holidays, orgWeekOff, empOverrides, deptOverrides] = await Promise.all([
    supabase.from("holidays").select("date").eq("org_id", orgId).eq("is_optional", false).gte("date", start).lte("date", end),
    supabase
      .from("week_off_policy")
      .select("week_type, off_days, alt_saturday_rule, effective_from")
      .eq("org_id", orgId)
      .lte("effective_from", end)
      .order("effective_from", { ascending: false })
      .limit(1),
    supabase.from("employee_week_off_override").select("employee_id, week_type, off_days, alt_saturday_rule").eq("org_id", orgId).in("employee_id", ids),
    deptIds.length
      ? supabase.from("department_week_off_override").select("department_id, week_type, off_days, alt_saturday_rule").eq("org_id", orgId).in("department_id", deptIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const [name, res] of [["holidays", holidays], ["week_off_policy", orgWeekOff], ["employee_week_off_override", empOverrides], ["department_week_off_override", deptOverrides]] as const) {
    if (res.error) throw new Error(`${name}: ${res.error.message}`);
  }

  const holidaySet = new Set<string>(((holidays.data ?? []) as any[]).map((h) => h.date));
  const orgPolicy = toPolicy(((orgWeekOff.data ?? []) as any[])[0]);
  const empOv = new Map(((empOverrides.data ?? []) as any[]).map((o) => [o.employee_id, toPolicy(o)]));
  const deptOv = new Map(((deptOverrides.data ?? []) as any[]).map((o) => [o.department_id, toPolicy(o)]));

  for (const e of employees) {
    const employeeOverride = empOv.get(e.id) ?? null;
    const departmentOverride = e.department_id ? (deptOv.get(e.department_id) ?? null) : null;
    const weekOff = orgPolicy
      ? resolveEffectiveWeekOff(orgPolicy, departmentOverride, employeeOverride)
      : (employeeOverride ?? departmentOverride);
    out.set(e.id, { dates: nonWorkingDatesInMonth(month, weekOff, holidaySet), hasWeekOff: weekOff !== null });
  }
  return out;
}
