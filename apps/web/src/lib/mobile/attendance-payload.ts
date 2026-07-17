import {
  computeMonthCalendar,
  pairPunches,
  type ApprovedLeaveLite,
  type DailyRecordLite,
  type HolidayLite,
  type MobileAttendanceDayDetail,
  type MobileAttendanceMonthResponse,
  type WeekOffPolicy,
} from "@jambahr/shared";

/** An `attendance_records` row joined with its shift's half-day threshold. */
export type AttendanceRecordRow = {
  date: string; // YYYY-MM-DD (IST attendance day)
  clock_in_at: string | null;
  clock_out_at: string | null;
  worked_minutes: number | null;
  total_minutes: number | null;
  source: string | null;
  auto_closed: boolean | null;
  out_of_zone_count: number | null;
  /** From the record's assigned shift (join). Null → skip half-day classification. */
  half_day_threshold_minutes: number | null;
};

/** A raw `attendance_punch_events` row, grouped by IST attendance day. */
export type PunchEventRow = {
  punched_at: string; // ISO 8601 (UTC)
  status: string | null;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Build one day's punch detail for the calendar tap-through. Prefers the raw
 * punch-event stream (`pairPunches`), falling back to the record's single
 * clock_in/out pair when no events exist for that day.
 */
function buildDayDetail(
  record: AttendanceRecordRow,
  events: PunchEventRow[] | undefined,
): MobileAttendanceDayDetail {
  const approved = (events ?? []).filter((e) => (e.status ?? "approved") === "approved");

  let pairs: { in: string | null; out: string | null }[];
  if (approved.length > 0) {
    const paired = pairPunches(
      approved.map((e, i) => ({ id: `${record.date}-${i}`, punched_at: e.punched_at })),
    );
    pairs = paired.intervals.map((iv) => ({ in: iv.inAt, out: iv.outAt }));
    if (paired.danglingInAt) pairs.push({ in: paired.danglingInAt, out: null });
  } else {
    pairs = [{ in: record.clock_in_at, out: record.clock_out_at }];
  }

  return {
    date: record.date,
    pairs,
    source: record.source ?? null,
    autoClosed: !!record.auto_closed,
    outOfZoneCount: record.out_of_zone_count ?? 0,
  };
}

/**
 * Compose the mobile month-calendar response: per-day states via the pure
 * `computeMonthCalendar` (Task 2) plus per-day punch detail for tap-through.
 */
export function buildAttendanceMonthPayload(input: {
  year: number;
  month: number; // 1-12
  records: AttendanceRecordRow[];
  punchEventsByDate: Record<string, PunchEventRow[]>;
  holidays: HolidayLite[];
  approvedLeaves: ApprovedLeaveLite[];
  weekOff: WeekOffPolicy;
  todayIst: string;
}): MobileAttendanceMonthResponse {
  const recordsLite: DailyRecordLite[] = input.records.map((r) => ({
    date: r.date,
    // Half-day classification uses net worked minutes; fall back to gross span.
    minutes: r.worked_minutes ?? r.total_minutes ?? null,
    half_day_threshold_minutes: r.half_day_threshold_minutes ?? null,
  }));

  const days = computeMonthCalendar({
    year: input.year,
    month: input.month,
    records: recordsLite,
    holidays: input.holidays,
    approvedLeaves: input.approvedLeaves,
    weekOff: input.weekOff,
    todayIst: input.todayIst,
  });

  const details = input.records.map((r) =>
    buildDayDetail(r, input.punchEventsByDate[r.date]),
  );

  return {
    month: `${input.year}-${pad2(input.month)}`,
    days,
    details,
  };
}
