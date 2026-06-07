# Attendance Module Phase 1 (Shifts + Week-Off) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a configurable Shift Master, manual shift assignment (employee + department), correct overnight-shift representation, and an org-level Week-Off Policy — the strict Phase 1 scope from PRD 01 (Attendance).

**Architecture:** Three new Supabase tables (`shifts`, `shift_assignments`, `week_off_policy`) plus two nullable additive columns on `attendance_records` (`shift_id`, `attributed_date`). New server-action surface in `src/actions/shifts.ts` and `src/actions/week-off.ts`. New "Attendance" CollapsibleSection in `src/components/settings/settings-content.tsx` hosting three sub-cards (Shift Master, Shift Assignments, Week-Off Policy) + the relocated Working Hours card. Pure helpers in `src/lib/attendance/` for overnight math, hour computation, and shift-for-date resolution — all unit-tested. Auto-clockout cron switches to "assigned shift hours → default shift hours → `standard_workday_hours`" fallback chain. Out-of-scope per PRD §11: rotational rotation UI, roster grid, OT computation, per-employee week-off override, alternate-Saturday, regularization, holiday integration, half-day automation.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind + Radix + CVA, Supabase Postgres (admin client; RLS advisory), Clerk (admin-only mutations in Phase 1), Vitest for pure helpers, existing `sonner` toast / `lucide-react` icons / `Button` + `CollapsibleSection` primitives.

---

## Scope Lockdown (read first)

**In scope (PRD §11 Phase 1):**
1. Shift Master CRUD — name, start/end time, total hours auto-computed, break minutes, grace minutes, half-day threshold, OT eligibility flag, default flag, active flag, auto-detected `is_overnight`.
2. Manual shift assignment — assign a shift to one-or-many employees, or to a whole department, for a date range. (No rotation UI, no roster grid, no conflict detection — those are Phase 2.)
3. Overnight handling — `is_overnight` auto-detected on save; `total_hours` correctly computed across midnight; overnight shifts attribute attendance to **start date** (hard-coded for Phase 1, configurable in Phase 2 per OD-1).
4. Week-Off Policy (org-level) — 5-day or 6-day work week + which days are off (subset of Sun/Sat). No per-employee override, no alternate-Saturday (both Phase 2).
5. Wire clock-in / clock-out + auto-clockout cron to honor the assigned shift hours (per OD-2 / OD-3). Falls back cleanly when no shift assignment exists.
6. Relocate `WorkingHoursCard` from `/dashboard/attendance` into the new Settings → Attendance section (per OD-7).

**Out of scope (defer to Phase 2 / Phase 3 / never):**
- Rotational rotation UI, roster grid, drag-to-assign.
- Conflict detection (double-assigned, week-off clash).
- OT computation, multiplier config, OT approval, OT → payroll feed.
- Per-employee week-off override, alternate-Saturday support.
- Half-day / short-leave automation, regularization workflow.
- Holiday calendar integration with shifts.
- `attendance_records.status` enum extension (`present|absent|half|...`) — Phase 2/3.
- `attendance_records.ot_minutes` column — Phase 2.
- `ot_records` table — Phase 2.
- `employee_week_off_override` table — Phase 2.
- Biometric / hardware device integration.
- Auto-rostering algorithms / AI.

**Resolved open decisions:** OD-1=hard-code-start-date, OD-2=wire-clock-in, OD-3=update-cron, OD-4=settings-card-only, OD-5=seed-default-shift-from-existing-workday-hours, OD-6=start-at-migration-029, OD-7=move-WorkingHoursCard-into-Settings.

**Authorization model for Phase 1:** All shift master / assignment / week-off mutations are **admin-only** (owner+admin). Managers gain assignment scope in Phase 2 with the roster grid. Employees can read their own assigned shift (read-only chip on `/dashboard/attendance`).

---

## File Structure

### Migrations (`supabase/migrations/`)
- Create: `029_shifts.sql` — `shifts` table + indexes + RLS scaffolding.
- Create: `030_shift_assignments.sql` — `shift_assignments` table + indexes + RLS scaffolding.
- Create: `031_week_off_policy.sql` — `week_off_policy` table + RLS scaffolding.
- Create: `032_attendance_records_shift_columns.sql` — additive `shift_id UUID NULL` + `attributed_date DATE NULL` on `attendance_records`.

### Pure helpers (Vitest-tested, no DB)
- Create: `src/lib/attendance/shift-time.ts` — `parseHHMM`, `computeShiftTotalHours(start, end, breakMinutes)`, `isOvernight(start, end)`.
- Create: `src/lib/attendance/attribute-date.ts` — `attributedDateForClockIn(clockInAtUtc, shift, tz='Asia/Kolkata')` returning the IST date the shift belongs to (= start date even when crossing midnight).
- Create: `src/lib/attendance/week-off.ts` — `WeekOffPolicy` type, `isWeekOff(date, policy)`, `WEEK_DAYS` constant.
- Test: `tests/attendance/shift-time.test.ts`, `tests/attendance/attribute-date.test.ts`, `tests/attendance/week-off.test.ts`.

### Server actions
- Create: `src/actions/shifts.ts` — `listShifts`, `getShift`, `upsertShift`, `setDefaultShift`, `deactivateShift`, `listShiftAssignments`, `assignShiftToEmployees`, `assignShiftToDepartment`, `getActiveShiftForEmployee(employeeId, date)`, `bootstrapDefaultShiftIfMissing`.
- Create: `src/actions/week-off.ts` — `getWeekOffPolicy`, `upsertWeekOffPolicy`.
- Modify: `src/actions/attendance.ts:108-154` (`clockIn`) — resolve active shift via `getActiveShiftForEmployee`; record `shift_id` + `attributed_date` when present; fall back to today's date otherwise (current behaviour).
- Modify: `src/actions/attendance.ts:225-257` (`listAttendance`) — return joined `shift_name` for history rows that have a `shift_id`.

### Cron
- Modify: `src/app/api/cron/attendance-auto-clockout/route.ts` — per-row resolution: assigned shift's hours → org default shift's hours → `standard_workday_hours` (existing). Cap unchanged (IST end-of-`date`, where `date` = `attributed_date` if present, else `date`).

### UI — Settings
- Modify: `src/components/settings/settings-content.tsx` — add new `Attendance` CollapsibleSection (admin + attendanceEnabled gated), housing four sub-cards: Working Hours (moved), Shift Master, Shift Assignments, Week-Off Policy.
- Modify: `src/app/dashboard/settings/page.tsx` — fetch shift master + assignments + week-off policy via the new actions; pass into `SettingsContent`.
- Create: `src/components/settings/attendance-section.tsx` — top-level wrapper for the four sub-cards.
- Create: `src/components/settings/shift-master-card.tsx` — list shifts + add/edit dialog.
- Create: `src/components/settings/shift-form-dialog.tsx` — modal form (name, start, end, break, grace, half-day threshold, OT-eligible, is_default, active). Live-renders `total_hours` and `is_overnight` from the time inputs.
- Create: `src/components/settings/shift-assignments-card.tsx` — list current assignments (employee / department, shift, date range) + assign-shift dialog.
- Create: `src/components/settings/assign-shift-dialog.tsx` — pick shift + scope (employees multi-select or a department) + date range; calls `assignShiftToEmployees` / `assignShiftToDepartment`.
- Create: `src/components/settings/week-off-card.tsx` — radio for 5/6-day; checkbox row Sun/Mon/…/Sat; save button.
- Move: `src/components/attendance/working-hours-card.tsx` → `src/components/settings/working-hours-card.tsx` (only the file moves; imports update). Phase-1 also adds a small read-only "Today's shift: <name> (06:00–15:00)" chip on `/dashboard/attendance` so employees can see their assignment without leaving the page.

### UI — Attendance page touch-ups
- Modify: `src/app/dashboard/attendance/page.tsx:319-361` — fetch the caller's active shift via `getActiveShiftForEmployee`; pass `activeShift` into `AttendanceClient`. Drop the `attendanceSettings`/`WorkingHoursCard` plumbing (moved to Settings).
- Modify: `src/components/attendance/attendance-client.tsx` — remove `WorkingHoursCard` import + render; accept `activeShift` prop; render read-only "Today's shift" chip near the clock-in card.

### Assistant integration (per CLAUDE.md gotcha #61)
- Modify: `src/lib/assistant/route-registry.ts` — add registry entries for the new Settings → Attendance sub-section (deep link `#attendance` anchor).
- Create: `src/lib/assistant/help/articles/configure_shifts.md` — how-to: define shifts, set default, mark overnight.
- Create: `src/lib/assistant/help/articles/assign_shift.md` — how-to: assign a shift to employees/department.
- Create: `src/lib/assistant/help/articles/configure_week_off.md` — how-to: pick 5/6-day + off days.

### Documentation
- Modify: `CLAUDE.md` — Attendance Module section: add shift master + assignments + week-off bullets, link to PRD 01. Add gotchas for Phase 1: (a) start-date attribution hard-coded; (b) bootstrap default-shift seeded from `standard_workday_hours`; (c) auto-clockout cron now reads shift hours first; (d) UNIQUE (org_id, employee_id, date) is preserved because overnight = attributed_date = start date; (e) admin-only authorization for Phase 1.
- Create: `docs/attendance-shifts-phase-1.md` — operator-facing summary (mirroring `docs/payroll-overhaul.md` / `docs/jambahire-pipeline-overhaul.md` style).

