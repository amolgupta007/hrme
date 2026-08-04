import { describe, it, expect } from "vitest";
import {
  buildReportData, enumerateDates, chunkDateColumns, sourceMarker,
  stateLetter, csvRows, formatHours,
  type RawReportInputs,
} from "@/lib/reports/attendance-report";
import { validateRange } from "@/lib/reports/fetch-report-data";

const POLICY = { week_type: 6 as const, off_days: [0] }; // Sundays off

function baseInput(over: Partial<RawReportInputs> = {}): RawReportInputs {
  return {
    from: "2026-07-01", to: "2026-07-07", todayIst: "2026-07-30",
    orgName: "TestOrg", generatedAt: "2026-07-30T10:00:00.000Z",
    employees: [{ id: "e1", name: "Priya S", department_id: null, department: null }],
    records: [], events: [], holidays: [], leaves: [],
    orgPolicy: POLICY, deptOverrides: {}, empOverrides: {},
    ...over,
  };
}

describe("enumerateDates", () => {
  it("spans month boundaries inclusively", () => {
    expect(enumerateDates("2026-06-29", "2026-07-02"))
      .toEqual(["2026-06-29", "2026-06-30", "2026-07-01", "2026-07-02"]);
  });
});

describe("day-state precedence", () => {
  it("holiday beats leave, week-off and worked", () => {
    const emp = buildReportData(baseInput({
      holidays: [{ date: "2026-07-05" }], // a Sunday (week-off) too
      leaves: [{ employee_id: "e1", start_date: "2026-07-05", end_date: "2026-07-05" }],
      records: [{ employee_id: "e1", date: "2026-07-05", clock_in_at: "2026-07-05T03:30:00Z", clock_out_at: "2026-07-05T12:30:00Z", total_minutes: 480, source: "device", auto_closed: false, out_of_zone_count: 0, is_late: false }],
    })).employees[0];
    const d = emp.days.find((x) => x.date === "2026-07-05")!;
    expect(d.state).toBe("holiday");
    expect(d.pairs.length).toBeGreaterThan(0); // detail keeps punches
    // Plan §2/§5 Task 1: worked-on-off-day days now KEEP their worked minutes
    // and source marker (previously zeroed since state !== "worked"); the
    // hours fold into totalMinutes but count under the off-state summary
    // bucket, not fullDays/daysPresent — "worked holiday hours invisible" fix.
    expect(d.minutes).toBe(480);
    expect(d.marker).toBe("d");
    expect(d.statusCode).toBe("H");
    expect(emp.totalMinutes).toBe(480);
    expect(emp.daysPresent).toBe(0);
    expect(emp.summary.holidays).toBe(1);
    expect(emp.summary.fullDays).toBe(0);
  });
  it("leave beats week-off; week-off beats absent", () => {
    const emp = buildReportData(baseInput({
      leaves: [{ employee_id: "e1", start_date: "2026-07-12", end_date: "2026-07-12" }],
      from: "2026-07-05", to: "2026-07-12",
    })).employees[0];
    expect(emp.days.find((x) => x.date === "2026-07-12")!.state).toBe("leave"); // a Sunday
    expect(emp.days.find((x) => x.date === "2026-07-05")!.state).toBe("week_off");
    expect(emp.days.find((x) => x.date === "2026-07-06")!.state).toBe("absent");
  });
  it("future dates are future, not absent", () => {
    const d = buildReportData(baseInput({ todayIst: "2026-07-03" }))
      .employees[0].days.find((x) => x.date === "2026-07-04")!;
    expect(d.state).toBe("future");
  });
  it("employee week-off override fully replaces org policy", () => {
    const d = buildReportData(baseInput({
      empOverrides: { e1: { week_type: 6, off_days: [3] } }, // Wednesdays
    })).employees[0];
    expect(d.days.find((x) => x.date === "2026-07-01")!.state).toBe("week_off"); // Wed
    expect(d.days.find((x) => x.date === "2026-07-05")!.state).toBe("absent");   // Sun no longer off
  });
});

