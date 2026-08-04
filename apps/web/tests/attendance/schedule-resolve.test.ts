import { describe, it, expect } from "vitest";
import { resolveAssignmentForDate, computeScheduleDay } from "@/lib/attendance/schedule-resolve";
import type { WeekOffPolicy } from "@/lib/attendance/week-off";

describe("resolveAssignmentForDate", () => {
  it("returns null when there are no assignments", () => {
    expect(resolveAssignmentForDate([], "2026-08-04")).toBeNull();
  });

  it("returns null when no assignment covers the date", () => {
    const rows = [{ date_from: "2026-08-10", date_to: "2026-08-12" }];
    expect(resolveAssignmentForDate(rows, "2026-08-04")).toBeNull();
  });

  it("matches an ongoing assignment (date_to null) for a future date", () => {
    const rows = [{ id: "a", date_from: "2026-01-01", date_to: null }];
    expect(resolveAssignmentForDate(rows, "2026-08-04")?.id).toBe("a");
  });

  it("excludes a dated range once the date is past date_to", () => {
    const rows = [{ id: "a", date_from: "2026-08-01", date_to: "2026-08-03" }];
    expect(resolveAssignmentForDate(rows, "2026-08-04")).toBeNull();
    expect(resolveAssignmentForDate(rows, "2026-08-03")?.id).toBe("a");
  });

  it("is inclusive on both boundaries", () => {
    const rows = [{ id: "a", date_from: "2026-08-04", date_to: "2026-08-04" }];
    expect(resolveAssignmentForDate(rows, "2026-08-04")?.id).toBe("a");
  });

  it("latest date_from wins among multiple covering assignments", () => {
    const rows = [
      { id: "old", date_from: "2026-01-01", date_to: null },
      { id: "new", date_from: "2026-08-01", date_to: null },
    ];
    expect(resolveAssignmentForDate(rows, "2026-08-04")?.id).toBe("new");
    // order-independent
    expect(resolveAssignmentForDate([...rows].reverse(), "2026-08-04")?.id).toBe("new");
  });

  it("single-day cell assignment wins over an older ongoing range", () => {
    const rows = [
      { id: "range", date_from: "2026-01-01", date_to: null },
      { id: "cell", date_from: "2026-08-04", date_to: "2026-08-04" },
    ];
    expect(resolveAssignmentForDate(rows, "2026-08-04")?.id).toBe("cell");
  });
});

describe("computeScheduleDay flag combination", () => {
  const fiveDayMonFri: WeekOffPolicy = { week_type: 5, off_days: [0, 6] }; // Sun+Sat off
  const shiftAssignment = {
    shifts: { name: "General", start_time: "09:00:00", end_time: "18:00:00" },
  };

  it("reports a working weekday with its shift", () => {
    // 2026-08-04 is a Tuesday
    const d = computeScheduleDay({
      date: "2026-08-04",
      assignment: shiftAssignment,
      effectivePolicy: fiveDayMonFri,
      holidayName: null,
    });
    expect(d.weekday).toBe("Tue");
    expect(d.shiftName).toBe("General");
    expect(d.startTime).toBe("09:00:00");
    expect(d.endTime).toBe("18:00:00");
    expect(d.isWeekOff).toBe(false);
    expect(d.isHoliday).toBe(false);
    expect(d.holidayName).toBeNull();
  });

  it("flags a week-off day (Saturday) even when a shift is assigned", () => {
    // 2026-08-08 is a Saturday
    const d = computeScheduleDay({
      date: "2026-08-08",
      assignment: shiftAssignment,
      effectivePolicy: fiveDayMonFri,
      holidayName: null,
    });
    expect(d.weekday).toBe("Sat");
    expect(d.isWeekOff).toBe(true);
    // shift data still surfaced; UI decides how to render precedence
    expect(d.shiftName).toBe("General");
  });

  it("flags a holiday and carries its name", () => {
    const d = computeScheduleDay({
      date: "2026-08-15", // Independence Day (Saturday)
      assignment: null,
      effectivePolicy: fiveDayMonFri,
      holidayName: "Independence Day",
    });
    expect(d.isHoliday).toBe(true);
    expect(d.holidayName).toBe("Independence Day");
    expect(d.isWeekOff).toBe(true); // also a Saturday
  });

  it("reports no shift assigned as nulls", () => {
    const d = computeScheduleDay({
      date: "2026-08-05", // Wednesday
      assignment: null,
      effectivePolicy: fiveDayMonFri,
      holidayName: null,
    });
    expect(d.shiftName).toBeNull();
    expect(d.startTime).toBeNull();
    expect(d.endTime).toBeNull();
    expect(d.isWeekOff).toBe(false);
    expect(d.isHoliday).toBe(false);
  });
});
