import type { MobileAttendanceReport, MobileLeaveReport } from "@jambahr/shared";

/**
 * Pure shapers for the mobile Owner/Admin Reports summaries (Mobile PRD-02,
 * Phase D4, Task 7). No I/O. Deliberately a FRESH, small org-scoped
 * aggregation rather than a reuse of `src/lib/reports/attendance-report.ts`'s
 * `buildReportData` — that module resolves week-off/holiday/leave state and
 * half-day thresholds per employee for the printable PDF matrix, which is
 * more than this lightweight mobile summary needs (present count + late
 * count per day, no per-employee breakdown). See task-7-report.md.
 */

/** One `attendance_records` row, narrowed to what the summary needs. */
export type ReportAttendanceRow = {
  date: string; // YYYY-MM-DD
  employee_id: string;
  is_late: boolean | null;
};

/**
 * `present` = distinct employees with an attendance_records row that date
 * (a row only exists once a clock-in has happened, so its mere presence
 * means "present" — no need to inspect clock_in_at). `late` = of those, how
 * many have `is_late`. `presentPct` = Σpresent / (activeEmployeeCount ×
 * days-in-range), rounded to 1 decimal; 0 when there are no active
 * employees or no days (avoids a NaN from division by zero).
 */
export function buildAttendanceReport(input: {
  from: string;
  to: string;
  /** Every date in [from, to] inclusive, YYYY-MM-DD — the caller enumerates this. */
  dates: string[];
  activeEmployeeCount: number;
  records: ReportAttendanceRow[];
}): MobileAttendanceReport {
  const presentByDate = new Map<string, Set<string>>();
  const lateByDate = new Map<string, number>();
  for (const d of input.dates) {
    presentByDate.set(d, new Set());
    lateByDate.set(d, 0);
  }

  let lateCount = 0;
  for (const r of input.records) {
    const set = presentByDate.get(r.date);
    if (set) set.add(r.employee_id);
    else continue; // defensive: a row outside the requested range is ignored
    if (r.is_late) {
      lateCount += 1;
      lateByDate.set(r.date, (lateByDate.get(r.date) ?? 0) + 1);
    }
  }

  const perDay = input.dates.map((date) => ({
    date,
    present: presentByDate.get(date)?.size ?? 0,
    late: lateByDate.get(date) ?? 0,
  }));

  const totalSlots = input.activeEmployeeCount * input.dates.length;
  const totalPresent = perDay.reduce((sum, d) => sum + d.present, 0);
  const presentPct = totalSlots > 0 ? Math.round((totalPresent / totalSlots) * 1000) / 10 : 0;

  return {
    range: { from: input.from, to: input.to },
    presentPct,
    lateCount,
    perDay,
  };
}

/** One `leave_requests` row, narrowed to what the summary needs (approved-only, caller pre-filters). */
export type ReportLeaveRow = {
  leave_type: string | null;
  days: number;
};

/**
 * Sums approved `leave_requests.days` by `leave_type` for whatever rows the
 * caller passes in (org-scoped, `status='approved'`, overlapping the range —
 * filtering happens server-side in the route). Not clipped to the exact
 * range boundaries — a request that starts before `from` or ends after `to`
 * still counts its FULL `days` value, mirroring the simplicity of the
 * existing aggregation idioms elsewhere in the mobile BFF (e.g. Home's
 * calendar-year leave-balance sum) rather than a per-day ledger.
 */
export function buildLeaveReport(input: {
  from: string;
  to: string;
  approvedLeaves: ReportLeaveRow[];
}): MobileLeaveReport {
  const byType = new Map<string, number>();
  let totalDays = 0;
  for (const r of input.approvedLeaves) {
    const type = r.leave_type ?? "other";
    const days = Number(r.days) || 0;
    byType.set(type, (byType.get(type) ?? 0) + days);
    totalDays += days;
  }

  return {
    range: { from: input.from, to: input.to },
    totalDays,
    byType: Array.from(byType.entries()).map(([type, days]) => ({ type, days })),
  };
}
