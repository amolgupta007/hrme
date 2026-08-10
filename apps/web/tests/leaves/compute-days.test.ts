import { describe, it, expect } from "vitest";
import { computeLeaveDays } from "@jambahr/shared/leaves/compute-days";

describe("computeLeaveDays — single day", () => {
  it("no half-day flags is 1.0 day", () => {
    const result = computeLeaveDays("2026-08-10", "2026-08-10", false, false);
    expect(result).toEqual({ ok: true, days: 1 });
  });

  it("half-day start only is 0.5 day", () => {
    const result = computeLeaveDays("2026-08-10", "2026-08-10", true, false);
    expect(result).toEqual({ ok: true, days: 0.5 });
  });

  it("half-day end only is 0.5 day", () => {
    const result = computeLeaveDays("2026-08-10", "2026-08-10", false, true);
    expect(result).toEqual({ ok: true, days: 0.5 });
  });

  it("both half-day flags on the same date collapses to 0 and is rejected", () => {
    const result = computeLeaveDays("2026-08-10", "2026-08-10", true, true);
    expect(result).toEqual({ ok: false, error: "Leave must be at least half a day" });
  });
});

describe("computeLeaveDays — multi-day ranges", () => {
  it("5-day range with no flags is 5.0 days (inclusive, weekends not excluded)", () => {
    // 2026-08-10 is a Monday; range spans through Friday 2026-08-14.
    const result = computeLeaveDays("2026-08-10", "2026-08-14", false, false);
    expect(result).toEqual({ ok: true, days: 5 });
  });

  it("5-day range with both half-day flags is 4.0 days (5 - 1.0)", () => {
    const result = computeLeaveDays("2026-08-10", "2026-08-14", true, true);
    expect(result).toEqual({ ok: true, days: 4 });
  });

  it("5-day range with only half-day start is 4.5 days", () => {
    const result = computeLeaveDays("2026-08-10", "2026-08-14", true, false);
    expect(result).toEqual({ ok: true, days: 4.5 });
  });

  it("range spanning a weekend counts the weekend days (not excluded)", () => {
    // 2026-08-08 (Sat) through 2026-08-10 (Mon) = 3 inclusive calendar days.
    const result = computeLeaveDays("2026-08-08", "2026-08-10", false, false);
    expect(result).toEqual({ ok: true, days: 3 });
  });
});

describe("computeLeaveDays — rejections", () => {
  it("2-day range with both half-day flags collapses to 1.0 (not rejected)", () => {
    const result = computeLeaveDays("2026-08-10", "2026-08-11", true, true);
    expect(result).toEqual({ ok: true, days: 1 });
  });

  it("inverted range (end before start) is rejected as invalid", () => {
    const result = computeLeaveDays("2026-08-14", "2026-08-10", false, false);
    expect(result).toEqual({ ok: false, error: "Invalid date range" });
  });

  it("malformed date format is rejected as invalid", () => {
    const result = computeLeaveDays("10-08-2026", "2026-08-14", false, false);
    expect(result).toEqual({ ok: false, error: "Invalid date range" });
  });

  it("empty date strings are rejected as invalid", () => {
    const result = computeLeaveDays("", "", false, false);
    expect(result).toEqual({ ok: false, error: "Invalid date range" });
  });

  it("calendar-overflow date (Feb 30) is rejected as invalid, not silently rolled forward", () => {
    const result = computeLeaveDays("2026-02-28", "2026-02-30", false, false);
    expect(result).toEqual({ ok: false, error: "Invalid date range" });
  });
});

describe("computeLeaveDays — month/year boundaries", () => {
  it("range crossing a month boundary counts correctly (Jan 30 - Feb 2)", () => {
    // 2026-01-30, 31, 2026-02-01, 02 = 4 inclusive calendar days.
    const result = computeLeaveDays("2026-01-30", "2026-02-02", false, false);
    expect(result).toEqual({ ok: true, days: 4 });
  });

  it("range crossing a year boundary counts correctly (Dec 30 - Jan 2)", () => {
    // 2025-12-30, 31, 2026-01-01, 02 = 4 inclusive calendar days.
    const result = computeLeaveDays("2025-12-30", "2026-01-02", false, false);
    expect(result).toEqual({ ok: true, days: 4 });
  });

  it("range crossing a leap-February boundary counts Feb 29 correctly", () => {
    // 2028 is a leap year. 2028-02-28, 29, 2028-03-01 = 3 inclusive calendar days.
    const result = computeLeaveDays("2028-02-28", "2028-03-01", false, false);
    expect(result).toEqual({ ok: true, days: 3 });
  });
});
