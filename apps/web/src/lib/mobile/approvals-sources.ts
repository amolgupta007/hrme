// Mobile BFF: per-type fetch + normalize for the unified Approvals inbox
// (`GET /api/mobile/approvals`). Plain module (NOT "use server") — each
// exported fetcher takes an already-created admin Supabase client + the
// caller's resolved `UserContext` and returns already-normalized
// `MobileApprovalItem[]`. Every fetcher is wrapped in try/catch and resolves
// to `[]` on any failure so one broken source can never blank the whole
// inbox (mirrors the audit-write-swallow precedent, gotcha #52).
//
// Scope rule (mirrors `apps/web/src/app/api/mobile/leave/approvals/route.ts`):
// admins see the whole org (minus their own pending items — you don't
// approve your own request); managers see `getManagerScopedEmployeeIds`
// (self excluded); employees see nothing. Payroll is admin-only and further
// gated on the org having RazorpayX configured.
import { isAdmin, isManagerOrAbove, type UserContext } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getManagerScopedEmployeeIds } from "@/lib/attendance/manager-scope";
import { computeRemainingDays } from "@/lib/leaves/validation";
import { computeHourlyRate } from "@/lib/attendance/ot";
import type { MobileApprovalItem } from "@jambahr/shared";

type Sb = ReturnType<typeof createAdminSupabase>;

/** `Rs 8,40,000` — Indian digit grouping, no decimals (rupee amounts only). */
function formatINR(rupees: number): string {
  return `Rs ${Math.round(rupees).toLocaleString("en-IN")}`;
}

/** IST calendar date + HH:MM of a UTC ISO instant. */
function istParts(iso: string): { date: string; time: string } {
  const d = new Date(new Date(iso).getTime() + 5.5 * 3600 * 1000);
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) };
}

/**
 * Resolves the employee-id scope a leave/regularization/OT fetcher should
 * query. Returns `null` when the caller shouldn't see anything (not
 * manager+, or a manager scoped to nobody but themselves). `scopeIds: null`
 * inside the result means org-wide (admin) — still self-excluded by the
 * caller via `.neq`.
 */
async function resolveScope(
  user: UserContext,
): Promise<{ scopeIds: string[] | null } | null> {
  if (!isManagerOrAbove(user.role)) return null;
  if (isAdmin(user.role)) return { scopeIds: null };
  if (!user.employeeId) return null;
  const scoped = (await getManagerScopedEmployeeIds(user.orgId, user.employeeId)).filter(
    (id) => id !== user.employeeId,
  );
  if (scoped.length === 0) return null;
  return { scopeIds: scoped };
}

/** Pending leave requests in scope. `impact = "balance <before>→<after>"`. */
export async function fetchLeaveApprovals(sb: Sb, user: UserContext): Promise<MobileApprovalItem[]> {
  try {
    const scope = await resolveScope(user);
    if (!scope) return [];
    const me = user.employeeId;

    let pendingQ = sb
      .from("leave_requests")
      .select(
        "id, employee_id, policy_id, start_date, end_date, days, created_at, leave_policies(name, days_per_year), employees!employee_id(first_name, last_name)",
      )
      .eq("org_id", user.orgId)
      .eq("status", "pending");
    if (scope.scopeIds) pendingQ = pendingQ.in("employee_id", scope.scopeIds);
    else if (me) pendingQ = pendingQ.neq("employee_id", me);
    const { data: pendingRows, error } = await pendingQ;
    if (error) return [];
    const pending = (pendingRows as any[]) ?? [];
    if (pending.length === 0) return [];

    // This-year approved usage per (employee, policy) — same aggregation as
    // the D2 leave-approvals route (fetch in scope, filter to the current
    // calendar year in JS).
    let approvedQ = sb
      .from("leave_requests")
      .select("employee_id, policy_id, days, start_date, end_date")
      .eq("org_id", user.orgId)
      .eq("status", "approved");
    if (scope.scopeIds) approvedQ = approvedQ.in("employee_id", scope.scopeIds);
    else if (me) approvedQ = approvedQ.neq("employee_id", me);
    const { data: approvedRows } = await approvedQ;
    const currentYear = new Date().getFullYear();
    const yearStart = `${currentYear}-01-01`;
    const yearEnd = `${currentYear}-12-31`;
    const approvedList = ((approvedRows as any[]) ?? []).filter(
      (a) => a.start_date >= yearStart && a.end_date <= yearEnd,
    );

    return pending.map((r) => {
      const usedApproved = approvedList
        .filter((a) => a.employee_id === r.employee_id && a.policy_id === r.policy_id)
        .reduce((s, a) => s + Number(a.days), 0);
      const daysPerYear = Number(r.leave_policies?.days_per_year ?? 0);
      const remainingBefore = computeRemainingDays({ daysPerYear, usedApproved });
      const days = Number(r.days);
      const balanceAfter = remainingBefore - days;
      const who = `${r.employees?.first_name ?? ""} ${r.employees?.last_name ?? ""}`.trim();
      return {
        id: r.id,
        type: "leave",
        who,
        what: r.leave_policies?.name ?? "Leave",
        when: r.created_at,
        impact: `balance ${remainingBefore}→${balanceAfter}`,
        meta: { days },
      };
    });
  } catch {
    return [];
  }
}

