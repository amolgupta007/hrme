import type {
  MobileHomeResponse,
  MobileHolidayLite,
  MobileLeaveBalance,
  MobileTodayStatus,
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

export function buildHomePayload(input: {
  record: TodayRecordLite;
  shift: ShiftLite;
  policies: LeavePolicyUsage[];
  holidays: MobileHolidayLite[];
  pendingLeaveRequests: number;
  pendingRegularizations: number;
}): MobileHomeResponse {
  return {
    today: buildTodayStatus(input.record, input.shift),
    leave: { balances: buildLeaveBalances(input.policies) },
    nextHolidays: input.holidays.slice(0, 3),
    pending: {
      leaveRequests: input.pendingLeaveRequests,
      regularizations: input.pendingRegularizations,
    },
  };
}
