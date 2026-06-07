/** Matches HH:MM strictly: 00–23 hours, 00–59 minutes */
const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Parse a strict HH:MM string into minutes past midnight (0–1439).
 * Throws on any input that is not exactly two-digit hours and minutes
 * within the valid clock range.
 */
export function parseHHMM(value: string): number {
  const m = HHMM_RE.exec(value);
  if (!m) throw new Error(`Invalid HH:MM time: ${value}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Returns true when the shift crosses midnight (end time < start time).
 * Returns false when start === end (treat as same point; form validation
 * should reject 24-hour shifts separately).
 */
export function isOvernight(start: string, end: string): boolean {
  return parseHHMM(end) < parseHHMM(start);
}

/**
 * Compute net shift hours (to one decimal place) after subtracting break.
 *
 * @param start        HH:MM shift start
 * @param end          HH:MM shift end (may be past midnight)
 * @param breakMinutes non-negative break duration in minutes
 * @throws when breakMinutes >= shift span (net hours would be ≤ 0)
 * @throws when breakMinutes < 0
 */
export function computeShiftTotalHours(
  start: string,
  end: string,
  breakMinutes: number,
): number {
  if (breakMinutes < 0) throw new Error("Break minutes cannot be negative");

  const startMin = parseHHMM(start);
  const endMin = parseHHMM(end);

  // Overnight shifts: end < start → span wraps through midnight
  const spanMin =
    endMin > startMin
      ? endMin - startMin
      : 24 * 60 - startMin + endMin;

  if (breakMinutes >= spanMin) {
    throw new Error("Break minutes cannot equal or exceed shift duration");
  }

  // Round to one decimal place (nearest 6 minutes = 0.1 h)
  return Math.round((spanMin - breakMinutes) / 6) / 10;
}
