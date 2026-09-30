import { describe, it, expect } from "vitest";
import {
  planLateLadder,
  splitDeduction,
  type LadderEvent,
  type LadderPolicy,
} from "@jambahr/shared/attendance/late-ladder";

const policy: LadderPolicy = {
  warningAt: 3,
  deductAt: 5,
  deductDays: 1,
  repeat: true,
  lopFallback: true,
};

const lates = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `r${i + 1}`, date: `2026-09-${String(i + 1).padStart(2, "0")}` }));

const ev = (e: Partial<LadderEvent> & Pick<LadderEvent, "kind" | "occurrence_no">): LadderEvent => ({
  id: `${e.kind}-${e.occurrence_no}`,
  status: "applied",
  cl_days: e.kind === "deduction" ? 1 : 0,
  lop_days: 0,
  ...e,
});

describe("splitDeduction (CL first, then LOP)", () => {
  it("full CL available → all CL", () => {
    expect(splitDeduction(1, 4, true)).toEqual({ cl: 1, lop: 0 });
  });
  it("0.5 CL left → 0.5 CL + 0.5 LOP", () => {
    expect(splitDeduction(1, 0.5, true)).toEqual({ cl: 0.5, lop: 0.5 });
  });
  it("no CL → all LOP", () => {
    expect(splitDeduction(1, 0, true)).toEqual({ cl: 0, lop: 1 });
  });
  it("odd balances round DOWN to the half day", () => {
    expect(splitDeduction(1, 0.7, true)).toEqual({ cl: 0.5, lop: 0.5 });
  });
  it("negative balance is treated as none", () => {
    expect(splitDeduction(1, -2, true)).toEqual({ cl: 0, lop: 1 });
  });
  it("LOP fallback off → only what CL covers", () => {
    expect(splitDeduction(1, 0.5, false)).toEqual({ cl: 0.5, lop: 0 });
  });
});

