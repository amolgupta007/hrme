import { describe, it, expect } from "vitest";
import {
  buildReportData, enumerateDates, chunkDateColumns, sourceMarker,
  stateLetter, csvRows, formatHours,
  type RawReportInputs,
} from "@/lib/reports/attendance-report";

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
    const d = buildReportData(baseInput({
      holidays: [{ date: "2026-07-05" }], // a Sunday (week-off) too
      leaves: [{ employee_id: "e1", start_date: "2026-07-05", end_date: "2026-07-05" }],
      records: [{ employee_id: "e1", date: "2026-07-05", clock_in_at: "2026-07-05T03:30:00Z", clock_out_at: "2026-07-05T12:30:00Z", total_minutes: 480, source: "device", auto_closed: false, out_of_zone_count: 0, is_late: false }],
    })).employees[0].days.find((x) => x.date === "2026-07-05")!;
    expect(d.state).toBe("holiday");
    expect(d.pairs.length).toBeGreaterThan(0); // detail keeps punches
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
  it("emits header + one row per employee-day with pair string", () => {
    const rows = csvRows(buildReportData(baseInput({
      records: [{ employee_id: "e1", date: "2026-07-02", clock_in_at: "2026-07-02T03:32:00Z", clock_out_at: "2026-07-02T12:50:00Z", total_minutes: 492, source: "mobile", auto_closed: false, out_of_zone_count: 0, is_late: false }],
      events: [
        { employee_id: "e1", punched_at: "2026-07-02T03:32:00Z" },
        { employee_id: "e1", punched_at: "2026-07-02T12:50:00Z" },
      ],
    })));
    expect(rows[0]).toEqual(["date", "employee", "department", "state", "hours", "punch_pairs", "source", "auto_closed", "out_of_zone", "late"]);
    const worked = rows.find((r) => r[0] === "2026-07-02")!;
    expect(worked[1]).toBe("Priya S");
    expect(worked[3]).toBe("worked");
    expect(worked[4]).toBe("8.2");
    expect(worked[5]).toBe("09:02-18:20");
    expect(worked[6]).toBe("mobile");
    expect(rows).toHaveLength(1 + 7); // header + 7 days
  });
});
