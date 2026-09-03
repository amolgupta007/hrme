import { describe, it, expect } from "vitest";
import { describeHalfDay, resolveHalfDayState } from "@/lib/leaves/half-day";

/**
 * Web half-day display/state helpers (dialog chips + leaves-table indicator).
 * Pure logic only — the repo has no component-test infra, so the JSX stays a
 * thin wiring layer over these functions.
 */

describe("describeHalfDay", () => {
  it("returns null when neither end is a half day", () => {
    expect(describeHalfDay(false, false)).toBeNull();
  });

  it("describes a half day on the start date", () => {
    expect(describeHalfDay(true, false)).toEqual({
      marker: "½",
      label: "Half day on start",
    });
  });

  it("describes a half day on the end date", () => {
    expect(describeHalfDay(false, true)).toEqual({
      marker: "½",
      label: "Half day on end",
    });
  });

  it("describes a half day on both ends", () => {
    expect(describeHalfDay(true, true)).toEqual({
      marker: "½",
      label: "Half day on both ends",
    });
  });

  it("treats null flags from legacy rows as not-half-day", () => {
    // Rows written before migration 103 backfilled the default can read null
    // through the `select("*")` in listLeaveRequests.
    expect(describeHalfDay(null, null)).toBeNull();
  });
});

describe("resolveHalfDayState", () => {
  it("offers no chips until both dates are chosen", () => {
    expect(resolveHalfDayState("", "", true, true)).toEqual({
      mode: "none",
      startHalfDay: false,
      endHalfDay: false,
    });
    expect(resolveHalfDayState("2026-09-10", "", true, false)).toEqual({
      mode: "none",
      startHalfDay: false,
      endHalfDay: false,
    });
  });

  it("offers a single chip when start and end are the same date", () => {
    expect(resolveHalfDayState("2026-09-10", "2026-09-10", true, false)).toEqual({
      mode: "single",
      startHalfDay: true,
      endHalfDay: false,
    });
  });

  it("forces the end flag off in single-day mode so days can never collapse to zero", () => {
    // Both flags on one date would be 1 - 0.5 - 0.5 = 0, which
    // computeLeaveDays rejects. Single-day mode makes that unreachable.
    expect(resolveHalfDayState("2026-09-10", "2026-09-10", true, true)).toEqual({
      mode: "single",
      startHalfDay: true,
      endHalfDay: false,
    });
  });

  it("offers both chips across a multi-day range and preserves each flag", () => {
    expect(resolveHalfDayState("2026-09-10", "2026-09-14", false, true)).toEqual({
      mode: "range",
      startHalfDay: false,
      endHalfDay: true,
    });
  });

  it("offers no chips when the range is inverted", () => {
    expect(resolveHalfDayState("2026-09-14", "2026-09-10", true, true)).toEqual({
      mode: "none",
      startHalfDay: false,
      endHalfDay: false,
    });
  });

  it("offers no chips when a date is malformed", () => {
    expect(resolveHalfDayState("2026-02-30", "2026-02-30", true, false)).toEqual({
      mode: "none",
      startHalfDay: false,
      endHalfDay: false,
    });
  });
});
