import { describe, it, expect } from "vitest";
import {
  computeMonthCalendar,
  type DailyRecordLite,
  type HolidayLite,
  type ApprovedLeaveLite,
} from "@jambahr/shared/attendance/month-calendar";
import type { WeekOffPolicy } from "@jambahr/shared/attendance/week-off";

// June 2026 reference calendar (matches tests/attendance/week-off-v2.test.ts):
// 2026-06-01 = Monday ... 2026-06-06 = 1st Saturday ... 2026-06-07 = Sunday
// 2026-06-13 = 2nd Saturday, 2026-06-20 = 3rd Saturday, 2026-06-27 = 4th Saturday
// 2026-06-30 = Tuesday (last day of the month).

const sundayOnly: WeekOffPolicy = { week_type: 6, off_days: [0] };
const oddSaturdayOff: WeekOffPolicy = { week_type: 6, off_days: [0], alt_saturday_rule: "odd_off" };

function baseInput(overrides: Partial<Parameters<typeof computeMonthCalendar>[0]> = {}) {
  return {
    year: 2026,
    month: 6,
    records: [] as DailyRecordLite[],
    holidays: [] as HolidayLite[],
    approvedLeaves: [] as ApprovedLeaveLite[],
    weekOff: sundayOnly,
    todayIst: "2026-06-15",
    ...overrides,
  };
}

describe("computeMonthCalendar — month boundaries", () => {
  it("returns exactly one entry per calendar day, June has 30 days", () => {
    const days = computeMonthCalendar(baseInput());
    expect(days).toHaveLength(30);
    expect(days[0].date).toBe("2026-06-01");
    expect(days[29].date).toBe("2026-06-30");
  });

  it("handles a leap-February correctly (2028 is a leap year)", () => {
    const days = computeMonthCalendar(baseInput({ year: 2028, month: 2, todayIst: "2028-02-01" }));
    expect(days).toHaveLength(29);
    expect(days[28].date).toBe("2028-02-29");
  });

  it("handles a non-leap February correctly", () => {
    const days = computeMonthCalendar(baseInput({ year: 2026, month: 2, todayIst: "2026-02-01" }));
    expect(days).toHaveLength(28);
    expect(days[27].date).toBe("2026-02-28");
  });

  it("marks isToday only on the matching date", () => {
    const days = computeMonthCalendar(baseInput({ todayIst: "2026-06-15" }));
    const flagged = days.filter((d) => d.isToday);
    expect(flagged).toHaveLength(1);
    expect(flagged[0].date).toBe("2026-06-15");
  });
});

describe("computeMonthCalendar — past/today/future with no data", () => {
  it("past working day with no record and no holiday/leave/week-off is absent", () => {
    const days = computeMonthCalendar(baseInput({ todayIst: "2026-06-15" }));
    const day10 = days.find((d) => d.date === "2026-06-10")!; // Wednesday, past
    expect(day10.state).toBe("absent");
  });

  it("today with no record yet is no_data, not absent", () => {
    const days = computeMonthCalendar(baseInput({ todayIst: "2026-06-15" }));
    const today = days.find((d) => d.date === "2026-06-15")!; // Monday
    expect(today.state).toBe("no_data");
  });

  it("a date after today is future", () => {
    const days = computeMonthCalendar(baseInput({ todayIst: "2026-06-15" }));
    const day16 = days.find((d) => d.date === "2026-06-16")!; // Tuesday, future
    expect(day16.state).toBe("future");
  });
});

describe("computeMonthCalendar — alt-Saturday via isAltSaturdayOff", () => {
  it("odd_off marks the 1st/3rd Saturday as week_off but not the 2nd/4th", () => {
    const days = computeMonthCalendar(baseInput({ weekOff: oddSaturdayOff, todayIst: "2026-06-29" }));
    const firstSat = days.find((d) => d.date === "2026-06-06")!;
    const secondSat = days.find((d) => d.date === "2026-06-13")!;
    const thirdSat = days.find((d) => d.date === "2026-06-20")!;
    const fourthSat = days.find((d) => d.date === "2026-06-27")!;
    expect(firstSat.state).toBe("week_off");
    expect(thirdSat.state).toBe("week_off");
    expect(secondSat.state).not.toBe("week_off");
    expect(fourthSat.state).not.toBe("week_off");
  });

  it("every Sunday is week_off under the plain sundayOnly policy", () => {
    const days = computeMonthCalendar(baseInput({ todayIst: "2026-06-29" }));
    const sundays = ["2026-06-07", "2026-06-14", "2026-06-21", "2026-06-28"];
    for (const date of sundays) {
      expect(days.find((d) => d.date === date)!.state).toBe("week_off");
    }
  });
});

