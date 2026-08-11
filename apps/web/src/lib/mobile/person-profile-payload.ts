import type { MobilePersonProfile } from "@jambahr/shared";

/**
 * Pure shaper for the mobile admin/manager People mini-profile (Mobile PRD-02,
 * Phase D4, Task 6). No I/O, no salary/PAN/Aadhaar/bank fields — only what the
 * DTO in packages/shared/src/mobile/directory.ts declares.
 */

/** The `employees` row the route selects for the target, plus the resolved dept name. */
export type PersonProfileEmployeeRow = {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
  phone: string | null;
  personal_email: string | null;
  whatsapp_opt_in: boolean | null;
  departments?: { name: string | null } | null;
};

/** Today's `attendance_records` row for the target (or null — no punch today). */
export type PersonProfileAttendanceRow = {
  clock_in_at: string | null;
  clock_out_at: string | null;
} | null;

/** An org `leave_policies` row. */
export type PersonProfileLeavePolicyRow = {
  id: string;
  type: string;
  days_per_year: number;
};

/** One of the target's own `leave_requests` rows, reverse-chronological. */
export type PersonProfileLeaveRequestRow = {
  policy_id: string | null;
  leave_type: string | null;
  status: string;
  start_date: string;
  days: number;
};

/**
 * One of the target's own `leave_requests` rows, PRE-FILTERED server-side to
 * `status='approved'` + the current calendar year (mirrors the Home route's
 * query bounds — see route.ts). This is the complete set for the "used days"
 * sum, unlike the capped/any-status `PersonProfileLeaveRequestRow` list used
 * for recent requests.
 */
export type PersonProfileApprovedLeaveRow = {
  policy_id: string | null;
  days: number;
};

/** clocked_in when there's an open punch today; clocked_out once closed; null when no row exists. */
export function buildTodayAttendance(
  record: PersonProfileAttendanceRow,
): MobilePersonProfile["todayAttendance"] {
  if (!record || !record.clock_in_at) return null;
  return {
    status: record.clock_out_at ? "clocked_out" : "clocked_in",
    clockIn: record.clock_in_at,
    clockOut: record.clock_out_at ?? null,
  };
}

/**
 * Balances are DERIVED by aggregation (used = Σ approved days this calendar
 * year), mirroring the Home card (`leave_balances` table is stale — known web
 * bug, see gotcha #101's sibling note in home-payload.ts). `approvedLeaveRequests`
 * MUST be the full, unlimited, server-side-filtered (approved + current year)
 * set — NOT the capped/any-status recent-requests list. Summing over a
 * limit-30 "most recent" list under-counts used days for employees with more
 * than 30 leave_requests, which overstates remaining balance.
 */
export function buildLeaveBalance(
  policies: PersonProfileLeavePolicyRow[],
  approvedLeaveRequests: PersonProfileApprovedLeaveRow[],
): MobilePersonProfile["leaveBalance"] {
  const usedByPolicy: Record<string, number> = {};
  for (const r of approvedLeaveRequests) {
    if (!r.policy_id) continue;
    usedByPolicy[r.policy_id] = (usedByPolicy[r.policy_id] ?? 0) + Number(r.days);
  }
  return policies.map((p) => ({
    type: p.type,
    remaining: Math.max(0, Number(p.days_per_year) - (usedByPolicy[p.id] ?? 0)),
  }));
}

/** Most recent requests (any status), newest first. Caller passes rows already ordered desc. */
export function buildRecentRequests(
  leaveRequests: PersonProfileLeaveRequestRow[],
  limit = 5,
): MobilePersonProfile["recentRequests"] {
  return leaveRequests.slice(0, limit).map((r) => ({
    type: r.leave_type ?? "leave",
    status: r.status,
    when: r.start_date,
  }));
}

export function buildPersonProfile(input: {
  employee: PersonProfileEmployeeRow;
  todayRecord: PersonProfileAttendanceRow;
  policies: PersonProfileLeavePolicyRow[];
  /**
   * Target's own leave_requests, org-scoped, `status='approved'` +
   * current-calendar-year filtered SERVER-SIDE, unlimited — the complete set
   * the "used days" sum must run over.
   */
  approvedLeaveRequests: PersonProfileApprovedLeaveRow[];
  /** Target's own leave_requests, any status, reverse-chronological (created_at desc), capped at 30 — for the recent-requests list only. */
  recentLeaveRequests: PersonProfileLeaveRequestRow[];
}): MobilePersonProfile {
  const e = input.employee;
  return {
    id: e.id,
    name: `${e.first_name} ${e.last_name}`.trim(),
    role: e.role,
    department: e.departments?.name ?? null,
    phone: e.phone ?? null,
    personalEmail: e.personal_email ?? null,
    whatsappOptIn: !!e.whatsapp_opt_in,
    todayAttendance: buildTodayAttendance(input.todayRecord),
    leaveBalance: buildLeaveBalance(input.policies, input.approvedLeaveRequests),
    recentRequests: buildRecentRequests(input.recentLeaveRequests),
  };
}
