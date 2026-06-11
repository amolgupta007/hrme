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

// ---- Leave & Attendance ----

export type LeaveTypeMonthlyRow = { month: string; label: string } & Record<string, number | string>;

export type TopBalanceRow = {
  name: string;
  remaining: number;
  total: number;
};

export type AttendanceInsights = {
  enabled: boolean;
  /** false when the rollup RPC (migration 059) isn't applied yet. */
  available: boolean;
  presentDays: MonthPoint[];
  avgClockInMinutes: MonthPoint[]; // minutes since midnight, IST
  avgDailyHours: MonthPoint[];
  autoClosed: MonthPoint[];
  otHoursByDept: NamedCount[];
};

export type LeaveAttendanceInsights = {
  kpis: {
    daysTaken12m: number;
    utilizationPct: number;
    avgDaysPerEmployee: number;
    pendingNow: number;
  };
  leaveTypes: string[];
  leaveByTypeMonthly: LeaveTypeMonthlyRow[];
  topBalances: TopBalanceRow[];
  attendance: AttendanceInsights;
};

export async function getLeaveAttendanceInsights(): Promise<ActionResult<LeaveAttendanceInsights>> {
  const access = await requireInsightsAccess();
  if (!access.ok) return { success: false, error: access.error };
  const { user } = access;
  const supabase = createAdminSupabase();
  const orgId = user.orgId;

  const months = lastNMonths(12);
  const windowStart = `${months[0].month}-01`;
  const today = new Date().toISOString().slice(0, 10);
  const year = new Date().getFullYear();

  const [leavesResult, balancesResult, { count: pendingNow }, { count: activeEmployees }] =
    await Promise.all([
      supabase
        .from("leave_requests")
        .select("leave_type, start_date, days")
        .eq("org_id", orgId)
        .eq("status", "approved")
        .gte("start_date", windowStart),
      supabase
        .from("leave_balances")
        .select("total_days, used_days, carried_forward_days, employees!employee_id(first_name, last_name, status)")
        .eq("org_id", orgId)
        .eq("year", year),
      supabase
        .from("leave_requests")
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("status", "pending"),
      supabase
        .from("employees")
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("status", "active"),
    ]);

  // Stacked leave-by-type per month
  const leaves = (leavesResult.data ?? []) as { leave_type: string; start_date: string; days: number }[];
  const typeTotals = new Map<string, number>();
  for (const l of leaves) {
    typeTotals.set(l.leave_type, (typeTotals.get(l.leave_type) ?? 0) + (l.days ?? 0));
  }
  const leaveTypes = [...typeTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t);
  const leaveByTypeMonthly: LeaveTypeMonthlyRow[] = months.map((m) => {
    const row: LeaveTypeMonthlyRow = { month: m.month, label: m.label };
    for (const t of leaveTypes) row[t] = 0;
    return row;
  });
  const rowByMonth = new Map(leaveByTypeMonthly.map((r) => [r.month, r]));
  let daysTaken12m = 0;
  for (const l of leaves) {
    const row = rowByMonth.get(l.start_date.slice(0, 7));
    if (!row) continue;
    row[l.leave_type] = ((row[l.leave_type] as number) ?? 0) + (l.days ?? 0);
    daysTaken12m += l.days ?? 0;
  }

  // Utilization + top remaining balances (active employees, summed across policies)
  let totalAllocated = 0;
  let totalUsed = 0;
  const perEmployee = new Map<string, { remaining: number; total: number }>();
  for (const b of (balancesResult.data ?? []) as any[]) {
    const total = (b.total_days ?? 0) + (b.carried_forward_days ?? 0);
    const used = b.used_days ?? 0;
    totalAllocated += total;
    totalUsed += used;
    if (b.employees?.status === "terminated") continue;
    const name = `${b.employees?.first_name ?? ""} ${b.employees?.last_name ?? ""}`.trim() || "Unknown";
    const agg = perEmployee.get(name) ?? { remaining: 0, total: 0 };
    agg.remaining += Math.max(0, total - used);
    agg.total += total;
    perEmployee.set(name, agg);
  }
  const topBalances: TopBalanceRow[] = [...perEmployee.entries()]
    .map(([name, v]) => ({ name, remaining: v.remaining, total: v.total }))
    .sort((a, b) => b.remaining - a.remaining)
    .slice(0, 8);

  const utilizationPct = totalAllocated > 0 ? Math.round((totalUsed / totalAllocated) * 100) : 0;
  const avgDaysPerEmployee =
    (activeEmployees ?? 0) > 0 ? Math.round((daysTaken12m / (activeEmployees ?? 1)) * 10) / 10 : 0;

  // Attendance rollup — best-effort. Missing RPC (migration 059 not applied)
  // must degrade to an explanatory empty state, never crash the page.
  const attendance: AttendanceInsights = {
    enabled: !!user.attendanceEnabled,
    available: false,
    presentDays: [],
    avgClockInMinutes: [],
    avgDailyHours: [],
    autoClosed: [],
    otHoursByDept: [],
  };

  if (user.attendanceEnabled) {
    const [rollup, otResult, employeesResult, departmentsResult] = await Promise.all([
      supabase.rpc("insights_attendance_monthly", {
        p_org_id: orgId,
        p_from: windowStart,
        p_to: today,
      }),
      supabase
        .from("ot_records")
        .select("ot_minutes, employee_id, date, status")
        .eq("org_id", orgId)
        .in("status", ["approved", "pushed"])
        .gte("date", windowStart),
      supabase.from("employees").select("id, department_id").eq("org_id", orgId),
      supabase.from("departments").select("id, name").eq("org_id", orgId),
    ]);

    if (!rollup.error) {
      attendance.available = true;
      type RollupRow = {
        month: string;
        present_days: number;
        avg_clock_in_minutes_ist: number | null;
        auto_closed_days: number;
        total_worked_minutes: number;
      };
      const byMonth = new Map(
        ((rollup.data ?? []) as RollupRow[]).map((r) => [r.month, r])
      );
      for (const m of months) {
        const r = byMonth.get(m.month);
        attendance.presentDays.push({ month: m.month, label: m.label, value: r?.present_days ?? 0 });
        attendance.avgClockInMinutes.push({
          month: m.month,
          label: m.label,
          value: r?.avg_clock_in_minutes_ist ? Math.round(Number(r.avg_clock_in_minutes_ist)) : 0,
        });
        attendance.avgDailyHours.push({
          month: m.month,
          label: m.label,
          value:
            r && r.present_days > 0
              ? Math.round((r.total_worked_minutes / r.present_days / 60) * 10) / 10
              : 0,
        });
        attendance.autoClosed.push({ month: m.month, label: m.label, value: r?.auto_closed_days ?? 0 });
      }
    }

    // OT hours by department (ot_records is small — JS aggregation is fine)
    const deptNames = new Map<string, string>(
      ((departmentsResult.data ?? []) as { id: string; name: string }[]).map((d) => [d.id, d.name])
    );
    const empDept = new Map<string, string | null>(
      ((employeesResult.data ?? []) as { id: string; department_id: string | null }[]).map((e) => [
        e.id,
        e.department_id,
      ])
    );
    const otByDept = new Map<string, number>();
    for (const r of (otResult.data ?? []) as { ot_minutes: number; employee_id: string }[]) {
      const deptId = empDept.get(r.employee_id);
      const name = deptId ? deptNames.get(deptId) ?? "Unknown" : "Unassigned";
      otByDept.set(name, (otByDept.get(name) ?? 0) + (r.ot_minutes ?? 0));
    }
    attendance.otHoursByDept = [...otByDept.entries()]
      .map(([name, minutes]) => ({ name, value: Math.round((minutes / 60) * 10) / 10 }))
      .sort((a, b) => b.value - a.value);
  }

  return {
    success: true,
    data: {
      kpis: {
        daysTaken12m,
        utilizationPct,
        avgDaysPerEmployee,
        pendingNow: pendingNow ?? 0,
      },
      leaveTypes,
      leaveByTypeMonthly,
      topBalances,
      attendance,
    },
  };
}