describe("planLateLadder", () => {
  const base = { policy, existing: [] as LadderEvent[], clBalance: 5, payrollPaid: false };

  it("below the warning threshold → nothing", () => {
    expect(planLateLadder({ ...base, lates: lates(2) })).toEqual([]);
  });

  it("3rd late → one warning listing the 3 lates", () => {
    const out = planLateLadder({ ...base, lates: lates(3) });
    expect(out).toEqual([
      { type: "warn", occurrenceNo: 1, lateCount: 3, lateIds: ["r1", "r2", "r3"], triggerDate: "2026-09-03" },
    ]);
  });

  it("a rerun after the warning fired → nothing new (idempotent)", () => {
    const out = planLateLadder({ ...base, lates: lates(4), existing: [ev({ kind: "warning", occurrence_no: 1 })] });
    expect(out).toEqual([]);
  });

  it("5th late → deduction 1 CL, effective on the 5th late's date", () => {
    const out = planLateLadder({ ...base, lates: lates(5), existing: [ev({ kind: "warning", occurrence_no: 1 })] });
    expect(out).toEqual([
      {
        type: "deduct",
        occurrenceNo: 1,
        lateCount: 5,
        lateIds: ["r1", "r2", "r3", "r4", "r5"],
        triggerDate: "2026-09-05",
        cl: 1,
        lop: 0,
        clBalanceBefore: 5,
        needsReview: false,
      },
    ]);
  });

  it("jumping straight to 5 (e.g. a backlog) fires the warning AND the deduction", () => {
    const out = planLateLadder({ ...base, lates: lates(5) });
    expect(out.map((a) => a.type)).toEqual(["warn", "deduct"]);
  });

  it("10 lates with repeat → two deductions, balance consumed in order", () => {
    const out = planLateLadder({
      ...base,
      clBalance: 1.5,
      lates: lates(10),
      existing: [ev({ kind: "warning", occurrence_no: 1 })],
    });
    const deds = out.filter((a) => a.type === "deduct") as any[];
    expect(deds.map((d) => [d.occurrenceNo, d.cl, d.lop, d.clBalanceBefore, d.triggerDate])).toEqual([
      [1, 1, 0, 1.5, "2026-09-05"],
      [2, 0.5, 0.5, 0.5, "2026-09-10"],
    ]);
  });

  it("10 lates without repeat → still only one deduction", () => {
    const out = planLateLadder({ ...base, policy: { ...policy, repeat: false }, lates: lates(10) });
    expect(out.filter((a) => a.type === "deduct")).toHaveLength(1);
  });

  it("no warning configured → deductions only", () => {
    const out = planLateLadder({ ...base, policy: { ...policy, warningAt: null }, lates: lates(5) });
    expect(out.map((a) => a.type)).toEqual(["deduct"]);
  });

  it("count drops below a deduction (late excused) → reverse it", () => {
    const out = planLateLadder({
      ...base,
      lates: lates(4),
      existing: [ev({ kind: "warning", occurrence_no: 1 }), ev({ kind: "deduction", occurrence_no: 1, lop_days: 0 })],
    });
    expect(out).toEqual([{ type: "reverse", eventId: "deduction-1", occurrenceNo: 1 }]);
  });

  it("…but if that month's payroll is paid and LOP was involved → flag for review instead", () => {
    const out = planLateLadder({
      ...base,
      payrollPaid: true,
      lates: lates(4),
      existing: [ev({ kind: "warning", occurrence_no: 1 }), ev({ kind: "deduction", occurrence_no: 1, cl_days: 0.5, lop_days: 0.5 })],
    });
    expect(out).toEqual([{ type: "review", eventId: "deduction-1", occurrenceNo: 1 }]);
  });

  it("a CL-only deduction is reversed even when payroll is paid (leave isn't payroll)", () => {
    const out = planLateLadder({
      ...base,
      payrollPaid: true,
      lates: lates(4),
      existing: [ev({ kind: "warning", occurrence_no: 1 }), ev({ kind: "deduction", occurrence_no: 1, cl_days: 1, lop_days: 0 })],
    });
    expect(out).toEqual([{ type: "reverse", eventId: "deduction-1", occurrenceNo: 1 }]);
  });

  it("a reversed deduction whose lates come back is re-applied", () => {
    const out = planLateLadder({
      ...base,
      lates: lates(5),
      existing: [ev({ kind: "warning", occurrence_no: 1 }), ev({ kind: "deduction", occurrence_no: 1, status: "reversed" })],
    });
    expect(out).toMatchObject([{ type: "deduct", occurrenceNo: 1, reapplyEventId: "deduction-1" }]);
  });

  it("a waived deduction is never re-applied or reversed", () => {
    const out = planLateLadder({
      ...base,
      lates: lates(5),
      existing: [ev({ kind: "warning", occurrence_no: 1 }), ev({ kind: "deduction", occurrence_no: 1, status: "waived" })],
    });
    expect(out).toEqual([]);
  });

  it("a new deduction in an already-paid month is created but flagged for review", () => {
    const out = planLateLadder({
      ...base,
      clBalance: 0,
      payrollPaid: true,
      lates: lates(5),
      existing: [ev({ kind: "warning", occurrence_no: 1 })],
    });
    expect(out).toMatchObject([{ type: "deduct", cl: 0, lop: 1, needsReview: true }]);
  });

  it("an already-flagged (needs_review) event is left alone", () => {
    const out = planLateLadder({
      ...base,
      lates: lates(4),
      existing: [ev({ kind: "warning", occurrence_no: 1 }), ev({ kind: "deduction", occurrence_no: 1, status: "needs_review", lop_days: 1, cl_days: 0 })],
    });
    expect(out).toEqual([]);
  });
});

import { describeLadder } from "@jambahr/shared/attendance/late-ladder";

describe("describeLadder", () => {
  it("summarises the default ladder", () => {
    expect(describeLadder({ ...policy, leaveLabel: "casual leave" })).toBe(
      "Warning at the 3rd late · 1 day of casual leave deducted at every 5th late (loss of pay if no casual leave is left)"
    );
  });
  it("no warning, once a month, half day, no LOP fallback", () => {
    expect(
      describeLadder({ warningAt: null, deductAt: 4, deductDays: 0.5, repeat: false, lopFallback: false, leaveLabel: "casual leave" })
    ).toBe("0.5 days of casual leave deducted at the 4th late (once a month) (nothing deducted if no casual leave is left)");
  });
  it("ordinals: 1st, 2nd, 11th, 21st", () => {
    const d = (n: number) => describeLadder({ ...policy, warningAt: n, deductAt: 31, leaveLabel: "x" });
    expect([d(1), d(2), d(11), d(21)].map((s) => s.split(" late")[0])).toEqual([
      "Warning at the 1st",
      "Warning at the 2nd",
      "Warning at the 11th",
      "Warning at the 21st",
    ]);
  });
});