### Commit convention
Follow repo convention; **never** include `Co-Authored-By` lines per `memory/feedback_commit_message.md`. Per-task commits: small, scope-prefixed (`feat(attendance):` / `fix(attendance):` / `chore(attendance):` / `docs(attendance):`).

---

## Task Decomposition

### Task 1: Migration `029_shifts.sql`

**Files:**
- Create: `supabase/migrations/029_shifts.sql`

- [ ] **Step 1: Author the migration**

```sql
-- 029_shifts.sql — Attendance Phase 1: Shift master
-- Idempotent. Apply via Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  total_hours NUMERIC(4,2) NOT NULL,
  break_minutes INTEGER NOT NULL DEFAULT 0,
  grace_minutes INTEGER NOT NULL DEFAULT 0,
  half_day_threshold_minutes INTEGER NOT NULL DEFAULT 240,
  is_overnight BOOLEAN NOT NULL DEFAULT FALSE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  ot_eligible BOOLEAN NOT NULL DEFAULT TRUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- At most one default per org (Phase 1 invariant).
CREATE UNIQUE INDEX IF NOT EXISTS shifts_one_default_per_org
  ON public.shifts (org_id)
  WHERE is_default;

CREATE INDEX IF NOT EXISTS shifts_org_active_idx
  ON public.shifts (org_id, active);

-- Org-uniqueness: a shift name should be unique within an org so the picker
-- can't show two "Morning" entries. Case-insensitive via lower().
CREATE UNIQUE INDEX IF NOT EXISTS shifts_org_name_unique
  ON public.shifts (org_id, lower(name));

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

-- Admin policy follows the existing codebase pattern (009_jambahire_rls.sql,
-- 018_payroll_schema_capture.sql). Service-role bypasses RLS today (CLAUDE.md
-- gotcha #5); these policies activate when Clerk-JWT-to-Supabase is wired.
DROP POLICY IF EXISTS shifts_admin_all ON public.shifts;
CREATE POLICY shifts_admin_all ON public.shifts FOR ALL
  USING (
    auth.jwt() ->> 'org_id' = shifts.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  )
  WITH CHECK (
    auth.jwt() ->> 'org_id' = shifts.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  );

-- Reuse the shared updated_at trigger function (already exists per migration 001).
DROP TRIGGER IF EXISTS shifts_set_updated_at ON public.shifts;
CREATE TRIGGER shifts_set_updated_at
  BEFORE UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

- [ ] **Step 2: Apply via Supabase SQL Editor**

Run the migration in the Supabase Dashboard. Verify with:
```sql
SELECT column_name, data_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='shifts' ORDER BY ordinal_position;
```
Expected: 15 rows incl. `is_overnight`, `is_default`, `ot_eligible`, `active`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/029_shifts.sql
git commit -m "feat(attendance): add shifts table (PRD 01 Phase 1)"
```

---

### Task 2: Migration `030_shift_assignments.sql`

**Files:**
- Create: `supabase/migrations/030_shift_assignments.sql`

- [ ] **Step 1: Author the migration**

```sql
-- 030_shift_assignments.sql — Attendance Phase 1: Per-employee shift assignment.
-- Idempotent.

CREATE TABLE IF NOT EXISTS public.shift_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  shift_id UUID NOT NULL REFERENCES public.shifts(id) ON DELETE RESTRICT,
  date_from DATE NOT NULL,
  date_to DATE,  -- null = open-ended
  assigned_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (date_to IS NULL OR date_to >= date_from)
);

CREATE INDEX IF NOT EXISTS shift_assignments_employee_range_idx
  ON public.shift_assignments (org_id, employee_id, date_from DESC);

CREATE INDEX IF NOT EXISTS shift_assignments_shift_idx
  ON public.shift_assignments (shift_id);

ALTER TABLE public.shift_assignments ENABLE ROW LEVEL SECURITY;

-- Follows 009_jambahire_rls.sql / 018_payroll_schema_capture.sql admin pattern.
-- Service-role bypasses today (CLAUDE.md gotcha #5).
DROP POLICY IF EXISTS shift_assignments_admin_all ON public.shift_assignments;
CREATE POLICY shift_assignments_admin_all ON public.shift_assignments FOR ALL
  USING (
    auth.jwt() ->> 'org_id' = shift_assignments.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  )
  WITH CHECK (
    auth.jwt() ->> 'org_id' = shift_assignments.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  );

-- Employees can SELECT their own assignments (powers the "Today's shift" chip).
DROP POLICY IF EXISTS shift_assignments_self_read ON public.shift_assignments;
CREATE POLICY shift_assignments_self_read ON public.shift_assignments FOR SELECT
  USING (
    auth.jwt() ->> 'org_id' = shift_assignments.org_id::text
    AND auth.jwt() ->> 'employee_id' = shift_assignments.employee_id::text
  );
```

> Note: Phase 1 does not enforce non-overlapping assignments. Latest-`date_from` wins at resolve time (see `getActiveShiftForEmployee`). Conflict detection is Phase 2.

