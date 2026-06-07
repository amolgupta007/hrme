import { describe, it, expect } from "vitest";
import { computeDailyOvertimeMinutes, computeWeeklyOvertimeMinutes, computeHourlyRate } from "@/lib/attendance/ot";

describe("computeDailyOvertimeMinutes", () => {
  it("returns 0 when worked <= shift hours", () => {
    expect(computeDailyOvertimeMinutes(420, 480)).toBe(0); // 7h < 8h
    expect(computeDailyOvertimeMinutes(480, 480)).toBe(0);
  });
  it("returns excess minutes when worked > shift hours", () => {
    expect(computeDailyOvertimeMinutes(540, 480)).toBe(60); // 9h - 8h = 1h
  });
  it("handles null/undefined gracefully", () => {
    expect(computeDailyOvertimeMinutes(null, 480)).toBe(0);
    expect(computeDailyOvertimeMinutes(540, null)).toBe(0);
  });
});

describe("computeWeeklyOvertimeMinutes", () => {
  it("returns 0 when weekly total <= threshold", () => {
    expect(computeWeeklyOvertimeMinutes(2400, 48)).toBe(0); // 40h <= 48h
    expect(computeWeeklyOvertimeMinutes(2880, 48)).toBe(0); // exactly 48h
  });
  it("returns excess weekly minutes when above threshold", () => {
    expect(computeWeeklyOvertimeMinutes(3000, 48)).toBe(120); // 50h - 48h = 2h = 120m
  });
});

describe("computeHourlyRate", () => {
  it("paise = (gross_monthly * 100) / (working_days * shift_hours)", () => {
    // ₹40,000 gross, 26 working days, 8h/day → ~₹192.31/h → 19231 paise
    expect(computeHourlyRate(40000, 26, 8)).toBe(19231);
  });
  it("returns 0 if working_days or shift_hours is 0", () => {
    expect(computeHourlyRate(40000, 0, 8)).toBe(0);
    expect(computeHourlyRate(40000, 26, 0)).toBe(0);
  });
});
