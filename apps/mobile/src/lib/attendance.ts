import { istToday } from "@jambahr/shared/attendance/ist";

/**
 * Single source of truth for the attendance month query key. The Attendance
 * screen (`useMobileQuery`) and the punch success paths (`use-punch.ts`) must
 * key on exactly this so a fresh punch can invalidate the current month's
 * calendar. Includes `orgId` (BFF is org-scoped for multi-org users) AND the
 * `YYYY-MM` month so each month caches independently — see the `useMobileQuery`
 * contract note.
 */
export function attendanceMonthQueryKey(
  orgId: string | null | undefined,
  month: string
) {
  return ["mobile", "attendance", orgId, month] as const;
}

/** Current IST calendar month as `YYYY-MM`. `nowMs` overridable for tests. */
export function currentIstMonth(nowMs?: number): string {
  return istToday(nowMs).slice(0, 7);
}
