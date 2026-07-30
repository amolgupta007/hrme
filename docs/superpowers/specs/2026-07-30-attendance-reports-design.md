# Attendance Reports — Design Spec

**Date:** 2026-07-30 · **Status:** Approved by Amol (brainstorm 2026-07-30)
**Surface:** web `/dashboard/attendance` → new **Reports** tab · **Access:** admin/owner only

## Purpose

Admins need a periodic, audit-grade attendance export: who worked how many hours on which
date, with per-day punch detail and the punch source (device / mobile / web / auto-closed)
visible at a glance. Output must be **compact** (one-glance matrix) **and detailed**
(per-employee punch pairs) in a single PDF, plus a CSV for spreadsheet work.

## Decisions (locked)

| Decision | Choice |
|---|---|
| Placement | New "Reports" tab in `attendance-client.tsx` tab union (`"my"\|"team"\|"roster"\|"overtime"\|"daily"\|"reports"`) — how this page has always grown |
| Access | Admin/owner only (same gate as the Daily tab's `getDailyAttendance`); managers excluded in v1 |
| Period | Presets **This month / Last month / Last 7 days / Custom From–To**; range hard-capped at **92 days** (server-enforced, friendly error) |
| Filters | Department dropdown (All / one). No individual-employee picker in v1 |
| Formats | **PDF** (server-rendered) + **CSV** (client Blob from the same data) |
| PDF layout | **Summary matrix + per-employee detail sections** (chosen over single flat table) |
| Day states | Full: week-off **W**, holiday **H**, approved leave **L**, absent **A** — every empty cell is explained |
| Source markers | Lowercase/symbol for source: `ᵈ` device · `ᵐ` mobile · `ʷ` web/manual · `*` auto-closed. Uppercase for day states. Legend on page 1. Fallback to plain suffix letters (`8.2 d`) if superscript glyphs render poorly in `@react-pdf/renderer` built-in fonts — decide once at implementation with a render probe |

## Architecture

Three units, each independently testable:

### 1. Data action — `getAttendanceReportData({from, to, departmentId?})`
`apps/web/src/actions/attendance-reports.ts` (new). Admin-gated (`isAdmin`), org-scoped via
`getCurrentUser()`. Composes, in parallel where possible:

- **Employees**: active (non-terminated) rows + department names; filtered by `departmentId`.
  Include employees terminated *within* the range? **No — v1 reports active employees only**
  (matches Daily tab behavior).
- **`attendance_records`** for `[from, to]` — **paginated with `.range()` in 1000-row pages**
  and stitched. (The existing `getDailyAttendance` truncates silently at PostgREST's 1000-row
  cap; this feature must not inherit that. Fixing the Daily tab itself is out of scope — note
  it in the plan as a known-issue line, don't touch it.)
- **`attendance_punch_events`** (status `approved`) for the range — same pagination. Grouped
  per employee/IST-day; pairs via shared `pairPunches`. Days with a record but **no** events
  (legacy web clock-in rows) fall back to the record's `clock_in_at`/`clock_out_at` as a
  single pair.
- **Day states**: holidays in range, approved `leave_requests` overlapping range, effective
  week-off per employee (`resolveEffectiveWeekOff` with employee > department > org
  precedence, same loading pattern as `/dashboard/attendance/page.tsx`'s `weekOffByEmployee`).
  Precedence per cell: **holiday > leave > week-off > worked > absent** (absent = past
  working day, no hours). Dates after today-IST inside the range (e.g. "This month" mid-month)
  render as `–` (future), never absent — same rule as the mobile calendar. Reuse the shared compute the mobile slice built: call
  `computeMonthCalendar` per covered month per employee and slice to the range — or, if that
  proves awkward, add a thin pure `computeRangeDayStates` wrapper in `packages/shared`
  reusing the same helpers (`isWeekOff`/`isAltSaturdayOff`). Implementation plan picks one;
  either way the precedence logic is NOT re-derived.

Returns a typed `AttendanceReportData`: `{ period, employees: [{id, name, department,
days: [{date, state, minutes?, source?, autoClosed, pairs: [{in, out, minutes}],
outOfZoneCount, isLate}], totalMinutes }], legend meta }`.

### 2. Pure assembly lib — `apps/web/src/lib/reports/attendance-report.ts`
Pure functions (no I/O) turning raw fetched rows into `AttendanceReportData`: pagination
stitching, per-day grouping, pair fallback, day-state resolution, totals, matrix
column-chunking math (date columns per page). This is where vitest coverage lives
(`apps/web/tests/reports/attendance-report.test.ts`): day-state precedence table cases,
range spanning month boundaries, pair fallback, 1000-row page stitching, source-marker
mapping (record `source` values `web|device|auto_close|mobile` → markers).

### 3. PDF route — `GET /api/reports/attendance/pdf?from=&to=&departmentId=`
Route handler (not a server action — streams a download). Auth: `getCurrentUser()` +
`isAdmin` (route stays behind Clerk middleware; browser download carries cookies).
`export const maxDuration = 60`. Renders with `@react-pdf/renderer` `renderToBuffer`
(already in `serverComponentsExternalPackages`), responds with
`Content-Disposition: attachment; filename="attendance-<org>-<from>-<to>.pdf"`.
No storage residue (deliberate contrast with document-templating's upload+signed-URL —
reports are ephemeral).

**PDF structure** (landscape A4):
- **Page 1+ — summary matrix**: rows = employees (grouped by department when All), columns =
  dates. Cell = `hours` + source marker, or state letter (W/H/L/A). Right column: period
  total hours. Ranges wider than ~16 days split into column groups continuing on following
  pages (chunk math from the pure lib). Legend + org name + period + generated-at header.
- **Then — per-employee detail**: one section per employee: `date · punch pairs
  (HH:MM→HH:MM each) · day hours · source marker · flags` (auto-closed, out-of-zone count,
  late, single-punch `!`). Times in IST. Section header repeats employee name + dept + total.

### CSV
Client-side Blob (Insights `export-csv-button` pattern) from the same
`AttendanceReportData` already fetched for the preview — one row per employee-day:
`date, employee, department, state, hours, punch_pairs ("09:02-13:11; 13:58-18:20"),
source, auto_closed, out_of_zone, late`. UTF-8 BOM.

### UI — `apps/web/src/components/attendance/attendance-reports-tab.tsx`
Period preset pills + custom From/To (native date inputs, Daily-tab idiom), department
select, **Generate preview** → renders per-employee totals table (name, dept, days present,
total hours) via the data action → **Download PDF** (link to the route with current params)
+ **Download CSV** (client Blob). Empty/error states; disabled buttons until a valid
preview loaded; range >92d rejected client-side with the same message the server enforces.

## Error handling
- Range invalid / >92 days → 400 with `{error}` (route) / `ActionResult` error (action).
- Zero employees or zero records → PDF still generates with an "no attendance in period"
  page (not an error); preview shows empty state.
- PDF render failure → 500 generic, detail server-logged (no internals in body).

## Out of scope (v1)
Manager-scoped reports · individual-employee filter · scheduled/emailed reports ·
terminated-employee inclusion · late/OT dedicated report types (the Reports tab leaves room
for them) · fixing the Daily tab's 1000-row truncation (noted as known issue).

## Success criteria
Admin selects "Last month" + All departments on a 15-person org → PDF downloads in <10s
with a one-page matrix where every cell is either hours+marker or W/H/L/A, followed by 15
detail sections whose pair times match the web punch timeline; CSV opens in Excel with
matching totals. All new tests green; no change to existing attendance tab behavior.
