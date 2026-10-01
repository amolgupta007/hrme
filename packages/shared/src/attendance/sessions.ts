/**
 * Clock-in sessions for "clock in and out as often as you like" days (web_app
 * timekeeping mode). Punches alternate in → out → in → out by time order; an
 * odd count means the employee is clocked in right now. Hours are the sum of
 * the closed sessions — the gaps between them (breaks, errands) don't count.
 *
 * Pure: no DB, no I/O. Direction is derived from order, never stored.
 */
import { dedupePunches } from "./daily-attendance";

export type WorkSession = {
  inAt: string; // ISO 8601 UTC
  /** null = still clocked in. */
  outAt: string | null;
  /** Whole minutes for a closed session; null while open. */
  minutes: number | null;
};

export type WorkSessionSummary = {
  sessions: WorkSession[];
  /** True when the last session has no clock-out yet. */
  open: boolean;
  /** Σ minutes of closed sessions. */
  closedMinutes: number;
  /** First clock-in of the day (arrival — lateness keys on this). */
  firstInAt: string | null;
  /** Latest punch of the day, in or out. */
  lastPunchAt: string | null;
};

const ms = (iso: string) => new Date(iso).getTime();

/** Mirrors computeDailyAttendance's dedupe so the list matches the rollup. */
export const SESSION_DEDUPE_SECONDS = 60;

export function deriveWorkSessions(punches: { punched_at: string }[]): WorkSessionSummary {
  const deduped = dedupePunches(
    punches.map((p, i) => ({ id: String(i), punched_at: p.punched_at, location_id: null })),
    SESSION_DEDUPE_SECONDS,
  );
  const sorted = [...deduped].sort((a, b) => ms(a.punched_at) - ms(b.punched_at));

  const sessions: WorkSession[] = [];
  let closedMinutes = 0;
  for (let i = 0; i < sorted.length; i += 2) {
    const inAt = sorted[i].punched_at;
    const outAt = sorted[i + 1]?.punched_at ?? null;
    const minutes = outAt ? Math.round((ms(outAt) - ms(inAt)) / 60_000) : null;
    if (minutes !== null) closedMinutes += minutes;
    sessions.push({ inAt, outAt, minutes });
  }

  return {
    sessions,
    open: sorted.length % 2 === 1,
    closedMinutes,
    firstInAt: sorted[0]?.punched_at ?? null,
    lastPunchAt: sorted[sorted.length - 1]?.punched_at ?? null,
  };
}

/** Leaves the auto clock-out clear of the 60s dedupe window after the last punch. */
export const AUTO_CLOSE_MIN_GAP_MS = 2 * 60 * 1000;

/**
 * When the midnight job closes a forgotten open session: first clock-in + shift
 * hours (the historical rule), but never at or before the last clock-in — then
 * it closes 2 minutes after it, crediting nothing extra. Capped at the end of
 * the day.
 */
export function autoCloseInstant(input: {
  firstInMs: number;
  lastPunchMs: number;
  hours: number;
  dayCapMs: number;
}): number {
  const byShift = input.firstInMs + input.hours * 60 * 60 * 1000;
  const afterLast = input.lastPunchMs + AUTO_CLOSE_MIN_GAP_MS;
  return Math.min(Math.max(byShift, afterLast), input.dayCapMs);
}
