// Pure assembly for the attendance report (no I/O). Fetch lives in
// fetch-report-data.ts; PDF/CSV render from the AttendanceReportData shape.
import {
  isWeekOff, resolveEffectiveWeekOff,
  type WeekOffPolicy, type WeekOffOverride,
} from "@/lib/attendance/week-off";
import { pairPunches } from "@/lib/attendance/pair-punches";

export type DayState = "worked" | "week_off" | "holiday" | "leave" | "absent" | "future";
export type SourceMarker = "d" | "m" | "w" | "*" | "";
export type ReportPair = { in: string; out: string | null; minutes: number };
export type ReportDay = {
  date: string;
  state: DayState;
  minutes: number;
  marker: SourceMarker;
  autoClosed: boolean;
  pairs: ReportPair[];
  outOfZoneCount: number;
  isLate: boolean;
  singlePunch: boolean;
};
export type ReportEmployee = {
  id: string;
  name: string;
  department: string | null;
  days: ReportDay[];
  totalMinutes: number;
  daysPresent: number;
};
export type AttendanceReportData = {
  from: string;
  to: string;
  dates: string[];
  orgName: string;
  generatedAt: string;
  employees: ReportEmployee[];
};

export type RawReportInputs = {
  from: string;
  to: string;
  todayIst: string;
  orgName: string;
  generatedAt: string;
  employees: { id: string; name: string; department_id: string | null; department: string | null }[];
  records: {
    employee_id: string; date: string;
    clock_in_at: string | null; clock_out_at: string | null;
    total_minutes: number | null; source: string | null;
    auto_closed: boolean | null; out_of_zone_count: number | null; is_late: boolean | null;
  }[];
  events: { employee_id: string; punched_at: string }[];
  holidays: { date: string }[];
  leaves: { employee_id: string; start_date: string; end_date: string }[];
  orgPolicy: WeekOffPolicy;
  deptOverrides: Record<string, WeekOffOverride>;
  empOverrides: Record<string, WeekOffOverride>;
};

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// Local IST helpers (main has no shared ist.ts; swap to @jambahr/shared if PR #18 merges).
export function istDateOf(isoUtc: string): string {
  return new Date(new Date(isoUtc).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}
export function istToday(): string {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}
function istClock(isoUtc: string): string {
  return new Date(new Date(isoUtc).getTime() + IST_OFFSET_MS).toISOString().slice(11, 16);
}

export function enumerateDates(from: string, to: string): string[] {
  const out: string[] = [];
  const end = new Date(`${to}T00:00:00.000Z`).getTime();
  for (let t = new Date(`${from}T00:00:00.000Z`).getTime(); t <= end; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

export function sourceMarker(source: string | null): SourceMarker {
  switch (source) {
    case "device": return "d";
    case "mobile": return "m";
    case "web": return "w";
    case "auto_close": return "*";
    default: return "";
  }
}

export function stateLetter(state: DayState): string {
  switch (state) {
    case "week_off": return "W";
    case "holiday": return "H";
    case "leave": return "L";
    case "absent": return "A";
    case "future": return "–";
    case "worked": return "";
  }
}

export function chunkDateColumns(dates: string[], maxPerChunk = 16): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < dates.length; i += maxPerChunk) chunks.push(dates.slice(i, i + maxPerChunk));
  return chunks;
}

export function formatHours(minutes: number): string {
  return (minutes / 60).toFixed(1);
}

export function buildReportData(input: RawReportInputs): AttendanceReportData {
  const dates = enumerateDates(input.from, input.to);
  const holidaySet = new Set(input.holidays.map((h) => h.date));

  const recordsByEmpDate = new Map<string, RawReportInputs["records"][number]>();
  for (const r of input.records) recordsByEmpDate.set(`${r.employee_id}:${r.date}`, r);

  const eventsByEmpDate = new Map<string, { id: string; punched_at: string }[]>();
  for (const e of input.events) {
    const key = `${e.employee_id}:${istDateOf(e.punched_at)}`;
    const arr = eventsByEmpDate.get(key) ?? [];
    arr.push({ id: `${key}:${arr.length}`, punched_at: e.punched_at });
    eventsByEmpDate.set(key, arr);
  }

  const leavesByEmp = new Map<string, { start_date: string; end_date: string }[]>();
  for (const l of input.leaves) {
    const arr = leavesByEmp.get(l.employee_id) ?? [];
    arr.push(l);
    leavesByEmp.set(l.employee_id, arr);
  }

  const employees: ReportEmployee[] = input.employees.map((emp) => {
    const effective = resolveEffectiveWeekOff(
      input.orgPolicy,
      emp.department_id ? input.deptOverrides[emp.department_id] ?? null : null,
      input.empOverrides[emp.id] ?? null,
    );
    const empLeaves = leavesByEmp.get(emp.id) ?? [];

    let totalMinutes = 0;
    let daysPresent = 0;

    const days: ReportDay[] = dates.map((date) => {
      const rec = recordsByEmpDate.get(`${emp.id}:${date}`);
      const dayEvents = eventsByEmpDate.get(`${emp.id}:${date}`) ?? [];

      let pairs: ReportPair[] = [];
      let minutes = 0;
      let singlePunch = false;
      if (dayEvents.length > 0) {
        const paired = pairPunches(dayEvents);
        pairs = paired.intervals.map((iv) => ({
          in: istClock(iv.inAt), out: iv.outAt ? istClock(iv.outAt) : null, minutes: iv.minutes,
        }));
        if (paired.danglingInAt) {
          pairs.push({ in: istClock(paired.danglingInAt), out: null, minutes: 0 });
          singlePunch = true;
        }
        // Prefer the record's rollup (recomputeAttendanceDay is zone/break-aware;
        // raw event re-pairing here is not) — pairs remain the raw punch times, so
        // the pair span may legitimately exceed the counted minutes.
        minutes = rec?.total_minutes ?? paired.workedMinutes;
      } else if (rec?.clock_in_at) {
        pairs = [{
          in: istClock(rec.clock_in_at),
          out: rec.clock_out_at ? istClock(rec.clock_out_at) : null,
          minutes: rec.total_minutes ?? 0,
        }];
        singlePunch = !rec.clock_out_at;
        minutes = rec.total_minutes ?? 0;
      }
      const worked = minutes > 0 || pairs.length > 0;

      const onLeave = empLeaves.some((l) => l.start_date <= date && date <= l.end_date);
      let state: DayState;
      if (holidaySet.has(date)) state = "holiday";
      else if (onLeave) state = "leave";
      else if (isWeekOff(date, effective)) state = "week_off";
      else if (worked) state = "worked";
      else if (date > input.todayIst) state = "future";
      else state = "absent";

      if (state === "worked") {
        totalMinutes += minutes;
        daysPresent += 1;
      }

      return {
        date, state,
        minutes: state === "worked" ? minutes : 0,
        marker: state === "worked" ? sourceMarker(rec?.source ?? null) : "",
        autoClosed: rec?.auto_closed ?? false,
        pairs,
        outOfZoneCount: rec?.out_of_zone_count ?? 0,
        isLate: rec?.is_late ?? false,
        singlePunch,
      };
    });

    return { id: emp.id, name: emp.name, department: emp.department, days, totalMinutes, daysPresent };
  });

  return {
    from: input.from, to: input.to, dates,
    orgName: input.orgName, generatedAt: input.generatedAt,
    employees,
  };
}

export function csvRows(data: AttendanceReportData): string[][] {
  const rows: string[][] = [[
    "date", "employee", "department", "state", "hours",
    "punch_pairs", "source", "auto_closed", "out_of_zone", "late",
  ]];
  const markerToSource: Record<string, string> = { d: "device", m: "mobile", w: "web", "*": "auto_close" };
  for (const emp of data.employees) {
    for (const day of emp.days) {
      rows.push([
        day.date, emp.name, emp.department ?? "", day.state,
        day.state === "worked" ? formatHours(day.minutes) : "",
        day.pairs.map((p) => `${p.in}-${p.out ?? "?"}`).join("; "),
        day.state === "worked" ? markerToSource[day.marker] ?? "" : "",
        day.autoClosed ? "yes" : "",
        day.outOfZoneCount > 0 ? String(day.outOfZoneCount) : "",
        day.isLate ? "yes" : "",
      ]);
    }
  }
  return rows;
}
