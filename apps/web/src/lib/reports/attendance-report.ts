// Pure assembly for the attendance report (no I/O). Fetch lives in
// fetch-report-data.ts; PDF/CSV render from the AttendanceReportData shape.
import {
  isWeekOff, resolveEffectiveWeekOff,
  type WeekOffPolicy, type WeekOffOverride,
} from "@/lib/attendance/week-off";
import { pairPunches } from "@/lib/attendance/pair-punches";

export type DayState = "worked" | "week_off" | "holiday" | "leave" | "absent" | "future";
export type SourceMarker = "d" | "m" | "w" | "*" | "";
// Full day / Half day / Absent / Week-off / Holiday / Leave / future-dash.
export type StatusCode = "FD" | "HD" | "A" | "WO" | "H" | "L" | "–";
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
  // IST HH:MM of first-in / last-out, derived from `pairs`. Both null when the
  // day has no punches; lastOut is also null when the last pair is dangling
  // (open — no clock-out yet). See plan 2026-08-04 §2/§5 Task 1.
  firstIn: string | null;
  lastOut: string | null;
  statusCode: StatusCode;
};
export type ReportSummary = {
  fullDays: number;
  halfDays: number;
  absents: number;
  weekOffs: number;
  leaves: number;
  holidays: number;
};
export type ReportEmployee = {
  id: string;
  name: string;
  department: string | null;
  days: ReportDay[];
  totalMinutes: number;
  daysPresent: number;
  summary: ReportSummary;
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
    // From the assigned shift's half-day threshold (fetch layer flattens the
    // `shifts!shift_id(half_day_threshold_minutes)` embed onto the row).
    // Absent/null → half-day classification is skipped (worked days are FD).
    half_day_threshold_minutes?: number | null;
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

// worked minutes < threshold -> HD; == or > threshold -> FD; no threshold -> FD
// (mirrors mobile's computeMonthCalendar half-day rule — plan §3).
export function computeStatusCode(
  state: DayState,
  minutes: number,
  halfDayThresholdMinutes?: number | null,
): StatusCode {
  switch (state) {
    case "worked":
      return halfDayThresholdMinutes != null && minutes < halfDayThresholdMinutes ? "HD" : "FD";
    case "week_off": return "WO";
    case "holiday": return "H";
    case "leave": return "L";
    case "absent": return "A";
    case "future": return "–";
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
    const summary: ReportSummary = {
      fullDays: 0, halfDays: 0, absents: 0, weekOffs: 0, leaves: 0, holidays: 0,
    };

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

      // Plan 2026-08-04 §2/§5 Task 1: a day with punches whose state is an
      // off-state (week_off/holiday/leave — those checks run before `worked`
      // above, so they still win the state) now KEEPS its worked minutes and
      // source marker instead of zeroing them; the hours fold into
      // totalMinutes but count under the off-state summary bucket below, not
      // daysPresent/fullDays/halfDays. Only `worked` (has punches) gates this,
      // not `state === "worked"`.
      if (worked) totalMinutes += minutes;
      if (state === "worked") daysPresent += 1;

      const statusCode = computeStatusCode(state, minutes, rec?.half_day_threshold_minutes ?? null);
      switch (statusCode) {
        case "FD": summary.fullDays += 1; break;
        case "HD": summary.halfDays += 1; break;
        case "A": summary.absents += 1; break;
        case "WO": summary.weekOffs += 1; break;
        case "L": summary.leaves += 1; break;
        case "H": summary.holidays += 1; break;
        case "–": break; // future days count nowhere
      }

      return {
        date, state,
        minutes: worked ? minutes : 0,
        marker: worked ? sourceMarker(rec?.source ?? null) : "",
        autoClosed: rec?.auto_closed ?? false,
        pairs,
        outOfZoneCount: rec?.out_of_zone_count ?? 0,
        isLate: rec?.is_late ?? false,
        singlePunch,
        firstIn: pairs.length > 0 ? pairs[0].in : null,
        lastOut: pairs.length > 0 ? pairs[pairs.length - 1].out : null,
        statusCode,
      };
    });

    return {
      id: emp.id, name: emp.name, department: emp.department, days,
      totalMinutes, daysPresent, summary,
    };
  });

  return {
    from: input.from, to: input.to, dates,
    orgName: input.orgName, generatedAt: input.generatedAt,
    employees,
  };
}

export function csvRows(data: AttendanceReportData): string[][] {
  const rows: string[][] = [[
    "date", "employee", "department", "state", "status_code", "hours",
    "punch_pairs", "source", "auto_closed", "out_of_zone", "late",
  ]];
  const markerToSource: Record<string, string> = { d: "device", m: "mobile", w: "web", "*": "auto_close" };
  for (const emp of data.employees) {
    for (const day of emp.days) {
      rows.push([
        day.date, emp.name, emp.department ?? "", day.state, day.statusCode,
        // Worked-on-off-day rows now carry real minutes/marker too (see
        // buildReportData), so gate on the values themselves, not `state`.
        day.minutes > 0 ? formatHours(day.minutes) : "",
        day.pairs.map((p) => `${p.in}-${p.out ?? "?"}`).join("; "),
        day.marker ? markerToSource[day.marker] ?? "" : "",
        day.autoClosed ? "yes" : "",
        day.outOfZoneCount > 0 ? String(day.outOfZoneCount) : "",
        day.isLate ? "yes" : "",
      ]);
    }
  }
  return rows;
}
