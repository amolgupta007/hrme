import { describe, it, expect } from "vitest";
import { resolveEffectiveWeekOff, isWeekOff, type WeekOffPolicy, type WeekOffOverride } from "@/lib/attendance/week-off";

const orgPolicy: WeekOffPolicy = { week_type: 6, off_days: [0] }; // Sunday only
const deptOverride: WeekOffOverride = { week_type: 5, off_days: [0, 6] }; // Sat + Sun
const empOverride: WeekOffOverride = { week_type: 5, off_days: [5, 6], alt_saturday_rule: "none" }; // Fri + Sat

describe("resolveEffectiveWeekOff precedence", () => {
  it("employee override wins over department and org", () => {
    expect(resolveEffectiveWeekOff(orgPolicy, deptOverride, empOverride)).toBe(empOverride);
  });

  it("department override wins over org when no employee override", () => {
    expect(resolveEffectiveWeekOff(orgPolicy, deptOverride, null)).toBe(deptOverride);
    expect(resolveEffectiveWeekOff(orgPolicy, deptOverride, undefined)).toBe(deptOverride);
  });

  it("falls back to org policy when no overrides", () => {
    expect(resolveEffectiveWeekOff(orgPolicy, null, null)).toBe(orgPolicy);
    expect(resolveEffectiveWeekOff(orgPolicy)).toBe(orgPolicy);
  });

  it("resolved policy drives isWeekOff correctly", () => {
    // 2026-07-04 is a Saturday.
    const sat = "2026-07-04";
    // Org: Sunday-only → Saturday is NOT off.
    expect(isWeekOff(sat, resolveEffectiveWeekOff(orgPolicy))).toBe(false);
    // Department override (Sat+Sun off) → Saturday IS off.
    expect(isWeekOff(sat, resolveEffectiveWeekOff(orgPolicy, deptOverride))).toBe(true);
    // Employee override (Fri+Sat off) also makes Saturday off, and wins over dept.
    expect(isWeekOff(sat, resolveEffectiveWeekOff(orgPolicy, deptOverride, empOverride))).toBe(true);
    // 2026-07-03 is a Friday: employee override makes it off; department override does not.
    const fri = "2026-07-03";
    expect(isWeekOff(fri, resolveEffectiveWeekOff(orgPolicy, deptOverride))).toBe(false);
    expect(isWeekOff(fri, resolveEffectiveWeekOff(orgPolicy, deptOverride, empOverride))).toBe(true);
  });
});
