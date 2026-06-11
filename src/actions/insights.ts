"use server";

import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { hasFeature } from "@/config/plans";
import { createAdminSupabase } from "@/lib/supabase/server";
import type { ActionResult } from "@/types";

// ---- Types ----

export type MonthPoint = {
  month: string; // YYYY-MM
  label: string; // "Jun"
  value: number;
};

export type NamedCount = {
  name: string;
  value: number;
};

export type JoinLeavePoint = {
  month: string;
  label: string;
  joiners: number;
  leavers: number;
};

export type OverviewInsights = {
  headcount: number;
  headcountDelta30d: number;
  headcountTrend: MonthPoint[];
  attritionRatePct: number;
  leaveUtilizationPct: number;
  leaveDaysTaken12m: number;
  trainingCompliancePct: number;
  overdueTrainingCount: number;
  monthlyPayrollCost: number | null;
  payrollMonth: string | null;
  openPositions: number | null;
  totalApplications: number | null;
  deptDistribution: NamedCount[];
  leaveByMonth: MonthPoint[];
  joinersLeavers: JoinLeavePoint[];
};

export type WorkforceInsights = {
  totals: {
    active: number;
    joiners12m: number;
    leavers12m: number;
    attritionRatePct: number;
    avgTenureYears: number;
  };
  headcountTrend: MonthPoint[];
  deptDistribution: NamedCount[];
  typeSplit: NamedCount[];
  joinersLeavers: JoinLeavePoint[];
  attritionTrend: MonthPoint[];
  tenureBuckets: NamedCount[];
};

// ---- Shared helpers ----

