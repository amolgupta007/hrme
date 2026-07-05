import { describe, it, expect } from "vitest";
import { isWeekOff, WEEK_DAYS } from "@/lib/attendance/week-off";

describe("isWeekOff", () => {
  const sundayOnly = { week_type: 6 as const, off_days: [0] };
  const satSunOff  = { week_type: 5 as const, off_days: [0, 6] };

  it("returns true on Sunday for 6-day week with Sun off", () => {
    expect(isWeekOff("2026-06-07", sundayOnly)).toBe(true);   // Sunday
    expect(isWeekOff("2026-06-08", sundayOnly)).toBe(false);  // Monday
  });
  it("returns true on Sat or Sun for 5-day week with both off", () => {
    expect(isWeekOff("2026-06-06", satSunOff)).toBe(true);    // Saturday
    expect(isWeekOff("2026-06-07", satSunOff)).toBe(true);    // Sunday
    expect(isWeekOff("2026-06-05", satSunOff)).toBe(false);   // Friday
  });
  it("WEEK_DAYS exposes 0..6 with English labels", () => {
    expect(WEEK_DAYS).toHaveLength(7);
    expect(WEEK_DAYS[0]).toEqual({ value: 0, label: "Sunday" });
  });
});
