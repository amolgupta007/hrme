/**
 * Pure graduated late-penalty band model. A band maps a monthly late-day count
 * to a number of days of salary to deduct. Bands are inclusive ranges; the top
 * band may be open-ended (max_late_days = null). No DB, no I/O.
 */
export type PenaltyBand = {
  min_late_days: number;
  max_late_days: number | null;
  deduction_days: number;
};

/** Days of salary to deduct for `lateDays`, or 0 when no band matches. */
export function resolvePenaltyDays(lateDays: number, bands: PenaltyBand[]): number {
  for (const b of bands) {
    const withinLower = lateDays >= b.min_late_days;
    const withinUpper = b.max_late_days === null || lateDays <= b.max_late_days;
    if (withinLower && withinUpper) return b.deduction_days;
  }
  return 0;
}

/** Reject overlapping / mis-ordered bands. Order-independent (sorts first). */
export function validateBands(bands: PenaltyBand[]): { ok: true } | { ok: false; error: string } {
  const sorted = [...bands].sort((a, b) => a.min_late_days - b.min_late_days);
  let prevMax = 0;
  for (const b of sorted) {
    if (b.max_late_days !== null && b.min_late_days > b.max_late_days) {
      return { ok: false, error: `Band min (${b.min_late_days}) exceeds max (${b.max_late_days}).` };
    }
    if (b.min_late_days <= prevMax) {
      return { ok: false, error: `Bands overlap at ${b.min_late_days} late days.` };
    }
    prevMax = b.max_late_days ?? 31;
  }
  return { ok: true };
}