type EmployeeRow = {
  id: string;
  date_of_joining: string | null;
  status: string;
  department_id: string | null;
  employment_type: string;
  updated_at: string;
};

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function lastNMonths(n: number): { month: string; label: string; end: string }[] {
  const out: { month: string; label: string; end: string }[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const endD = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const end = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, "0")}-${String(endD.getDate()).padStart(2, "0")}`;
    out.push({ month, label: MONTH_LABELS[d.getMonth()], end });
  }
  return out;
}

// No `terminated_at` column exists yet — for terminated employees we use
// `updated_at` as the exit-date proxy (terminating is almost always the
// final write to the row). Good enough for trend lines; a dedicated
// column is the upgrade path if precision ever matters.
function exitMonth(e: EmployeeRow): string | null {
  if (e.status !== "terminated") return null;
  return e.updated_at?.slice(0, 7) ?? null;
}

function headcountAt(employees: EmployeeRow[], monthEnd: string): number {
  let count = 0;
  for (const e of employees) {
    const joined = e.date_of_joining ?? e.updated_at?.slice(0, 10);
    if (!joined || joined > monthEnd) continue;
    const exit = exitMonth(e);
    if (exit && `${exit}-01` <= monthEnd) {
      // exited on/before this month end — only count if exit month is after monthEnd's month
      if (exit <= monthEnd.slice(0, 7)) continue;
    }
    count += 1;
  }
  return count;
}

function buildWorkforceSeries(employees: EmployeeRow[]) {
  const months = lastNMonths(12);

  const headcountTrend: MonthPoint[] = months.map((m) => ({
    month: m.month,
    label: m.label,
    value: headcountAt(employees, m.end),
  }));

  const joinersLeavers: JoinLeavePoint[] = months.map((m) => ({
    month: m.month,
    label: m.label,
    joiners: employees.filter((e) => e.date_of_joining?.slice(0, 7) === m.month).length,
    leavers: employees.filter((e) => exitMonth(e) === m.month).length,
  }));

  const joiners12m = joinersLeavers.reduce((s, p) => s + p.joiners, 0);
  const leavers12m = joinersLeavers.reduce((s, p) => s + p.leavers, 0);
  const avgHeadcount =
    headcountTrend.reduce((s, p) => s + p.value, 0) / Math.max(1, headcountTrend.length);
  const attritionRatePct =
    avgHeadcount > 0 ? Math.round((leavers12m / avgHeadcount) * 1000) / 10 : 0;

  // Rolling attrition per month: trailing-12m exits at each point / headcount then
  const attritionTrend: MonthPoint[] = months.map((m, idx) => {
    const windowMonths = months.slice(0, idx + 1).map((x) => x.month);
    const exits = employees.filter((e) => {
      const ex = exitMonth(e);
      return ex !== null && windowMonths.includes(ex);
    }).length;
    const hc = headcountTrend[idx].value;
    return {
      month: m.month,
      label: m.label,
      value: hc > 0 ? Math.round((exits / hc) * 1000) / 10 : 0,
    };
  });

  return { headcountTrend, joinersLeavers, joiners12m, leavers12m, attritionRatePct, attritionTrend };
}

async function requireInsightsAccess() {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { ok: false as const, error: "Unauthorized" };
  if (!hasFeature(user.plan ?? "starter", "analytics", user.customFeatures ?? null)) {
    return { ok: false as const, error: "Insights requires the Business plan" };
  }
  return { ok: true as const, user };
}

// ---- Actions ----

export async function getOverviewInsights(): Promise<ActionResult<OverviewInsights>> {
  const access = await requireInsightsAccess();
  if (!access.ok) return { success: false, error: access.error };
  const { user } = access;
  const supabase = createAdminSupabase();
  const orgId = user.orgId;

  const months = lastNMonths(12);
  const windowStart = `${months[0].month}-01`;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const year = new Date().getFullYear();

  const payrollEnabled = hasFeature(user.plan ?? "starter", "payroll", user.customFeatures ?? null);

  const [
    employeesResult,
    departmentsResult,
    leavesResult,
    balancesResult,
    { count: totalEnrollments },
    { count: completedEnrollments },
    { count: overdueEnrollments },
    jobsResult,
    applicationsResult,
    payrollRunResult,
  ] = await Promise.all([
    supabase
      .from("employees")
      .select("id, date_of_joining, status, department_id, employment_type, updated_at")
      .eq("org_id", orgId),
    supabase.from("departments").select("id, name").eq("org_id", orgId),
    supabase
      .from("leave_requests")
      .select("start_date, days")
      .eq("org_id", orgId)
      .eq("status", "approved")
      .gte("start_date", windowStart),
    supabase
      .from("leave_balances")
      .select("total_days, used_days, carried_forward_days")
      .eq("org_id", orgId)
      .eq("year", year),
    supabase
      .from("training_enrollments")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId),
    supabase
      .from("training_enrollments")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "completed"),
    supabase
      .from("training_enrollments")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "overdue"),
    user.jambaHireEnabled
      ? supabase
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("status", "active")
      : Promise.resolve(null),
    user.jambaHireEnabled
      ? supabase
          .from("applications")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
      : Promise.resolve(null),
    payrollEnabled
      ? supabase
          .from("payroll_runs")
          .select("id, month, status")
          .eq("org_id", orgId)
          .in("status", ["processed", "paid"])
          .order("month", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve(null),
  ]);

  const employees = (employeesResult.data ?? []) as EmployeeRow[];
  const active = employees.filter((e) => e.status !== "terminated");
  const { headcountTrend, joinersLeavers, attritionRatePct } = buildWorkforceSeries(employees);

  // Department distribution (active only)
  const deptNames = new Map<string, string>(
    ((departmentsResult.data ?? []) as { id: string; name: string }[]).map((d) => [d.id, d.name])
  );
  const deptCounts = new Map<string, number>();
  for (const e of active) {
    const name = e.department_id ? deptNames.get(e.department_id) ?? "Unknown" : "Unassigned";
    deptCounts.set(name, (deptCounts.get(name) ?? 0) + 1);
  }
  const deptDistribution: NamedCount[] = [...deptCounts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Leave days per month (approved, by start_date month)
  const leaveByMonthMap = new Map<string, number>();
  for (const l of (leavesResult.data ?? []) as { start_date: string; days: number }[]) {
    const m = l.start_date.slice(0, 7);
    leaveByMonthMap.set(m, (leaveByMonthMap.get(m) ?? 0) + (l.days ?? 0));
  }
  const leaveByMonth: MonthPoint[] = months.map((m) => ({
    month: m.month,
    label: m.label,
    value: leaveByMonthMap.get(m.month) ?? 0,
  }));
  const leaveDaysTaken12m = leaveByMonth.reduce((s, p) => s + p.value, 0);

  // Leave utilization (this calendar year)
  let totalAllocated = 0;
  let totalUsed = 0;
  for (const b of (balancesResult.data ?? []) as { total_days: number; used_days: number; carried_forward_days: number }[]) {
    totalAllocated += (b.total_days ?? 0) + (b.carried_forward_days ?? 0);
    totalUsed += b.used_days ?? 0;
  }
  const leaveUtilizationPct =
    totalAllocated > 0 ? Math.round((totalUsed / totalAllocated) * 100) : 0;

  const trainingCompliancePct =
    (totalEnrollments ?? 0) > 0
      ? Math.round(((completedEnrollments ?? 0) / (totalEnrollments ?? 1)) * 100)
      : 0;

  // Payroll cost: sum net_pay of the latest processed/paid run
  let monthlyPayrollCost: number | null = null;
  let payrollMonth: string | null = null;
  const runRow = payrollRunResult?.data as { id: string; month: string } | null | undefined;
  if (runRow) {
    const { data: entries } = await supabase
      .from("payroll_entries")
      .select("net_pay")
      .eq("payroll_run_id", runRow.id);
    monthlyPayrollCost = ((entries ?? []) as { net_pay: number }[]).reduce(
      (s, e) => s + (e.net_pay ?? 0),
      0
    );
    payrollMonth = runRow.month;
  }

  const headcountDelta30d = active.filter(
    (e) => (e.date_of_joining ?? "") >= thirtyDaysAgo
  ).length;

  return {
    success: true,
    data: {
      headcount: active.length,
      headcountDelta30d,
      headcountTrend,
      attritionRatePct,
      leaveUtilizationPct,
      leaveDaysTaken12m,
      trainingCompliancePct,
      overdueTrainingCount: overdueEnrollments ?? 0,
      monthlyPayrollCost,
      payrollMonth,
      openPositions: jobsResult ? jobsResult.count ?? 0 : null,
      totalApplications: applicationsResult ? applicationsResult.count ?? 0 : null,
      deptDistribution,
      leaveByMonth,
      joinersLeavers,
    },
  };
}

export async function getWorkforceInsights(): Promise<ActionResult<WorkforceInsights>> {
  const access = await requireInsightsAccess();
  if (!access.ok) return { success: false, error: access.error };
  const { user } = access;
  const supabase = createAdminSupabase();
  const orgId = user.orgId;

  const [employeesResult, departmentsResult] = await Promise.all([
    supabase
      .from("employees")
      .select("id, date_of_joining, status, department_id, employment_type, updated_at")
      .eq("org_id", orgId),
    supabase.from("departments").select("id, name").eq("org_id", orgId),
  ]);

  const employees = (employeesResult.data ?? []) as EmployeeRow[];
  const active = employees.filter((e) => e.status !== "terminated");
  const { headcountTrend, joinersLeavers, joiners12m, leavers12m, attritionRatePct, attritionTrend } =
    buildWorkforceSeries(employees);

  const deptNames = new Map<string, string>(
    ((departmentsResult.data ?? []) as { id: string; name: string }[]).map((d) => [d.id, d.name])
  );
  const deptCounts = new Map<string, number>();
  for (const e of active) {
    const name = e.department_id ? deptNames.get(e.department_id) ?? "Unknown" : "Unassigned";
    deptCounts.set(name, (deptCounts.get(name) ?? 0) + 1);
  }
  const deptDistribution: NamedCount[] = [...deptCounts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const TYPE_LABELS: Record<string, string> = {
    full_time: "Full-time",
    part_time: "Part-time",
    contract: "Contract",
    intern: "Intern",
  };
  const typeCounts = new Map<string, number>();
  for (const e of active) {
    const label = TYPE_LABELS[e.employment_type] ?? e.employment_type;
    typeCounts.set(label, (typeCounts.get(label) ?? 0) + 1);
  }
  const typeSplit: NamedCount[] = [...typeCounts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Tenure distribution (active, from date_of_joining)
  const todayMs = Date.now();
  const buckets = [
    { name: "< 1 yr", min: 0, max: 1 },
    { name: "1–2 yrs", min: 1, max: 2 },
    { name: "2–5 yrs", min: 2, max: 5 },
    { name: "5+ yrs", min: 5, max: Infinity },
  ];
  const tenureBuckets: NamedCount[] = buckets.map((b) => ({ name: b.name, value: 0 }));
  let tenureSum = 0;
  let tenureN = 0;
  for (const e of active) {
    if (!e.date_of_joining) continue;
    const years = (todayMs - new Date(e.date_of_joining).getTime()) / (365.25 * 24 * 3600 * 1000);
    if (years < 0) continue;
    tenureSum += years;
    tenureN += 1;
    const idx = buckets.findIndex((b) => years >= b.min && years < b.max);
    if (idx >= 0) tenureBuckets[idx].value += 1;
  }
  const avgTenureYears = tenureN > 0 ? Math.round((tenureSum / tenureN) * 10) / 10 : 0;

  return {
    success: true,
    data: {
      totals: {
        active: active.length,
        joiners12m,
        leavers12m,
        attritionRatePct,
        avgTenureYears,
      },
      headcountTrend,
      deptDistribution,
      typeSplit,
      joinersLeavers,
      attritionTrend,
      tenureBuckets,
    },
  };
}
