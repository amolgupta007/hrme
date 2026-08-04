// Pure, framework-free leave-request validation helpers.
// NOT a "use server" module — importable by server actions and unit tests.
//
// Dates are ISO "YYYY-MM-DD" strings and are compared lexically, which equals
// chronological order for zero-padded ISO dates (no Date parsing, no timezone
// surprises).

export type LeaveInterval = {
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  status: string;
};

// Statuses that consume a date range and therefore conflict with a new request.
const ACTIVE_STATUSES = new Set(["pending", "approved"]);

/**
 * Returns the first existing leave interval that overlaps the inclusive range
 * [newStart, newEnd]. Only pending/approved rows are considered; cancelled and
 * rejected rows are ignored. Endpoints are inclusive, so a touching boundary
 * (existing.end === newStart, or existing.start === newEnd) counts as an
 * overlap. Returns null when there is no conflict.
 */
export function findOverlap(
  existing: LeaveInterval[],
  newStart: string,
  newEnd: string
): LeaveInterval | null {
  for (const row of existing) {
    if (!ACTIVE_STATUSES.has(row.status)) continue;
    // Inclusive overlap test.
    if (row.start_date <= newEnd && row.end_date >= newStart) {
      return row;
    }
  }
  return null;
}

/**
 * Remaining leave days for a policy. Mirrors listLeavePolicies EXACTLY:
 *   remaining = daysPerYear - usedApproved   (clamped at 0)
 * Carry-forward is intentionally NOT added — the canonical balance-card
 * derivation in listLeavePolicies does not include it, so neither does this.
 */
export function computeRemainingDays(input: {
  daysPerYear: number;
  usedApproved: number;
}): number {
  return Math.max(0, input.daysPerYear - input.usedApproved);
}
