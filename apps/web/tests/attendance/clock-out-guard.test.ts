import { describe, it, expect } from "vitest";
import {
  isTooSoonToClockOut,
  MIN_CLOCK_OUT_GAP_SECONDS,
} from "@/lib/attendance/clock-out-guard";

// A web OUT punch within computeDailyAttendance's 60s dedupe window of the IN
// punch (both null-location) is collapsed by dedupePunches — the rollup would
// stay clocked-in while clockOut reported success. The action blocks clock-out
// until the window has passed; this guard is the pure predicate it uses.
describe("isTooSoonToClockOut", () => {
  const inAt = "2026-06-23T03:30:00.000Z"; // 09:00 IST
  const inMs = new Date(inAt).getTime();

  it("blocks a clock-out inside the 60s dedupe window", () => {
    expect(isTooSoonToClockOut(inAt, inMs)).toBe(true);
    expect(isTooSoonToClockOut(inAt, inMs + 30_000)).toBe(true);
    expect(isTooSoonToClockOut(inAt, inMs + 59_999)).toBe(true);
  });

  it("allows a clock-out once the window has passed", () => {
    expect(isTooSoonToClockOut(inAt, inMs + 60_000)).toBe(false);
    expect(isTooSoonToClockOut(inAt, inMs + 8 * 3600_000)).toBe(false);
  });

  it("window mirrors the dedupe default (60s)", () => {
    expect(MIN_CLOCK_OUT_GAP_SECONDS).toBe(60);
  });

  it("fails open on an unparseable clock-in (never wedges clock-out)", () => {
    expect(isTooSoonToClockOut("garbage", inMs)).toBe(false);
  });
});
