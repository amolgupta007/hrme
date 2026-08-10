/**
 * Pure month-calendar compute for the mobile attendance screen (Mobile Phase D,
 * Slice 1, Task 2). Merges attendance data with holidays, approved leaves, and
 * the employee's effective week-off policy into one per-day state per PRD-02A
 * decision 4. No DB, no I/O — see docs/prds/mobile/02A-PHASE-D-DECISIONS.md.
 *
 * Precedence (highest wins): holiday > leave > week-off > attendance-derived
 * (present/half_day) > absent (past working day, no record) > future.
 * `no_data` is the distinct case of *today* having no record yet (neither a
 * judgment of absence nor a not-yet-arrived future day).
 */
import { isWeekOff, type WeekOffPolicy } from "./week-off";

export type MonthDayState =
  | "present"
  | "half_day"
  | "absent"
  | "week_off"
  | "holiday"
  | "leave"
  | "future"
  | "no_data";

export type MonthDay = {
  date: string; // YYYY-MM-DD (IST)
  state: MonthDayState;
  /** Worked minutes for the day; only meaningful for present/half_day. */
  minutes?: number | null;
  isToday: boolean;
};

/**
 * Minimal per-day attendance shape the caller (Task 3's BFF endpoint) adapts
 * DB rows into. Presence of an entry for a date means "attendance data exists
 * for that date" — `minutes` may still be null (e.g. an incomplete single-punch
 * day); `half_day_threshold_minutes` is only present when the day's shift is
 * known, per the half-day rule below.
 */
export type DailyRecordLite = {
  date: string; // YYYY-MM-DD (IST attendance day)
  /** Worked minutes for the day; null when no completed in/out pair exists. */
  minutes: number | null;
  /** From the day's assigned shift, when known. Omitted/null → skip half-day classification. */
  half_day_threshold_minutes?: number | null;
};

export type HolidayLite = {
  date: string; // YYYY-MM-DD
  is_optional: boolean;
  name: string;
};

export type ApprovedLeaveLite = {
  start_date: string; // YYYY-MM-DD, inclusive
  end_date: string; // YYYY-MM-DD, inclusive
  days: number;
  type: string;
};

export type ComputeMonthCalendarInput = {
  year: number;
  month: number; // 1-12
  records: DailyRecordLite[];
  holidays: HolidayLite[];
  approvedLeaves: ApprovedLeaveLite[];
  weekOff: WeekOffPolicy;
  todayIst: string; // YYYY-MM-DD
};

function daysInMonth(year: number, month: number): number {
  // month is 1-based; Date.UTC's month index for "the following month" at day 0
  // rolls back to the last day of the target month.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isWithinLeave(date: string, leave: ApprovedLeaveLite): boolean {
  return date >= leave.start_date && date <= leave.end_date;
}

export function computeMonthCalendar(input: ComputeMonthCalendarInput): MonthDay[] {
  const { year, month, records, holidays, approvedLeaves, weekOff, todayIst } = input;

  const recordsByDate = new Map(records.map((r) => [r.date, r]));
  const holidayDates = new Set(holidays.map((h) => h.date));

  const total = daysInMonth(year, month);
  const out: MonthDay[] = [];

  for (let day = 1; day <= total; day++) {
    const date = `${year}-${pad2(month)}-${pad2(day)}`;
    const isToday = date === todayIst;

    if (holidayDates.has(date)) {
      out.push({ date, state: "holiday", isToday });
      continue;
    }

    if (approvedLeaves.some((l) => isWithinLeave(date, l))) {
      out.push({ date, state: "leave", isToday });
      continue;
    }

    if (isWeekOff(date, weekOff)) {
      out.push({ date, state: "week_off", isToday });
      continue;
    }

    const record = recordsByDate.get(date);
    if (record) {
      const { minutes, half_day_threshold_minutes: threshold } = record;
      const isHalfDay = minutes != null && threshold != null && minutes < threshold;
      out.push({ date, state: isHalfDay ? "half_day" : "present", minutes, isToday });
      continue;
    }

    if (date < todayIst) {
      out.push({ date, state: "absent", isToday });
    } else if (date === todayIst) {
      out.push({ date, state: "no_data", isToday });
    } else {
      out.push({ date, state: "future", isToday });
    }
  }

  return out;
}
