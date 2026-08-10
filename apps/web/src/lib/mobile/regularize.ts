import { z } from "zod";
import { istDateOf } from "@jambahr/shared";

/**
 * Regularization request body. `date` is the IST day being corrected;
 * `proposedIn` / `proposedOut` are full ISO-8601 instants (offset required)
 * that the client builds from that day + an IST wall-clock time. `proposedOut`
 * is optional (an employee may only have missed the punch-out, or want to log a
 * single in for an absent day). `reason` is required — the admin sees it in the
 * punch-review queue.
 */
export const RegularizeBodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  proposedIn: z.string().datetime({ offset: true }),
  proposedOut: z.string().datetime({ offset: true }).nullable().optional(),
  reason: z.string().trim().min(3, "reason too short").max(500, "reason too long"),
});

export type RegularizeBody = z.infer<typeof RegularizeBodySchema>;

export type RegularizeEvent = { punchType: "in" | "out"; punchedAtIso: string };

export type RegularizeValidation =
  | { ok: true; events: RegularizeEvent[] }
  | { ok: false; error: string };

/**
 * Pure validation of a regularization submission. No DB — the caller passes the
 * server's IST today and the employee's date_of_joining (null if unset).
 *
 * Rules:
 *  - `date` must be a PAST IST day (today's corrections go through normal
 *    punching, not regularization; the future is never regularizable).
 *  - `date` must not precede the employee's employment start.
 *  - `proposedIn` (and `proposedOut`, if given) must fall on the IST day `date`
 *    — this also blocks smuggling a punch onto another day via a crafted offset.
 *  - When `proposedOut` is present it must be strictly after `proposedIn`.
 */
export function validateRegularization(input: {
  date: string;
  proposedIn: string;
  proposedOut: string | null;
  todayIst: string;
  dateOfJoining: string | null;
}): RegularizeValidation {
  const { date, proposedIn, proposedOut, todayIst, dateOfJoining } = input;

  if (date >= todayIst) {
    return { ok: false, error: "date_not_past" };
  }
  if (dateOfJoining && date < dateOfJoining) {
    return { ok: false, error: "before_employment" };
  }

  if (istDateOf(proposedIn) !== date) {
    return { ok: false, error: "in_not_on_date" };
  }

  const events: RegularizeEvent[] = [{ punchType: "in", punchedAtIso: new Date(proposedIn).toISOString() }];

  if (proposedOut != null) {
    if (istDateOf(proposedOut) !== date) {
      return { ok: false, error: "out_not_on_date" };
    }
    if (new Date(proposedOut).getTime() <= new Date(proposedIn).getTime()) {
      return { ok: false, error: "out_before_in" };
    }
    events.push({ punchType: "out", punchedAtIso: new Date(proposedOut).toISOString() });
  }

  return { ok: true, events };
}
