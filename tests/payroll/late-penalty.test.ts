import { describe, it, expect } from "vitest";
import { computeLatePenaltyDeduction } from "@/lib/payroll/late-penalty";

const bands = [
  { min_late_days: 3, max_late_days: 4, deduction_days: 0.5 },
  { min_late_days: 5, max_late_days: 7, deduction_days: 2 },
];

describe("computeLatePenaltyDeduction", () => {
  it("half-day band", () => {
    const r = computeLatePenaltyDeduction({ lateDays: 3, bands, grossMonthly: 52000, workingDays: 26 });
    expect(r.penaltyDays).toBe(0.5);
    expect(r.deduction).toBe(1000); // 2000/day * 0.5
  });
  it("two-day band", () => {
    const r = computeLatePenaltyDeduction({ lateDays: 6, bands, grossMonthly: 52000, workingDays: 26 });
    expect(r.penaltyDays).toBe(2);
    expect(r.deduction).toBe(4000);
  });
  it("no band → zero", () => {
    const r = computeLatePenaltyDeduction({ lateDays: 1, bands, grossMonthly: 52000, workingDays: 26 });
    expect(r.deduction).toBe(0);
  });
  it("guards zero working days", () => {
    const r = computeLatePenaltyDeduction({ lateDays: 6, bands, grossMonthly: 52000, workingDays: 0 });
    expect(r.deduction).toBe(0);
  });
});
