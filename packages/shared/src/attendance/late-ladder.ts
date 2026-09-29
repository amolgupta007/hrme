// Late-arrival penalty ladder — pure planning. Given a month's COUNTABLE late
// arrivals (see late-eligibility.ts) and what has already been recorded, decide
// what should happen now. No I/O: the caller applies the actions (ledger rows,
// payroll, emails) and records them in late_penalty_events, whose unique key
// (org, employee, month, kind, occurrence_no) makes a re-run a no-op.

export type LadderPolicy = {
  /** Late arrival # that triggers the formal warning; null = no warning. */
  warningAt: number | null;
  /** Late arrival # that triggers a deduction (and every multiple of it when repeat is on). */
  deductAt: number;
  /** Leave days deducted per deduction (0.5 steps). */
  deductDays: number;
  repeat: boolean;
  /** When CL runs out, charge the rest as loss of pay. */
  lopFallback: boolean;
};

export type LadderEventStatus = "applied" | "reversed" | "waived" | "needs_review";

export type LadderEvent = {
  id: string;
  kind: "warning" | "deduction";
  occurrence_no: number;
  status: LadderEventStatus;
  cl_days: number;
  lop_days: number;
};

export type LadderAction =
  | { type: "warn"; occurrenceNo: number; lateCount: number; lateIds: string[]; triggerDate: string }
  | {
      type: "deduct";
      occurrenceNo: number;
      lateCount: number;
      lateIds: string[];
      triggerDate: string;
      cl: number;
      lop: number;
      clBalanceBefore: number;
      /** Payroll for the month is already paid, so the LOP can't flow automatically. */
      needsReview: boolean;
      /** Set when re-applying a previously reversed event rather than creating one. */
      reapplyEventId?: string;
    }
  | { type: "reverse"; eventId: string; occurrenceNo: number }
  | { type: "review"; eventId: string; occurrenceNo: number };

const halfDown = (n: number) => Math.floor(Math.max(0, n) * 2) / 2;

/**
 * CL first, then LOP. A full deduction's worth of CL → all CL; a partial
 * balance (rounded down to the half day) → that much CL plus the remainder as
 * LOP; none → all LOP. With lopFallback off, only what CL covers is taken.
 */
export function splitDeduction(
  deductDays: number,
  clBalance: number,
  lopFallback: boolean
): { cl: number; lop: number } {
  const cl = Math.min(deductDays, halfDown(clBalance));
  return { cl, lop: lopFallback ? deductDays - cl : 0 };
}

export function planLateLadder(input: {
  policy: LadderPolicy;
  /** Countable lates for the month, oldest first. */
  lates: Array<{ id: string; date: string }>;
  existing: LadderEvent[];
  /** Current remaining balance of the leave type being deducted. */
  clBalance: number;
  /** The month's payroll run is paid (locked). */
  payrollPaid: boolean;
}): LadderAction[] {
  const { policy, lates, existing, payrollPaid } = input;
  const n = lates.length;
  const actions: LadderAction[] = [];
  const upTo = (count: number) => ({
    lateIds: lates.slice(0, count).map((l) => l.id),
    triggerDate: lates[count - 1]?.date,
  });

  // Warning: once per month. Warnings are never reversed — the email is sent.
  if (policy.warningAt && n >= policy.warningAt) {
    const hasWarning = existing.some((e) => e.kind === "warning" && e.occurrence_no === 1);
    if (!hasWarning) {
      actions.push({ type: "warn", occurrenceNo: 1, lateCount: policy.warningAt, ...upTo(policy.warningAt) } as LadderAction);
    }
  }

  const due = n < policy.deductAt ? 0 : policy.repeat ? Math.floor(n / policy.deductAt) : 1;
  const deductions = existing.filter((e) => e.kind === "deduction");
  let balance = input.clBalance;

  // Occurrences that should exist: create, or re-apply if previously reversed.
  for (let k = 1; k <= due; k++) {
    const current = deductions.find((e) => e.occurrence_no === k);
    if (current && current.status !== "reversed") continue; // applied / waived / needs_review
    const count = k * policy.deductAt;
    const { cl, lop } = splitDeduction(policy.deductDays, balance, policy.lopFallback);
    actions.push({
      type: "deduct",
      occurrenceNo: k,
      lateCount: count,
      ...upTo(count),
      cl,
      lop,
      clBalanceBefore: balance,
      needsReview: payrollPaid && lop > 0,
      ...(current ? { reapplyEventId: current.id } : {}),
    } as LadderAction);
    balance -= cl;
  }

  // Occurrences that should no longer exist (count fell after an excuse/correction).
  for (const e of deductions) {
    if (e.occurrence_no <= due || e.status !== "applied") continue;
    actions.push(
      payrollPaid && e.lop_days > 0
        ? { type: "review", eventId: e.id, occurrenceNo: e.occurrence_no }
        : { type: "reverse", eventId: e.id, occurrenceNo: e.occurrence_no }
    );
  }

  return actions;
}
