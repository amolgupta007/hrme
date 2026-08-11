import type {
  MobileHomeResponse,
  MobileHolidayLite,
  MobileLeaveBalance,
  MobileTodayStatus,
  MobileAnnouncementLite,
} from "@jambahr/shared";

/** The subset of an `attendance_records` row the today card needs. */
export type TodayRecordLite = {
  clock_in_at: string | null;
  clock_out_at: string | null;
  total_minutes: number | null;
} | null;

/** The subset of the employee's active shift the today card shows. */
export type ShiftLite = {
  name: string;
  start_time: string;
  end_time: string;
} | null;

/**
 * Derive the live today-status from the day's rollup record + the resolved
 * shift. Shared by the Home card and the punch response (identical shape).
 */
export function buildTodayStatus(record: TodayRecordLite, shift: ShiftLite): MobileTodayStatus {
  const clockInAt = record?.clock_in_at ?? null;
  const clockOutAt = record?.clock_out_at ?? null;
  return {
    isClockedIn: !!clockInAt && !clockOutAt,
    clockInAt,
    clockOutAt,
    minutesToday: record?.total_minutes ?? null,
    shift: shift ? { name: shift.name, start: shift.start_time, end: shift.end_time } : null,
  };
}

/** A leave policy with the caller's own current-year approved usage folded in. */
export type LeavePolicyUsage = {
  id: string;
  name: string;
  type: string;
  days_per_year: number;
  used: number;
};

/**
 * Balances are DERIVED by aggregation (used = Σ approved days this year) — the
 * `leave_balances` table is stale/unwritten (known web bug). Mirrors the
 * `listLeavePolicies` idiom (leaves.ts, commit 078224c).
 */
export function buildLeaveBalances(policies: LeavePolicyUsage[]): MobileLeaveBalance[] {
  return policies.map((p) => ({
    policyId: p.id,
    name: p.name,
    type: p.type,
    total: p.days_per_year,
    used: p.used,
    remaining: Math.max(0, p.days_per_year - p.used),
  }));
}

/** The subset of an `announcements` row the Home card needs. */
export type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  category: string | null;
  created_at: string;
};

/**
 * Shape ≤3 latest org announcements for the Home card (2a design). Caller is
 * expected to have already queried pinned-first/newest-first and limited to
 * 3 — this just maps the DB row shape to the wire DTO (kept as a pure
 * function so it's covered without hitting Supabase).
 */
export function buildAnnouncements(rows: AnnouncementRow[]): MobileAnnouncementLite[] {
  return rows.slice(0, 3).map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    category: r.category ?? null,
    createdAt: r.created_at,
  }));
}

/**
 * The "to approve" stat cell is manager-only (2a design: center stat only
 * renders for managers/admins). Returns `null` for employees so the client
 * hides the cell instead of showing a permanently-zero count.
 */
export function resolvePendingApprovals(
  isManagerOrAbove: boolean,
  rawCount: number,
): number | null {
  return isManagerOrAbove ? rawCount : null;
}

export function buildHomePayload(input: {
  record: TodayRecordLite;
  shift: ShiftLite;
  policies: LeavePolicyUsage[];
  holidays: MobileHolidayLite[];
  pendingLeaveRequests: number;
  pendingRegularizations: number;
  pendingApprovals: number | null;
  trainingsOverdue: number;
  announcements: AnnouncementRow[];
  unreadNotifications: number;
  adminHome?: MobileHomeResponse["adminHome"];
}): MobileHomeResponse {
  return {
    today: buildTodayStatus(input.record, input.shift),
    leave: { balances: buildLeaveBalances(input.policies) },
    nextHolidays: input.holidays.slice(0, 3),
    pending: {
      leaveRequests: input.pendingLeaveRequests,
      regularizations: input.pendingRegularizations,
    },
    pendingApprovals: input.pendingApprovals,
    trainingsOverdue: input.trainingsOverdue,
    announcements: buildAnnouncements(input.announcements),
    unreadNotifications: input.unreadNotifications,
    adminHome: input.adminHome,
  };
}

// ─────────────────────────── Admin Home block (Task 5) ────────────────────────

/** The subset of a today `attendance_records` row the admin block's counts need. */
export type AdminHomeTodayRecord = {
  clock_in_at: string | null;
  is_late: boolean | null;
};

/**
 * Present = has a clock-in today; absent = active headcount minus present
 * (never negative — a stale/over-counted `totalActive` can't go below 0);
 * late = rows flagged `is_late` (0 for orgs with the late-policy module off,
 * since the column is never written — not an error, just an honest 0).
 */
export function computeAdminHomeToday(
  totalActive: number,
  records: AdminHomeTodayRecord[],
): { present: number; absent: number; late: number } {
  const present = records.filter((r) => !!r.clock_in_at).length;
  const late = records.filter((r) => !!r.is_late).length;
  return { present, absent: Math.max(0, totalActive - present), late };
}

export type AdminHomePayrollRun = { month: string; status: string } | null;

/**
 * Maps the org's current-cycle `payroll_runs` row to the Home payroll
 * status. `hasPendingApproval` (Task-3 payroll-approvals count > 0, admin
 * only) wins over the run's own `status` column — a `processed` run sitting
 * in a disbursement batch `awaiting_approval` should read as
 * "awaiting_approval" on Home, not "processing". No run this month → `none`.
 */
export function resolveAdminHomePayrollStatus(
  run: AdminHomePayrollRun,
  hasPendingApproval: boolean,
): NonNullable<MobileHomeResponse["adminHome"]>["payroll"] {
  if (!run) return { status: "none" };
  if (hasPendingApproval) return { status: "awaiting_approval", month: run.month };
  const status = run.status === "draft" ? "draft" : run.status === "paid" ? "paid" : "processing";
  return { status, month: run.month };
}

/**
 * Pure assembler for the `adminHome` block — mirrors `buildHomePayload`'s
 * data-in/DTO-out shape so it's covered without hitting Supabase. The route
 * fetches the raw inputs (org-wide today rows, active headcount, the 4
 * Task-3 approval counts, the current-month payroll run) and wraps THIS call
 * in a try/catch: any upstream throw never reaches here, so the whole
 * `adminHome` block is dropped by the caller instead of partially built.
 */
export function buildAdminHomeBlock(input: {
  totalActive: number;
  todayRecords: AdminHomeTodayRecord[];
  pendingByType: { leave: number; regularization: number; ot: number; payroll: number };
  payrollFeatureEnabled: boolean;
  payrollRun: AdminHomePayrollRun;
}): NonNullable<MobileHomeResponse["adminHome"]> {
  const { leave, regularization, ot, payroll } = input.pendingByType;
  return {
    today: computeAdminHomeToday(input.totalActive, input.todayRecords),
    pendingApprovals: {
      total: leave + regularization + ot + payroll,
      byType: input.pendingByType,
    },
    payroll: input.payrollFeatureEnabled
      ? resolveAdminHomePayrollStatus(input.payrollRun, payroll > 0)
      : null,
  };
}
