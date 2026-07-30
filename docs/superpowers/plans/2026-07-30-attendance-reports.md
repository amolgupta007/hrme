# Attendance Reports (PDF + CSV) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin-only "Reports" tab on `/dashboard/attendance` that exports a period attendance report — landscape PDF (employee×date hours matrix with source markers + day states, then per-employee punch-pair detail) and CSV — for a customizable period (≤92 days) with an optional department filter.

**Architecture:** A pure assembly lib (`lib/reports/attendance-report.ts`) turns raw rows into a typed `AttendanceReportData`; a server fetch module (`lib/reports/fetch-report-data.ts`, plain module NOT `"use server"`) does the paginated Supabase reads and calls the pure lib; a thin server action wraps it for the UI preview; a route handler renders the PDF via `@react-pdf/renderer` and streams it as a download; the tab component drives presets/filters, preview, and both downloads (CSV built client-side from the preview data).

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (admin client), `@react-pdf/renderer` (already in `serverComponentsExternalPackages`), vitest, Tailwind + existing UI idioms.

**Spec:** `docs/superpowers/specs/2026-07-30-attendance-reports-design.md` (locked decisions table is binding).

## Global Constraints

- Branch: `feat/attendance-reports` off **main** (do NOT branch off or depend on `feat/mobile-attendance-home` — `computeMonthCalendar`/`istToday` do NOT exist on main; day-state precedence is implemented in the new pure lib using main's `isWeekOff`/`resolveEffectiveWeekOff` from `@/lib/attendance/week-off` shim → `@jambahr/shared`).
- Access: admin/owner only (`isAdmin(user.role)`), org-scoped via `getCurrentUser()`. Employees: **active (status ≠ 'terminated') only**.
- Range: `from`/`to` are `YYYY-MM-DD`, `from <= to`, span ≤ **92 days** — enforced server-side (action AND route) and client-side with the same message: `"Range too large — maximum 92 days"`.
- Pagination: ALL range queries page through PostgREST in **1000-row pages** via `.range()` and stitch (the existing `getDailyAttendance` truncation bug must not be inherited; do NOT modify `attendance-daily.ts`).
- Day-state precedence per cell: **holiday > leave > week_off > worked > absent**, with dates after today-IST = `future` (rendered `–`). Optional holidays count as holiday. A day with punches whose state is holiday/leave/week_off still appears in the PDF detail section (annotated), but the matrix cell shows the state letter.
- Source markers (from `attendance_records.source ∈ web|device|auto_close|mobile`): `d` device · `m` mobile · `w` web · `*` auto_close. Day states: `W` week-off · `H` holiday · `L` leave · `A` absent · `–` future. Legend on PDF page 1. Markers render as small-font suffix text (no exotic glyphs — built-in Helvetica only).
- PDF route: `GET /api/reports/attendance/pdf`, `export const maxDuration = 60`, `export const dynamic = "force-dynamic"`, `Content-Disposition: attachment`. Errors: `{error}` JSON — 401 `unauthenticated`, 403 `forbidden`, 400 `invalid_range`, 500 `render_failed` (detail server-logged only, never in body).
- IST: derive IST day of a UTC instant as `new Date(t + 5.5h).toISOString().slice(0,10)` in ONE local helper in the pure lib (documented; swap to shared `istToday` if/when PR #18 merges — do not block on it).
- No changes to existing tab behavior; `attendance-client.tsx` gets a minimal additive tab.
- Repo rules: explicit git staging only (NEVER `git add -A`); no Co-Authored-By or other trailers; `sonner` toasts; `lucide-react` icons; Tailwind only.
- Verification per task: `cd apps/web && npx vitest run tests/reports/` (+ full suite in final task), `npm run lint` in apps/web. (apps/web typecheck is advisory — known Supabase never-type errors, CLAUDE.md gotcha #3.)

---

### Task 1: Pure report assembly lib (TDD)

**Files:**
- Create: `apps/web/src/lib/reports/attendance-report.ts`
- Test: `apps/web/tests/reports/attendance-report.test.ts`

**Interfaces:**
- Consumes: `WeekOffPolicy`, `WeekOffOverride`, `isWeekOff`, `resolveEffectiveWeekOff` from `@/lib/attendance/week-off`; `pairPunches` from `@/lib/attendance/pair-punches`.
- Produces (later tasks rely on these exact names):
  - `type DayState = "worked" | "week_off" | "holiday" | "leave" | "absent" | "future"`
  - `type SourceMarker = "d" | "m" | "w" | "*" | ""`
  - `type ReportPair = { in: string; out: string | null; minutes: number }`
  - `type ReportDay = { date: string; state: DayState; minutes: number; marker: SourceMarker; autoClosed: boolean; pairs: ReportPair[]; outOfZoneCount: number; isLate: boolean; singlePunch: boolean }`
  - `type ReportEmployee = { id: string; name: string; department: string | null; days: ReportDay[]; totalMinutes: number; daysPresent: number }`
  - `type AttendanceReportData = { from: string; to: string; dates: string[]; orgName: string; generatedAt: string; employees: ReportEmployee[] }`
  - `type RawReportInputs` (below), `buildReportData(input: RawReportInputs): AttendanceReportData`
  - `enumerateDates(from: string, to: string): string[]`
  - `istDateOf(isoUtc: string): string` and `istToday(): string`
  - `sourceMarker(source: string | null): SourceMarker`
  - `stateLetter(state: DayState): string` (`W|H|L|A|–`, `""` for worked)
  - `chunkDateColumns(dates: string[], maxPerChunk?: number): string[][]` (default 16)
  - `csvRows(data: AttendanceReportData): string[][]` (header row first)
  - `formatHours(minutes: number): string` (e.g. `"8.2"`, one decimal)

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/tests/reports/attendance-report.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run tests/reports/attendance-report.test.ts`
Expected: FAIL — cannot resolve `@/lib/reports/attendance-report`.

- [ ] **Step 3: Implement the lib**

```ts
// apps/web/src/lib/reports/attendance-report.ts
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
        minutes = paired.workedMinutes;
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/reports/attendance-report.test.ts`
Expected: PASS (all). If `pairPunches` intervals shape differs (`inAt`/`outAt`/`minutes` — verify against `packages/shared/src/attendance/pair-punches.ts:11-23`), adapt the mapping, not the tests' behavioral expectations.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/reports/attendance-report.ts apps/web/tests/reports/attendance-report.test.ts
git commit -m "feat(reports): pure attendance-report assembly lib (day states, pairs, markers, CSV rows)"
```

---

### Task 2: Server fetch module + server action

**Files:**
- Create: `apps/web/src/lib/reports/fetch-report-data.ts`
- Create: `apps/web/src/actions/attendance-reports.ts`
- Test: extend `apps/web/tests/reports/attendance-report.test.ts` (validation helper only — the fetch module's Supabase calls are exercised via the route tests' mocks in Task 3, matching repo convention of not mocking Supabase)

**Interfaces:**
- Consumes: `buildReportData`, `istToday`, `enumerateDates`, types from Task 1; `createAdminSupabase` from `@/lib/supabase/server`; `getCurrentUser`, `isAdmin` from `@/lib/current-user`; `getWeekOffPolicy`-equivalent reads done directly (see code — read tables directly with the admin client rather than calling other actions).
- Produces:
  - `validateRange(from: string, to: string): string | null` (returns error message or null) — exported from `fetch-report-data.ts`, pure, tested.
  - `fetchAttendanceReportData(orgId: string, orgName: string, params: { from: string; to: string; departmentId?: string | null }): Promise<AttendanceReportData>` — plain server module (NOT `"use server"`, per gotcha #85 no accidental RPC surface).
  - Server action `getAttendanceReportData(params): Promise<ActionResult<AttendanceReportData>>` and `listReportDepartments(): Promise<ActionResult<{ id: string; name: string }[]>>` in `attendance-reports.ts`.

- [ ] **Step 1: Add failing validation tests**

Append to `apps/web/tests/reports/attendance-report.test.ts`:

```ts
import { validateRange } from "@/lib/reports/fetch-report-data";

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
```

Run: `cd apps/web && npx vitest run tests/reports/attendance-report.test.ts` → FAIL (module missing).

- [ ] **Step 2: Implement `fetch-report-data.ts`**

```ts
// apps/web/src/lib/reports/fetch-report-data.ts
// Server-only data assembly for attendance reports. Plain module (NOT "use server")
// so nothing here becomes a browser-callable RPC; the action + PDF route wrap it.
import { createAdminSupabase } from "@/lib/supabase/server";
import type { WeekOffOverride, WeekOffPolicy } from "@/lib/attendance/week-off";
import {
  buildReportData, enumerateDates, istToday,
  type AttendanceReportData, type RawReportInputs,
} from "./attendance-report";

const MAX_RANGE_DAYS = 92;
const PAGE = 1000;
const DEFAULT_POLICY: WeekOffPolicy = { week_type: 6, off_days: [0] };

export function validateRange(from: string, to: string): string | null {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(from) || !re.test(to) || from > to) return "Invalid date range";
  if (enumerateDates(from, to).length > MAX_RANGE_DAYS) {
    return "Range too large — maximum 92 days";
  }
  return null;
}

// Page through PostgREST's 1000-row cap and stitch. `makeQuery` must apply
// .range(fromIdx, toIdx) itself so each call gets a fresh builder.
async function fetchAll<T>(
  makeQuery: (fromIdx: number, toIdx: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await makeQuery(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

export async function fetchAttendanceReportData(
  orgId: string,
  orgName: string,
  params: { from: string; to: string; departmentId?: string | null },
): Promise<AttendanceReportData> {
  const invalid = validateRange(params.from, params.to);
  if (invalid) throw new Error(invalid);
  const sb = createAdminSupabase();
  const { from, to, departmentId } = params;

  // Employees (active), optionally department-filtered.
  let empQuery = sb
    .from("employees")
    .select("id, first_name, last_name, department_id, departments(name)")
    .eq("org_id", orgId)
    .neq("status", "terminated")
    .order("first_name");
  if (departmentId) empQuery = empQuery.eq("department_id", departmentId);
  const { data: empRows, error: empErr } = await empQuery;
  if (empErr) throw new Error(empErr.message);
  const employees = (empRows ?? []).map((e) => {
    const dept = e.departments as unknown as { name: string } | null;
    return {
      id: e.id as string,
      name: `${e.first_name} ${e.last_name ?? ""}`.trim(),
      department_id: (e.department_id as string | null) ?? null,
      department: dept?.name ?? null,
    };
  });
  const empIds = employees.map((e) => e.id);
  if (empIds.length === 0) {
    return buildReportData({
      from, to, todayIst: istToday(), orgName,
      generatedAt: new Date().toISOString(),
      employees: [], records: [], events: [], holidays: [], leaves: [],
      orgPolicy: DEFAULT_POLICY, deptOverrides: {}, empOverrides: {},
    });
  }

  const [records, events, holidayRows, leaveRows, policyRow, deptOvRows, empOvRows] =
    await Promise.all([
      fetchAll((a, b) =>
        sb.from("attendance_records")
          .select("employee_id, date, clock_in_at, clock_out_at, total_minutes, source, auto_closed, out_of_zone_count, is_late")
          .eq("org_id", orgId).gte("date", from).lte("date", to)
          .in("employee_id", empIds)
          .order("date").order("employee_id")
          .range(a, b),
      ),
      fetchAll((a, b) =>
        sb.from("attendance_punch_events")
          .select("employee_id, punched_at")
          .eq("org_id", orgId).eq("status", "approved")
          // punched_at window widened ±1 day so IST attribution at range edges is complete
          .gte("punched_at", `${from}T00:00:00Z`)
          .lte("punched_at", new Date(new Date(`${to}T00:00:00Z`).getTime() + 2 * 86_400_000).toISOString())
          .in("employee_id", empIds)
          .order("punched_at")
          .range(a, b),
      ),
      sb.from("holidays").select("date").eq("org_id", orgId).gte("date", from).lte("date", to),
      fetchAll((a, b) =>
        sb.from("leave_requests")
          .select("employee_id, start_date, end_date")
          .eq("org_id", orgId).eq("status", "approved")
          .lte("start_date", to).gte("end_date", from)
          .in("employee_id", empIds)
          .range(a, b),
      ),
      sb.from("week_off_policy").select("week_type, off_days, alt_saturday_rule").eq("org_id", orgId).maybeSingle(),
      sb.from("department_week_off_override").select("department_id, week_type, off_days, alt_saturday_rule").eq("org_id", orgId),
      sb.from("employee_week_off_override").select("employee_id, week_type, off_days, alt_saturday_rule").eq("org_id", orgId),
    ]);

  if (holidayRows.error) throw new Error(holidayRows.error.message);
  if (policyRow.error) throw new Error(policyRow.error.message);
  if (deptOvRows.error) throw new Error(deptOvRows.error.message);
  if (empOvRows.error) throw new Error(empOvRows.error.message);

  const deptOverrides: Record<string, WeekOffOverride> = {};
  for (const r of deptOvRows.data ?? []) {
    deptOverrides[r.department_id as string] = {
      week_type: r.week_type as 5 | 6, off_days: r.off_days as number[],
      alt_saturday_rule: (r.alt_saturday_rule ?? "none") as WeekOffOverride["alt_saturday_rule"],
    };
  }
  const empOverrides: Record<string, WeekOffOverride> = {};
  for (const r of empOvRows.data ?? []) {
    empOverrides[r.employee_id as string] = {
      week_type: r.week_type as 5 | 6, off_days: r.off_days as number[],
      alt_saturday_rule: (r.alt_saturday_rule ?? "none") as WeekOffOverride["alt_saturday_rule"],
    };
  }

  const orgPolicy: WeekOffPolicy = policyRow.data
    ? {
        week_type: policyRow.data.week_type as 5 | 6,
        off_days: policyRow.data.off_days as number[],
        alt_saturday_rule: (policyRow.data.alt_saturday_rule ?? "none") as WeekOffPolicy["alt_saturday_rule"],
      }
    : DEFAULT_POLICY;

  return buildReportData({
    from, to, todayIst: istToday(), orgName,
    generatedAt: new Date().toISOString(),
    employees,
    records: records as RawReportInputs["records"],
    events: events as RawReportInputs["events"],
    holidays: (holidayRows.data ?? []) as { date: string }[],
    leaves: (leaveRows ?? []) as RawReportInputs["leaves"],
    orgPolicy, deptOverrides, empOverrides,
  });
}
```

NOTE for implementer: confirm the real `week_off_policy` table/column names before finalizing (read `apps/web/src/actions/week-off.ts:16-70` `getWeekOffPolicy` and copy its exact `.from(...)`/`.select(...)`); same for the two override tables (`:196`, `:344`). If the table stores the org policy under different column names, adapt the mapping here — the `WeekOffPolicy` shape fed to `buildReportData` is what matters. Events pairing tolerates the widened window: `buildReportData` groups by IST day and simply ignores days outside `dates`.

- [ ] **Step 3: Implement the server action**

```ts
// apps/web/src/actions/attendance-reports.ts
"use server";

import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import { fetchAttendanceReportData } from "@/lib/reports/fetch-report-data";
import type { AttendanceReportData } from "@/lib/reports/attendance-report";
import type { ActionResult } from "@/types";

export async function getAttendanceReportData(params: {
  from: string;
  to: string;
  departmentId?: string | null;
}): Promise<ActionResult<AttendanceReportData>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };
  try {
    const sb = createAdminSupabase();
    const { data: org } = await sb.from("organizations").select("name").eq("id", user.orgId).single();
    const data = await fetchAttendanceReportData(user.orgId, org?.name ?? "Organization", params);
    return { success: true, data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to build report";
    // Range-validation messages are user-facing; anything else is generic.
    const safe = msg.startsWith("Invalid date range") || msg.startsWith("Range too large") ? msg : "Failed to build report";
    if (safe !== msg) console.error("[attendance-reports] build failed:", msg);
    return { success: false, error: safe };
  }
}

export async function listReportDepartments(): Promise<ActionResult<{ id: string; name: string }[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };
  const sb = createAdminSupabase();
  const { data, error } = await sb.from("departments").select("id, name").eq("org_id", user.orgId).order("name");
  if (error) return { success: false, error: "Failed to load departments" };
  return { success: true, data: (data ?? []) as { id: string; name: string }[] };
}
```

NOTE: check `@/types` exports `ActionResult` (grep `export type ActionResult` in `apps/web/src/types/index.ts`); if it lives elsewhere, import from there — every other action file shows the idiom, copy it.

- [ ] **Step 4: Run tests**

Run: `cd apps/web && npx vitest run tests/reports/` → PASS (validateRange tests now green, Task 1 tests still green).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/reports/fetch-report-data.ts apps/web/src/actions/attendance-reports.ts apps/web/tests/reports/attendance-report.test.ts
git commit -m "feat(reports): paginated report data fetch + admin actions (preview, departments)"
```

---

### Task 3: PDF document + streaming route (with route tests)

**Files:**
- Create: `apps/web/src/lib/reports/attendance-pdf.tsx`
- Create: `apps/web/src/app/api/reports/attendance/pdf/route.ts`
- Test: `apps/web/tests/reports/pdf-route.test.ts`

**Interfaces:**
- Consumes: `AttendanceReportData`, `chunkDateColumns`, `formatHours`, `stateLetter` from Task 1; `fetchAttendanceReportData`, `validateRange` from Task 2; `getCurrentUser`, `isAdmin`.
- Produces: `renderAttendanceReportPdf(data: AttendanceReportData): Promise<Buffer>`; route `GET /api/reports/attendance/pdf?from=&to=&departmentId=`.

- [ ] **Step 1: Write failing route tests**

Copy the mocking idiom from `apps/web/tests/mobile/routes.test.ts` (vi.mock of `@/lib/current-user`). Mock the fetch + render modules so no Supabase/PDF work happens:

```ts
// apps/web/tests/reports/pdf-route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const getCurrentUser = vi.fn();
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: (...a: unknown[]) => getCurrentUser(...a),
  isAdmin: (role: string) => role === "owner" || role === "admin",
}));
const fetchData = vi.fn();
vi.mock("@/lib/reports/fetch-report-data", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/reports/fetch-report-data")>();
  return { ...real, fetchAttendanceReportData: (...a: unknown[]) => fetchData(...a) };
});
const renderPdf = vi.fn();
vi.mock("@/lib/reports/attendance-pdf", () => ({
  renderAttendanceReportPdf: (...a: unknown[]) => renderPdf(...a),
}));
vi.mock("@/lib/supabase/server", () => ({
  createAdminSupabase: () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { name: "TestOrg" } }) }) }) }),
  }),
}));