/** Pending manual punches (`attendance_punch_events`) in scope. */
export async function fetchRegularizationApprovals(
  sb: Sb,
  user: UserContext,
): Promise<MobileApprovalItem[]> {
  try {
    const scope = await resolveScope(user);
    if (!scope) return [];
    const me = user.employeeId;

    let q = sb
      .from("attendance_punch_events")
      .select("id, employee_id, punched_at, punch_type, created_at, employees!employee_id(first_name, last_name)")
      .eq("org_id", user.orgId)
      .eq("status", "pending");
    if (scope.scopeIds) q = q.in("employee_id", scope.scopeIds);
    else if (me) q = q.neq("employee_id", me);
    const { data, error } = await q;
    if (error) return [];

    return ((data as any[]) ?? []).map((r) => {
      const who = `${r.employees?.first_name ?? ""} ${r.employees?.last_name ?? ""}`.trim();
      const { date, time } = istParts(r.punched_at);
      const punchType = r.punch_type ?? "in";
      return {
        id: r.id,
        type: "regularization",
        who,
        what: "Manual punch",
        when: r.created_at,
        impact: `${punchType} ${time} ${date}`,
        meta: { punchAt: r.punched_at },
      };
    });
  } catch {
    return [];
  }
}

/**
 * Estimates an OT record's payout in rupees using the SAME formula
 * `pushOvertimeToPayroll` uses at push time (`src/actions/overtime.ts`):
 * hourly rate (paise) = `computeHourlyRate(gross_monthly, working_days,
 * shift.total_hours)`, then `amount = minutes/60 × hourlyRate × multiplier`.
 * `ot_records.amount`/`hourly_rate` are only populated once a record is
 * `pushed` (both stored in paise, migration `038_ot_records.sql`) — for the
 * `pending` rows this inbox shows they're always null, so the estimate is
 * computed at read time instead. Returns `null` (never throws) when the
 * salary structure or a usable working-days figure isn't available; the
 * caller renders that as "Rs --".
 */
function estimateOtAmountRupees(
  r: { ot_minutes: number; multiplier?: number | null; shifts?: { total_hours?: number | null } | null },
  grossMonthly: number | undefined,
  workingDays: number,
): number | null {
  if (!grossMonthly || grossMonthly <= 0 || workingDays <= 0) return null;
  const shiftHours = r.shifts?.total_hours ? Number(r.shifts.total_hours) : 8;
  if (shiftHours <= 0) return null;
  const multiplier = Number(r.multiplier ?? 1.5);
  const hourlyRatePaise = computeHourlyRate(grossMonthly, workingDays, shiftHours);
  const amountPaise = Math.round((Number(r.ot_minutes ?? 0) / 60) * hourlyRatePaise * multiplier);
  return Math.round(amountPaise / 100);
}