describe("worked-on-off-day (plan §2 behavioral change)", () => {
  it("worked-on-week-off keeps minutes, counts in totalMinutes and summary.weekOffs (not fullDays)", () => {
    const emp = buildReportData(baseInput({
      // 2026-07-05 is a Sunday (org policy off-day).
      records: [{ employee_id: "e1", date: "2026-07-05", clock_in_at: "2026-07-05T03:30:00Z", clock_out_at: "2026-07-05T11:30:00Z", total_minutes: 480, source: "device", auto_closed: false, out_of_zone_count: 0, is_late: false }],
    })).employees[0];
    const d = emp.days.find((x) => x.date === "2026-07-05")!;
    expect(d.state).toBe("week_off");
    expect(d.statusCode).toBe("WO");
    expect(d.minutes).toBe(480);
    expect(d.marker).toBe("d");
    expect(emp.totalMinutes).toBe(480);
    expect(emp.daysPresent).toBe(0);
    expect(emp.summary.weekOffs).toBe(1);
    expect(emp.summary.fullDays).toBe(0);
  });

  it("worked-on-leave keeps minutes and counts under summary.leaves", () => {
    const emp = buildReportData(baseInput({
      leaves: [{ employee_id: "e1", start_date: "2026-07-02", end_date: "2026-07-02" }],
      records: [{ employee_id: "e1", date: "2026-07-02", clock_in_at: "2026-07-02T03:30:00Z", clock_out_at: "2026-07-02T09:30:00Z", total_minutes: 360, source: "web", auto_closed: false, out_of_zone_count: 0, is_late: false }],
    })).employees[0];
    const d = emp.days.find((x) => x.date === "2026-07-02")!;
    expect(d.state).toBe("leave");
    expect(d.statusCode).toBe("L");
    expect(d.minutes).toBe(360);
    expect(emp.summary.leaves).toBe(1);
    expect(emp.summary.fullDays).toBe(0);
    expect(emp.daysPresent).toBe(0);
  });

  it("non-worked off-days have zero minutes and no marker", () => {
    const emp = buildReportData(baseInput({})).employees[0]; // no records at all
    const d = emp.days.find((x) => x.date === "2026-07-05")!; // Sunday, no punches
    expect(d.state).toBe("week_off");
    expect(d.minutes).toBe(0);
    expect(d.marker).toBe("");
  });
});

describe("half-day classification (plan §3)", () => {
  it("minutes below threshold -> HD", () => {
    const d = buildReportData(baseInput({
      records: [{ employee_id: "e1", date: "2026-07-01", clock_in_at: "2026-07-01T03:30:00Z", clock_out_at: "2026-07-01T06:30:00Z", total_minutes: 180, source: "device", auto_closed: false, out_of_zone_count: 0, is_late: false, half_day_threshold_minutes: 240 }],
    })).employees[0].days.find((x) => x.date === "2026-07-01")!;
    expect(d.statusCode).toBe("HD");
  });
  it("minutes exactly at threshold -> FD (not HD)", () => {
    const d = buildReportData(baseInput({
      records: [{ employee_id: "e1", date: "2026-07-01", clock_in_at: "2026-07-01T03:30:00Z", clock_out_at: "2026-07-01T07:30:00Z", total_minutes: 240, source: "device", auto_closed: false, out_of_zone_count: 0, is_late: false, half_day_threshold_minutes: 240 }],
    })).employees[0].days.find((x) => x.date === "2026-07-01")!;
    expect(d.statusCode).toBe("FD");
  });
  it("minutes above threshold -> FD", () => {
    const d = buildReportData(baseInput({
      records: [{ employee_id: "e1", date: "2026-07-01", clock_in_at: "2026-07-01T03:30:00Z", clock_out_at: "2026-07-01T12:30:00Z", total_minutes: 480, source: "device", auto_closed: false, out_of_zone_count: 0, is_late: false, half_day_threshold_minutes: 240 }],
    })).employees[0].days.find((x) => x.date === "2026-07-01")!;
    expect(d.statusCode).toBe("FD");
  });
  it("no threshold on the record -> FD even with very low minutes", () => {
    const d = buildReportData(baseInput({
      records: [{ employee_id: "e1", date: "2026-07-01", clock_in_at: "2026-07-01T03:30:00Z", clock_out_at: "2026-07-01T04:30:00Z", total_minutes: 60, source: "device", auto_closed: false, out_of_zone_count: 0, is_late: false }],
    })).employees[0].days.find((x) => x.date === "2026-07-01")!;
    expect(d.statusCode).toBe("FD");
  });
  it("absent day is never classified HD (no threshold applies)", () => {
    const d = buildReportData(baseInput({})).employees[0].days.find((x) => x.date === "2026-07-06")!; // Monday, no punches
    expect(d.state).toBe("absent");
    expect(d.statusCode).toBe("A");
  });
});