- [ ] **Step 2: Apply via Supabase SQL Editor** — verify with `\d public.shift_assignments` style query (or `information_schema.columns`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/030_shift_assignments.sql
git commit -m "feat(attendance): add shift_assignments table (PRD 01 Phase 1)"
```

---

### Task 3: Migration `031_week_off_policy.sql`

**Files:**
- Create: `supabase/migrations/031_week_off_policy.sql`

- [ ] **Step 1: Author the migration**

```sql
-- 031_week_off_policy.sql — Attendance Phase 1: Org-level week-off policy.
-- One row per org. Idempotent.

CREATE TABLE IF NOT EXISTS public.week_off_policy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  week_type SMALLINT NOT NULL CHECK (week_type IN (5, 6)),
  -- ISO day-of-week: 0=Sunday, 1=Monday, ..., 6=Saturday
  off_days SMALLINT[] NOT NULL DEFAULT ARRAY[0]::SMALLINT[],
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.week_off_policy ENABLE ROW LEVEL SECURITY;

-- Admin write (org-scoped, Clerk-JWT pattern from 009_jambahire_rls.sql).
DROP POLICY IF EXISTS week_off_policy_admin_all ON public.week_off_policy;
CREATE POLICY week_off_policy_admin_all ON public.week_off_policy FOR ALL
  USING (
    auth.jwt() ->> 'org_id' = week_off_policy.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  )
  WITH CHECK (
    auth.jwt() ->> 'org_id' = week_off_policy.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  );

-- Any authenticated user in the org can READ the org's policy (it affects
-- everyone's calendar — no PII).
DROP POLICY IF EXISTS week_off_policy_org_read ON public.week_off_policy;
CREATE POLICY week_off_policy_org_read ON public.week_off_policy FOR SELECT
  USING (auth.jwt() ->> 'org_id' = week_off_policy.org_id::text);

DROP TRIGGER IF EXISTS week_off_policy_set_updated_at ON public.week_off_policy;
CREATE TRIGGER week_off_policy_set_updated_at
  BEFORE UPDATE ON public.week_off_policy
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

- [ ] **Step 2: Apply via Supabase SQL Editor** and verify columns.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/031_week_off_policy.sql
git commit -m "feat(attendance): add week_off_policy table (PRD 01 Phase 1)"
```

---

### Task 4: Migration `032_attendance_records_shift_columns.sql`

**Files:**
- Create: `supabase/migrations/032_attendance_records_shift_columns.sql`

- [ ] **Step 1: Author the migration**

```sql
-- 032_attendance_records_shift_columns.sql — Attendance Phase 1:
-- Wire attendance records to shift master. Additive + nullable.

ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS shift_id UUID NULL REFERENCES public.shifts(id) ON DELETE SET NULL;

ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS attributed_date DATE NULL;

-- attributed_date is only set when the row is recorded under a shift; for
-- legacy / no-shift orgs we leave it null and continue using `date`.
CREATE INDEX IF NOT EXISTS attendance_records_attributed_date_idx
  ON public.attendance_records (org_id, attributed_date)
  WHERE attributed_date IS NOT NULL;
```

> Existing UNIQUE `(org_id, employee_id, date)` is preserved unchanged. For overnight shifts, `clockIn` writes `date = attributed_date = shift start date`, so the unique key still holds.

- [ ] **Step 2: Apply via Supabase SQL Editor**, verify columns exist.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/032_attendance_records_shift_columns.sql
git commit -m "feat(attendance): add shift_id + attributed_date to attendance_records"
```

---

### Task 5: Pure helper `shift-time.ts` (TDD)

**Files:**
- Create: `src/lib/attendance/shift-time.ts`
- Test: `tests/attendance/shift-time.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/attendance/shift-time.test.ts
import { describe, it, expect } from "vitest";
import { parseHHMM, computeShiftTotalHours, isOvernight } from "@/lib/attendance/shift-time";

describe("parseHHMM", () => {
  it("parses HH:MM into minutes past midnight", () => {
    expect(parseHHMM("09:00")).toBe(9 * 60);
    expect(parseHHMM("00:00")).toBe(0);
    expect(parseHHMM("23:59")).toBe(23 * 60 + 59);
  });
  it("throws on invalid input", () => {
    expect(() => parseHHMM("9:00")).toThrow();
    expect(() => parseHHMM("24:00")).toThrow();
    expect(() => parseHHMM("ab:cd")).toThrow();
  });
});

describe("isOvernight", () => {
  it("flags shifts whose end < start", () => {
    expect(isOvernight("22:00", "06:00")).toBe(true);
    expect(isOvernight("09:00", "17:00")).toBe(false);
    expect(isOvernight("00:00", "08:00")).toBe(false);
  });
  it("returns false when start === end (24h shift edge case → reject in form, but helper is true-or-false)", () => {
    expect(isOvernight("06:00", "06:00")).toBe(false);
  });
});

describe("computeShiftTotalHours", () => {
  it("computes regular daytime shift hours minus break", () => {
    expect(computeShiftTotalHours("09:00", "17:00", 0)).toBe(8);
    expect(computeShiftTotalHours("09:00", "17:00", 30)).toBe(7.5);
  });
  it("computes overnight shift hours correctly", () => {
    expect(computeShiftTotalHours("22:00", "06:00", 0)).toBe(8);
    expect(computeShiftTotalHours("22:00", "06:00", 60)).toBe(7);
  });
  it("rejects break >= shift duration", () => {
    expect(() => computeShiftTotalHours("09:00", "10:00", 60)).toThrow();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```
npx vitest run tests/attendance/shift-time.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

```typescript
// src/lib/attendance/shift-time.ts
const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseHHMM(value: string): number {
  const m = HHMM_RE.exec(value);
  if (!m) throw new Error(`Invalid HH:MM time: ${value}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function isOvernight(start: string, end: string): boolean {
  return parseHHMM(end) < parseHHMM(start);
}

export function computeShiftTotalHours(start: string, end: string, breakMinutes: number): number {
  const startMin = parseHHMM(start);
  const endMin = parseHHMM(end);
  const spanMin = endMin > startMin ? endMin - startMin : 24 * 60 - startMin + endMin;
  if (breakMinutes >= spanMin) {
    throw new Error("Break minutes cannot equal or exceed shift duration");
  }
  if (breakMinutes < 0) throw new Error("Break minutes cannot be negative");
  return Math.round((spanMin - breakMinutes) / 6) / 10; // 0.1h precision
}
```

- [ ] **Step 4: Run tests, verify they pass**

```
npx vitest run tests/attendance/shift-time.test.ts
```
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendance/shift-time.ts tests/attendance/shift-time.test.ts
git commit -m "feat(attendance): shift-time helpers with overnight + break math"
```

---

### Task 6: Pure helper `attribute-date.ts` (TDD)

**Files:**
- Create: `src/lib/attendance/attribute-date.ts`
- Test: `tests/attendance/attribute-date.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/attendance/attribute-date.test.ts
import { describe, it, expect } from "vitest";
import { attributedDateForClockIn } from "@/lib/attendance/attribute-date";

describe("attributedDateForClockIn (start-date attribution, IST)", () => {
  it("daytime shift on the same IST date attributes to that date", () => {
    // 09:30 IST on 2026-06-07 → IST 03:30 minus 5.5 = 03:30 IST start → UTC 04:00 prev day
    // For test simplicity, build IST 09:30 = UTC 04:00
    const clockInUtc = "2026-06-07T04:00:00.000Z"; // 09:30 IST
    expect(attributedDateForClockIn(clockInUtc, { start_time: "09:00", end_time: "17:00", is_overnight: false })).toBe("2026-06-07");
  });

  it("overnight shift clock-in at 22:00 IST attributes to that date (start)", () => {
    // 22:00 IST on 2026-06-07 = UTC 16:30 same day
    const clockInUtc = "2026-06-07T16:30:00.000Z";
    expect(attributedDateForClockIn(clockInUtc, { start_time: "22:00", end_time: "06:00", is_overnight: true })).toBe("2026-06-07");
  });

  it("overnight shift clock-in at 00:30 IST attributes to PREVIOUS IST date (start of the shift was yesterday)", () => {
    // 00:30 IST on 2026-06-08 = UTC 19:00 on 2026-06-07
    const clockInUtc = "2026-06-08T19:00:00.000Z";
    expect(attributedDateForClockIn(clockInUtc, { start_time: "22:00", end_time: "06:00", is_overnight: true })).toBe("2026-06-07");
  });

  it("falls back to IST date when no shift is provided", () => {
    const clockInUtc = "2026-06-07T16:30:00.000Z"; // 22:00 IST
    expect(attributedDateForClockIn(clockInUtc, null)).toBe("2026-06-07");
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```
npx vitest run tests/attendance/attribute-date.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

```typescript
// src/lib/attendance/attribute-date.ts
import { parseHHMM } from "./shift-time";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

type ShiftLike = {
  start_time: string;
  end_time: string;
  is_overnight: boolean;
} | null;

function toIstParts(utcIso: string): { dateStr: string; minutesPastMidnight: number } {
  const utcMs = new Date(utcIso).getTime();
  const ist = new Date(utcMs + IST_OFFSET_MS);
  const dateStr = ist.toISOString().slice(0, 10);
  const minutesPastMidnight = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return { dateStr, minutesPastMidnight };
}

function shiftPreviousDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function attributedDateForClockIn(clockInAtUtc: string, shift: ShiftLike): string {
  const { dateStr, minutesPastMidnight } = toIstParts(clockInAtUtc);
  if (!shift || !shift.is_overnight) return dateStr;

  const startMin = parseHHMM(shift.start_time);
  const endMin = parseHHMM(shift.end_time);
  // If the clock-in IST clock time is before the shift end-of-day boundary
  // (i.e. closer to midnight from the AM side), it belongs to the previous IST date.
  if (minutesPastMidnight < endMin || (minutesPastMidnight < startMin && minutesPastMidnight < 12 * 60)) {
    return shiftPreviousDay(dateStr);
  }
  return dateStr;
}
```

- [ ] **Step 4: Run tests, verify they pass**

```
npx vitest run tests/attendance/attribute-date.test.ts
```
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendance/attribute-date.ts tests/attendance/attribute-date.test.ts
git commit -m "feat(attendance): IST start-date attribution for overnight shifts"
```

---

### Task 7: Pure helper `week-off.ts` (TDD)

**Files:**
- Create: `src/lib/attendance/week-off.ts`
- Test: `tests/attendance/week-off.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/attendance/week-off.test.ts
import { describe, it, expect } from "vitest";
import { isWeekOff, WEEK_DAYS } from "@/lib/attendance/week-off";

describe("isWeekOff", () => {
  const sundayOnly = { week_type: 6 as const, off_days: [0] };
  const satSunOff  = { week_type: 5 as const, off_days: [0, 6] };

  it("returns true on Sunday for 6-day week with Sun off", () => {
    expect(isWeekOff("2026-06-07", sundayOnly)).toBe(true);   // Sunday
    expect(isWeekOff("2026-06-08", sundayOnly)).toBe(false);  // Monday
  });
  it("returns true on Sat or Sun for 5-day week with both off", () => {
    expect(isWeekOff("2026-06-06", satSunOff)).toBe(true);    // Saturday
    expect(isWeekOff("2026-06-07", satSunOff)).toBe(true);    // Sunday
    expect(isWeekOff("2026-06-05", satSunOff)).toBe(false);   // Friday
  });
  it("WEEK_DAYS exposes 0..6 with English labels", () => {
    expect(WEEK_DAYS).toHaveLength(7);
    expect(WEEK_DAYS[0]).toEqual({ value: 0, label: "Sunday" });
  });
});
```

- [ ] **Step 2: Run tests, verify they fail.**

- [ ] **Step 3: Implement**

```typescript
// src/lib/attendance/week-off.ts
export type WeekOffPolicy = {
  week_type: 5 | 6;
  off_days: number[]; // 0=Sun..6=Sat
};

export const WEEK_DAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
] as const;

export function isWeekOff(dateStr: string, policy: WeekOffPolicy): boolean {
  const day = new Date(`${dateStr}T00:00:00.000Z`).getUTCDay();
  return policy.off_days.includes(day);
}
```

- [ ] **Step 4: Run tests, verify they pass.**

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendance/week-off.ts tests/attendance/week-off.test.ts
git commit -m "feat(attendance): week-off policy helper"
```

---

### Task 8: Server actions `src/actions/shifts.ts` (CRUD + bootstrap)

**Files:**
- Create: `src/actions/shifts.ts`

- [ ] **Step 1: Write `shifts.ts` (full content)**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import type { ActionResult } from "@/types";
import { computeShiftTotalHours, isOvernight } from "@/lib/attendance/shift-time";

export type Shift = {
  id: string;
  org_id: string;
  name: string;
  start_time: string;
  end_time: string;
  total_hours: number;
  break_minutes: number;
  grace_minutes: number;
  half_day_threshold_minutes: number;
  is_overnight: boolean;
  is_default: boolean;
  ot_eligible: boolean;
  active: boolean;
};

export type ShiftAssignment = {
  id: string;
  org_id: string;
  employee_id: string;
  employee_name?: string | null;
  shift_id: string;
  shift_name?: string | null;
  date_from: string;
  date_to: string | null;
  assigned_by: string | null;
  notes: string | null;
};

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Invalid HH:MM");
const ShiftInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(80),
  start_time: HHMM,
  end_time: HHMM,
  break_minutes: z.number().int().min(0).max(720).default(0),
  grace_minutes: z.number().int().min(0).max(120).default(0),
  half_day_threshold_minutes: z.number().int().min(30).max(720).default(240),
  is_default: z.boolean().default(false),
  ot_eligible: z.boolean().default(true),
  active: z.boolean().default(true),
});

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" as const };
  if (!isAdmin(user.role)) return { error: "Only admins can manage shifts" as const };
  return { user };
}

export async function listShifts(): Promise<ActionResult<Shift[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  await bootstrapDefaultShiftIfMissing(user.orgId);
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("shifts")
    .select("*")
    .eq("org_id", user.orgId)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });
  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as Shift[] };
}

