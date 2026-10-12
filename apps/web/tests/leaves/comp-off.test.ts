import { describe, it, expect } from "vitest";
import {
  validateCompOffRequest,
  describeWorkedDayAttendance,
  formatWorkedDate,
  isCompOff,
} from "../../src/lib/leaves/comp-off";

const ok = {
  startDate: "2026-10-14",
  endDate: "2026-10-14",
  days: 1,
  workedDate: "2026-10-11",
  reason: "Client launch support",
  todayIst: "2026-10-12",
  workedDayIsNonWorking: true as boolean | null,
};

describe("validateCompOffRequest", () => {
  it("accepts a single day off after a worked week-off", () => {
    expect(validateCompOffRequest(ok)).toBeNull();
  });

  it("accepts a half day", () => {
    expect(validateCompOffRequest({ ...ok, days: 0.5 })).toBeNull();
  });

  it("allows an unverifiable day (no week-off policy anywhere)", () => {
    expect(validateCompOffRequest({ ...ok, workedDayIsNonWorking: null })).toBeNull();
  });

  it("requires the worked day and a reason", () => {
    expect(validateCompOffRequest({ ...ok, workedDate: "" })).toMatch(/day you worked/);
    expect(validateCompOffRequest({ ...ok, workedDate: "11/10/2026" })).toMatch(/day you worked/);
    expect(validateCompOffRequest({ ...ok, reason: "   " })).toMatch(/reason/);
  });

  it("is one day at most", () => {
    expect(validateCompOffRequest({ ...ok, endDate: "2026-10-15", days: 2 })).toMatch(/single date/);
    expect(validateCompOffRequest({ ...ok, days: 2 })).toMatch(/full or half/);
  });

  it("the worked day must be in the past and before the day off", () => {
    expect(validateCompOffRequest({ ...ok, workedDate: "2026-10-13" })).toMatch(/future/);
    expect(validateCompOffRequest({ ...ok, workedDate: "2026-10-14", todayIst: "2026-10-20" })).toMatch(/after the day you worked/);
    expect(validateCompOffRequest({ ...ok, workedDate: "2026-10-12", startDate: "2026-10-12", endDate: "2026-10-12" })).toMatch(/after/);
  });

  it("rejects a known working day, naming it", () => {
    expect(validateCompOffRequest({ ...ok, workedDayIsNonWorking: false })).toBe(
      "Sun 11 Oct 2026 was a working day for you — comp-off is for working a week-off or holiday"
    );
  });
});

describe("describeWorkedDayAttendance", () => {
  it("clock-in/out with hours, in IST", () => {
    expect(
      describeWorkedDayAttendance({
        clock_in_at: "2026-10-11T04:32:00Z",
        clock_out_at: "2026-10-11T13:10:00Z",
        total_minutes: 518,
        device_first_seen_at: null,
        device_last_seen_at: null,
      })
    ).toBe("Clocked 10:02–18:40 (8h 38m)");
  });

  it("open shift", () => {
    expect(
      describeWorkedDayAttendance({
        clock_in_at: "2026-10-11T04:32:00Z",
        clock_out_at: null,
        total_minutes: null,
        device_first_seen_at: null,
        device_last_seen_at: null,
      })
    ).toBe("Clocked in 10:02, no clock-out");
  });

  it("device presence only (web timekeeping orgs)", () => {
    expect(
      describeWorkedDayAttendance({
        clock_in_at: null,
        clock_out_at: null,
        total_minutes: 0,
        device_first_seen_at: "2026-10-11T04:28:00Z",
        device_last_seen_at: "2026-10-11T13:15:00Z",
      })
    ).toBe("Device 09:58–18:45");
  });

  it("nothing recorded", () => {
    expect(describeWorkedDayAttendance(null)).toBe("No attendance recorded");
  });
});

describe("helpers", () => {
  it("formats the worked date with weekday", () => {
    expect(formatWorkedDate("2026-10-03")).toBe("Sat 3 Oct 2026");
  });
  it("isCompOff", () => {
    expect(isCompOff("comp_off")).toBe(true);
    expect(isCompOff("casual")).toBe(false);
    expect(isCompOff(null)).toBe(false);
  });
});