// ---- Payroll Cost ----

export type PayrollMonthlyRow = {
  month: string;
  label: string;
  net: number;
  tds: number;
  pf: number;
  gross: number;
  employees: number;
};

export type PayrollInsights = {
  kpis: {
    latestNet: number;
    latestGross: number;
    latestTds: number;
    avgNetPerEmployee: number;
    projectedAnnualNet: number;
    employeesOnPayroll: number;
    latestMonth: string;
  };
  monthly: PayrollMonthlyRow[];
  costByDept: NamedCount[];
  salaryBands: NamedCount[];
  otSpendMonthly: MonthPoint[];
};

/** Returns data:null when the org's plan doesn't include payroll. */
export async function getPayrollInsights(): Promise<ActionResult<PayrollInsights | null>> {
  const access = await requireInsightsAccess();
  if (!access.ok) return { success: false, error: access.error };
  const { user } = access;

  if (!hasFeature(user.plan ?? "starter", "payroll", user.customFeatures ?? null)) {
    return { success: true, data: null };
  }

  const supabase = createAdminSupabase();
  const orgId = user.orgId;

  const { data: runRows } = await supabase
    .from("payroll_runs")
    .select("id, month, status")
    .eq("org_id", orgId)
    .in("status", ["processed", "paid"])
    .order("month", { ascending: false })
    .limit(12);

  const runs = ((runRows ?? []) as { id: string; month: string }[]).reverse();

  const emptyKpis = {
    latestNet: 0,
    latestGross: 0,
    latestTds: 0,
    avgNetPerEmployee: 0,
    projectedAnnualNet: 0,
    employeesOnPayroll: 0,
    latestMonth: "",
  };

  if (runs.length === 0) {
    return {
      success: true,
      data: { kpis: emptyKpis, monthly: [], costByDept: [], salaryBands: [], otSpendMonthly: [] },
    };
  }

  const runIds = runs.map((r) => r.id);
  const [entriesResult, employeesResult, departmentsResult, structuresResult, lineItemsResult] =
    await Promise.all([
      supabase
        .from("payroll_entries")
        .select("id, payroll_run_id, employee_id, gross_salary, net_pay, tds, employee_pf")
        .eq("org_id", orgId)
        .in("payroll_run_id", runIds),
      supabase.from("employees").select("id, department_id").eq("org_id", orgId),
      supabase.from("departments").select("id, name").eq("org_id", orgId),
      supabase.from("salary_structures").select("ctc").eq("org_id", orgId),
      supabase
        .from("payroll_line_items")
        .select("amount, payroll_entry_id")
        .eq("org_id", orgId)
        .eq("category", "overtime"),
    ]);

  type EntryRow = {
    id: string;
    payroll_run_id: string;
    employee_id: string;
    gross_salary: number;
    net_pay: number;
    tds: number;
    employee_pf: number;
  };
  const entries = (entriesResult.data ?? []) as EntryRow[];
  const monthOfRun = new Map(runs.map((r) => [r.id, r.month]));

  const monthlyMap = new Map<string, PayrollMonthlyRow>();
  for (const r of runs) {
    const m = Number(r.month.split("-")[1]);
    monthlyMap.set(r.month, {
      month: r.month,
      label: MONTH_LABELS[(m || 1) - 1] ?? r.month,
      net: 0,
      tds: 0,
      pf: 0,
      gross: 0,
      employees: 0,
    });
  }
  for (const e of entries) {
    const month = monthOfRun.get(e.payroll_run_id);
    const row = month ? monthlyMap.get(month) : undefined;
    if (!row) continue;
    row.net += e.net_pay ?? 0;
    row.tds += e.tds ?? 0;
    row.pf += e.employee_pf ?? 0;
    row.gross += e.gross_salary ?? 0;
    row.employees += 1;
  }
  const monthly = [...monthlyMap.values()];

  const latest = monthly[monthly.length - 1];
  const kpis = latest
    ? {
        latestNet: Math.round(latest.net),
        latestGross: Math.round(latest.gross),
        latestTds: Math.round(latest.tds),
        avgNetPerEmployee:
          latest.employees > 0 ? Math.round(latest.net / latest.employees) : 0,
        projectedAnnualNet: Math.round(latest.net * 12),
        employeesOnPayroll: latest.employees,
        latestMonth: latest.month,
      }
    : emptyKpis;

  // Cost by department — latest run only
  const latestRunId = runs[runs.length - 1].id;
  const deptNames = new Map<string, string>(
    ((departmentsResult.data ?? []) as { id: string; name: string }[]).map((d) => [d.id, d.name])
  );
  const empDept = new Map<string, string | null>(
    ((employeesResult.data ?? []) as { id: string; department_id: string | null }[]).map((e) => [
      e.id,
      e.department_id,
    ])
  );
  const deptCost = new Map<string, number>();
  for (const e of entries) {
    if (e.payroll_run_id !== latestRunId) continue;
    const deptId = empDept.get(e.employee_id);
    const name = deptId ? deptNames.get(deptId) ?? "Unknown" : "Unassigned";
    deptCost.set(name, (deptCost.get(name) ?? 0) + (e.net_pay ?? 0));
  }
  const costByDept: NamedCount[] = [...deptCost.entries()]
    .map(([name, value]) => ({ name, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value);

  // Salary bands from configured CTCs
  const bands = [
    { name: "< ₹5L", min: 0, max: 5_00_000 },
    { name: "₹5–10L", min: 5_00_000, max: 10_00_000 },
    { name: "₹10–15L", min: 10_00_000, max: 15_00_000 },
    { name: "₹15–25L", min: 15_00_000, max: 25_00_000 },
    { name: "₹25–50L", min: 25_00_000, max: 50_00_000 },
    { name: "₹50L+", min: 50_00_000, max: Infinity },
  ];
  const salaryBands: NamedCount[] = bands.map((b) => ({ name: b.name, value: 0 }));
  for (const s of (structuresResult.data ?? []) as { ctc: number }[]) {
    const idx = bands.findIndex((b) => (s.ctc ?? 0) >= b.min && (s.ctc ?? 0) < b.max);
    if (idx >= 0) salaryBands[idx].value += 1;
  }

  // OT spend per month (line items → entry → run month)
  const runOfEntry = new Map(entries.map((e) => [e.id, e.payroll_run_id]));
  const otByMonth = new Map<string, number>();
  for (const li of (lineItemsResult.data ?? []) as { amount: number; payroll_entry_id: string }[]) {
    const runId = runOfEntry.get(li.payroll_entry_id);
    const month = runId ? monthOfRun.get(runId) : undefined;
    if (!month) continue;
    otByMonth.set(month, (otByMonth.get(month) ?? 0) + (li.amount ?? 0));
  }
  const otSpendMonthly: MonthPoint[] = monthly.map((m) => ({
    month: m.month,
    label: m.label,
    value: Math.round(otByMonth.get(m.month) ?? 0),
  }));

  return {
    success: true,
    data: { kpis, monthly, costByDept, salaryBands, otSpendMonthly },
  };
}

// ---- Hiring ----

const HIRE_STAGE_ORDER: Record<string, number> = {
  applied: 0,
  screening: 1,
  shortlisted: 2,
  interview_1: 3,
  interview_2: 4,
  final_round: 5,
  offer: 6,
  hired: 7,
};

const HIRE_STAGE_LABELS: Record<string, string> = {
  applied: "Applied",
  screening: "Screening",
  shortlisted: "Shortlisted",
  interview_1: "Interview 1",
  interview_2: "Interview 2",
  final_round: "Final Round",
  offer: "Offer",
  hired: "Hired",
};

export type FunnelStage = {
  name: string;
  value: number;
  /** Conversion from the previous stage, 0–100. 100 for the first stage. */
  conversionPct: number;
};

export type SourceRow = { label: string; total: number; hired: number };

export type HiringInsights = {
  kpis: {
    openJobs: number;
    applications12m: number;
    hires12m: number;
    avgTimeToHireDays: number;
    offerAcceptancePct: number;
  };
  funnel: FunnelStage[];
  avgDaysInStage: NamedCount[];
  sources: SourceRow[];
  offerStatusDist: NamedCount[];
  loiDist: NamedCount[];
  rejectionByStage: NamedCount[];
};

/** Returns data:null when JambaHire isn't enabled for the org. */
export async function getHiringInsights(): Promise<ActionResult<HiringInsights | null>> {
  const access = await requireInsightsAccess();
  if (!access.ok) return { success: false, error: access.error };
  const { user } = access;
  if (!user.jambaHireEnabled) return { success: true, data: null };

  const supabase = createAdminSupabase();
  const orgId = user.orgId;
  const twelveMonthsAgo = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString();

  const [applicationsResult, transitionsResult, candidatesResult, offersResult, { count: openJobs }] =
    await Promise.all([
      supabase
        .from("applications")
        .select("id, stage, applied_at, candidate_id, loi_status")
        .eq("org_id", orgId),
      supabase
        .from("candidate_stage_transitions")
        .select("application_id, from_stage, to_stage, direction, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: true }),
      supabase.from("candidates").select("id, source").eq("org_id", orgId),
      supabase.from("offers").select("status").eq("org_id", orgId),
      supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("status", "active"),
    ]);

  type AppRow = {
    id: string;
    stage: string;
    applied_at: string;
    candidate_id: string;
    loi_status: string | null;
  };
  type TransitionRow = {
    application_id: string;
    from_stage: string | null;
    to_stage: string;
    direction: string;
    created_at: string;
  };
  const applications = (applicationsResult.data ?? []) as AppRow[];
  const transitions = (transitionsResult.data ?? []) as TransitionRow[];

  const transitionsByApp = new Map<string, TransitionRow[]>();
  for (const t of transitions) {
    const arr = transitionsByApp.get(t.application_id) ?? [];
    arr.push(t);
    transitionsByApp.set(t.application_id, arr);
  }

  // Funnel: an application "reached" stage S if its current stage or any
  // recorded to_stage is at/past S in the canonical order.
  const maxReached = new Map<string, number>();
  for (const a of applications) {
    let max = HIRE_STAGE_ORDER[a.stage] ?? 0;
    for (const t of transitionsByApp.get(a.id) ?? []) {
      const o = HIRE_STAGE_ORDER[t.to_stage];
      if (o !== undefined && o > max) max = o;
    }
    maxReached.set(a.id, max);
  }
  const stageKeys = Object.keys(HIRE_STAGE_ORDER);
  const funnel: FunnelStage[] = stageKeys.map((key, idx) => {
    const value = [...maxReached.values()].filter((m) => m >= idx).length;
    const prev = idx === 0 ? value : [...maxReached.values()].filter((m) => m >= idx - 1).length;
    return {
      name: HIRE_STAGE_LABELS[key],
      value,
      conversionPct: idx === 0 ? 100 : prev > 0 ? Math.round((value / prev) * 100) : 0,
    };
  });

  // Time-to-hire + time-in-stage
  const DAY_MS = 24 * 3600 * 1000;
  const hireDurations: number[] = [];
  const stageDurations = new Map<string, number[]>();
  for (const a of applications) {
    const ts = (transitionsByApp.get(a.id) ?? []).filter((t) => t.direction !== "initial");
    let prevAt = a.applied_at;
    let prevStage = "applied";
    for (const t of ts) {
      const days = (new Date(t.created_at).getTime() - new Date(prevAt).getTime()) / DAY_MS;
      if (days >= 0 && days < 365) {
        const arr = stageDurations.get(prevStage) ?? [];
        arr.push(days);
        stageDurations.set(prevStage, arr);
      }
      if (t.to_stage === "hired") {
        const total = (new Date(t.created_at).getTime() - new Date(a.applied_at).getTime()) / DAY_MS;
        if (total >= 0 && total < 730) hireDurations.push(total);
      }
      prevAt = t.created_at;
      prevStage = t.to_stage;
    }
  }
  const avgTimeToHireDays =
    hireDurations.length > 0
      ? Math.round((hireDurations.reduce((s, v) => s + v, 0) / hireDurations.length) * 10) / 10
      : 0;
  const avgDaysInStage: NamedCount[] = stageKeys
    .filter((k) => k !== "hired")
    .map((k) => {
      const arr = stageDurations.get(k) ?? [];
      return {
        name: HIRE_STAGE_LABELS[k],
        value:
          arr.length > 0
            ? Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10
            : 0,
      };
    });

  // Source effectiveness
  const sourceOfCandidate = new Map<string, string>(
    ((candidatesResult.data ?? []) as { id: string; source: string }[]).map((c) => [
      c.id,
      c.source || "other",
    ])
  );
  const sourceAgg = new Map<string, { total: number; hired: number }>();
  for (const a of applications) {
    const src = sourceOfCandidate.get(a.candidate_id) ?? "other";
    const agg = sourceAgg.get(src) ?? { total: 0, hired: 0 };
    agg.total += 1;
    if ((maxReached.get(a.id) ?? 0) >= HIRE_STAGE_ORDER.hired) agg.hired += 1;
    sourceAgg.set(src, agg);
  }
  const sources: SourceRow[] = [...sourceAgg.entries()]
    .map(([label, v]) => ({ label: label.charAt(0).toUpperCase() + label.slice(1), ...v }))
    .sort((a, b) => b.total - a.total);

  // Offers
  const offerCounts = new Map<string, number>();
  for (const o of (offersResult.data ?? []) as { status: string }[]) {
    offerCounts.set(o.status, (offerCounts.get(o.status) ?? 0) + 1);
  }
  const offerStatusDist: NamedCount[] = [...offerCounts.entries()]
    .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }))
    .sort((a, b) => b.value - a.value);
  const accepted = offerCounts.get("accepted") ?? 0;
  const declined = offerCounts.get("declined") ?? 0;
  const offerAcceptancePct =
    accepted + declined > 0 ? Math.round((accepted / (accepted + declined)) * 100) : 0;

  // LOI response distribution
  const loiCounts = new Map<string, number>();
  for (const a of applications) {
    if (!a.loi_status) continue;
    loiCounts.set(a.loi_status, (loiCounts.get(a.loi_status) ?? 0) + 1);
  }
  const loiDist: NamedCount[] = [...loiCounts.entries()]
    .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }))
    .sort((a, b) => b.value - a.value);

  // Rejections by the stage they happened from
  const rejCounts = new Map<string, number>();
  for (const t of transitions) {
    if (t.direction !== "reject" || !t.from_stage) continue;
    const label = HIRE_STAGE_LABELS[t.from_stage] ?? t.from_stage;
    rejCounts.set(label, (rejCounts.get(label) ?? 0) + 1);
  }
  const rejectionByStage: NamedCount[] = stageKeys
    .map((k) => ({ name: HIRE_STAGE_LABELS[k], value: rejCounts.get(HIRE_STAGE_LABELS[k]) ?? 0 }))
    .filter((r) => r.value > 0);

  const applications12m = applications.filter((a) => a.applied_at >= twelveMonthsAgo).length;
  const hires12m = transitions.filter(
    (t) => t.to_stage === "hired" && t.created_at >= twelveMonthsAgo
  ).length;

  return {
    success: true,
    data: {
      kpis: {
        openJobs: openJobs ?? 0,
        applications12m,
        hires12m,
        avgTimeToHireDays,
        offerAcceptancePct,
      },
      funnel,
      avgDaysInStage,
      sources,
      offerStatusDist,
      loiDist,
      rejectionByStage,
    },
  };
}

