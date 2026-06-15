import { describe, it, expect } from "vitest";
import { computeLateness } from "@/lib/attendance/lateness";

function istToUtcIso(hh: number, mm: number): string {
  const ms = Date.UTC(2026, 5, 16, hh, mm, 0) - 5.5 * 3600 * 1000;
  return new Date(ms).toISOString();
}

describe("computeLateness", () => {
  it("flags late when clock-in is after start + grace", () => {
    const r = computeLateness({
      clockInAtUtc: istToUtcIso(9, 25),
      shift: { start_time: "09:00", grace_minutes: 10, is_overnight: false },
      fallbackCutoff: null,
    });
    expect(r.evaluated).toBe(true);
    expect(r.isLate).toBe(true);
    expect(r.lateMinutes).toBe(15);
  });

  it("is on-time within grace", () => {
    const r = computeLateness({
      clockInAtUtc: istToUtcIso(9, 8),
      shift: { start_time: "09:00", grace_minutes: 10, is_overnight: false },
      fallbackCutoff: null,
    });
    expect(r.isLate).toBe(false);
    expect(r.lateMinutes).toBe(0);
  });

  it("uses fallback cutoff when no shift", () => {
    const r = computeLateness({ clockInAtUtc: istToUtcIso(9, 45), shift: null, fallbackCutoff: "09:30" });
    expect(r.evaluated).toBe(true);
    expect(r.isLate).toBe(true);
    expect(r.lateMinutes).toBe(15);
  });

  it("does not evaluate when no shift and no fallback", () => {
    const r = computeLateness({ clockInAtUtc: istToUtcIso(9, 45), shift: null, fallbackCutoff: null });
    expect(r.evaluated).toBe(false);
    expect(r.isLate).toBe(false);
  });

  it("skips overnight shifts in v1 (not evaluated)", () => {
    const r = computeLateness({
      clockInAtUtc: istToUtcIso(22, 30),
      shift: { start_time: "22:00", grace_minutes: 10, is_overnight: true },
      fallbackCutoff: null,
    });
    expect(r.evaluated).toBe(false);
  });
});
