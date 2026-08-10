import { describe, expect, it } from "vitest";
import { buildAttendanceMonthPayload } from "@/lib/mobile/attendance-payload";
import type { WeekOffPolicy } from "@jambahr/shared";

const weekOff: WeekOffPolicy = { week_type: 5, off_days: [0, 6], alt_saturday_rule: "none" };

describe("buildAttendanceMonthPayload", () => {
  it("runs the month calendar and classifies present/half_day/absent/holiday/leave/week_off", () => {
    const res = buildAttendanceMonthPayload({
      year: 2026,
      month: 7,
      records: [
        // Full day (Fri 2026-07-17): worked 480 >= threshold 240 → present
        {
          date: "2026-07-17",
          clock_in_at: "2026-07-17T04:00:00Z",
          clock_out_at: "2026-07-17T12:00:00Z",
          worked_minutes: 480,
          total_minutes: 480,
          source: "mobile",
          auto_closed: false,
          out_of_zone_count: 0,
          half_day_threshold_minutes: 240,
        },
        // Half day (Thu 2026-07-16): worked 120 < threshold 240 → half_day
        {
          date: "2026-07-16",
          clock_in_at: "2026-07-16T04:00:00Z",
          clock_out_at: "2026-07-16T06:00:00Z",
          worked_minutes: 120,
          total_minutes: 120,
          source: "device",
          auto_closed: false,
          out_of_zone_count: 1,
          half_day_threshold_minutes: 240,
        },
      ],
      punchEventsByDate: {},
      holidays: [{ date: "2026-07-15", name: "Test Holiday", is_optional: false }],
      approvedLeaves: [
        { start_date: "2026-07-13", end_date: "2026-07-13", days: 1, type: "paid" },
      ],
      weekOff,
      todayIst: "2026-07-17",
    });

    expect(res.month).toBe("2026-07");
    const byDate = Object.fromEntries(res.days.map((d) => [d.date, d.state]));
    expect(byDate["2026-07-17"]).toBe("present");
    expect(byDate["2026-07-16"]).toBe("half_day");
    expect(byDate["2026-07-15"]).toBe("holiday");
    expect(byDate["2026-07-13"]).toBe("leave");
    expect(byDate["2026-07-12"]).toBe("week_off"); // Sunday
    expect(byDate["2026-07-14"]).toBe("absent"); // past working day, no record
    expect(byDate["2026-07-31"]).toBe("future");
  });

  it("builds per-day details from punch events when present (pairs + dangling)", () => {
    const res = buildAttendanceMonthPayload({
      year: 2026,
      month: 7,
      records: [
        {
          date: "2026-07-17",
          clock_in_at: "2026-07-17T04:00:00Z",
          clock_out_at: "2026-07-17T12:00:00Z",
          worked_minutes: 420,
          total_minutes: 480,
          source: "device",
          auto_closed: false,
          out_of_zone_count: 2,
          half_day_threshold_minutes: 240,
        },
      ],
      punchEventsByDate: {
        "2026-07-17": [
          { date: "2026-07-17", punched_at: "2026-07-17T04:00:00Z", status: "approved" },
          { date: "2026-07-17", punched_at: "2026-07-17T07:00:00Z", status: "approved" },
          { date: "2026-07-17", punched_at: "2026-07-17T08:00:00Z", status: "approved" },
          { date: "2026-07-17", punched_at: "2026-07-17T12:00:00Z", status: "approved" },
          // A dangling extra punch (missed out)
          { date: "2026-07-17", punched_at: "2026-07-17T13:00:00Z", status: "approved" },
          // A rejected punch must be ignored
          { date: "2026-07-17", punched_at: "2026-07-17T15:00:00Z", status: "rejected" },
        ],
      },
      holidays: [],
      approvedLeaves: [],
      weekOff,
      todayIst: "2026-07-17",
    });

    const detail = res.details.find((d) => d.date === "2026-07-17")!;
    expect(detail.source).toBe("device");
    expect(detail.outOfZoneCount).toBe(2);
    // 2 closed pairs + 1 dangling in
    expect(detail.pairs).toEqual([
      { in: "2026-07-17T04:00:00Z", out: "2026-07-17T07:00:00Z" },
      { in: "2026-07-17T08:00:00Z", out: "2026-07-17T12:00:00Z" },
      { in: "2026-07-17T13:00:00Z", out: null },
    ]);
  });

  it("falls back to record clock_in/out for details when no punch events exist", () => {
    const res = buildAttendanceMonthPayload({
      year: 2026,
      month: 7,
      records: [
        {
          date: "2026-07-10",
          clock_in_at: "2026-07-10T04:00:00Z",
          clock_out_at: "2026-07-10T12:00:00Z",
          worked_minutes: 480,
          total_minutes: 480,
          source: "web",
          auto_closed: true,
          out_of_zone_count: 0,
          half_day_threshold_minutes: null,
        },
      ],
      punchEventsByDate: {},
      holidays: [],
      approvedLeaves: [],
      weekOff,
      todayIst: "2026-07-17",
    });

    const detail = res.details.find((d) => d.date === "2026-07-10")!;
    expect(detail.autoClosed).toBe(true);
    expect(detail.pairs).toEqual([{ in: "2026-07-10T04:00:00Z", out: "2026-07-10T12:00:00Z" }]);
  });
});

describe("buildAttendanceMonthPayload — pending regularizations", () => {
  it("keeps a pending-only shell record classified absent and lists its date as pending", () => {
    const res = buildAttendanceMonthPayload({
      year: 2026,
      month: 7,
      records: [
        // Rollup row created only to flag a pending regularization on an
        // absent day: no clock-in, no minutes.
        {
          date: "2026-07-14",
          clock_in_at: null,
          clock_out_at: null,
          worked_minutes: null,
          total_minutes: null,
          source: "mobile",
          auto_closed: false,
          out_of_zone_count: 0,
          half_day_threshold_minutes: null,
        },
      ],
      punchEventsByDate: {
        "2026-07-14": [
          { punched_at: "2026-07-14T04:00:00Z", status: "pending" },
          { punched_at: "2026-07-14T12:30:00Z", status: "pending" },
        ],
      },
      holidays: [],
      approvedLeaves: [],
      weekOff,
      todayIst: "2026-07-17",
    });

    const byDate = Object.fromEntries(res.days.map((d) => [d.date, d.state]));
    // Pending events must NOT flip the day to present before approval.
    expect(byDate["2026-07-14"]).toBe("absent");
    expect(res.pendingRegularizationDates).toEqual(["2026-07-14"]);
  });

  it("does not list dates whose events are all approved/rejected", () => {
    const res = buildAttendanceMonthPayload({
      year: 2026,
      month: 7,
      records: [],
      punchEventsByDate: {
        "2026-07-10": [{ punched_at: "2026-07-10T04:00:00Z", status: "approved" }],
        "2026-07-11": [{ punched_at: "2026-07-11T04:00:00Z", status: "rejected" }],
      },
      holidays: [],
      approvedLeaves: [],
      weekOff,
      todayIst: "2026-07-17",
    });
    expect(res.pendingRegularizationDates).toEqual([]);
  });
});