describe("firstIn / lastOut", () => {
  it("multi-pair day: firstIn = first pair's in, lastOut = last pair's out", () => {
    const d = buildReportData(baseInput({
      records: [{ employee_id: "e1", date: "2026-07-02", clock_in_at: "2026-07-02T03:32:00Z", clock_out_at: "2026-07-02T12:50:00Z", total_minutes: 492, source: "device", auto_closed: false, out_of_zone_count: 0, is_late: false }],
      events: [
        { employee_id: "e1", punched_at: "2026-07-02T03:32:00Z" }, // 09:02 IST
        { employee_id: "e1", punched_at: "2026-07-02T07:41:00Z" },
        { employee_id: "e1", punched_at: "2026-07-02T08:28:00Z" },
        { employee_id: "e1", punched_at: "2026-07-02T12:50:00Z" }, // 18:20 IST
      ],
    })).employees[0].days.find((x) => x.date === "2026-07-02")!;
    expect(d.firstIn).toBe("09:02");
    expect(d.lastOut).toBe("18:20");
  });
  it("dangling last pair (open punch) -> lastOut is null", () => {
    const d = buildReportData(baseInput({
      records: [{ employee_id: "e1", date: "2026-07-02", clock_in_at: "2026-07-02T03:30:00Z", clock_out_at: null, total_minutes: null, source: "device", auto_closed: false, out_of_zone_count: 0, is_late: false }],
      events: [{ employee_id: "e1", punched_at: "2026-07-02T03:30:00Z" }],
    })).employees[0].days.find((x) => x.date === "2026-07-02")!;
    expect(d.firstIn).toBe("09:00");
    expect(d.lastOut).toBeNull();
  });
  it("no punches -> both null", () => {
    const d = buildReportData(baseInput({})).employees[0].days.find((x) => x.date === "2026-07-06")!; // absent Monday
    expect(d.firstIn).toBeNull();
    expect(d.lastOut).toBeNull();
  });
});

describe("per-employee summary counts", () => {
  it("tallies a mixed week correctly, excluding future days", () => {
    const emp = buildReportData(baseInput({
      from: "2026-07-01", to: "2026-07-08", todayIst: "2026-07-07",
      holidays: [{ date: "2026-07-03" }],
      leaves: [{ employee_id: "e1", start_date: "2026-07-04", end_date: "2026-07-04" }],
      records: [
        // full day
        { employee_id: "e1", date: "2026-07-01", clock_in_at: "2026-07-01T03:30:00Z", clock_out_at: "2026-07-01T11:30:00Z", total_minutes: 480, source: "device", auto_closed: false, out_of_zone_count: 0, is_late: false, half_day_threshold_minutes: 240 },
        // half day
        { employee_id: "e1", date: "2026-07-02", clock_in_at: "2026-07-02T03:30:00Z", clock_out_at: "2026-07-02T06:30:00Z", total_minutes: 180, source: "device", auto_closed: false, out_of_zone_count: 0, is_late: false, half_day_threshold_minutes: 240 },
      ],
      // Remaining days in the 8-day range (Wed 07-01 .. Wed 07-08), no punches:
      // 07-03 Fri = holiday, 07-04 Sat = leave, 07-05 Sun = week-off (org policy),
      // 07-06 Mon & 07-07 Tue = absent, 07-08 Wed = future (> todayIst).
    })).employees[0];
    expect(emp.summary).toEqual({
      fullDays: 1, halfDays: 1, absents: 2, weekOffs: 1, leaves: 1, holidays: 1,
    });
    // 2026-07-08 is future (todayIst = 07) and must not be counted anywhere.
    const total = Object.values(emp.summary).reduce((a, b) => a + b, 0);
    expect(total).toBe(7); // 8-day range minus the 1 future day
  });
});

