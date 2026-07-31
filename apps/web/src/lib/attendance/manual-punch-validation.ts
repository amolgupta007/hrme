/**
 * Pure validation for manual (self-service / manager / admin) punch additions.
 * No DB, no I/O — safe to unit test and to import from anywhere.
 *
 * Rules (see docs/superpowers spec — attendance scoping fix):
 * - No actor may add a punch dated in the future (IST day precision).
 * - Non-admin actors (employees + managers) whose punch lands `pending` must
 *   supply a note (>= 3 chars trimmed) explaining the correction. Admins/owners
 *   auto-approve and may omit the note.
 */

/** IST calendar date (YYYY-MM-DD) for a given instant (defaults to now). */
export function istTodayDate(now: Date = new Date()): string {
  return new Date(now.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * Returns an error message (exact UI copy) when the punch is invalid, or null
 * when it is acceptable. Future check runs before the note check.
 */
export function validateManualPunch(input: {
  /** IST calendar date (YYYY-MM-DD) of the punch. */
  istDate: string;
  /** IST calendar date (YYYY-MM-DD) of "today". */
  todayIst: string;
  note?: string | null;
  /** owner|admin → auto-approve path (note optional). */
  isAdmin: boolean;
}): string | null {
  // YYYY-MM-DD strings compare lexically in date order.
  if (input.istDate > input.todayIst) return "Cannot add a punch in the future";
  if (!input.isAdmin) {
    if ((input.note ?? "").trim().length < 3)
      return "A note explaining the correction is required";
  }
  return null;
}