import { GET } from "@/app/api/reports/attendance/pdf/route";

function req(qs: string) {
  return new Request(`http://localhost/api/reports/attendance/pdf?${qs}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  renderPdf.mockResolvedValue(Buffer.from("%PDF-fake"));
  fetchData.mockResolvedValue({ from: "2026-07-01", to: "2026-07-31", dates: [], orgName: "TestOrg", generatedAt: "", employees: [] });
});

describe("GET /api/reports/attendance/pdf", () => {
  it("401 when unauthenticated", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await GET(req("from=2026-07-01&to=2026-07-31"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthenticated" });
  });
  it("403 for non-admin", async () => {
    getCurrentUser.mockResolvedValue({ role: "employee", orgId: "o1" });
    const res = await GET(req("from=2026-07-01&to=2026-07-31"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
  });
  it("400 on invalid or oversized range", async () => {
    getCurrentUser.mockResolvedValue({ role: "admin", orgId: "o1" });
    const res = await GET(req("from=2026-01-01&to=2026-06-30"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_range");
    expect(fetchData).not.toHaveBeenCalled();
  });
  it("200 streams a PDF attachment", async () => {
    getCurrentUser.mockResolvedValue({ role: "admin", orgId: "o1" });
    const res = await GET(req("from=2026-07-01&to=2026-07-31"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("attendance-");
    expect(res.headers.get("content-disposition")).toContain("2026-07-01-2026-07-31.pdf");
  });
  it("500 render_failed hides internals", async () => {
    getCurrentUser.mockResolvedValue({ role: "admin", orgId: "o1" });
    renderPdf.mockRejectedValue(new Error("secret internal stack"));
    const res = await GET(req("from=2026-07-01&to=2026-07-31"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "render_failed" });
  });
});
```

Run: `cd apps/web && npx vitest run tests/reports/pdf-route.test.ts` → FAIL (route module missing).

- [ ] **Step 2: Implement the PDF document**

```tsx
// apps/web/src/lib/reports/attendance-pdf.tsx
// Server-side PDF render (renderToBuffer) — follows the document-templating
// precedent in src/lib/documents/pdf.tsx. Built-in Helvetica only.
import React from "react";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import {
  chunkDateColumns, formatHours, stateLetter,
  type AttendanceReportData, type ReportEmployee,
} from "./attendance-report";

const s = StyleSheet.create({
  page: { padding: 28, fontSize: 8, fontFamily: "Helvetica", color: "#0B1220" },
  h1: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  sub: { fontSize: 8, color: "#5B6472", marginBottom: 8 },
  legend: { fontSize: 7, color: "#5B6472", marginBottom: 8 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#E7E9EC", alignItems: "center" },
  headRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#0B1220", paddingBottom: 2, marginBottom: 1 },
  nameCell: { width: 96, paddingRight: 4 },
  dayCell: { flex: 1, textAlign: "center", paddingVertical: 2 },
  totalCell: { width: 40, textAlign: "right", fontFamily: "Helvetica-Bold" },
  marker: { fontSize: 5.5, color: "#5B6472" },
  deptHead: { fontSize: 8, fontFamily: "Helvetica-Bold", marginTop: 6, marginBottom: 2, color: "#17806D" },
  detailHead: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 2 },
  detailSub: { fontSize: 7, color: "#5B6472", marginBottom: 3 },
  detailRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#F0F1F3", paddingVertical: 1.5 },
  dDate: { width: 52 },
  dPairs: { flex: 1 },
  dHours: { width: 34, textAlign: "right" },
  dFlags: { width: 90, textAlign: "right", color: "#5B6472" },
});

const LEGEND =
  "Sources: d device · m mobile · w web · * auto-closed   |   Days: W week-off · H holiday · L leave · A absent · – future   |   ! single punch";

function MatrixCell({ day }: { day: ReportEmployee["days"][number] }) {
  if (day.state !== "worked") return <Text style={s.dayCell}>{stateLetter(day.state)}</Text>;
  return (
    <Text style={s.dayCell}>
      {formatHours(day.minutes)}
      <Text style={s.marker}>{day.marker}{day.singlePunch ? "!" : ""}</Text>
    </Text>
  );
}

function flags(day: ReportEmployee["days"][number]): string {
  const f: string[] = [];
  if (day.autoClosed) f.push("auto-closed");
  if (day.outOfZoneCount > 0) f.push(`${day.outOfZoneCount} out-of-zone`);
  if (day.isLate) f.push("late");
  if (day.singlePunch) f.push("single punch !");
  if (day.state !== "worked" && day.pairs.length > 0) f.push(`on ${day.state.replace("_", "-")}`);
  return f.join(", ");
}

export function AttendanceReportPdf({ data }: { data: AttendanceReportData }) {
  const chunks = chunkDateColumns(data.dates);
  // Group by department for the matrix when >1 department present.
  const byDept = new Map<string, ReportEmployee[]>();
  for (const emp of data.employees) {
    const key = emp.department ?? "No department";
    byDept.set(key, [...(byDept.get(key) ?? []), emp]);
  }
  const grouped = byDept.size > 1;
  const groups: [string, ReportEmployee[]][] = grouped
    ? [...byDept.entries()]
    : [["", data.employees]];

  return (
    <Document title={`Attendance ${data.from} to ${data.to}`}>
      {chunks.map((dates, ci) => (
        <Page key={`m${ci}`} size="A4" orientation="landscape" style={s.page}>
          <Text style={s.h1}>{data.orgName} — Attendance Report</Text>
          <Text style={s.sub}>
            {data.from} to {data.to} · generated {data.generatedAt.slice(0, 10)}
            {chunks.length > 1 ? ` · days ${dates[0]} – ${dates[dates.length - 1]}` : ""}
          </Text>
          {ci === 0 && <Text style={s.legend}>{LEGEND}</Text>}
          <View style={s.headRow}>
            <Text style={s.nameCell}>Employee</Text>
            {dates.map((d) => (
              <Text key={d} style={s.dayCell}>{d.slice(8)}</Text>
            ))}
            <Text style={s.totalCell}>Total h</Text>
          </View>
          {groups.map(([dept, emps]) => (
            <View key={dept || "all"}>
              {grouped && <Text style={s.deptHead}>{dept}</Text>}
              {emps.map((emp) => (
                <View key={emp.id} style={s.row} wrap={false}>
                  <Text style={s.nameCell}>{emp.name}</Text>
                  {emp.days
                    .filter((d) => dates.includes(d.date))
                    .map((d) => <MatrixCell key={d.date} day={d} />)}
                  <Text style={s.totalCell}>{formatHours(emp.totalMinutes)}</Text>
                </View>
              ))}
            </View>
          ))}
          {data.employees.length === 0 && (
            <Text style={{ marginTop: 20, color: "#5B6472" }}>No attendance in this period.</Text>
          )}
        </Page>
      ))}
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.h1}>Per-employee detail</Text>
        <Text style={s.sub}>{data.orgName} · {data.from} to {data.to} · times in IST</Text>
        {data.employees.map((emp) => (
          <View key={emp.id}>
            <Text style={s.detailHead}>
              {emp.name}{emp.department ? ` — ${emp.department}` : ""}
            </Text>
            <Text style={s.detailSub}>
              {formatHours(emp.totalMinutes)} hrs · {emp.daysPresent} days present
            </Text>
            {emp.days
              .filter((d) => d.pairs.length > 0 || d.state === "absent")
              .map((d) => (
                <View key={d.date} style={s.detailRow} wrap={false}>
                  <Text style={s.dDate}>{d.date.slice(5)}</Text>
                  <Text style={s.dPairs}>
                    {d.pairs.length > 0
                      ? d.pairs.map((p) => `${p.in}→${p.out ?? "?"}`).join(", ")
                      : "— absent —"}
                  </Text>
                  <Text style={s.dHours}>
                    {d.state === "worked" ? `${formatHours(d.minutes)}${d.marker}` : stateLetter(d.state)}
                  </Text>
                  <Text style={s.dFlags}>{flags(d)}</Text>
                </View>
              ))}
          </View>
        ))}
      </Page>
    </Document>
  );
}

export async function renderAttendanceReportPdf(data: AttendanceReportData): Promise<Buffer> {
  return renderToBuffer(<AttendanceReportPdf data={data} />);
}
```

- [ ] **Step 3: Implement the route**

```ts
// apps/web/src/app/api/reports/attendance/pdf/route.ts
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import { fetchAttendanceReportData, validateRange } from "@/lib/reports/fetch-report-data";
import { renderAttendanceReportPdf } from "@/lib/reports/attendance-pdf";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });
  if (!isAdmin(user.role)) return Response.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const departmentId = url.searchParams.get("departmentId");
  if (validateRange(from, to)) {
    return Response.json({ error: "invalid_range" }, { status: 400 });
  }

  try {
    const sb = createAdminSupabase();
    const { data: org } = await sb.from("organizations").select("name").eq("id", user.orgId).single();
    const orgName = org?.name ?? "Organization";
    const data = await fetchAttendanceReportData(user.orgId, orgName, { from, to, departmentId });
    const pdf = await renderAttendanceReportPdf(data);
    const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "org";
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="attendance-${slug}-${from}-${to}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[reports/attendance/pdf] failed:", e instanceof Error ? e.message : e);
    return Response.json({ error: "render_failed" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run route tests + a real render smoke test**

Run: `cd apps/web && npx vitest run tests/reports/` → PASS.
Then a one-off real-render probe (no test file, just confidence the PDF actually renders with Helvetica + the `–` dash):

```bash
cd apps/web && npx tsx --tsconfig tsconfig.json -e "
import { renderAttendanceReportPdf } from './src/lib/reports/attendance-pdf';
import { buildReportData } from './src/lib/reports/attendance-report';
const d = buildReportData({ from:'2026-07-01', to:'2026-07-07', todayIst:'2026-07-30', orgName:'Probe', generatedAt:new Date().toISOString(), employees:[{id:'e1',name:'Priya S',department_id:null,department:null}], records:[{employee_id:'e1',date:'2026-07-02',clock_in_at:'2026-07-02T03:32:00Z',clock_out_at:'2026-07-02T12:50:00Z',total_minutes:492,source:'device',auto_closed:false,out_of_zone_count:0,is_late:false}], events:[], holidays:[{date:'2026-07-04'}], leaves:[], orgPolicy:{week_type:6,off_days:[0]}, deptOverrides:{}, empOverrides:{} });
renderAttendanceReportPdf(d).then(b => { require('fs').writeFileSync('../../.superpowers/probe-report.pdf', b); console.log('OK', b.length, 'bytes'); });
"
```

Expected: `OK <n> bytes` with n > 2000. Open `.superpowers/probe-report.pdf` locally to eyeball the matrix (or skip visual check if headless — byte-size success is the gate; visual pass happens in Task 4's manual verify). If the `–` en-dash renders as garbage in Helvetica, replace `stateLetter`'s future glyph with `"-"` in the lib AND its test.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/reports/attendance-pdf.tsx apps/web/src/app/api/reports/attendance/pdf/route.ts apps/web/tests/reports/pdf-route.test.ts
git commit -m "feat(reports): attendance PDF document + streaming download route"
```

---

### Task 4: Reports tab UI + CSV download + wiring

**Files:**
- Create: `apps/web/src/components/attendance/attendance-reports-tab.tsx`
- Modify: `apps/web/src/components/attendance/attendance-client.tsx` (tab union at `:56`, tab button row, tab render — additive only)

**Interfaces:**
- Consumes: `getAttendanceReportData`, `listReportDepartments` (Task 2 actions); `csvRows`, `formatHours`, type `AttendanceReportData` (Task 1); `sonner` toast; existing tab-button styling in `attendance-client.tsx` (copy the classNames of the "daily" tab button exactly).
- Produces: `<AttendanceReportsTab />` (no props — self-contained fetching).

- [ ] **Step 1: Implement the tab component**

```tsx
// apps/web/src/components/attendance/attendance-reports-tab.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, FileText, Loader2 } from "lucide-react";
import { getAttendanceReportData, listReportDepartments } from "@/actions/attendance-reports";
import { csvRows, formatHours, type AttendanceReportData } from "@/lib/reports/attendance-report";

const MAX_RANGE_MSG = "Range too large — maximum 92 days";

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function monthBounds(offset: number): { from: string; to: string } {
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 0));
  return { from: iso(first), to: iso(last) };
}

const PRESETS = [
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "last_7", label: "Last 7 days" },
  { key: "custom", label: "Custom" },
] as const;

export function AttendanceReportsTab() {
  const [preset, setPreset] = useState<(typeof PRESETS)[number]["key"]>("this_month");
  const [custom, setCustom] = useState(() => monthBounds(0));
  const [departmentId, setDepartmentId] = useState<string>("");
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<AttendanceReportData | null>(null);

  useEffect(() => {
    listReportDepartments().then((r) => {
      if (r.success) setDepartments(r.data);
    });
  }, []);

  const range = useMemo(() => {
    if (preset === "this_month") return monthBounds(0);
    if (preset === "last_month") return monthBounds(-1);
    if (preset === "last_7") {
      const now = new Date();
      const from = new Date(now.getTime() - 6 * 86_400_000);
      return { from: iso(from), to: iso(now) };
    }
    return custom;
  }, [preset, custom]);

  const rangeDays = useMemo(() => {
    const ms = new Date(`${range.to}T00:00:00Z`).getTime() - new Date(`${range.from}T00:00:00Z`).getTime();
    return Math.round(ms / 86_400_000) + 1;
  }, [range]);
  const rangeError =
    !/^\d{4}-\d{2}-\d{2}$/.test(range.from) || !/^\d{4}-\d{2}-\d{2}$/.test(range.to) || range.from > range.to
      ? "Invalid date range"
      : rangeDays > 92
        ? MAX_RANGE_MSG
        : null;

  async function generatePreview() {
    if (rangeError) return toast.error(rangeError);
    setLoading(true);
    const res = await getAttendanceReportData({ from: range.from, to: range.to, departmentId: departmentId || null });
    setLoading(false);
    if (!res.success) return toast.error(res.error);
    setReport(res.data);
    if (res.data.employees.length === 0) toast.info("No employees in this selection");
  }

  function downloadCsv() {
    if (!report) return;
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const text = csvRows(report).map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `attendance-${report.from}-${report.to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const pdfHref = `/api/reports/attendance/pdf?from=${range.from}&to=${range.to}${departmentId ? `&departmentId=${departmentId}` : ""}`;
  const previewMatchesRange = report && report.from === range.from && report.to === range.to;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => { setPreset(p.key); setReport(null); }}
              className={`rounded-full px-3 py-1.5 text-sm ${
                preset === p.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex items-center gap-2 text-sm">
            <input type="date" value={custom.from} max={custom.to}
              onChange={(e) => { setCustom((c) => ({ ...c, from: e.target.value })); setReport(null); }}
              className="rounded-md border px-2 py-1.5" />
            <span className="text-muted-foreground">to</span>
            <input type="date" value={custom.to} min={custom.from}
              onChange={(e) => { setCustom((c) => ({ ...c, to: e.target.value })); setReport(null); }}
              className="rounded-md border px-2 py-1.5" />
          </div>
        )}
        <select value={departmentId}
          onChange={(e) => { setDepartmentId(e.target.value); setReport(null); }}
          className="rounded-md border px-2 py-1.5 text-sm">
          <option value="">All departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <button onClick={generatePreview} disabled={loading || !!rangeError}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          Generate preview
        </button>
      </div>
      {rangeError && <p className="text-sm text-destructive">{rangeError}</p>}

      {report && (
        <>
          <div className="flex gap-2">
            <a href={pdfHref}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
              <Download className="h-4 w-4" /> Download PDF
            </a>
            <button onClick={downloadCsv}
              className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium">
              <Download className="h-4 w-4" /> Download CSV
            </button>
            {!previewMatchesRange && (
              <span className="self-center text-xs text-muted-foreground">Preview is for {report.from} – {report.to}; regenerate after changing the range.</span>
            )}
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">Department</th>
                  <th className="px-3 py-2 text-right">Days present</th>
                  <th className="px-3 py-2 text-right">Total hours</th>
                </tr>
              </thead>
              <tbody>
                {report.employees.map((e) => (
                  <tr key={e.id} className="border-t">
                    <td className="px-3 py-2">{e.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{e.department ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{e.daysPresent}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatHours(e.totalMinutes)}</td>
                  </tr>
                ))}
                {report.employees.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">No employees in this selection</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
      {!report && !loading && (
        <p className="text-sm text-muted-foreground">Pick a period and generate a preview, then download the full PDF (matrix + per-employee punch detail) or CSV.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire into `attendance-client.tsx`** (three minimal edits — match existing styling verbatim; the exact classNames come from the current "daily" tab button and pane, read them before editing)

1. Import: `import { AttendanceReportsTab } from "./attendance-reports-tab";`
2. Widen the union at `:56`: `useState<"my" | "team" | "roster" | "overtime" | "daily" | "reports">(...)`
3. In the tab-button row, after the Daily/Locations button (which renders only when `isAdmin` — mirror that condition):

```tsx
{isAdmin && (
  <button
    onClick={() => setActiveTab("reports")}
    className={/* copy the exact className expression the "daily" tab button uses, with activeTab === "reports" */}
  >
    Reports
  </button>
)}
```

4. In the tab content area, alongside the `activeTab === "daily"` branch:

```tsx
{activeTab === "reports" && isAdmin && <AttendanceReportsTab />}
```

- [ ] **Step 3: Verify**

```bash
cd apps/web && npx vitest run tests/reports/ && npm run lint
```
Expected: tests PASS, lint clean.
Manual smoke (requires `.env.local`): `npm run dev` from repo root → sign in as the test1 org admin → `/dashboard/attendance` → Reports tab → Last month → Generate preview (totals table renders) → Download PDF (opens as attachment, matrix cells show hours+marker or W/H/L/A, detail pairs match the Punch Timeline dialog for a spot-checked employee) → Download CSV (opens in Excel, totals match preview). Stop the dev server when done — NEVER run `next build` while it runs (gotcha #92).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/attendance/attendance-reports-tab.tsx apps/web/src/components/attendance/attendance-client.tsx
git commit -m "feat(reports): Reports tab — period presets, dept filter, preview, PDF/CSV downloads"
```

---

### Task 5: Final gates + docs

**Files:**
- Modify: `CLAUDE.md` (Attendance Module section — add a short "Reports" bullet; NO new gotcha unless something genuinely new surfaced)
- No route-registry/help-article changes: gotcha #61 covers new `/dashboard/*` PAGES; this is a tab on an existing page. State this in the PR body so the assistant-integrity reviewer doesn't flag it.

- [ ] **Step 1: Full web test suite + lint**

```bash
cd apps/web && npx vitest run && npm run lint
```
Expected: all suites green (500+ tests incl. the new `tests/reports/*`), lint clean.

- [ ] **Step 2: Production build**

```bash
cd apps/web && npm run build
```
Expected: build succeeds (ensure NO dev server is running first — gotcha #92). Confirm the new route appears in the route manifest output (`/api/reports/attendance/pdf`).

- [ ] **Step 3: CLAUDE.md addition** — in the Attendance Module section, append:

```markdown
- **Reports tab** (admin-only, shipped 2026-07-30): period presets/custom range (≤92 days) + department filter → preview totals, landscape PDF (employee×date matrix with source markers d/m/w/* + day states W/H/L/A, then per-employee punch-pair detail) via `GET /api/reports/attendance/pdf` (streams, `maxDuration=60`), CSV client-side. Pure assembly in `src/lib/reports/attendance-report.ts` (paginated fetch in `fetch-report-data.ts` — range queries page at 1000 rows; the older `getDailyAttendance` still truncates at 1000, known issue).
```

- [ ] **Step 4: Commit + finish**

```bash
git add CLAUDE.md
git commit -m "docs: attendance Reports tab notes in CLAUDE.md"
```

Then use superpowers:finishing-a-development-branch (PR to main; note in the PR body: no route-registry entry needed — tab, not a new page; Daily-tab 1000-row truncation intentionally untouched, tracked as known issue).