describe("computeMonthCalendar — holidays", () => {
  it("a required holiday marks the day holiday", () => {
    const holidays: HolidayLite[] = [{ date: "2026-06-17", is_optional: false, name: "Founders Day" }];
    const days = computeMonthCalendar(baseInput({ holidays, todayIst: "2026-06-29" }));
    expect(days.find((d) => d.date === "2026-06-17")!.state).toBe("holiday");
  });

  it("an optional holiday ALSO marks the day holiday (per spec: optional holidays count as holiday)", () => {
    const holidays: HolidayLite[] = [{ date: "2026-06-17", is_optional: true, name: "Regional Festival" }];
    const days = computeMonthCalendar(baseInput({ holidays, todayIst: "2026-06-29" }));
    expect(days.find((d) => d.date === "2026-06-17")!.state).toBe("holiday");
  });

  it("holiday takes precedence over an approved leave on the same date", () => {
    const holidays: HolidayLite[] = [{ date: "2026-06-17", is_optional: false, name: "Founders Day" }];
    const approvedLeaves: ApprovedLeaveLite[] = [
      { start_date: "2026-06-16", end_date: "2026-06-18", days: 3, type: "casual" },
    ];
    const days = computeMonthCalendar(baseInput({ holidays, approvedLeaves, todayIst: "2026-06-29" }));
    expect(days.find((d) => d.date === "2026-06-17")!.state).toBe("holiday");
  });
});

describe("computeMonthCalendar — leave precedence", () => {
  it("a date inside an approved leave range is leave", () => {
    const approvedLeaves: ApprovedLeaveLite[] = [
      { start_date: "2026-06-09", end_date: "2026-06-11", days: 3, type: "casual" },
    ];
    const days = computeMonthCalendar(baseInput({ approvedLeaves, todayIst: "2026-06-15" }));
    expect(days.find((d) => d.date === "2026-06-09")!.state).toBe("leave");
    expect(days.find((d) => d.date === "2026-06-10")!.state).toBe("leave");
    expect(days.find((d) => d.date === "2026-06-11")!.state).toBe("leave");
    expect(days.find((d) => d.date === "2026-06-08")!.state).not.toBe("leave");
  });

  it("leave takes precedence over week-off on the same date", () => {
    // 2026-06-07 is a Sunday (week_off under sundayOnly).
    const approvedLeaves: ApprovedLeaveLite[] = [
      { start_date: "2026-06-05", end_date: "2026-06-08", days: 4, type: "sick" },
    ];
    const days = computeMonthCalendar(baseInput({ approvedLeaves, todayIst: "2026-06-15" }));
    expect(days.find((d) => d.date === "2026-06-07")!.state).toBe("leave");
  });
});

describe("computeMonthCalendar — week-off precedence over attendance data", () => {
  it("week-off wins even when a record with worked minutes exists that day", () => {
    // 2026-06-07 is a Sunday (week_off).
    const records: DailyRecordLite[] = [{ date: "2026-06-07", minutes: 240 }];
    const days = computeMonthCalendar(baseInput({ records, todayIst: "2026-06-15" }));
    expect(days.find((d) => d.date === "2026-06-07")!.state).toBe("week_off");
  });
});

describe("computeMonthCalendar — attendance-derived present/half_day", () => {
  it("minutes >= half_day_threshold_minutes is present", () => {
    const records: DailyRecordLite[] = [
      { date: "2026-06-09", minutes: 300, half_day_threshold_minutes: 240 },
    ];
    const days = computeMonthCalendar(baseInput({ records, todayIst: "2026-06-15" }));
    const day = days.find((d) => d.date === "2026-06-09")!;
    expect(day.state).toBe("present");
    expect(day.minutes).toBe(300);
  });

  it("minutes < half_day_threshold_minutes is half_day", () => {
    const records: DailyRecordLite[] = [
      { date: "2026-06-09", minutes: 120, half_day_threshold_minutes: 240 },
    ];
    const days = computeMonthCalendar(baseInput({ records, todayIst: "2026-06-15" }));
    const day = days.find((d) => d.date === "2026-06-09")!;
    expect(day.state).toBe("half_day");
    expect(day.minutes).toBe(120);
  });

  it("skips half-day classification entirely when the record has no half_day_threshold_minutes", () => {
    const records: DailyRecordLite[] = [{ date: "2026-06-09", minutes: 60 }]; // very low, but no threshold known
    const days = computeMonthCalendar(baseInput({ records, todayIst: "2026-06-15" }));
    const day = days.find((d) => d.date === "2026-06-09")!;
    expect(day.state).toBe("present");
  });

  it("a record exists but minutes is null (e.g. incomplete single punch) is still present, not absent", () => {
    const records: DailyRecordLite[] = [
      { date: "2026-06-09", minutes: null, half_day_threshold_minutes: 240 },
    ];
    const days = computeMonthCalendar(baseInput({ records, todayIst: "2026-06-15" }));
    const day = days.find((d) => d.date === "2026-06-09")!;
    expect(day.state).toBe("present");
    expect(day.minutes).toBeNull();
  });
});
