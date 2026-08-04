// Pure helpers for employee self-schedule resolution (plain module — no
// "use server", no DB). Shared by the roster/clock-in resolution path
// (`getActiveShiftForEmployee`) and the employee self-view (`getMySchedule`).

import { isWeekOff, type WeekOffPolicy } from "@/lib/attendance/week-off";

export type ResolvableAssignment = {
  date_from: string;
  date_to: string | null;
};

/**
 * Phase-1 shift-assignment resolution: among an employee's assignments, pick the
 * one that covers `date` — `date_from <= date` AND (`date_to` is null OR
 * `date_to >= date`) — preferring the latest `date_from`. Single-day cell
 * assignments carry `date_from = date_to`, so a same-day cell wins over an older
 * ongoing range. Mirrors `getActiveShiftForEmployee`'s ordered-desc +
 * first-covering-match semantics (dates are ISO `YYYY-MM-DD`, string-comparable).
 * Ties on `date_from` keep the first assignment in input order (stable).
 */
export function resolveAssignmentForDate<T extends ResolvableAssignment>(
  assignments: T[],
  date: string
): T | null {
  let best: T | null = null;
  for (const a of assignments) {
    if (a.date_from <= date && (!a.date_to || a.date_to >= date)) {
      if (!best || a.date_from > best.date_from) best = a;
    }
  }
  return best;
}

export type MyScheduleDay = {
  date: string; // YYYY-MM-DD (IST calendar date)
  weekday: string; // short label, e.g. "Mon"
  shiftName: string | null;
  startTime: string | null;
  endTime: string | null;
  isWeekOff: boolean;
  isHoliday: boolean;
  holidayName: string | null;
};

type ScheduleAssignmentShift = {
  shifts?: { name: string; start_time: string; end_time: string } | null;
} | null;

/**
 * Pure per-day projection used by `getMySchedule`. Combines the resolved shift
 * assignment, the employee's effective week-off policy and any holiday name into
 * one flat row. Keeps flag-combination logic testable without a DB.
 */
export function computeScheduleDay(input: {
  date: string;
  assignment: ScheduleAssignmentShift;
  effectivePolicy: WeekOffPolicy;
  holidayName: string | null;
}): MyScheduleDay {
  const shift = input.assignment?.shifts ?? null;
  return {
    date: input.date,
    weekday: new Date(`${input.date}T00:00:00.000Z`).toLocaleDateString("en-US", {
      weekday: "short",
      timeZone: "UTC",
    }),
    shiftName: shift?.name ?? null,
    startTime: shift?.start_time ?? null,
    endTime: shift?.end_time ?? null,
    isWeekOff: isWeekOff(input.date, input.effectivePolicy),
    isHoliday: !!input.holidayName,
    holidayName: input.holidayName ?? null,
  };
}