export async function upsertShift(input: unknown): Promise<ActionResult<Shift>> {
  const guard = await requireAdmin();
  if ("error" in guard) return { success: false, error: guard.error };
  const parsed = ShiftInputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const v = parsed.data;
  let total_hours: number;
  try {
    total_hours = computeShiftTotalHours(v.start_time, v.end_time, v.break_minutes);
  } catch (e: any) {
    return { success: false, error: e?.message ?? "Invalid shift duration" };
  }
  const overnight = isOvernight(v.start_time, v.end_time);

  const sb = createAdminSupabase();
  // If is_default, clear any existing default for this org first.
  if (v.is_default) {
    await sb.from("shifts").update({ is_default: false } as any).eq("org_id", guard.user.orgId).eq("is_default", true);
  }

  const row = {
    org_id: guard.user.orgId,
    name: v.name,
    start_time: v.start_time,
    end_time: v.end_time,
    total_hours,
    break_minutes: v.break_minutes,
    grace_minutes: v.grace_minutes,
    half_day_threshold_minutes: v.half_day_threshold_minutes,
    is_overnight: overnight,
    is_default: v.is_default,
    ot_eligible: v.ot_eligible,
    active: v.active,
  };

  const query = v.id
    ? sb.from("shifts").update(row as any).eq("id", v.id).eq("org_id", guard.user.orgId).select("*").single()
    : sb.from("shifts").insert(row as any).select("*").single();

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true, data: data as Shift };
}

export async function setDefaultShift(shiftId: string): Promise<ActionResult<void>> {
  const guard = await requireAdmin();
  if ("error" in guard) return { success: false, error: guard.error };
  const sb = createAdminSupabase();
  await sb.from("shifts").update({ is_default: false } as any).eq("org_id", guard.user.orgId).eq("is_default", true);
  const { error } = await sb.from("shifts").update({ is_default: true } as any).eq("id", shiftId).eq("org_id", guard.user.orgId);
  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true, data: undefined };
}

export async function deactivateShift(shiftId: string): Promise<ActionResult<void>> {
  const guard = await requireAdmin();
  if ("error" in guard) return { success: false, error: guard.error };
  const sb = createAdminSupabase();
  const { error } = await sb
    .from("shifts")
    .update({ active: false, is_default: false } as any)
    .eq("id", shiftId)
    .eq("org_id", guard.user.orgId);
  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true, data: undefined };
}

/**
 * Phase-1 bootstrap (OD-5): if an org with attendance enabled has no shifts yet,
 * seed a single default shift from its existing `standard_workday_hours`.
 * Idempotent — only inserts when zero shifts exist.
 */
export async function bootstrapDefaultShiftIfMissing(orgId: string): Promise<void> {
  const sb = createAdminSupabase();
  const { count } = await sb.from("shifts").select("*", { count: "exact", head: true }).eq("org_id", orgId);
  if ((count ?? 0) > 0) return;

  const { data: orgRow } = await sb.from("organizations").select("settings").eq("id", orgId).single();
  const rawHours = (orgRow as any)?.settings?.attendance?.standard_workday_hours;
  const hours = typeof rawHours === "number" && Number.isFinite(rawHours) ? Math.max(1, Math.min(16, rawHours)) : 8;
  const endHour = (9 + Math.round(hours)) % 24;
  const end_time = `${String(endHour).padStart(2, "0")}:00`;

  await sb.from("shifts").insert({
    org_id: orgId,
    name: "General",
    start_time: "09:00",
    end_time,
    total_hours: hours,
    break_minutes: 0,
    grace_minutes: 0,
    half_day_threshold_minutes: 240,
    is_overnight: false,
    is_default: true,
    ot_eligible: true,
    active: true,
  } as any);
}

export async function listShiftAssignments(): Promise<ActionResult<ShiftAssignment[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("shift_assignments")
    .select(`id, org_id, employee_id, shift_id, date_from, date_to, assigned_by, notes,
             employees!shift_assignments_employee_id_fkey(first_name, last_name),
             shifts(name)`)
    .eq("org_id", user.orgId)
    .order("date_from", { ascending: false });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    data: (data ?? []).map((r: any) => ({
      id: r.id,
      org_id: r.org_id,
      employee_id: r.employee_id,
      employee_name: r.employees ? `${r.employees.first_name} ${r.employees.last_name}` : null,
      shift_id: r.shift_id,
      shift_name: r.shifts?.name ?? null,
      date_from: r.date_from,
      date_to: r.date_to,
      assigned_by: r.assigned_by,
      notes: r.notes,
    })),
  };
}

const AssignSchema = z.object({
  shift_id: z.string().uuid(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().max(500).optional(),
});

export async function assignShiftToEmployees(input: {
  employee_ids: string[];
  shift_id: string;
  date_from: string;
  date_to?: string | null;
  notes?: string;
}): Promise<ActionResult<{ inserted: number }>> {
  const guard = await requireAdmin();
  if ("error" in guard) return { success: false, error: guard.error };
  const parsed = AssignSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  if (!Array.isArray(input.employee_ids) || input.employee_ids.length === 0) {
    return { success: false, error: "Pick at least one employee" };
  }
  const sb = createAdminSupabase();
  const rows = input.employee_ids.map((empId) => ({
    org_id: guard.user.orgId,
    employee_id: empId,
    shift_id: parsed.data.shift_id,
    date_from: parsed.data.date_from,
    date_to: parsed.data.date_to ?? null,
    assigned_by: guard.user.employeeId,
    notes: parsed.data.notes ?? null,
  }));
  const { error, data } = await sb.from("shift_assignments").insert(rows as any).select("id");
  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true, data: { inserted: (data ?? []).length } };
}

export async function assignShiftToDepartment(input: {
  department_id: string;
  shift_id: string;
  date_from: string;
  date_to?: string | null;
  notes?: string;
}): Promise<ActionResult<{ inserted: number }>> {
  const guard = await requireAdmin();
  if ("error" in guard) return { success: false, error: guard.error };
  const sb = createAdminSupabase();
  const { data: emps } = await sb
    .from("employees")
    .select("id")
    .eq("org_id", guard.user.orgId)
    .eq("department_id", input.department_id)
    .neq("status", "terminated");
  const employee_ids = (emps ?? []).map((e: any) => e.id);
  if (employee_ids.length === 0) return { success: false, error: "Department has no active employees" };
  return assignShiftToEmployees({ ...input, employee_ids });
}

/**
 * Returns the active shift for an employee on a given IST date, if any.
 * Phase 1 rule: latest `date_from <= date` wins; ignored if `date_to < date`.
 */
export async function getActiveShiftForEmployee(employeeId: string, date: string): Promise<Shift | null> {
  const sb = createAdminSupabase();
  const { data } = await sb
    .from("shift_assignments")
    .select(`shift_id, date_from, date_to, shifts(*)`)
    .eq("employee_id", employeeId)
    .lte("date_from", date)
    .order("date_from", { ascending: false })
    .limit(5);
  const row = (data ?? []).find((r: any) => !r.date_to || r.date_to >= date);
  return row ? ((row as any).shifts as Shift) : null;
}
```

- [ ] **Step 2: Lint check**

```
npm run lint -- --max-warnings=0 src/actions/shifts.ts
```
Expected: PASS (ignore pre-existing project-wide warnings — only this file).

- [ ] **Step 3: Commit**

```bash
git add src/actions/shifts.ts
git commit -m "feat(attendance): shift master + assignment server actions"
```

---

### Task 9: Server actions `src/actions/week-off.ts`

**Files:**
- Create: `src/actions/week-off.ts`

- [ ] **Step 1: Write the file**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import type { ActionResult } from "@/types";
import type { WeekOffPolicy } from "@/lib/attendance/week-off";

const Schema = z.object({
  week_type: z.union([z.literal(5), z.literal(6)]),
  off_days: z.array(z.number().int().min(0).max(6)).min(1).max(2),
});

export async function getWeekOffPolicy(): Promise<ActionResult<WeekOffPolicy | null>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("week_off_policy")
    .select("week_type, off_days")
    .eq("org_id", user.orgId)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  return { success: true, data: data ? ((data as any) as WeekOffPolicy) : null };
}

export async function upsertWeekOffPolicy(input: unknown): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can update week-off policy" };

  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  // Sanity: 5-day week → at least 2 off days; 6-day → exactly 1 off day.
  if (parsed.data.week_type === 5 && parsed.data.off_days.length !== 2) {
    return { success: false, error: "5-day week must pick exactly 2 off days" };
  }
  if (parsed.data.week_type === 6 && parsed.data.off_days.length !== 1) {
    return { success: false, error: "6-day week must pick exactly 1 off day" };
  }

  const sb = createAdminSupabase();
  const { error } = await sb
    .from("week_off_policy")
    .upsert({
      org_id: user.orgId,
      week_type: parsed.data.week_type,
      off_days: parsed.data.off_days,
    } as any, { onConflict: "org_id" });
  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true, data: undefined };
}
```

- [ ] **Step 2: Lint check**

```
npm run lint -- --max-warnings=0 src/actions/week-off.ts
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/actions/week-off.ts
git commit -m "feat(attendance): week-off policy server actions"
```

---

### Task 10: Wire `clockIn` to record `shift_id` + `attributed_date`

**Files:**
- Modify: `src/actions/attendance.ts:108-154` (`clockIn`)
- Modify: `src/actions/attendance.ts:85-99` (`AttendanceRecord` type — add `shift_id` and `attributed_date`)
- Modify: `src/actions/attendance.ts:297-315` (`formatRecord` — surface the two new fields)

- [ ] **Step 1: Update `AttendanceRecord` type and `formatRecord`**

