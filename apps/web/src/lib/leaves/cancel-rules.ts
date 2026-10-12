// Who can cancel a leave request, and when — plain module (gotcha #78/#85):
// cancelLeave enforces it, the leaves table uses it to show the menu item.
//
//   pending                      → the employee, a manager-of-record, or an admin
//   approved, not started yet    → the same people
//   approved, already started    → admins only
//   approved unpaid leave in a month whose payroll is processed/paid → nobody
//     (loss of pay already went out; correct it in a later month instead)

export type CancelContext = {
  status: string;
  startDate: string;
  todayIst: string;
  isOwn: boolean;
  isManagerOfRecord: boolean;
  isAdmin: boolean;
  /** An unpaid leave touching a month whose payroll run is past draft. */
  payrollLocked: boolean;
};

export type CancelDecision = { ok: true } | { ok: false; error: string };

export function canCancelLeave(c: CancelContext): CancelDecision {
  const involved = c.isOwn || c.isManagerOfRecord || c.isAdmin;
  if (c.status === "pending") {
    return involved ? { ok: true } : { ok: false, error: "Unauthorized" };
  }
  if (c.status !== "approved") {
    return { ok: false, error: "Only pending or approved requests can be cancelled" };
  }
  if (!involved) return { ok: false, error: "Unauthorized" };
  if (c.startDate <= c.todayIst && !c.isAdmin) {
    return { ok: false, error: "This leave has already started — ask an admin to cancel it" };
  }
  if (c.payrollLocked) {
    return {
      ok: false,
      error: "Payroll for this leave's month is already processed — correct it in a later month instead",
    };
  }
  return { ok: true };
}

/** "YYYY-MM" months a date range touches, for the payroll-lock check. */
export function monthsSpanned(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  let [y, m] = startDate.slice(0, 7).split("-").map(Number);
  const end = endDate.slice(0, 7);
  for (;;) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    out.push(key);
    if (key >= end) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}
