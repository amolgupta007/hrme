/**
 * Guard for web clockOut on the punch-event stream (fix/clockin-event-stream).
 *
 * computeDailyAttendance collapses same-location punches within a 60s window
 * (dedupePunches' default). Web punch events carry location_id = null, so a
 * web OUT event within 60s of the web IN event is deduped away — the rollup
 * would stay clocked-in while the clockOut action reported success (a silent
 * no-op). The action blocks clock-out until the window has passed instead.
 *
 * Plain module (not "use server") so it stays a unit-testable pure predicate.
 */

/** Mirrors computeDailyAttendance's default dedupeWindowSeconds (60). */
export const MIN_CLOCK_OUT_GAP_SECONDS = 60;

export function isTooSoonToClockOut(
  clockInAtIso: string,
  nowMs: number,
  gapSeconds: number = MIN_CLOCK_OUT_GAP_SECONDS,
): boolean {
  const inMs = new Date(clockInAtIso).getTime();
  if (!Number.isFinite(inMs)) return false; // fail open — never wedge clock-out
  return nowMs - inMs < gapSeconds * 1000;
}