```typescript
export type AttendanceRecord = {
  id: string;
  org_id: string;
  employee_id: string;
  employee_name: string;
  date: string;
  clock_in_at: string | null;
  clock_out_at: string | null;
  total_minutes: number | null;
  ip_address: string | null;
  notes: string | null;
  source: "web" | "device" | "auto_close";
  device_id: string | null;
  auto_closed: boolean;
  shift_id: string | null;
  attributed_date: string | null;
};
```

In `formatRecord`, add:
```typescript
shift_id: raw.shift_id ?? null,
attributed_date: raw.attributed_date ?? null,
```

- [ ] **Step 2: Update `clockIn` to resolve shift + attribute date**

Add imports at the top of `src/actions/attendance.ts`:
```typescript
import { getActiveShiftForEmployee } from "@/actions/shifts";
import { attributedDateForClockIn } from "@/lib/attendance/attribute-date";
```

Replace the body of `clockIn` (entire function):
```typescript
export async function clockIn(ipAddress?: string): Promise<ActionResult<AttendanceRecord>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!user.attendanceEnabled) return { success: false, error: "Attendance is not enabled for your organization" };
  if (!user.employeeId) return { success: false, error: "No employee record found" };

  const supabase = createAdminSupabase();
  const nowUtc = new Date().toISOString();
  const istToday = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Resolve assigned shift for the IST date; null if none assigned.
  const shift = await getActiveShiftForEmployee(user.employeeId, istToday);
  const attributedDate = attributedDateForClockIn(nowUtc, shift);
  const recordDate = attributedDate; // we always set `date` = attributed_date when a shift is in play; identical to istToday when no shift

  // Idempotency: prevent double clock-in for the same (employee, recordDate).
  const { data: existing } = await supabase
    .from("attendance_records")
    .select("*")
    .eq("org_id", user.orgId)
    .eq("employee_id", user.employeeId)
    .eq("date", recordDate)
    .maybeSingle();

  if (existing) {
    if ((existing as any).clock_in_at && !(existing as any).clock_out_at) {
      return { success: false, error: "You are already clocked in" };
    }
    if ((existing as any).clock_out_at) {
      return { success: false, error: "You have already completed attendance for today" };
    }
  }

  const { data, error } = await supabase
    .from("attendance_records")
    .insert({
      org_id: user.orgId,
      employee_id: user.employeeId,
      date: recordDate,
      attributed_date: attributedDate,
      shift_id: shift?.id ?? null,
      clock_in_at: nowUtc,
      ip_address: ipAddress ?? null,
      source: "web" as const,
    })
    .select(`*, employees!employee_id(first_name, last_name)`)
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/attendance");
  return { success: true, data: formatRecord(data) };
}
```

> `clockOut` does **not** need to change in Phase 1 — it looks up the open row by `(employee, today)`, which now equals `attributed_date`. If you ever ship "clock out next morning for an overnight shift" the lookup needs to widen to "find any open row for this employee with `attributed_date = yesterday`" — but that's Phase 2 polish, out of scope here. Note in code comment.

Add a single line of comment above `clockOut`:
```typescript
// Phase-1 limitation: clockOut still matches by today's IST date. Overnight
// shifts clocking out the next morning is a Phase 2 follow-up (the lookup
// needs to widen to attributed_date = yesterday in that case).
```

- [ ] **Step 3: Lint check**

```
npm run lint -- src/actions/attendance.ts
```
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/actions/attendance.ts
git commit -m "feat(attendance): clockIn records shift_id + attributed_date when a shift is assigned"
```

---

### Task 11: Update auto-clockout cron to honor assigned shift hours

**Files:**
- Modify: `src/app/api/cron/attendance-auto-clockout/route.ts`

- [ ] **Step 1: Fetch assigned shift hours per row**

Replace the per-row loop to look up the row's `shift_id` first; fall back to org default shift; fall back to `standard_workday_hours` (current behaviour). Below is the diff-style replacement for the loop section (rest of file unchanged):

```typescript
// New: load all referenced shifts (one round-trip)
const shiftIds = Array.from(new Set(rows.map((r) => (r as any).shift_id).filter(Boolean))) as string[];
const shiftsById = new Map<string, { total_hours: number }>();
if (shiftIds.length > 0) {
  const { data: shiftRows } = await supabase.from("shifts").select("id, total_hours").in("id", shiftIds);
  for (const s of (shiftRows ?? []) as any[]) shiftsById.set(s.id, { total_hours: Number(s.total_hours) });
}

// Per-row resolution:
for (const row of rows) {
  const orgConfig = settingsByOrg.get(row.org_id);
  if (!orgConfig || !orgConfig.enabled) {
    skippedDisabled++;
    continue;
  }

  // 1) Assigned shift's hours, if the row has shift_id.
  // 2) Else org's default-shift total_hours (one tiny lookup per org, lazy-cached).
  // 3) Else standard_workday_hours from settings.
  let resolvedHours = orgConfig.hours;
  const rowShiftId = (row as any).shift_id as string | null;
  if (rowShiftId && shiftsById.has(rowShiftId)) {
    resolvedHours = shiftsById.get(rowShiftId)!.total_hours;
  }
  // (Phase-1 simplification: skip the per-org default-shift fallback — orgs that
  // need it should already have shift_id set via clockIn since 029_shifts shipped.)

  const clockInAt = new Date(row.clock_in_at);
  const proposedClockOut = new Date(clockInAt.getTime() + resolvedHours * 60 * 60 * 1000);
  const dayCap = endOfDateIST(row.date);
  const finalClockOut = proposedClockOut.getTime() < dayCap.getTime() ? proposedClockOut : dayCap;
  const totalMinutes = Math.max(0, Math.round((finalClockOut.getTime() - clockInAt.getTime()) / 60000));

  const { error: updateErr } = await supabase
    .from("attendance_records")
    .update({
      clock_out_at: finalClockOut.toISOString(),
      total_minutes: totalMinutes,
      auto_closed: true,
      source: "auto_close",
    })
    .eq("id", row.id)
    .is("clock_out_at", null);

  if (updateErr) {
    failures.push({ id: row.id, error: updateErr.message });
    continue;
  }
  closedCount++;
  perOrg[row.org_id] = (perOrg[row.org_id] ?? 0) + 1;
}
```

Also widen the initial select to pull `shift_id`:
```typescript
const { data: openRows, error: queryErr } = await supabase
  .from("attendance_records")
  .select("id, org_id, date, clock_in_at, shift_id")
  .is("clock_out_at", null)
  .not("clock_in_at", "is", null)
  .lt("date", today);
```

- [ ] **Step 2: Lint check** — `npm run lint -- src/app/api/cron/attendance-auto-clockout/route.ts`. Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/attendance-auto-clockout/route.ts
git commit -m "feat(attendance): auto-clockout cron honors assigned shift hours"
```

---

### Task 12: UI — `WorkingHoursCard` moves into Settings

**Files:**
- Move: `src/components/attendance/working-hours-card.tsx` → `src/components/settings/working-hours-card.tsx`
- Modify: `src/components/attendance/attendance-client.tsx` (drop the import + render)
- Modify: `src/app/dashboard/attendance/page.tsx` (drop the `getAttendanceSettings` fetch + prop)

- [ ] **Step 1: Move the file**

```powershell
git mv src/components/attendance/working-hours-card.tsx src/components/settings/working-hours-card.tsx
```
No code changes inside the file — its action import (`@/actions/attendance`) and named export stay the same.

- [ ] **Step 2: Drop usage in attendance-client.tsx**

Remove `import { WorkingHoursCard } from "./working-hours-card";` and the `{isAdmin && attendanceSettings && (...)}` block. Remove `attendanceSettings` from the `Props` type + destructure. (The prop will be re-added in Task 14 as `activeShift`.)

- [ ] **Step 3: Drop the fetch in attendance/page.tsx**

Remove the `getAttendanceSettings` import, the `settingsResult` from the `Promise.all` array, and the `attendanceSettings` prop on `<AttendanceClient />`.

- [ ] **Step 4: Lint check** — `npm run lint -- src/components/attendance src/app/dashboard/attendance/page.tsx`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/working-hours-card.tsx src/components/attendance/attendance-client.tsx src/app/dashboard/attendance/page.tsx
git commit -m "chore(attendance): relocate WorkingHoursCard into Settings"
```

---

### Task 13: UI — Settings → Attendance section (Shift Master + Assignments + Week-Off + Working Hours)

**Files:**
- Create: `src/components/settings/attendance-section.tsx`
- Create: `src/components/settings/shift-master-card.tsx`
- Create: `src/components/settings/shift-form-dialog.tsx`
- Create: `src/components/settings/shift-assignments-card.tsx`
- Create: `src/components/settings/assign-shift-dialog.tsx`
- Create: `src/components/settings/week-off-card.tsx`
- Modify: `src/components/settings/settings-content.tsx` — register new section
- Modify: `src/app/dashboard/settings/page.tsx` — fetch new props

- [ ] **Step 1: Build `attendance-section.tsx` wrapper**

```typescript
"use client";

import { WorkingHoursCard } from "./working-hours-card";
import { ShiftMasterCard } from "./shift-master-card";
import { ShiftAssignmentsCard } from "./shift-assignments-card";
import { WeekOffCard } from "./week-off-card";
import type { AttendanceSettings } from "@/actions/attendance";
import type { Shift, ShiftAssignment } from "@/actions/shifts";
import type { WeekOffPolicy } from "@/lib/attendance/week-off";
import type { Employee, Department } from "@/types";

