/**
 * Half-day leave display + chip-state helpers for the web surfaces
 * (Request Leave dialog, leaves table).
 *
 * Plain module, NOT "use client" — both a client component and a server
 * component may import these (gotcha #78: a Server Component importing a
 * utility out of a "use client" file throws at request time in prod).
 *
 * The half-day model mirrors the mobile Request Leave sheet: two independent
 * flags, each subtracting 0.5 from the inclusive calendar-day count. There is
 * no AM/PM concept — see packages/shared/src/leaves/compute-days.ts, which is
 * the single source for the day math on every surface.
 */

import { computeLeaveDays } from "@jambahr/shared";

export type HalfDayDescription = {
  /** Compact marker rendered beside the date range in the leaves table. */
  marker: string;
  /** Full text for the marker's title/tooltip and for screen readers. */
  label: string;
};

/**
 * Describes which end(s) of a leave request are half days, or null when it is
 * a plain whole-day request. Flags are nullable because `listLeaveRequests`
 * does `select("*")` and rows can carry null before migration 103's default
 * settles.
 */
export function describeHalfDay(
  startHalfDay: boolean | null | undefined,
  endHalfDay: boolean | null | undefined
): HalfDayDescription | null {
  const start = !!startHalfDay;
  const end = !!endHalfDay;

  if (!start && !end) return null;

  const label = start && end
    ? "Half day on both ends"
    : start
      ? "Half day on start"
      : "Half day on end";

  return { marker: "½", label };
}

/** Which half-day chips the Request Leave dialog should offer. */
export type HalfDayMode =
  /** Dates incomplete or invalid — offer nothing. */
  | "none"
  /** Start === end: one "Half day" chip, mapped to the start flag. */
  | "single"
  /** A real range: "Half-day start" and "Half-day end" chips. */
  | "range";

export type HalfDayState = {
  mode: HalfDayMode;
  startHalfDay: boolean;
  endHalfDay: boolean;
};

/**
 * Resolves the chip state for the current date selection, clamping the flags
 * to what that selection can actually express.
 *
 * Single-day mode forces the end flag off: both flags on one date derive
 * 1 - 0.5 - 0.5 = 0 days, which `computeLeaveDays` rejects. Rather than
 * surface that error, the dialog makes the state unreachable.
 *
 * Validity is judged by `computeLeaveDays` itself (with both flags off, so
 * only the range is under test) so this helper can never disagree with the
 * math that persists the request.
 */
export function resolveHalfDayState(
  startDate: string,
  endDate: string,
  startHalfDay: boolean,
  endHalfDay: boolean
): HalfDayState {
  const OFF: HalfDayState = { mode: "none", startHalfDay: false, endHalfDay: false };

  if (!startDate || !endDate) return OFF;
  if (!computeLeaveDays(startDate, endDate, false, false).ok) return OFF;

  if (startDate === endDate) {
    return { mode: "single", startHalfDay, endHalfDay: false };
  }

  return { mode: "range", startHalfDay, endHalfDay };
}
