/**
 * Mobile BFF DTOs for the Owner/Admin Reports screen (Mobile PRD-02, Phase D4,
 * Task 7). Lightweight range summaries only — present % / late count / total
 * approved leave days. Deep analysis (per-employee punch detail, PDF/CSV,
 * week-off/holiday-aware day states) stays web-only at
 * /dashboard/attendance → Reports (`src/lib/reports/attendance-report.ts` +
 * `fetch-report-data.ts`). Admin-only; range capped at 92 days (mirrors the
 * web Reports tab's `validateRange`).
 *
 * Types only. Shaping lives web-side in
 * apps/web/src/lib/mobile/reports-payload.ts.
 */

/** Echoes the validated query range back, YYYY-MM-DD. */
export type MobileReportRange = { from: string; to: string };

/** One day's org-wide attendance in the requested range. */
export type MobileAttendanceReportDay = {
  date: string; // YYYY-MM-DD
  present: number; // distinct employees with an attendance_records row that day
  late: number; // of those, how many are_late
};

/**
 * GET /api/mobile/reports/attendance?from=&to= — org-wide attendance summary.
 * `presentPct` is Σpresent / (active employees × days in range), 1 decimal.
 * `lateCount` is the total late-marked rows across the whole range.
 */
export type MobileAttendanceReport = {
  range: MobileReportRange;
  presentPct: number;
  lateCount: number;
  perDay: MobileAttendanceReportDay[];
};

/** Approved leave days in the range for one leave type. */
export type MobileLeaveReportByType = { type: string; days: number };

/**
 * GET /api/mobile/reports/leave?from=&to= — approved leave summary over the
 * range, grouped by `leave_requests.leave_type`. `totalDays` is the raw sum
 * of `days` for every approved request overlapping the range (not clipped to
 * the range boundaries — a lightweight aggregate, not a per-day ledger).
 */
export type MobileLeaveReport = {
  range: MobileReportRange;
  totalDays: number;
  byType: MobileLeaveReportByType[];
};