describe("worked days: pairs, fallback, markers", () => {
  it("pairs from punch events (IST day attribution) with worked minutes", () => {
    const d = buildReportData(baseInput({
      records: [{ employee_id: "e1", date: "2026-07-02", clock_in_at: "2026-07-02T03:32:00Z", clock_out_at: "2026-07-02T12:50:00Z", total_minutes: 492, source: "device", auto_closed: false, out_of_zone_count: 1, is_late: true }],
      events: [
        { employee_id: "e1", punched_at: "2026-07-02T03:32:00Z" }, // 09:02 IST
        { employee_id: "e1", punched_at: "2026-07-02T07:41:00Z" },
        { employee_id: "e1", punched_at: "2026-07-02T08:28:00Z" },
        { employee_id: "e1", punched_at: "2026-07-02T12:50:00Z" },
      ],
    })).employees[0].days.find((x) => x.date === "2026-07-02")!;
    expect(d.state).toBe("worked");
    expect(d.pairs).toHaveLength(2);
    expect(d.marker).toBe("d");
    expect(d.outOfZoneCount).toBe(1);
    expect(d.isLate).toBe(true);
    expect(d.singlePunch).toBe(false);
  });
  it("falls back to record clock_in/out as one pair when no events", () => {
    const d = buildReportData(baseInput({
      records: [{ employee_id: "e1", date: "2026-07-02", clock_in_at: "2026-07-02T03:30:00Z", clock_out_at: "2026-07-02T11:30:00Z", total_minutes: 480, source: "web", auto_closed: false, out_of_zone_count: 0, is_late: false }],
    })).employees[0].days.find((x) => x.date === "2026-07-02")!;
    expect(d.pairs).toHaveLength(1);
    expect(d.minutes).toBe(480);
    expect(d.marker).toBe("w");
  });
  it("dangling single punch flags singlePunch", () => {
    const d = buildReportData(baseInput({
      records: [{ employee_id: "e1", date: "2026-07-02", clock_in_at: "2026-07-02T03:30:00Z", clock_out_at: null, total_minutes: null, source: "device", auto_closed: false, out_of_zone_count: 0, is_late: false }],
      events: [{ employee_id: "e1", punched_at: "2026-07-02T03:30:00Z" }],
    })).employees[0].days.find((x) => x.date === "2026-07-02")!;
    expect(d.singlePunch).toBe(true);
  });
  it("totals and daysPresent aggregate worked days only", () => {
    const emp = buildReportData(baseInput({
      records: [
        { employee_id: "e1", date: "2026-07-01", clock_in_at: "2026-07-01T03:30:00Z", clock_out_at: "2026-07-01T11:30:00Z", total_minutes: 480, source: "device", auto_closed: false, out_of_zone_count: 0, is_late: false },
        { employee_id: "e1", date: "2026-07-02", clock_in_at: "2026-07-02T03:30:00Z", clock_out_at: "2026-07-02T12:00:00Z", total_minutes: 510, source: "auto_close", auto_closed: true, out_of_zone_count: 0, is_late: false },
      ],
    })).employees[0];
    expect(emp.totalMinutes).toBe(990);
    expect(emp.daysPresent).toBe(2);
    expect(emp.days.find((x) => x.date === "2026-07-02")!.marker).toBe("*");
    expect(emp.days.find((x) => x.date === "2026-07-02")!.autoClosed).toBe(true);
  });
});