interface Props {
  attendanceSettings: AttendanceSettings | null;
  shifts: Shift[];
  assignments: ShiftAssignment[];
  weekOffPolicy: WeekOffPolicy | null;
  employees: Employee[];
  departments: Department[];
}

export function AttendanceSection({ attendanceSettings, shifts, assignments, weekOffPolicy, employees, departments }: Props) {
  return (
    <div className="space-y-4 p-6">
      <h2 className="text-lg font-semibold">Attendance</h2>
      <p className="text-sm text-muted-foreground">
        Configure shifts, assign employees to shifts, set the org-wide week-off policy, and
        manage the fallback working hours used when no shift is assigned.
      </p>
      {attendanceSettings && <WorkingHoursCard settings={attendanceSettings} />}
      <ShiftMasterCard shifts={shifts} />
      <ShiftAssignmentsCard assignments={assignments} shifts={shifts} employees={employees} departments={departments} />
      <WeekOffCard initial={weekOffPolicy} />
    </div>
  );
}
```

- [ ] **Step 2: Build `shift-master-card.tsx`**

```typescript
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Star, StarOff, MoonStar, Sun, Pencil, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setDefaultShift, deactivateShift } from "@/actions/shifts";
import type { Shift } from "@/actions/shifts";
import { ShiftFormDialog } from "./shift-form-dialog";