// ---- Performance & Training ----

export type RatingDistRow = { label: string; self: number; manager: number };

export type PerformanceTrainingInsights = {
  kpis: {
    avgManagerRating: number;
    ratingScale: number;
    reviewsCompletionPct: number;
    objectivesAchievementPct: number;
    trainingCompliancePct: number;
    overdueEnrollments: number;
  };
  latestCycleName: string | null;
  ratingDist: RatingDistRow[];
  objectivesByDept: NamedCount[];
  trainingByDept: NamedCount[];
  overdueByCourse: NamedCount[];
};

export async function getPerformanceTrainingInsights(): Promise<
  ActionResult<PerformanceTrainingInsights>
> {
  const access = await requireInsightsAccess();
  if (!access.ok) return { success: false, error: access.error };
  const { user } = access;
  const supabase = createAdminSupabase();
  const orgId = user.orgId;

  const [cyclesResult, reviewsResult, objectivesResult, enrollmentsResult, coursesResult, employeesResult, departmentsResult] =
    await Promise.all([
      supabase
        .from("review_cycles")
        .select("id, name, rating_scale, end_date")
        .eq("org_id", orgId)
        .order("end_date", { ascending: false }),
      supabase
        .from("reviews")
        .select("cycle_id, status, self_rating, manager_rating")
        .eq("org_id", orgId),
      supabase
        .from("objectives")
        .select("employee_id, status, items")
        .eq("org_id", orgId)
        .eq("status", "approved"),
      supabase
        .from("training_enrollments")
        .select("employee_id, course_id, status")
        .eq("org_id", orgId),
      supabase.from("training_courses").select("id, title").eq("org_id", orgId),
      supabase.from("employees").select("id, department_id").eq("org_id", orgId),
      supabase.from("departments").select("id, name").eq("org_id", orgId),
    ]);

  type ReviewRow = {
    cycle_id: string;
    status: string;
    self_rating: number | null;
    manager_rating: number | null;
  };
  const reviews = (reviewsResult.data ?? []) as ReviewRow[];
  const cycles = (cyclesResult.data ?? []) as {
    id: string;
    name: string;
    rating_scale: number | null;
  }[];

  // Latest cycle that actually has reviews
  const latestCycle = cycles.find((c) => reviews.some((r) => r.cycle_id === c.id)) ?? null;
  const cycleReviews = latestCycle ? reviews.filter((r) => r.cycle_id === latestCycle.id) : [];
  const ratingScale = latestCycle?.rating_scale ?? 5;

  const ratingDist: RatingDistRow[] = [];
  for (let n = 1; n <= ratingScale; n++) {
    ratingDist.push({
      label: String(n),
      self: cycleReviews.filter((r) => Math.round(r.self_rating ?? 0) === n).length,
      manager: cycleReviews.filter((r) => Math.round(r.manager_rating ?? 0) === n).length,
    });
  }
  const managerRatings = cycleReviews
    .map((r) => r.manager_rating)
    .filter((v): v is number => v !== null);
  const avgManagerRating =
    managerRatings.length > 0
      ? Math.round((managerRatings.reduce((s, v) => s + v, 0) / managerRatings.length) * 10) / 10
      : 0;
  const reviewsCompletionPct =
    cycleReviews.length > 0
      ? Math.round(
          (cycleReviews.filter((r) => r.status === "completed").length / cycleReviews.length) * 100
        )
      : 0;

  // Dept lookups
  const deptNames = new Map<string, string>(
    ((departmentsResult.data ?? []) as { id: string; name: string }[]).map((d) => [d.id, d.name])
  );
  const empDept = new Map<string, string | null>(
    ((employeesResult.data ?? []) as { id: string; department_id: string | null }[]).map((e) => [
      e.id,
      e.department_id,
    ])
  );
  const deptOf = (employeeId: string): string => {
    const id = empDept.get(employeeId);
    return id ? deptNames.get(id) ?? "Unknown" : "Unassigned";
  };

  // Objectives achievement (items JSONB: count self_status === 'achieved')
  let objAchieved = 0;
  let objTotal = 0;
  const objByDept = new Map<string, { achieved: number; total: number }>();
  for (const o of (objectivesResult.data ?? []) as { employee_id: string; items: unknown }[]) {
    const items = Array.isArray(o.items) ? (o.items as { self_status?: string }[]) : [];
    if (items.length === 0) continue;
    const achieved = items.filter((i) => i.self_status === "achieved").length;
    objAchieved += achieved;
    objTotal += items.length;
    const dept = deptOf(o.employee_id);
    const agg = objByDept.get(dept) ?? { achieved: 0, total: 0 };
    agg.achieved += achieved;
    agg.total += items.length;
    objByDept.set(dept, agg);
  }
  const objectivesAchievementPct = objTotal > 0 ? Math.round((objAchieved / objTotal) * 100) : 0;
  const objectivesByDept: NamedCount[] = [...objByDept.entries()]
    .map(([name, v]) => ({
      name,
      value: v.total > 0 ? Math.round((v.achieved / v.total) * 100) : 0,
    }))
    .sort((a, b) => b.value - a.value);

  // Training compliance by department + overdue by course
  type EnrollmentRow = { employee_id: string; course_id: string; status: string };
  const enrollments = (enrollmentsResult.data ?? []) as EnrollmentRow[];
  const trainByDept = new Map<string, { completed: number; total: number }>();
  for (const e of enrollments) {
    const dept = deptOf(e.employee_id);
    const agg = trainByDept.get(dept) ?? { completed: 0, total: 0 };
    agg.total += 1;
    if (e.status === "completed") agg.completed += 1;
    trainByDept.set(dept, agg);
  }
  const trainingByDept: NamedCount[] = [...trainByDept.entries()]
    .map(([name, v]) => ({
      name,
      value: v.total > 0 ? Math.round((v.completed / v.total) * 100) : 0,
    }))
    .sort((a, b) => b.value - a.value);
  const trainingCompliancePct =
    enrollments.length > 0
      ? Math.round(
          (enrollments.filter((e) => e.status === "completed").length / enrollments.length) * 100
        )
      : 0;

  const courseTitles = new Map<string, string>(
    ((coursesResult.data ?? []) as { id: string; title: string }[]).map((c) => [c.id, c.title])
  );
  const overdueByCourseMap = new Map<string, number>();
  let overdueEnrollments = 0;
  for (const e of enrollments) {
    if (e.status !== "overdue") continue;
    overdueEnrollments += 1;
    const title = courseTitles.get(e.course_id) ?? "Unknown course";
    overdueByCourseMap.set(title, (overdueByCourseMap.get(title) ?? 0) + 1);
  }
  const overdueByCourse: NamedCount[] = [...overdueByCourseMap.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  return {
    success: true,
    data: {
      kpis: {
        avgManagerRating,
        ratingScale,
        reviewsCompletionPct,
        objectivesAchievementPct,
        trainingCompliancePct,
        overdueEnrollments,
      },
      latestCycleName: latestCycle?.name ?? null,
      ratingDist,
      objectivesByDept,
      trainingByDept,
      overdueByCourse,
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
