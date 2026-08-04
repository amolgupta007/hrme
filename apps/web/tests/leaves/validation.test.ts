import { describe, it, expect } from "vitest";
import {
  findOverlap,
  computeRemainingDays,
  type LeaveInterval,
} from "@/lib/leaves/validation";

function iv(start: string, end: string, status = "pending"): LeaveInterval {
  return { start_date: start, end_date: end, status };
}

describe("findOverlap", () => {
  it("returns null for an empty set", () => {
    expect(findOverlap([], "2026-08-10", "2026-08-12")).toBeNull();
  });

  it("detects a fully nested overlap", () => {
    const existing = [iv("2026-08-01", "2026-08-31")];
    expect(findOverlap(existing, "2026-08-10", "2026-08-12")).toEqual(existing[0]);
  });

  it("treats touching endpoints as an overlap (existing.end === newStart) — dates are inclusive", () => {
    const existing = [iv("2026-08-01", "2026-08-10")];
    expect(findOverlap(existing, "2026-08-10", "2026-08-15")).toEqual(existing[0]);
  });

  it("treats touching endpoints as an overlap (existing.start === newEnd)", () => {
    const existing = [iv("2026-08-10", "2026-08-20")];
    expect(findOverlap(existing, "2026-08-05", "2026-08-10")).toEqual(existing[0]);
  });

  it("returns null for a one-day gap (adjacent, non-touching)", () => {
    const existing = [iv("2026-08-01", "2026-08-09")];
    expect(findOverlap(existing, "2026-08-10", "2026-08-15")).toBeNull();
  });

  it("ignores cancelled rows even when they overlap", () => {
    const existing = [iv("2026-08-01", "2026-08-31", "cancelled")];
    expect(findOverlap(existing, "2026-08-10", "2026-08-12")).toBeNull();
  });

  it("ignores rejected rows even when they overlap", () => {
    const existing = [iv("2026-08-01", "2026-08-31", "rejected")];
    expect(findOverlap(existing, "2026-08-10", "2026-08-12")).toBeNull();
  });

  it("counts pending and approved rows", () => {
    expect(findOverlap([iv("2026-08-01", "2026-08-31", "pending")], "2026-08-10", "2026-08-12")).not.toBeNull();
    expect(findOverlap([iv("2026-08-01", "2026-08-31", "approved")], "2026-08-10", "2026-08-12")).not.toBeNull();
  });

  it("returns the first matching active row and skips ignored ones before it", () => {
    const existing = [
      iv("2026-08-01", "2026-08-05", "rejected"),
      iv("2026-08-11", "2026-08-20", "approved"),
      iv("2026-08-12", "2026-08-14", "pending"),
    ];
    expect(findOverlap(existing, "2026-08-15", "2026-08-18")).toEqual(existing[1]);
  });
});

describe("computeRemainingDays", () => {
  it("returns the full allocation when nothing is used", () => {
    expect(computeRemainingDays({ daysPerYear: 21, usedApproved: 0 })).toBe(21);
  });

  it("returns zero at an exact-fit consumption", () => {
    expect(computeRemainingDays({ daysPerYear: 10, usedApproved: 10 })).toBe(0);
  });

  it("clamps to zero when used exceeds the allocation", () => {
    expect(computeRemainingDays({ daysPerYear: 10, usedApproved: 14 })).toBe(0);
  });

  it("supports fractional (half-day) remainders", () => {
    expect(computeRemainingDays({ daysPerYear: 21, usedApproved: 20.5 })).toBe(0.5);
  });

  it("mirrors listLeavePolicies: carry-forward is NOT added into remaining", () => {
    // daysPerYear is the sole allocation input; there is no carryForward term.
    expect(computeRemainingDays({ daysPerYear: 7, usedApproved: 2 })).toBe(5);
  });
});

describe("balance rejection at the call site (days > remaining)", () => {
  it("accepts an exact-fit request", () => {
    const remaining = computeRemainingDays({ daysPerYear: 10, usedApproved: 5 });
    expect(5 > remaining).toBe(false); // requested 5, remaining 5 -> allowed
  });

  it("rejects a request that exceeds remaining by half a day", () => {
    const remaining = computeRemainingDays({ daysPerYear: 10, usedApproved: 5 });
    expect(5.5 > remaining).toBe(true); // requested 5.5, remaining 5 -> rejected
  });
});