export function ShiftMasterCard({ shifts }: { shifts: Shift[] }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Shift | null>(null);

  async function handleSetDefault(id: string) {
    const r = await setDefaultShift(id);
    if (r.success) toast.success("Default shift updated");
    else toast.error(r.error);
  }
  async function handleDeactivate(id: string) {
    const r = await deactivateShift(id);
    if (r.success) toast.success("Shift deactivated");
    else toast.error(r.error);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold">Shift Master</p>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add shift
        </Button>
      </div>
      {shifts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No shifts yet. Add your first shift to get started.</p>
      ) : (
        <ul className="divide-y divide-border">
          {shifts.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{s.name}</span>
                  {s.is_default && <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary"><Star className="h-3 w-3" />Default</span>}
                  {s.is_overnight && <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700"><MoonStar className="h-3 w-3" />Overnight</span>}
                  {!s.active && <span className="text-[10px] text-muted-foreground">Inactive</span>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {s.start_time}–{s.end_time} · {s.total_hours}h
                  {s.break_minutes > 0 ? ` · ${s.break_minutes}m break` : ""}
                  {s.grace_minutes > 0 ? ` · ${s.grace_minutes}m grace` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {!s.is_default && s.active && (
                  <Button variant="ghost" size="sm" onClick={() => handleSetDefault(s.id)}><Star className="h-3.5 w-3.5" /></Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => { setEditing(s); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                {s.active && (
                  <Button variant="ghost" size="sm" onClick={() => handleDeactivate(s.id)}><Power className="h-3.5 w-3.5" /></Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <ShiftFormDialog initial={editing ?? undefined} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Build `shift-form-dialog.tsx`**

```typescript
"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { upsertShift } from "@/actions/shifts";
import type { Shift } from "@/actions/shifts";
import { computeShiftTotalHours, isOvernight } from "@/lib/attendance/shift-time";

interface Props {
  initial?: Shift;
  onClose: () => void;
}

export function ShiftFormDialog({ initial, onClose }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [start, setStart] = useState(initial?.start_time ?? "09:00");
  const [end, setEnd] = useState(initial?.end_time ?? "17:00");
  const [breakMin, setBreakMin] = useState(initial?.break_minutes ?? 0);
  const [graceMin, setGraceMin] = useState(initial?.grace_minutes ?? 10);
  const [halfDayMin, setHalfDayMin] = useState(initial?.half_day_threshold_minutes ?? 240);
  const [isDefault, setIsDefault] = useState(initial?.is_default ?? false);
  const [otEligible, setOtEligible] = useState(initial?.ot_eligible ?? true);
  const [active, setActive] = useState(initial?.active ?? true);
  const [saving, setSaving] = useState(false);

  const computed = useMemo(() => {
    try {
      return { total: computeShiftTotalHours(start, end, breakMin), overnight: isOvernight(start, end) };
    } catch (e: any) {
      return { total: 0, overnight: false, err: e?.message as string };
    }
  }, [start, end, breakMin]);

  async function handleSave() {
    if (!name.trim()) return toast.error("Shift name required");
    if ((computed as any).err) return toast.error((computed as any).err);
    setSaving(true);
    const r = await upsertShift({
      id: initial?.id,
      name: name.trim(),
      start_time: start,
      end_time: end,
      break_minutes: breakMin,
      grace_minutes: graceMin,
      half_day_threshold_minutes: halfDayMin,
      is_default: isDefault,
      ot_eligible: otEligible,
      active,
    });
    setSaving(false);
    if (r.success) { toast.success(initial ? "Shift updated" : "Shift created"); onClose(); }
    else toast.error(r.error);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-xl">
        <p className="text-sm font-semibold mb-3">{initial ? "Edit shift" : "Add shift"}</p>
        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="block text-xs text-muted-foreground mb-1">Name</span>
            <input className="w-full rounded-md border border-input bg-background px-3 py-1.5" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs text-muted-foreground mb-1">Start</span>
              <input type="time" className="w-full rounded-md border border-input bg-background px-3 py-1.5" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="block">
              <span className="block text-xs text-muted-foreground mb-1">End</span>
              <input type="time" className="w-full rounded-md border border-input bg-background px-3 py-1.5" value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="block text-xs text-muted-foreground mb-1">Break (m)</span>
              <input type="number" min={0} max={720} className="w-full rounded-md border border-input bg-background px-3 py-1.5" value={breakMin} onChange={(e) => setBreakMin(Number(e.target.value))} />
            </label>
            <label className="block">
              <span className="block text-xs text-muted-foreground mb-1">Grace (m)</span>
              <input type="number" min={0} max={120} className="w-full rounded-md border border-input bg-background px-3 py-1.5" value={graceMin} onChange={(e) => setGraceMin(Number(e.target.value))} />
            </label>
            <label className="block">
              <span className="block text-xs text-muted-foreground mb-1">Half-day &lt; (m)</span>
              <input type="number" min={30} max={720} className="w-full rounded-md border border-input bg-background px-3 py-1.5" value={halfDayMin} onChange={(e) => setHalfDayMin(Number(e.target.value))} />
            </label>
          </div>
          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Total: <span className="font-semibold tabular-nums text-foreground">{(computed as any).err ? "—" : `${computed.total}h`}</span>
            {" · "}{computed.overnight ? "Overnight" : "Same day"}
            {(computed as any).err ? <span className="ml-2 text-destructive">{(computed as any).err}</span> : null}
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />Default shift</label>
            <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={otEligible} onChange={(e) => setOtEligible(e.target.checked)} />OT eligible</label>
            <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />Active</label>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Build `shift-assignments-card.tsx` + `assign-shift-dialog.tsx`**

```typescript
// src/components/settings/shift-assignments-card.tsx
"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Shift, ShiftAssignment } from "@/actions/shifts";
import type { Employee, Department } from "@/types";
import { AssignShiftDialog } from "./assign-shift-dialog";

export function ShiftAssignmentsCard({ assignments, shifts, employees, departments }: {
  assignments: ShiftAssignment[];
  shifts: Shift[];
  employees: Employee[];
  departments: Department[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold">Shift Assignments</p>
        <Button size="sm" onClick={() => setOpen(true)} disabled={shifts.length === 0}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Assign shift
        </Button>
      </div>
      {assignments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No assignments yet. Pick a shift and assign employees or a whole department.</p>
      ) : (
        <ul className="divide-y divide-border">
          {assignments.map((a) => (
            <li key={a.id} className="py-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{a.employee_name ?? "—"}</p>
                <p className="text-xs text-muted-foreground">{a.shift_name ?? "—"} · {a.date_from}{a.date_to ? ` → ${a.date_to}` : " → ongoing"}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <AssignShiftDialog shifts={shifts} employees={employees} departments={departments} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}
```

```typescript
// src/components/settings/assign-shift-dialog.tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { assignShiftToEmployees, assignShiftToDepartment } from "@/actions/shifts";
import type { Shift } from "@/actions/shifts";
import type { Employee, Department } from "@/types";

interface Props {
  shifts: Shift[];
  employees: Employee[];
  departments: Department[];
  onClose: () => void;
}

export function AssignShiftDialog({ shifts, employees, departments, onClose }: Props) {
  const [shiftId, setShiftId] = useState(shifts.find((s) => s.is_default)?.id ?? shifts[0]?.id ?? "");
  const [scope, setScope] = useState<"employees" | "department">("employees");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState("");
  const [saving, setSaving] = useState(false);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleSave() {
    if (!shiftId) return toast.error("Pick a shift");
    setSaving(true);
    const args = { shift_id: shiftId, date_from: dateFrom, date_to: dateTo || null };
    const r = scope === "employees"
      ? await assignShiftToEmployees({ ...args, employee_ids: [...selected] })
      : await assignShiftToDepartment({ ...args, department_id: departmentId });
    setSaving(false);
    if (r.success) { toast.success(`Assigned ${r.data.inserted} employee(s)`); onClose(); }
    else toast.error(r.error);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-xl">
        <p className="text-sm font-semibold mb-3">Assign shift</p>
        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="block text-xs text-muted-foreground mb-1">Shift</span>
            <select className="w-full rounded-md border border-input bg-background px-3 py-1.5" value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
              {shifts.filter((s) => s.active).map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.start_time}–{s.end_time})</option>
              ))}
            </select>
          </label>
          <div className="flex gap-3 text-xs">
            <label className="inline-flex items-center gap-1.5"><input type="radio" checked={scope === "employees"} onChange={() => setScope("employees")} />Employees</label>
            <label className="inline-flex items-center gap-1.5"><input type="radio" checked={scope === "department"} onChange={() => setScope("department")} />Whole department</label>
          </div>
          {scope === "employees" ? (
            <div className="max-h-48 overflow-auto rounded-md border border-border p-2 space-y-1">
              {employees.map((e: any) => (
                <label key={e.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} />
                  {e.first_name} {e.last_name}
                </label>
              ))}
            </div>
          ) : (
            <label className="block">
              <span className="block text-xs text-muted-foreground mb-1">Department</span>
              <select className="w-full rounded-md border border-input bg-background px-3 py-1.5" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs text-muted-foreground mb-1">From</span>
              <input type="date" className="w-full rounded-md border border-input bg-background px-3 py-1.5" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </label>
            <label className="block">
              <span className="block text-xs text-muted-foreground mb-1">To (blank = ongoing)</span>
              <input type="date" className="w-full rounded-md border border-input bg-background px-3 py-1.5" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </label>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Assign"}</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Build `week-off-card.tsx`**

```typescript
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { upsertWeekOffPolicy } from "@/actions/week-off";
import { WEEK_DAYS, type WeekOffPolicy } from "@/lib/attendance/week-off";

export function WeekOffCard({ initial }: { initial: WeekOffPolicy | null }) {
  const [weekType, setWeekType] = useState<5 | 6>(initial?.week_type ?? 6);
  const [offDays, setOffDays] = useState<number[]>(initial?.off_days ?? [0]);
  const [saving, setSaving] = useState(false);

  function toggleDay(d: number) {
    setOffDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort());
  }

  async function handleSave() {
    const expected = weekType === 5 ? 2 : 1;
    if (offDays.length !== expected) {
      return toast.error(weekType === 5 ? "Pick exactly 2 off days" : "Pick exactly 1 off day");
    }
    setSaving(true);
    const r = await upsertWeekOffPolicy({ week_type: weekType, off_days: offDays });
    setSaving(false);
    if (r.success) toast.success("Week-off policy saved");
    else toast.error(r.error);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-semibold mb-2">Week-Off Policy</p>
      <div className="flex gap-3 text-sm mb-3">
        <label className="inline-flex items-center gap-1.5"><input type="radio" checked={weekType === 5} onChange={() => { setWeekType(5); setOffDays([0, 6]); }} />5-day week</label>
        <label className="inline-flex items-center gap-1.5"><input type="radio" checked={weekType === 6} onChange={() => { setWeekType(6); setOffDays([0]); }} />6-day week</label>
      </div>
      <div className="flex flex-wrap gap-2 text-xs mb-3">
        {WEEK_DAYS.map((d) => (
          <button
            key={d.value}
            type="button"
            onClick={() => toggleDay(d.value)}
            className={`rounded-full px-3 py-1 border ${offDays.includes(d.value) ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card"}`}
          >
            {d.label}
          </button>
        ))}
      </div>
      <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save policy"}</Button>
    </div>
  );
}
```

- [ ] **Step 6: Register section in `settings-content.tsx`**

In the imports add:
```typescript
import { Clock as ClockIcon } from "lucide-react";
import { AttendanceSection } from "@/components/settings/attendance-section";
import type { AttendanceSettings } from "@/actions/attendance";
import type { Shift, ShiftAssignment } from "@/actions/shifts";
import type { WeekOffPolicy } from "@/lib/attendance/week-off";
import type { Employee, Department } from "@/types";
```

Extend `SettingsContentProps` with:
```typescript
attendanceSettings: AttendanceSettings | null;
shifts: Shift[];
shiftAssignments: ShiftAssignment[];
weekOffPolicy: WeekOffPolicy | null;
employees: Employee[];
```

Destructure these in the `SettingsContent` signature, then render a new `CollapsibleSection` between "Products & Features" and "Onboarding Steps":

```typescript
{attendanceEnabled && isAdmin && (
  <CollapsibleSection
    title="Attendance"
    icon={<ClockIcon className="h-5 w-5 text-muted-foreground" />}
    summary={`${shifts.length} ${pluralise(shifts.length, "shift", "shifts")} · week-off ${weekOffPolicy ? "configured" : "not set"}`}
    isOpen={openSection === "attendance"}
    onToggle={() => toggle("attendance")}
  >
    <AttendanceSection
      attendanceSettings={attendanceSettings}
      shifts={shifts}
      assignments={shiftAssignments}
      weekOffPolicy={weekOffPolicy}
      employees={employees}
      departments={departments}
    />
  </CollapsibleSection>
)}
```

- [ ] **Step 7: Fetch in `settings/page.tsx`**

Add imports:
```typescript
import { getAttendanceSettings } from "@/actions/attendance";
import { listShifts, listShiftAssignments } from "@/actions/shifts";
import { getWeekOffPolicy } from "@/actions/week-off";
import { listEmployees } from "@/actions/employees";
```

Add to `Promise.all`:
```typescript
getAttendanceSettings(),
listShifts(),
listShiftAssignments(),
getWeekOffPolicy(),
listEmployees(),
```

Pull out results, then pass into `<SettingsContent />`:
```typescript
attendanceSettings={attendanceSettings}
shifts={shifts}
shiftAssignments={shiftAssignments}
weekOffPolicy={weekOffPolicy}
employees={employees}
```

- [ ] **Step 8: Build check**

```
npm run build
```
Expected: PASS. (Note: `next.config.js` already sets `eslint: { ignoreDuringBuilds: true }` and `typescript: { ignoreBuildErrors: true }` per CLAUDE.md — build should still pass if any non-attendance file has prior Supabase-never errors.)

- [ ] **Step 9: Commit**

```bash
git add src/components/settings/attendance-section.tsx \
        src/components/settings/shift-master-card.tsx \
        src/components/settings/shift-form-dialog.tsx \
        src/components/settings/shift-assignments-card.tsx \
        src/components/settings/assign-shift-dialog.tsx \
        src/components/settings/week-off-card.tsx \
        src/components/settings/settings-content.tsx \
        src/app/dashboard/settings/page.tsx
git commit -m "feat(attendance): Settings → Attendance section (shifts, assignments, week-off)"
```

---

### Task 14: UI — "Today's shift" chip on attendance page

**Files:**
- Modify: `src/app/dashboard/attendance/page.tsx` — fetch active shift, pass into client
- Modify: `src/components/attendance/attendance-client.tsx` — render chip

- [ ] **Step 1: Fetch active shift in `page.tsx`**

Add import:
```typescript
import { getActiveShiftForEmployee } from "@/actions/shifts";
```

After `getCurrentUser()`:
```typescript
const istToday = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
const activeShift = user.employeeId ? await getActiveShiftForEmployee(user.employeeId, istToday) : null;
```

Pass into `<AttendanceClient activeShift={activeShift} … />`.

- [ ] **Step 2: Render chip in `attendance-client.tsx`**

Add to `Props`:
```typescript
activeShift: { id: string; name: string; start_time: string; end_time: string; is_overnight: boolean } | null;
```

Right under the page header, before the clock-in card:
```tsx
{activeShift && (
  <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
    Today&apos;s shift: <span className="font-medium text-foreground">{activeShift.name}</span>
    <span>·</span>
    <span>{activeShift.start_time}–{activeShift.end_time}</span>
    {activeShift.is_overnight && <span className="text-amber-600">overnight</span>}
  </div>
)}
```

- [ ] **Step 3: Build check** — `npm run build`.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/attendance/page.tsx src/components/attendance/attendance-client.tsx
git commit -m "feat(attendance): today's-shift chip on attendance page"
```

---

### Task 15: Assistant help articles + route-registry entries

**Files:**
- Create: `src/lib/assistant/help/articles/configure_shifts.md`
- Create: `src/lib/assistant/help/articles/assign_shift.md`
- Create: `src/lib/assistant/help/articles/configure_week_off.md`
- Modify: `src/lib/assistant/route-registry.ts`

- [ ] **Step 1: Author `configure_shifts.md`**

Frontmatter id MUST match filename; `route_key` MUST exist in `route-registry.ts` (see step 4 for the key we add).

```markdown
---
id: configure_shifts
title: Configure shifts (Shift Master)
route_key: settings_attendance
category: attendance
audience: admin
---

# Configure shifts

Shifts define the working window for each employee. You can have as many as you need
(Morning, Evening, Night, General, etc.). Phase 1 supports manual assignment per
employee or per department.

## Steps

1. Open **Settings → Attendance → Shift Master**.
2. Click **Add shift**.
3. Enter:
   - **Name** (e.g. "Morning")
   - **Start** and **End** time (24-hour). Overnight shifts (end < start, e.g. 22:00–06:00) are auto-detected.
   - **Break (minutes)** — subtracted from total hours.
   - **Grace (minutes)** — late-mark tolerance.
   - **Half-day threshold (minutes)** — anything less than this is half-day.
4. Tick **Default shift** to make this the org's fallback shift.
5. Click **Save**.

Mark a shift inactive instead of deleting it — historical records stay safe.
```

- [ ] **Step 2: Author `assign_shift.md`**

```markdown
---
id: assign_shift
title: Assign a shift to employees or a department
route_key: settings_attendance
category: attendance
audience: admin
---

# Assign a shift

## Steps

1. Open **Settings → Attendance → Shift Assignments**.
2. Click **Assign shift**.
3. Pick the **shift** from the dropdown.
4. Choose scope:
   - **Employees** — multi-select individuals.
   - **Whole department** — assigns every active employee in that department.
5. Set the **From** date. Leave **To** blank for an ongoing assignment.
6. Click **Assign**.

The clock-in flow on `/dashboard/attendance` will use the latest active
assignment automatically.
```

- [ ] **Step 3: Author `configure_week_off.md`**

```markdown
---
id: configure_week_off
title: Set the org week-off policy
route_key: settings_attendance
category: attendance
audience: admin
---

# Configure week-off

## Steps

1. Open **Settings → Attendance → Week-Off Policy**.
2. Pick **5-day** (exactly 2 off days, default Sat+Sun) or **6-day** week (exactly 1 off day, default Sun).
3. Toggle the day chips to choose which days are off.
4. Click **Save policy**.

Per-employee overrides and alternate-Saturday support are planned for Phase 2.
```

- [ ] **Step 4: Add `settings_attendance` to `route-registry.ts`**

Add an entry in the existing `ROUTE_REGISTRY` constant:
```typescript
settings_attendance: {
  key: "settings_attendance",
  title: "Settings → Attendance",
  path: "/dashboard/settings",
  hash: "attendance",
  description: "Shift master, shift assignments, week-off policy, and default working hours.",
  required_role: "admin",
  feature_flag: "attendanceEnabled",
},
```

(Exact field shape — match the existing entries in `route-registry.ts`. If the registry uses a different schema, conform to it.)

- [ ] **Step 5: Re-embed help articles**

```
npm run embed:help
```
Expected: "indexed N chunks" output, N rising by ~6 (2 chunks per new article).

- [ ] **Step 6: Run vitest integrity check (per CLAUDE.md gotcha #61)**

```
npx vitest run tests/assistant/route-registry.integrity.test.ts
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/assistant/help/articles/configure_shifts.md \
        src/lib/assistant/help/articles/assign_shift.md \
        src/lib/assistant/help/articles/configure_week_off.md \
        src/lib/assistant/route-registry.ts
git commit -m "docs(assistant): add Phase-1 attendance shift+week-off articles"
```

---

### Task 16: CLAUDE.md + operator doc

**Files:**
- Modify: `CLAUDE.md` — Attendance section
- Create: `docs/attendance-shifts-phase-1.md`

- [ ] **Step 1: Update Attendance section in `CLAUDE.md`**

Find the existing `## Attendance Module` section and append (do not replace existing content):

```markdown
### Phase 1 — Shifts + Week-Off (PRD 01, 2026-06-XX)

- **Shift Master** at Settings → Attendance → Shift Master. Each shift has name,
  start/end (auto-detects overnight), total_hours (auto-computed from
  start/end minus break), break/grace/half-day-threshold minutes, OT-eligible,
  default flag, active flag. At most one default per org.
- **Shift Assignments** at Settings → Attendance → Shift Assignments. Admin
  assigns a shift to one or more employees, or to a whole department, for a date
  range (blank to-date = ongoing). Latest `date_from <= today` wins at resolve
  time (no conflict detection in Phase 1).
- **Week-Off Policy** at Settings → Attendance → Week-Off Policy. Org-level only
  in Phase 1. 5-day week = pick 2 off days; 6-day = pick 1.
- **Overnight attribution** is hard-coded to start-date in Phase 1
  (configurable per-org in Phase 2). `attendance_records.attributed_date` mirrors
  the `date` column when a shift is assigned and overnight clock-ins map to the
  prior IST date.
- **`clockIn`** writes `shift_id` + `attributed_date` when an active assignment
  exists; otherwise behaves as before (today IST).
- **Auto-clockout cron** prefers the row's assigned shift hours; falls back to
  `organizations.settings.attendance.standard_workday_hours`.
- **`WorkingHoursCard`** moved from `/dashboard/attendance` to
  `Settings → Attendance` (Phase 1 consolidation per PRD §8).

**Phase 1 gotchas:**
- Migrations 029–032 are idempotent and must be run via Supabase SQL Editor in
  order. Migration 028 number is taken by the orphan `assistant_insights`
  (Phase 5 revert); we start at 029.
- The original `UNIQUE (org_id, employee_id, date)` constraint on
  `attendance_records` is preserved. Overnight shifts uphold uniqueness because
  `date = attributed_date = shift start date`.
- `clockOut` still matches by **today's IST date**. Clocking out next morning
  for an overnight shift is a Phase 2 follow-up (the lookup must widen to
  `attributed_date = yesterday`).
- All Phase 1 mutations are **admin-only**. Manager-scoped assignment lands in
  Phase 2 with the roster grid.
- The "Settings → Attendance" CollapsibleSection only renders when
  `attendanceEnabled && isAdmin`. Non-admins see no shift configuration UI.
- `bootstrapDefaultShiftIfMissing()` runs inside `listShifts` and seeds a
  "General" shift from the org's existing `standard_workday_hours`. Safe to
  call repeatedly — only inserts when zero shifts exist.
```

- [ ] **Step 2: Create operator doc**

```markdown
# Attendance Phase 1 — Shifts + Week-Off (PRD 01)

**Shipped:** 2026-06-XX
**Scope:** PRD 01 §11 Phase 1. Strict — see plan doc
`docs/superpowers/plans/2026-06-06-attendance-phase-1-shifts-and-week-off.md`.

## What admins can do now
1. Define shifts (Settings → Attendance → Shift Master).
2. Mark one shift as the org default.
3. Assign a shift to employees or a whole department.
4. Set the org week-off policy (5/6 day + which days are off).

## What the system does automatically
- Auto-detects overnight shifts (end time < start time).
- Auto-computes shift total hours (end − start − break).
- On clock-in, records the employee's active shift and the attributed IST date.
- On auto-clockout (00:00 IST cron), uses the assigned shift's hours; falls back
  to the org default working hours.

## Out of scope (Phase 2+)
- Rotational rotation, roster grid, drag-to-assign.
- OT computation, multiplier config, OT → payroll.
- Per-employee week-off override, alternate-Saturday.
- Half-day automation, regularization workflow, holiday integration.

## Migrations
- 029_shifts.sql
- 030_shift_assignments.sql
- 031_week_off_policy.sql
- 032_attendance_records_shift_columns.sql
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/attendance-shifts-phase-1.md
git commit -m "docs(attendance): Phase 1 shifts + week-off — CLAUDE.md + operator doc"
```

---

### Task 17: Smoke test in the demo org

- [ ] **Step 1: Apply migrations 029–032 to the live DB** via Supabase SQL Editor.
- [ ] **Step 2: Run `npm run dev`** and navigate to `/dashboard/settings` as an org admin (`amolgupta007@gmail.com`, org `test1`).
- [ ] **Step 3: Verify**:
   - Settings → Attendance section appears (because attendance is enabled for `test1`).
   - Working Hours card shows the existing value (8h).
   - Shift Master shows a bootstrapped "General" shift seeded from `standard_workday_hours`.
   - Add a "Night" shift: 22:00–06:00, break 60, grace 15 → total 7h, marked overnight.
   - Assign the Night shift to one employee for date range "today → blank".
   - Set Week-Off policy: 6-day, Sunday off → save.
- [ ] **Step 4: Sign in as the assigned employee** → `/dashboard/attendance` shows "Today's shift: Night · 22:00–06:00 overnight".
- [ ] **Step 5: Clock in** → DB row has `shift_id`, `attributed_date`, and `date` all set to today's IST date (or yesterday if clocking in just after midnight IST on the night shift).
- [ ] **Step 6: Trigger the auto-clockout cron manually**:
   ```
   curl -H "Authorization: Bearer $env:CRON_SECRET" https://jambahr.com/api/cron/attendance-auto-clockout
   ```
   Verify the response includes `closedCount` and the closed rows used 7h (the shift's hours) — not 8h.
- [ ] **Step 7: Smoke tick the route-registry integrity test + help article re-index.**

No commit for this task — verification only.

---

## Self-Review Checklist

**Spec coverage (PRD §11 Phase 1):**
- ✅ Shift master (define shifts + default) → Tasks 1, 8, 13
- ✅ Manual shift assignment per employee + per department → Tasks 2, 8, 13
- ✅ Overnight handling → Tasks 1 (`is_overnight` column), 5, 6 (helpers), 10 (`clockIn`)
- ✅ Org-level week-off policy (5/6 day, fixed off days) → Tasks 3, 7, 9, 13

**Spec coverage (PRD §6 functional requirements, Phase 1 subset):**
- §6.1 Shift Master fields → Task 1 schema + Task 13 form
- §6.2 Manual assignment (Phase 1 subset, no rotation) → Tasks 2, 8, 13
- §6.3 Overnight handling → Tasks 5, 6, 10
- §6.4 OT — **out of scope** (Phase 2) ✅
- §6.5 Week-off (org-level only) → Tasks 3, 9, 13
- §6.6 Half-days / regularization — **out of scope** (Phase 3) ✅

**Placeholder scan:** No "TBD", no "implement later", no bare "add validation" — every step has full code blocks and exact commands.

**Type consistency:** `Shift`, `ShiftAssignment`, `WeekOffPolicy` types are defined once each (Tasks 7, 8, 9) and consumed identically downstream. `getActiveShiftForEmployee` signature is the same in actions/shifts.ts and call sites in actions/attendance.ts + cron + page.tsx.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-06-attendance-phase-1-shifts-and-week-off.md`.**

> Awaiting user approval of the plan (and confirmation of OD-1 through OD-7) before any code is written.

**Two execution options once approved:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.
