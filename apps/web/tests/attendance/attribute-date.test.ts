import { describe, it, expect } from "vitest";
import { attributedDateForClockIn } from "@/lib/attendance/attribute-date";

describe("attributedDateForClockIn (start-date attribution, IST)", () => {
  it("daytime shift on the same IST date attributes to that date", () => {
    // 09:30 IST on 2026-06-07 = UTC 04:00 same day
    const clockInUtc = "2026-06-07T04:00:00.000Z";
    expect(attributedDateForClockIn(clockInUtc, { start_time: "09:00", end_time: "17:00", is_overnight: false })).toBe("2026-06-07");
  });

  it("overnight shift clock-in at 22:00 IST attributes to that date (start)", () => {
    // 22:00 IST on 2026-06-07 = UTC 16:30 same day
    const clockInUtc = "2026-06-07T16:30:00.000Z";
    expect(attributedDateForClockIn(clockInUtc, { start_time: "22:00", end_time: "06:00", is_overnight: true })).toBe("2026-06-07");
  });

  it("overnight shift clock-in at 00:30 IST attributes to PREVIOUS IST date (start of the shift was yesterday)", () => {
    // 00:30 IST on 2026-06-08 = UTC 19:00 on 2026-06-07
    const clockInUtc = "2026-06-07T19:00:00.000Z";
    expect(attributedDateForClockIn(clockInUtc, { start_time: "22:00", end_time: "06:00", is_overnight: true })).toBe("2026-06-07");
  });

  it("falls back to IST date when no shift is provided", () => {
    const clockInUtc = "2026-06-07T16:30:00.000Z"; // 22:00 IST
    expect(attributedDateForClockIn(clockInUtc, null)).toBe("2026-06-07");
  });
});
