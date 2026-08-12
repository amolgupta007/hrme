import type { MobileAttendanceReport, MobileLeaveReport } from "@jambahr/shared";
import { useMobileQuery } from "@/lib/query";

const ATTENDANCE_PATH = "/api/mobile/reports/attendance";
const LEAVE_PATH = "/api/mobile/reports/leave";

/** Query key for the Owner/Admin attendance report over a date range. */
export function attendanceReportQueryKey(
  orgId: string | null | undefined,
  from: string,
  to: string
) {
  return ["mobile", "reports", "attendance", orgId, from, to] as const;
}

/** Query key for the Owner/Admin leave report over a date range. */
export function leaveReportQueryKey(
  orgId: string | null | undefined,
  from: string,
  to: string
) {
  return ["mobile", "reports", "leave", orgId, from, to] as const;
}

function rangeQuery(from: string, to: string) {
  return `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
}

/**
 * GET the org-wide attendance summary (present % / late count / per-day
 * breakdown) for `[from, to]`. Admin-only server-side; range capped at 92
 * days (mirrors web's `validateRange`) — the BFF 400s an out-of-range query.
 */
export function useAttendanceReport(
  orgId: string | null | undefined,
  from: string,
  to: string
) {
  return useMobileQuery<MobileAttendanceReport>(
    attendanceReportQueryKey(orgId, from, to),
    `${ATTENDANCE_PATH}${rangeQuery(from, to)}`,
    { orgId, enabled: !!orgId && !!from && !!to, staleTime: 30_000 }
  );
}

/**
 * GET the approved-leave-days summary, grouped by leave type, for
 * `[from, to]`. Admin-only server-side.
 */
export function useLeaveReport(
  orgId: string | null | undefined,
  from: string,
  to: string
) {
  return useMobileQuery<MobileLeaveReport>(
    leaveReportQueryKey(orgId, from, to),
    `${LEAVE_PATH}${rangeQuery(from, to)}`,
    { orgId, enabled: !!orgId && !!from && !!to, staleTime: 30_000 }
  );
}

/**
 * Convenience hook for the Reports screen: both range reports at once,
 * keyed off the same `[from, to]`.
 */
export function useReports(orgId: string | null | undefined, from: string, to: string) {
  const attendance = useAttendanceReport(orgId, from, to);
  const leave = useLeaveReport(orgId, from, to);
  return { attendance, leave };
}