describe("helpers", () => {
  it("sourceMarker maps all record sources", () => {
    expect(sourceMarker("device")).toBe("d");
    expect(sourceMarker("mobile")).toBe("m");
    expect(sourceMarker("web")).toBe("w");
    expect(sourceMarker("auto_close")).toBe("*");
    expect(sourceMarker(null)).toBe("");
  });
  it("stateLetter covers all non-worked states", () => {
    expect(stateLetter("week_off")).toBe("W");
    expect(stateLetter("holiday")).toBe("H");
    expect(stateLetter("leave")).toBe("L");
    expect(stateLetter("absent")).toBe("A");
    expect(stateLetter("future")).toBe("–");
    expect(stateLetter("worked")).toBe("");
  });
  it("chunkDateColumns splits at 16 by default", () => {
    const dates = enumerateDates("2026-07-01", "2026-07-31");
    const chunks = chunkDateColumns(dates);
    expect(chunks.map((c) => c.length)).toEqual([16, 15]);
  });
  it("formatHours renders one decimal", () => {
    expect(formatHours(492)).toBe("8.2");
    expect(formatHours(0)).toBe("0.0");
  });
});

describe("csvRows", () => {
  it("emits header + one row per employee-day with pair string and status_code", () => {
    const rows = csvRows(buildReportData(baseInput({
      records: [{ employee_id: "e1", date: "2026-07-02", clock_in_at: "2026-07-02T03:32:00Z", clock_out_at: "2026-07-02T12:50:00Z", total_minutes: 492, source: "mobile", auto_closed: false, out_of_zone_count: 0, is_late: false }],
      events: [
        { employee_id: "e1", punched_at: "2026-07-02T03:32:00Z" },
        { employee_id: "e1", punched_at: "2026-07-02T12:50:00Z" },
      ],
    })));
    // status_code column added after "state" (plan §5 Task 1).
    expect(rows[0]).toEqual(["date", "employee", "department", "state", "status_code", "hours", "punch_pairs", "source", "auto_closed", "out_of_zone", "late"]);
    const worked = rows.find((r) => r[0] === "2026-07-02")!;
    expect(worked[1]).toBe("Priya S");
    expect(worked[3]).toBe("worked");
    expect(worked[4]).toBe("FD");
    expect(worked[5]).toBe("8.2");
    expect(worked[6]).toBe("09:02-18:20");
    expect(worked[7]).toBe("mobile");
    expect(rows).toHaveLength(1 + 7); // header + 7 days
  });

  it("worked-on-off-day rows emit hours + status_code even though state is week_off/holiday/leave", () => {
    const rows = csvRows(buildReportData(baseInput({
      // 2026-07-05 is a Sunday (week-off) with punches.
      records: [{ employee_id: "e1", date: "2026-07-05", clock_in_at: "2026-07-05T03:30:00Z", clock_out_at: "2026-07-05T11:30:00Z", total_minutes: 480, source: "device", auto_closed: false, out_of_zone_count: 0, is_late: false }],
    })));
    const wo = rows.find((r) => r[0] === "2026-07-05")!;
    expect(wo[3]).toBe("week_off");
    expect(wo[4]).toBe("WO");
    expect(wo[5]).toBe("8.0"); // hours now visible for worked-on-off-day (plan §2 fix)
    expect(wo[7]).toBe("device");
  });
});

describe("validateRange", () => {
  it("accepts a normal month", () => {
    expect(validateRange("2026-07-01", "2026-07-31")).toBeNull();
  });
  it("rejects bad format, inverted, and >92 days", () => {
    expect(validateRange("2026/07/01", "2026-07-31")).toMatch(/invalid/i);
    expect(validateRange("2026-07-31", "2026-07-01")).toMatch(/invalid/i);
    expect(validateRange("2026-01-01", "2026-04-15")).toBe("Range too large — maximum 92 days");
  });
  it("accepts exactly 92 days", () => {
    expect(validateRange("2026-01-01", "2026-04-02")).toBeNull(); // 92 days inclusive
  });
});
