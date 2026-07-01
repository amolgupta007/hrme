import { describe, it, expect } from "vitest";
import {
  resolvePenaltyDays,
  validateBands,
  type PenaltyBand,
} from "@/lib/attendance/late-penalty-bands";

const bands: PenaltyBand[] = [
  { min_late_days: 3, max_late_days: 4, deduction_days: 0.5 },
  { min_late_days: 5, max_late_days: 7, deduction_days: 2 },
  { min_late_days: 8, max_late_days: null, deduction_days: 3 },
];

describe("resolvePenaltyDays", () => {
  it("below the lowest band → 0", () => expect(resolvePenaltyDays(2, bands)).toBe(0));
  it("matches inclusive band", () => {
    expect(resolvePenaltyDays(3, bands)).toBe(0.5);
    expect(resolvePenaltyDays(4, bands)).toBe(0.5);
    expect(resolvePenaltyDays(6, bands)).toBe(2);
  });
  it("open-ended top band", () => expect(resolvePenaltyDays(20, bands)).toBe(3));
  it("empty bands → 0", () => expect(resolvePenaltyDays(10, [])).toBe(0));
});

describe("validateBands", () => {
  it("accepts ordered non-overlapping", () => expect(validateBands(bands).ok).toBe(true));
  it("rejects overlap", () => {
    const bad: PenaltyBand[] = [
      { min_late_days: 3, max_late_days: 5, deduction_days: 1 },
      { min_late_days: 5, max_late_days: 7, deduction_days: 2 },
    ];
    expect(validateBands(bad).ok).toBe(false);
  });
  it("rejects min>max", () => {
    expect(validateBands([{ min_late_days: 5, max_late_days: 3, deduction_days: 1 }]).ok).toBe(false);
  });
});
