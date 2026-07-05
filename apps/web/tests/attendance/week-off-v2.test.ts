import { describe, it, expect } from "vitest";
import { isWeekOff, isAltSaturdayOff, type WeekOffPolicy, type WeekOffOverride } from "@/lib/attendance/week-off";

describe("isAltSaturdayOff", () => {
  // 2026-06-06 = first Saturday of June 2026
  // 2026-06-13 = second Saturday
  // 2026-06-20 = third Saturday
  // 2026-06-27 = fourth Saturday
  it("odd_off → 1st + 3rd Saturdays off", () => {
    expect(isAltSaturdayOff("2026-06-06", "odd_off")).toBe(true);
    expect(isAltSaturdayOff("2026-06-13", "odd_off")).toBe(false);
    expect(isAltSaturdayOff("2026-06-20", "odd_off")).toBe(true);
    expect(isAltSaturdayOff("2026-06-27", "odd_off")).toBe(false);
  });
  it("even_off → 2nd + 4th Saturdays off", () => {
    expect(isAltSaturdayOff("2026-06-06", "even_off")).toBe(false);
    expect(isAltSaturdayOff("2026-06-13", "even_off")).toBe(true);
    expect(isAltSaturdayOff("2026-06-20", "even_off")).toBe(false);
    expect(isAltSaturdayOff("2026-06-27", "even_off")).toBe(true);
  });
  it("none → always false", () => {
    expect(isAltSaturdayOff("2026-06-06", "none")).toBe(false);
  });
  it("non-Saturday dates always return false", () => {
    expect(isAltSaturdayOff("2026-06-08", "odd_off")).toBe(false); // Monday
  });
});

describe("isWeekOff v2 (with override + alt-Sat)", () => {
  const orgPolicy: WeekOffPolicy = { week_type: 6, off_days: [0], alt_saturday_rule: "odd_off" };

  it("uses org policy when no override", () => {
    expect(isWeekOff("2026-06-07", orgPolicy)).toBe(true);  // Sunday
    expect(isWeekOff("2026-06-08", orgPolicy)).toBe(false); // Monday
    expect(isWeekOff("2026-06-06", orgPolicy)).toBe(true);  // 1st Saturday, odd_off
    expect(isWeekOff("2026-06-13", orgPolicy)).toBe(false); // 2nd Saturday
  });

  it("override fully replaces org policy", () => {
    const override: WeekOffOverride = { week_type: 5, off_days: [0, 6], alt_saturday_rule: "none" };
    expect(isWeekOff("2026-06-06", orgPolicy, override)).toBe(true); // Sat off via override
    expect(isWeekOff("2026-06-13", orgPolicy, override)).toBe(true); // Sat off via override
    expect(isWeekOff("2026-06-08", orgPolicy, override)).toBe(false);
  });

  it("v1 signature still works (no override, no alt-Sat)", () => {
    expect(isWeekOff("2026-06-07", { week_type: 6, off_days: [0] })).toBe(true);
  });
});
