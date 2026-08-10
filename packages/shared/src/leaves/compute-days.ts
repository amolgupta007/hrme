/**
 * Pure leave-days compute for the mobile Request Leave sheet (Mobile Phase D,
 * Slice 2, Task 1). No DB, no I/O — see
 * docs/superpowers/plans/2026-08-10-mobile-phase-d-slice2.md (Locked decisions,
 * "Half-day model").
 *
 * Semantics mirror the web leave-request dialog's `calcDays`
 * (apps/web/src/components/leaves/leave-request-form.tsx): inclusive calendar
 * days between start and end (both dates count), weekends/holidays are NOT
 * excluded. Dates are parsed as UTC midnight (the `${date}T00:00:00.000Z`
 * idiom used by `enumerateDates` in apps/web/src/lib/reports/attendance-report.ts)
 * so the count is stable regardless of the server's local timezone.
 *
 * The half-day model (from the approved WF-Request-Leave wireframe) is two
 * independent chips — "half-day start" and "half-day end" — each subtracting
 * 0.5 from the inclusive calendar-day count. There is no AM/PM-per-single-day
 * concept; a single-day leave with both chips set collapses to 0 days, which
 * is rejected.
 */

export type ComputeLeaveDaysResult =
  | { ok: true; days: number }
  | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Parses a strict `YYYY-MM-DD` string as UTC midnight, rejecting both
 * malformed strings and calendar overflow (e.g. "2026-02-30", which
 * `Date.UTC` would otherwise silently roll into March). Returns the epoch ms
 * on success, or `null` on any invalid input.
 */
function parseStrictUtcDate(dateStr: string): number | null {
  if (!DATE_RE.test(dateStr)) return null;
  const [year, month, day] = dateStr.split("-").map(Number);
  const ms = Date.UTC(year, month - 1, day);
  const check = new Date(ms);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return ms;
}

/**
 * Derives the leave-request `days` total from a date range plus half-day
 * start/end flags. Server-side derivation (the BFF never trusts a
 * client-supplied `days`, unlike the web dialog today — see investigation
 * §2 finding #2).
 *
 * - Inclusive calendar days: `endDate - startDate + 1` (weekends/holidays
 *   NOT excluded, matching current web semantics).
 * - Each true half-day flag subtracts 0.5.
 * - Result <= 0 (e.g. same-date range with both flags set) is rejected with
 *   "Leave must be at least half a day".
 * - Malformed date strings or `endDate < startDate` are rejected with
 *   "Invalid date range".
 */
export function computeLeaveDays(
  startDate: string,
  endDate: string,
  startHalfDay: boolean,
  endHalfDay: boolean
): ComputeLeaveDaysResult {
  const startMs = parseStrictUtcDate(startDate);
  const endMs = parseStrictUtcDate(endDate);

  if (startMs === null || endMs === null || endMs < startMs) {
    return { ok: false, error: "Invalid date range" };
  }

  const calendarDays = Math.round((endMs - startMs) / MS_PER_DAY) + 1;

  let days = calendarDays;
  if (startHalfDay) days -= 0.5;
  if (endHalfDay) days -= 0.5;

  if (days <= 0) {
    return { ok: false, error: "Leave must be at least half a day" };
  }

  return { ok: true, days };
}
