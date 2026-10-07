// Plain module — NOT "use server" (gotcha #85): takes raw org/employee ids.
//
// Each employee's non-working days in [from, to]: the org's MANDATORY holidays
// plus their effective week-off (employee > department > org). Payroll reads
// through this today; leave counting, late counting and reports move onto it in
// later PRs so they all agree on what a holiday is. A failed query throws — an
// outage must never read as "no holidays" (gotcha #102).
//
// Caveat: it uses the org week-off policy in force on `to` for the whole range —
// resolve per date before using it for ranges that cross a policy change (PR 2).

import { resolveEffectiveWeekOff, type WeekOffPolicy } from "@jambahr/shared/attendance/week-off";
import { buildNonWorkingDays, type NonWorkingDays } from "@jambahr/shared/holidays/non-working";

type Supabase = { from: (table: string) => any };

const toPolicy = (r: any): WeekOffPolicy | null =>
  r ? { week_type: r.week_type, off_days: r.off_days ?? [], alt_saturday_rule: r.alt_saturday_rule ?? "none" } : null;

export async function loadNonWorkingDays(
  supabase: Supabase,
  params: { orgId: string; employees: { id: string; department_id: string | null }[]; from: string; to: string },
): Promise<Map<string, NonWorkingDays>> {
  const { orgId, employees, from, to } = params;
  const out = new Map<string, NonWorkingDays>();
  if (employees.length === 0) return out;
  const ids = employees.map((e) => e.id);
  const deptIds = [...new Set(employees.map((e) => e.department_id).filter(Boolean))] as string[];

  const [holidays, orgWeekOff, empOverrides, deptOverrides] = await Promise.all([
    supabase.from("holidays").select("date, name").eq("org_id", orgId).eq("is_optional", false).gte("date", from).lte("date", to),
    supabase
      .from("week_off_policy")
      .select("week_type, off_days, alt_saturday_rule, effective_from")
      .eq("org_id", orgId)
      .lte("effective_from", to)
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

  const holidayRows = ((holidays.data ?? []) as { date: string; name: string }[]).map((h) => ({ date: h.date, name: h.name }));
  const orgPolicy = toPolicy(((orgWeekOff.data ?? []) as any[])[0]);
  const empOv = new Map(((empOverrides.data ?? []) as any[]).map((o) => [o.employee_id, toPolicy(o)]));
  const deptOv = new Map(((deptOverrides.data ?? []) as any[]).map((o) => [o.department_id, toPolicy(o)]));

  for (const e of employees) {
    const employeeOverride = empOv.get(e.id) ?? null;
    const departmentOverride = e.department_id ? (deptOv.get(e.department_id) ?? null) : null;
    const weekOff = orgPolicy
      ? resolveEffectiveWeekOff(orgPolicy, departmentOverride, employeeOverride)
      : (employeeOverride ?? departmentOverride);
    out.set(e.id, buildNonWorkingDays({ from, to, holidays: holidayRows, weekOff }));
  }
  return out;
}
