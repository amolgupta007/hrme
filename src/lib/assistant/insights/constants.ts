export const PENDING_LEAVE_DAYS = 3;
export const PROBATION_DAYS = 90;
export const PROBATION_LOOKAHEAD_DAYS = 7;
export const STALLED_STAGE_DAYS = 7;
export const NEW_JOINER_DAYS = 7;
export const REVIEW_CYCLE_END_DAYS = 7;
export const BALANCE_EXPIRY_DAYS = 45;
export const MIN_LEAVE_BALANCE_FLAG = 5;        // days remaining to count
export const LEAVE_CONCENTRATION_MIN = 3;       // employees overlapping in one dept
export const LEAVE_CONCENTRATION_WINDOW_DAYS = 14;
export const TOP_INSIGHTS = 3;

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** A Date whose UTC fields equal IST wall-clock. For date-precision math only. */
export function istNow(now: Date = new Date()): Date {
  return new Date(now.getTime() + IST_OFFSET_MS);
}

/** "YYYY-MM-DD" for the IST calendar day. */
export function istDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Add days to a Date, returning a new Date. */
export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}