/** Pending `ot_records` in scope. Empty when the org's OT master toggle is off. */
export async function fetchOtApprovals(sb: Sb, user: UserContext): Promise<MobileApprovalItem[]> {
  try {
    const scope = await resolveScope(user);
    if (!scope) return [];

    const { data: orgRow } = await sb
      .from("organizations")
      .select("settings")
      .eq("id", user.orgId)
      .single();
    const otEnabled = (orgRow as any)?.settings?.attendance?.overtime?.enabled === true;
    if (!otEnabled) return [];

    const me = user.employeeId;
    let q = sb
      .from("ot_records")
      .select(
        "id, employee_id, ot_minutes, amount, multiplier, date, created_at, employees!employee_id(first_name, last_name), shifts(total_hours)",
      )
      .eq("org_id", user.orgId)
      .eq("status", "pending");
    if (scope.scopeIds) q = q.in("employee_id", scope.scopeIds);
    else if (me) q = q.neq("employee_id", me);
    const { data, error } = await q;
    if (error) return [];
    const rows = (data as any[]) ?? [];
    if (rows.length === 0) return [];

    // Same inputs `pushOvertimeToPayroll` uses: gross_monthly per employee,
    // working_days per month (from that month's payroll run, if it exists).
    const employeeIds = Array.from(new Set(rows.map((r) => r.employee_id)));
    const { data: salaries } = await sb
      .from("salary_structures")
      .select("employee_id, gross_monthly")
      .eq("org_id", user.orgId)
      .in("employee_id", employeeIds);
    const grossByEmp = new Map<string, number>();
    for (const s of (salaries as any[]) ?? []) grossByEmp.set(s.employee_id, Number(s.gross_monthly));

    const months = Array.from(new Set(rows.map((r) => String(r.date).slice(0, 7))));
    const { data: runs } = await sb
      .from("payroll_runs")
      .select("month, working_days")
      .eq("org_id", user.orgId)
      .in("month", months);
    const workingDaysByMonth = new Map<string, number>();
    for (const run of (runs as any[]) ?? []) workingDaysByMonth.set(run.month, Number(run.working_days));

    return rows.map((r) => {
      const who = `${r.employees?.first_name ?? ""} ${r.employees?.last_name ?? ""}`.trim();
      const hours = (Number(r.ot_minutes ?? 0) / 60).toFixed(1);

      // Already pushed (shouldn't reach a `pending`-filtered query, but be
      // safe) — `ot_records.amount` is stored in paise.
      const amountRupees =
        r.amount != null
          ? Math.round(Number(r.amount) / 100)
          : estimateOtAmountRupees(
              r,
              grossByEmp.get(r.employee_id),
              workingDaysByMonth.get(String(r.date).slice(0, 7)) ?? 26,
            );

      return {
        id: r.id,
        type: "ot",
        who,
        what: "Overtime",
        when: r.created_at,
        impact: `${hours}h · ${amountRupees != null ? formatINR(amountRupees) : "Rs --"}`,
        meta: { minutes: r.ot_minutes },
      };
    });
  } catch {
    return [];
  }
}

/**
 * Disbursement batches in `awaiting_approval` for the org. Admin-only AND
 * only when RazorpayX is configured (manual "Mark Paid" orgs surface
 * nothing). Caller (`route.ts`) already gates on `isAdmin` before invoking
 * this — re-checked here defensively.
 */
export async function fetchPayrollApprovals(sb: Sb, user: UserContext): Promise<MobileApprovalItem[]> {
  try {
    if (!isAdmin(user.role)) return [];

    const { data: creds } = await sb
      .from("razorpayx_credentials")
      .select("id")
      .eq("org_id", user.orgId)
      .maybeSingle();
    if (!creds) return [];

    const { data: batches, error } = await sb
      .from("disbursement_batches")
      .select("id, total_amount, initiated_at, created_at, payroll_runs!payroll_run_id(month)")
      .eq("org_id", user.orgId)
      .eq("status", "awaiting_approval");
    if (error) return [];
    const rows = (batches as any[]) ?? [];
    if (rows.length === 0) return [];

    const items: MobileApprovalItem[] = [];
    for (const b of rows) {
      const { data: batchItems } = await sb
        .from("disbursement_items")
        .select("status")
        .eq("batch_id", b.id)
        .eq("org_id", user.orgId);
      const its = (batchItems as any[]) ?? [];
      const headcount = its.length;
      const exceptions = its.filter((i) => i.status !== "pending").length;
      const month = b.payroll_runs?.month ?? "";
      const totalRupees = Number(b.total_amount ?? 0);

      items.push({
        id: b.id,
        type: "payroll",
        who: `Payroll ${month}`,
        what: "Payroll disbursement",
        when: b.initiated_at ?? b.created_at,
        impact: `${headcount} staff · ${formatINR(totalRupees)}`,
        meta: { headcount, totalPaise: Math.round(totalRupees * 100), exceptions },
      });
    }
    return items;
  } catch {
    return [];
  }
}
