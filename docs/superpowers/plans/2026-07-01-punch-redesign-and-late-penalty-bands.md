# Punch Event Redesign + Late-Penalty Bands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the min/max punch-envelope with true chronological interval pairing (breaks subtracted), add manual-punch entry with an approval workflow, soft-void + audit + dedup marking, a per-employee Punch Timeline UI, and a configurable graduated late-penalty-band consequence wired into payroll net pay.

**Architecture:** Punch interpretation moves to a pure `pairPunches()` function that sums in→out intervals (worked) and gaps (breaks); only `status='approved'` punches count. Manual punches enter a pending→approved/rejected flow (admins + dept managers approve; admin-added auto-approve). A new `late_penalty_bands` table maps monthly late-day counts to days-of-salary deductions, computed at payroll process time and folded into net pay via a dedicated `late_penalty_deduction` field (mirroring the existing LOP per-day rate `gross_monthly / working_days`), leaving the additive-only line-item invariant untouched.

**Tech Stack:** Next.js 14 App Router (Server Actions), TypeScript strict, Supabase Postgres (migrations via Supabase MCP / SQL Editor — Windows, gotcha #4), Vitest (`npm test`), Tailwind + Radix + shadcn UI, `sonner` toasts, `lucide-react` icons.

## Global Constraints

- Migrations applied via Supabase MCP / SQL Editor; **make every migration idempotent** (`IF NOT EXISTS`, `DROP … IF EXISTS` before recreate). Next free numbers are **086–090** (repo is at 085).
- Server actions follow the `ActionResult<T>` pattern; guard with `getCurrentUser()` + `isAdmin`/`isManagerOrAbove` from `src/lib/current-user.ts`; all DB via `createAdminSupabase()` (service role — RLS advisory, gotcha #5).
- `attendance_records.source` CHECK allows only `web`/`device`/`auto_close` — **never write `'adms'` to it** (gotcha #91). Punch events use `source` in `web|device|manual|adms`.
- Secret/PII helpers and pure logic must NOT live in `"use server"` files (gotcha #85). Pure functions go in `src/lib/…`, not `src/actions/…`.
- Money is in **rupees (integer)** on payroll entries. Per-day salary rate = `gross_monthly / working_days` (default `working_days = 26`).
- Late penalty reduces **net pay only, not taxable income** (mirror `lop_deduction`; do not touch the TDS snapshot).
- RLS on new tables uses the Clerk-JWT pattern (`auth.jwt() ->> 'org_id'` + `org_role IN ('org:owner','org:admin')`), matching migrations 078/083/085.
- Audit writes are best-effort and never block the primary mutation (gotcha #52).
- Test files live under `tests/attendance/` and `tests/payroll/`, import from `@/lib/...`, use `import { describe, it, expect } from "vitest"`.
- No `Co-Authored-By` line in commits (user preference). Branch off `main` before committing (do not commit directly to `main`).

---

## File Structure

**Track A — Punch redesign**
- `src/lib/attendance/pair-punches.ts` (new) — pure interval-pairing engine.
- `src/lib/attendance/daily-attendance.ts` (modify) — call `pairPunches`, emit `workedMinutes`/`breakMinutes`/`needsReview`; keep `totalMinutes` = gross span for back-compat.
- `src/lib/attendance/adms-ingest.ts` (modify) — `recomputeAttendanceDay` filters `status='approved'`, writes new rollup columns.
- `src/actions/attendance-punches.ts` (new) — list/add-manual/approve/reject/void punch actions + audit.
- `src/lib/attendance/punch-permissions.ts` (new) — pure guard for who can act on a punch.
- `src/components/attendance/punch-timeline-dialog.tsx` (new) — admin drill-down timeline + actions.
- `src/components/attendance/punch-timeline-row.tsx` (new) — one punch row (icon/color/source/status).
- `src/components/attendance/daily-attendance-tab.tsx` (modify) — make `punch_count` a drill-down trigger.
- `src/components/attendance/attendance-client.tsx` (modify) — employee read-only "My Timeline".
- Migrations: `086_punch_events_lifecycle.sql`, `087_attendance_punch_audit.sql`, `088_attendance_records_worked_minutes.sql`.

**Track B — Late-penalty bands**
- `src/lib/attendance/late-penalty-bands.ts` (new) — pure band resolver + validator.
- `src/actions/late-policy.ts` (modify) — extend `PolicySchema` with `consequence` + `bands`; persist bands.
- `src/lib/payroll/late-penalty.ts` (new) — pure `computeLatePenaltyDeduction`.
- `src/actions/payroll.ts` (modify) — count late days for month, compute penalty in `processPayrollRun` + `updatePayrollEntry`.
- `src/lib/payroll/recompute-entry.ts` (modify) — include `late_penalty_deduction` in `total_deductions`/`net_pay`.
- `src/components/settings/late-policy-card.tsx` (modify) — consequence selector + band editor.
- `src/components/settings/late-penalty-bands-editor.tsx` (new) — repeatable band rows.
- `src/components/payroll/late-penalty-chip.tsx` (new) — payroll-row penalty chip + waive.
- `src/components/payroll/payroll-client.tsx` (modify) — render the chip.
- Migrations: `089_late_penalty_bands.sql`, `090_payroll_entry_late_penalty.sql`.

---

# TRACK A — PUNCH EVENT REDESIGN

### Task A1: Pure `pairPunches` interval engine

**Files:**
- Create: `src/lib/attendance/pair-punches.ts`
- Test: `tests/attendance/pair-punches.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  ```ts
  export type PairPunch = { id: string; punched_at: string /* ISO UTC */ };
  export type PairResult = {
    workedMinutes: number;        // Σ(out−in) over closed pairs, whole minutes
    breakMinutes: number;         // Σ gaps between pairs, whole minutes
    grossSpanMinutes: number;     // last−first (0 if <2 punches)
    intervals: { inAt: string; outAt: string; minutes: number }[];
    danglingInAt: string | null;  // unpaired trailing punch (odd count) or null
    needsReview: boolean;         // true when danglingInAt !== null OR punches < 2
    pairedStatus: "present" | "incomplete";
  };
  export function pairPunches(punches: PairPunch[]): PairResult;
  ```

Pairing rule: sort ascending, walk in order taking `(0,1),(2,3),…` as `(in,out)` pairs; a leftover last punch is `danglingInAt`. `breakMinutes` = sum of gaps between consecutive pairs (`in[k+1] − out[k]`). Single/zero punch → `incomplete`, `workedMinutes = 0`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { pairPunches } from "@/lib/attendance/pair-punches";

const t = (hhmm: string) => `2026-07-01T${hhmm}:00.000Z`;

describe("pairPunches", () => {
  it("empty → incomplete, zero worked", () => {
    const r = pairPunches([]);
    expect(r.pairedStatus).toBe("incomplete");
    expect(r.workedMinutes).toBe(0);
    expect(r.needsReview).toBe(true);
  });

  it("single punch → incomplete dangling in", () => {
    const r = pairPunches([{ id: "a", punched_at: t("09:00") }]);
    expect(r.pairedStatus).toBe("incomplete");
    expect(r.danglingInAt).toBe(t("09:00"));
    expect(r.workedMinutes).toBe(0);
  });

  it("simple in/out → worked = span, no break", () => {
    const r = pairPunches([
      { id: "a", punched_at: t("09:00") },
      { id: "b", punched_at: t("17:00") },
    ]);
    expect(r.pairedStatus).toBe("present");
    expect(r.workedMinutes).toBe(480);
    expect(r.breakMinutes).toBe(0);
    expect(r.intervals).toHaveLength(1);
    expect(r.needsReview).toBe(false);
  });

  it("in / lunch-out / lunch-in / out → break subtracted", () => {
    const r = pairPunches([
      { id: "a", punched_at: t("09:00") },
      { id: "b", punched_at: t("13:00") },
      { id: "c", punched_at: t("14:00") },
      { id: "d", punched_at: t("18:00") },
    ]);
    expect(r.workedMinutes).toBe(480); // 4h + 4h
    expect(r.breakMinutes).toBe(60);
    expect(r.grossSpanMinutes).toBe(540);
    expect(r.intervals).toHaveLength(2);
    expect(r.needsReview).toBe(false);
  });

  it("odd count (missed out) → pairs what it can, flags dangling", () => {
    const r = pairPunches([
      { id: "a", punched_at: t("09:00") },
      { id: "b", punched_at: t("13:00") },
      { id: "c", punched_at: t("14:00") },
    ]);
    expect(r.workedMinutes).toBe(240); // only 09:00–13:00 closed
    expect(r.danglingInAt).toBe(t("14:00"));
    expect(r.needsReview).toBe(true);
    expect(r.pairedStatus).toBe("incomplete");
  });

  it("sorts unsorted input", () => {
    const r = pairPunches([
      { id: "b", punched_at: t("17:00") },
      { id: "a", punched_at: t("09:00") },
    ]);
    expect(r.intervals[0].inAt).toBe(t("09:00"));
    expect(r.workedMinutes).toBe(480);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/attendance/pair-punches.test.ts`
Expected: FAIL — "Cannot find module '@/lib/attendance/pair-punches'".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/attendance/pair-punches.ts
/**
 * Pure chronological interval pairing. Sorts punches ascending, pairs
 * (in,out),(in,out)… ; worked = Σ(out−in), break = Σ gaps between pairs.
 * A trailing unpaired punch is danglingInAt (missed clock-out) → needsReview.
 * Direction is derived from sequence, never trusted from the device.
 */
export type PairPunch = { id: string; punched_at: string };
export type PairResult = {
  workedMinutes: number;
  breakMinutes: number;
  grossSpanMinutes: number;
  intervals: { inAt: string; outAt: string; minutes: number }[];
  danglingInAt: string | null;
  needsReview: boolean;
  pairedStatus: "present" | "incomplete";
};

const ms = (iso: string) => new Date(iso).getTime();
const mins = (a: string, b: string) => Math.round((ms(b) - ms(a)) / 60_000);

export function pairPunches(punches: PairPunch[]): PairResult {
  const empty: PairResult = {
    workedMinutes: 0,
    breakMinutes: 0,
    grossSpanMinutes: 0,
    intervals: [],
    danglingInAt: null,
    needsReview: true,
    pairedStatus: "incomplete",
  };
  if (!punches || punches.length === 0) return empty;

  const sorted = [...punches].sort((a, b) => ms(a.punched_at) - ms(b.punched_at));

  if (sorted.length === 1) {
    return { ...empty, danglingInAt: sorted[0].punched_at };
  }

  const intervals: PairResult["intervals"] = [];
  let workedMinutes = 0;
  for (let i = 0; i + 1 < sorted.length; i += 2) {
    const inAt = sorted[i].punched_at;
    const outAt = sorted[i + 1].punched_at;
    const m = mins(inAt, outAt);
    intervals.push({ inAt, outAt, minutes: m });
    workedMinutes += m;
  }

  let breakMinutes = 0;
  for (let k = 0; k + 1 < intervals.length; k++) {
    breakMinutes += mins(intervals[k].outAt, intervals[k + 1].inAt);
  }

  const danglingInAt = sorted.length % 2 === 1 ? sorted[sorted.length - 1].punched_at : null;
  const grossSpanMinutes = mins(sorted[0].punched_at, sorted[sorted.length - 1].punched_at);

  return {
    workedMinutes,
    breakMinutes,
    grossSpanMinutes,
    intervals,
    danglingInAt,
    needsReview: danglingInAt !== null,
    pairedStatus: danglingInAt !== null ? "incomplete" : "present",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/attendance/pair-punches.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendance/pair-punches.ts tests/attendance/pair-punches.test.ts
git commit -m "feat(attendance): pure interval-pairing engine for multi-punch days"
```

---

### Task A2: Wire `pairPunches` into `computeDailyAttendance`

**Files:**
- Modify: `src/lib/attendance/daily-attendance.ts`
- Test: `tests/attendance/daily-attendance.test.ts` (extend)

**Interfaces:**
- Consumes: `pairPunches` (Task A1).
- Produces: `DailyAttendanceResult` gains `workedMinutes: number | null`, `breakMinutes: number | null`, `needsReview: boolean`. `totalMinutes` stays = gross span (last−first) for back-compat. `PunchEvent` gains optional `status?: string` so callers can pass lifecycle state.

- [ ] **Step 1: Write the failing test** (append to existing file)

```ts
import { computeDailyAttendance } from "@/lib/attendance/daily-attendance";
// ... existing imports/tests ...

describe("computeDailyAttendance worked/break minutes", () => {
  const t = (hhmm: string) => `2026-07-01T${hhmm}:00.000Z`;
  it("subtracts lunch from workedMinutes but totalMinutes stays gross span", () => {
    const r = computeDailyAttendance({
      events: [
        { id: "a", punched_at: t("09:00"), location_id: null },
        { id: "b", punched_at: t("13:00"), location_id: null },
        { id: "c", punched_at: t("14:00"), location_id: null },
        { id: "d", punched_at: t("18:00"), location_id: null },
      ],
      zoneLocationIds: null,
    });
    expect(r.totalMinutes).toBe(540);   // gross span (back-compat)
    expect(r.workedMinutes).toBe(480);  // minus lunch
    expect(r.breakMinutes).toBe(60);
    expect(r.needsReview).toBe(false);
    expect(r.status).toBe("present");
  });
  it("odd punch count flags needsReview", () => {
    const r = computeDailyAttendance({
      events: [
        { id: "a", punched_at: t("09:00"), location_id: null },
        { id: "b", punched_at: t("13:00"), location_id: null },
        { id: "c", punched_at: t("14:00"), location_id: null },
      ],
      zoneLocationIds: null,
    });
    expect(r.workedMinutes).toBe(240);
    expect(r.needsReview).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/attendance/daily-attendance.test.ts`
Expected: FAIL — `workedMinutes`/`breakMinutes`/`needsReview` undefined.

- [ ] **Step 3: Implement**

In `daily-attendance.ts`: add `import { pairPunches } from "./pair-punches";`. Add `workedMinutes: number | null; breakMinutes: number | null; needsReview: boolean;` to `DailyAttendanceResult`, and `workedMinutes: null, breakMinutes: null, needsReview: true` to the `empty` object (and the `inZone.length === 0` and single-punch returns keep `needsReview: true`, `workedMinutes: null`). In the ≥2 branch, after computing `totalMinutes`, add:

```ts
const paired = pairPunches(sorted.map((e) => ({ id: e.id, punched_at: e.punched_at })));
```

and return `workedMinutes: paired.workedMinutes, breakMinutes: paired.breakMinutes, needsReview: paired.needsReview` alongside the existing fields (keep `status: "present"`; `totalMinutes` unchanged = gross span). For the single-punch branch set `workedMinutes: null, breakMinutes: null, needsReview: true`.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- tests/attendance/daily-attendance.test.ts`
Expected: PASS (existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendance/daily-attendance.ts tests/attendance/daily-attendance.test.ts
git commit -m "feat(attendance): derive worked/break minutes via interval pairing"
```

---

### Task A3: Migration 086 — punch-event lifecycle columns

**Files:**
- Create: `supabase/migrations/086_punch_events_lifecycle.sql`

**Interfaces:**
- Produces columns on `attendance_punch_events`: `punch_type text NULL CHECK (punch_type IN ('in','out','break_out','break_in'))`, `status text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved','pending','rejected','voided','duplicate'))`, `created_by uuid NULL`, `approved_by uuid NULL`, `approved_at timestamptz NULL`, `rejected_by uuid NULL`, `rejected_at timestamptz NULL`, `rejection_reason text NULL`, `voided_by uuid NULL`, `voided_at timestamptz NULL`, `void_reason text NULL`, `superseded_by uuid NULL`, `note text NULL`.

- [ ] **Step 1: Write the migration SQL**

```sql
-- 086_punch_events_lifecycle.sql — status/type/void/approve columns for punch redesign
ALTER TABLE public.attendance_punch_events
  ADD COLUMN IF NOT EXISTS punch_type text NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS created_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS rejected_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason text NULL,
  ADD COLUMN IF NOT EXISTS voided_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS voided_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS void_reason text NULL,
  ADD COLUMN IF NOT EXISTS superseded_by uuid NULL REFERENCES public.attendance_punch_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS note text NULL;

DO $$ BEGIN
  ALTER TABLE public.attendance_punch_events
    ADD CONSTRAINT punch_events_type_check
    CHECK (punch_type IS NULL OR punch_type IN ('in','out','break_out','break_in'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.attendance_punch_events
    ADD CONSTRAINT punch_events_status_check
    CHECK (status IN ('approved','pending','rejected','voided','duplicate'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Existing rows are trusted device punches.
UPDATE public.attendance_punch_events SET status = 'approved' WHERE status IS NULL;

CREATE INDEX IF NOT EXISTS idx_punch_events_status
  ON public.attendance_punch_events (org_id, employee_id, status);
```

- [ ] **Step 2: Apply via Supabase MCP** (`apply_migration`, name `086_punch_events_lifecycle`). Verify with `list_tables` that the columns exist.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/086_punch_events_lifecycle.sql
git commit -m "feat(attendance): punch-event lifecycle columns (status/type/void/approve)"
```

---

### Task A4: Migration 087 — punch audit table

**Files:**
- Create: `supabase/migrations/087_attendance_punch_audit.sql`

**Interfaces:**
- Produces table `attendance_punch_audit (id, org_id, punch_event_id, action, actor_id, actor_role, reason, metadata jsonb, created_at)`. `action IN ('manual_add','approve','reject','void','dedupe','edit')`.

- [ ] **Step 1: Write the migration SQL**

```sql
-- 087_attendance_punch_audit.sql — who/when/why for every punch mutation
CREATE TABLE IF NOT EXISTS public.attendance_punch_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  punch_event_id uuid NULL REFERENCES public.attendance_punch_events(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('manual_add','approve','reject','void','dedupe','edit')),
  actor_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  actor_role text NULL,
  reason text NULL,
  metadata jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_punch_audit_event
  ON public.attendance_punch_audit (org_id, punch_event_id);

ALTER TABLE public.attendance_punch_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS punch_audit_admin_all ON public.attendance_punch_audit;
CREATE POLICY punch_audit_admin_all ON public.attendance_punch_audit
  FOR ALL TO authenticated
  USING (org_id::text = auth.jwt() ->> 'org_id'
    AND auth.jwt() ->> 'org_role' IN ('org:owner','org:admin'))
  WITH CHECK (org_id::text = auth.jwt() ->> 'org_id'
    AND auth.jwt() ->> 'org_role' IN ('org:owner','org:admin'));
```

- [ ] **Step 2: Apply via Supabase MCP** (name `087_attendance_punch_audit`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/087_attendance_punch_audit.sql
git commit -m "feat(attendance): punch audit table"
```

---

### Task A5: Migration 088 — attendance_records worked/break/review

**Files:**
- Create: `supabase/migrations/088_attendance_records_worked_minutes.sql`

**Interfaces:**
- Produces `attendance_records.worked_minutes int NULL`, `break_minutes int NULL`, `needs_review boolean NOT NULL DEFAULT false`, `has_pending_punches boolean NOT NULL DEFAULT false`.

- [ ] **Step 1: Write the migration SQL**

```sql
-- 088_attendance_records_worked_minutes.sql — net worked time + review flags
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS worked_minutes integer NULL,
  ADD COLUMN IF NOT EXISTS break_minutes integer NULL,
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_pending_punches boolean NOT NULL DEFAULT false;

-- Backfill: legacy rows keep total_minutes as their worked figure.
UPDATE public.attendance_records
  SET worked_minutes = total_minutes
  WHERE worked_minutes IS NULL AND total_minutes IS NOT NULL;
```

- [ ] **Step 2: Apply via Supabase MCP** (name `088_attendance_records_worked_minutes`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/088_attendance_records_worked_minutes.sql
git commit -m "feat(attendance): worked_minutes/break_minutes/needs_review on rollup"
```

---

### Task A6: `recomputeAttendanceDay` honours status + writes new fields

**Files:**
- Modify: `src/lib/attendance/adms-ingest.ts` (`recomputeAttendanceDay`, ~lines 225-279)
- Test: `tests/attendance/adms-ingest.test.ts` (extend — pure assertions only where possible)

**Interfaces:**
- Consumes: `computeDailyAttendance` (now emits worked/break/needsReview).
- Produces: rollup upsert now selects punch-event columns incl. `status`, filters to `status='approved'` before computing, and writes `worked_minutes`, `break_minutes`, `needs_review`, `has_pending_punches` (true if any event that day has `status='pending'`).

- [ ] **Step 1: Modify the event fetch** — in `recomputeAttendanceDay`, change the `attendance_punch_events` select to include `status`, and split results: `approved = rows.filter(r => r.status === 'approved')` feeds `computeDailyAttendance`; `hasPending = rows.some(r => r.status === 'pending')`.

- [ ] **Step 2: Widen the upsert** — add to the upserted object:

```ts
worked_minutes: result.workedMinutes,
break_minutes: result.breakMinutes,
needs_review: result.needsReview || hasPending,
has_pending_punches: hasPending,
```

Keep `total_minutes: result.totalMinutes`, `source: "device"`, and the existing multi-loc fields. If `result.status === "absent"` AND `!hasPending`, keep the current early-return; if `hasPending` with no approved punches, still upsert a `needs_review` row so the timeline surfaces it.

- [ ] **Step 3: Run the attendance suite**

Run: `npm test -- tests/attendance/`
Expected: PASS (no regressions; adms-ingest pure parser tests unaffected).

- [ ] **Step 4: Commit**

```bash
git add src/lib/attendance/adms-ingest.ts tests/attendance/adms-ingest.test.ts
git commit -m "feat(attendance): recompute honours approved status + writes worked minutes"
```

---

### Task A7: Punch permissions + server actions

**Files:**
- Create: `src/lib/attendance/punch-permissions.ts`
- Create: `src/actions/attendance-punches.ts`
- Test: `tests/attendance/punch-permissions.test.ts`

**Interfaces:**
- Consumes: `getCurrentUser`, `isAdmin`, `isManagerOrAbove` (`@/lib/current-user`), `getManagerScopedEmployeeIds` (`@/lib/attendance/manager-scope`), `recomputeAttendanceDay` (`@/lib/attendance/adms-ingest`), `createAdminSupabase` (`@/lib/supabase/server`).
- Produces pure guard:
  ```ts
  export type PunchActor = { role: "owner"|"admin"|"manager"|"employee"; employeeId: string | null; scopedEmployeeIds: string[] };
  export function canApprovePunch(actor: PunchActor, targetEmployeeId: string): boolean; // admin any; manager if target in scopedEmployeeIds; employee never
  export function canVoidPunch(actor: PunchActor): boolean;                              // admin only
  export function autoApproveOnAdd(actor: PunchActor): boolean;                          // true when isAdmin
  ```
  And server actions (all `ActionResult`): `listPunchEvents({ employeeId, date })`, `addManualPunch({ employeeId, punchedAtIso, punchType, note })`, `approvePunch(punchId)`, `rejectPunch(punchId, reason)`, `voidPunch(punchId, reason)`.

- [ ] **Step 1: Write the failing permission test**

```ts
import { describe, it, expect } from "vitest";
import { canApprovePunch, canVoidPunch, autoApproveOnAdd } from "@/lib/attendance/punch-permissions";

const admin = { role: "admin" as const, employeeId: "A", scopedEmployeeIds: [] };
const mgr = { role: "manager" as const, employeeId: "M", scopedEmployeeIds: ["E1"] };
const emp = { role: "employee" as const, employeeId: "E1", scopedEmployeeIds: [] };

describe("punch permissions", () => {
  it("admin approves anyone", () => expect(canApprovePunch(admin, "Z")).toBe(true));
  it("manager approves own-dept only", () => {
    expect(canApprovePunch(mgr, "E1")).toBe(true);
    expect(canApprovePunch(mgr, "E9")).toBe(false);
  });
  it("employee approves nobody", () => expect(canApprovePunch(emp, "E1")).toBe(false));
  it("only admin voids", () => {
    expect(canVoidPunch(admin)).toBe(true);
    expect(canVoidPunch(mgr)).toBe(false);
  });
  it("admin-added punches auto-approve", () => {
    expect(autoApproveOnAdd(admin)).toBe(true);
    expect(autoApproveOnAdd(mgr)).toBe(false);
    expect(autoApproveOnAdd(emp)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/attendance/punch-permissions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure guard**

```ts
// src/lib/attendance/punch-permissions.ts
export type PunchActor = {
  role: "owner" | "admin" | "manager" | "employee";
  employeeId: string | null;
  scopedEmployeeIds: string[];
};
const isAdminRole = (r: PunchActor["role"]) => r === "owner" || r === "admin";

export function canApprovePunch(actor: PunchActor, targetEmployeeId: string): boolean {
  if (isAdminRole(actor.role)) return true;
  if (actor.role === "manager") return actor.scopedEmployeeIds.includes(targetEmployeeId);
  return false;
}
export function canVoidPunch(actor: PunchActor): boolean {
  return isAdminRole(actor.role);
}
export function autoApproveOnAdd(actor: PunchActor): boolean {
  return isAdminRole(actor.role);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- tests/attendance/punch-permissions.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Implement the server actions** (`src/actions/attendance-punches.ts`, `"use server"`). Each: `const user = await getCurrentUser(); if (!user) return { success:false, error:"Not authenticated" }`. Build the `PunchActor` — for managers, `scopedEmployeeIds = await getManagerScopedEmployeeIds(user.orgId, user.employeeId)`. Key behaviors:
  - `listPunchEvents({ employeeId, date })`: managers/admins per scope; an employee may pass only their own `employeeId`. Returns rows incl. all lifecycle columns, ordered by `punched_at`.
  - `addManualPunch`: Zod-validate (`punchType ∈ {in,out}`, valid ISO). Insert `source:'manual'`, `punch_type`, `created_by:user.employeeId`, `status: autoApproveOnAdd(actor) ? 'approved' : 'pending'` (+ `approved_by/approved_at` when auto). Employees may add only for themselves (always `pending`). Write audit `manual_add`. Call `recomputeAttendanceDay`. `revalidatePath('/dashboard/attendance')`.
  - `approvePunch`: load punch; `if (!canApprovePunch(actor, punch.employee_id)) return Unauthorized`. Set `status:'approved', approved_by, approved_at`. Audit `approve`. Recompute. Revalidate.
  - `rejectPunch(id, reason)`: reason required; same scope guard. Set `status:'rejected', rejected_by, rejected_at, rejection_reason`. Audit `reject`. Recompute. Revalidate.
  - `voidPunch(id, reason)`: `if (!canVoidPunch(actor)) return Unauthorized`; reason required. Set `status:'voided', voided_by, voided_at, void_reason`. Audit `void`. Recompute. Revalidate.
  - Audit writes wrapped in try/catch (best-effort, gotcha #52).

- [ ] **Step 6: Typecheck build**

Run: `npm run build`
Expected: build succeeds (note `ignoreBuildErrors` for TS; watch for hard failures / "Functions cannot be passed to Client Components" — none here, server-only).

- [ ] **Step 7: Commit**

```bash
git add src/lib/attendance/punch-permissions.ts src/actions/attendance-punches.ts tests/attendance/punch-permissions.test.ts
git commit -m "feat(attendance): manual punch add/approve/reject/void actions + permissions"
```

---

### Task A8: Punch Timeline UI

**Files:**
- Create: `src/components/attendance/punch-timeline-row.tsx`
- Create: `src/components/attendance/punch-timeline-dialog.tsx`
- Modify: `src/components/attendance/daily-attendance-tab.tsx` (make `punch_count` a drill-down button, ~line 158)
- Modify: `src/components/attendance/attendance-client.tsx` (employee read-only "My Timeline")

**Interfaces:**
- Consumes: `listPunchEvents`, `addManualPunch`, `approvePunch`, `rejectPunch`, `voidPunch` (Task A7).
- Produces: `<PunchTimelineDialog employeeId date employeeName readOnly?={boolean} />` (opened from the Locations tab row and from the employee history), `<PunchTimelineRow punch onVoid onApprove onReject />`.

- [ ] **Step 1: Build `PunchTimelineRow`** — one punch card. Icon+color by inferred/explicit type: `in`=green `LogIn`, `out`=red `LogOut`, `break_out`/`break_in`=amber `Coffee`. Source badge: `device`/`adms` = `Cpu` "Device", `manual` = `PencilLine` "Manual", `web` = "Web". Status styling: `approved` solid; `pending` dashed amber "Awaiting approval"; `rejected`/`voided` strike-through + muted with reason tooltip; `duplicate` muted "Duplicate". Time in IST (`formatTime`). Admin/manager actions rendered when not `readOnly`: Void (admin), Approve/Reject (pending + in scope). Use `sonner` toasts + `router.refresh()` on success.

- [ ] **Step 2: Build `PunchTimelineDialog`** — Radix `Dialog`. On open, calls `listPunchEvents`. Renders a vertical chronological list of `PunchTimelineRow`; between consecutive approved in→out rows show the worked interval, between pairs show the break gap. Header shows computed **worked hours / break total** (recompute client-side via a small `pairPunches` call on approved rows, or read the rollup) plus a `needs_review` / `pending` banner. Footer (when not `readOnly`): "Add missing punch" → inline time picker + in/out select → `addManualPunch`.

- [ ] **Step 3: Wire the Locations tab** — in `daily-attendance-tab.tsx`, replace the plain `{r.punch_count}` cell (~line 158) with a button that opens `<PunchTimelineDialog employeeId={r.employee_id} date={r.date} employeeName={r.employee_name} />`. Keep the out-of-zone badge.

- [ ] **Step 4: Employee read-only view** — in `attendance-client.tsx` "My History" rows, add a "View punches" affordance opening `<PunchTimelineDialog employeeId={user.employeeId} date={row.date} readOnly employeeName="You" />`. Employees get no void/approve; they get "Request missing punch" (→ `addManualPunch`, lands `pending`).

- [ ] **Step 5: Build check**

Run: `npm run build`
Expected: succeeds. Confirm no server→client function-prop leaks (gotcha #83) — pass ids/strings, resolve actions inside client components.

- [ ] **Step 6: Commit**

```bash
git add src/components/attendance/punch-timeline-row.tsx src/components/attendance/punch-timeline-dialog.tsx src/components/attendance/daily-attendance-tab.tsx src/components/attendance/attendance-client.tsx
git commit -m "feat(attendance): per-employee Punch Timeline (admin actions + employee read-only)"
```

---

### Task A9: Repoint OT/payroll hours to `worked_minutes`

**Files:**
- Modify: `src/actions/overtime.ts` (OT compute reading `attendance_records`)
- Modify: `src/lib/attendance/ot.ts` (if the per-day worked figure is read there)
- Test: `tests/attendance/ot.test.ts` (extend for net-worked input)

**Interfaces:**
- Consumes: `attendance_records.worked_minutes` (falls back to `total_minutes` when null, for legacy rows).
- Produces: OT per-day = `max(0, worked_minutes − shift.total_minutes)`; weekly threshold uses summed `worked_minutes`.

- [ ] **Step 1: Locate the worked-minutes read** in `computeAndRecordOvertime` (`src/actions/overtime.ts`) and any helper in `src/lib/attendance/ot.ts`. Change the per-day figure from `total_minutes` to `worked_minutes ?? total_minutes`.

- [ ] **Step 2: Extend the OT test** to assert a day with a lunch break yields OT off net worked time, not gross span.

Run: `npm test -- tests/attendance/ot.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/actions/overtime.ts src/lib/attendance/ot.ts tests/attendance/ot.test.ts
git commit -m "feat(payroll): overtime uses net worked_minutes (breaks excluded)"
```

---

# TRACK B — LATE-PENALTY BANDS

### Task B1: Migration 089 — late_penalty_bands + consequence

**Files:**
- Create: `supabase/migrations/089_late_penalty_bands.sql`

**Interfaces:**
- Produces table `late_penalty_bands (id, org_id, policy_id, min_late_days int, max_late_days int NULL, deduction_days numeric(4,2), sort int, created_at)`; extends `late_policies.consequence` CHECK to `('block_bonus','salary_deduction','both','none')`.

- [ ] **Step 1: Write the migration SQL**

```sql
-- 089_late_penalty_bands.sql — graduated salary-deduction bands + consequence options
CREATE TABLE IF NOT EXISTS public.late_penalty_bands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  policy_id uuid NOT NULL REFERENCES public.late_policies(id) ON DELETE CASCADE,
  min_late_days integer NOT NULL CHECK (min_late_days >= 1 AND min_late_days <= 31),
  max_late_days integer NULL CHECK (max_late_days IS NULL OR (max_late_days >= min_late_days AND max_late_days <= 31)),
  deduction_days numeric(4,2) NOT NULL CHECK (deduction_days >= 0 AND deduction_days <= 31),
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_late_penalty_bands_policy
  ON public.late_penalty_bands (org_id, policy_id, sort);

ALTER TABLE public.late_penalty_bands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_late_penalty_bands_org ON public.late_penalty_bands;
CREATE POLICY p_late_penalty_bands_org ON public.late_penalty_bands
  FOR ALL TO authenticated
  USING (org_id::text = auth.jwt() ->> 'org_id')
  WITH CHECK (org_id::text = auth.jwt() ->> 'org_id');

-- Extend the consequence CHECK.
DO $$ BEGIN
  ALTER TABLE public.late_policies DROP CONSTRAINT IF EXISTS late_policies_consequence_check;
  ALTER TABLE public.late_policies
    ADD CONSTRAINT late_policies_consequence_check
    CHECK (consequence IN ('block_bonus','salary_deduction','both','none'));
END $$;
```

- [ ] **Step 2: Apply via Supabase MCP** (name `089_late_penalty_bands`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/089_late_penalty_bands.sql
git commit -m "feat(late-policy): penalty bands table + consequence options"
```

---

### Task B2: Migration 090 — payroll entry late-penalty columns

**Files:**
- Create: `supabase/migrations/090_payroll_entry_late_penalty.sql`

**Interfaces:**
- Produces `payroll_entries.late_penalty_days numeric(4,2) NOT NULL DEFAULT 0`, `late_penalty_deduction integer NOT NULL DEFAULT 0`.

- [ ] **Step 1: Write the migration SQL**

```sql
-- 090_payroll_entry_late_penalty.sql — late-penalty deduction on payroll entries
ALTER TABLE public.payroll_entries
  ADD COLUMN IF NOT EXISTS late_penalty_days numeric(4,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_penalty_deduction integer NOT NULL DEFAULT 0;
```

- [ ] **Step 2: Apply via Supabase MCP** (name `090_payroll_entry_late_penalty`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/090_payroll_entry_late_penalty.sql
git commit -m "feat(payroll): late_penalty_days/late_penalty_deduction columns"
```

---

### Task B3: Pure band resolver + validator

**Files:**
- Create: `src/lib/attendance/late-penalty-bands.ts`
- Test: `tests/attendance/late-penalty-bands.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type PenaltyBand = { min_late_days: number; max_late_days: number | null; deduction_days: number };
  export function resolvePenaltyDays(lateDays: number, bands: PenaltyBand[]): number; // 0 if no band matches
  export function validateBands(bands: PenaltyBand[]): { ok: true } | { ok: false; error: string }; // gaps/overlaps/order
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { resolvePenaltyDays, validateBands, type PenaltyBand } from "@/lib/attendance/late-penalty-bands";

const bands: PenaltyBand[] = [
  { min_late_days: 3, max_late_days: 4, deduction_days: 0.5 },
  { min_late_days: 5, max_late_days: 7, deduction_days: 2 },
  { min_late_days: 8, max_late_days: null, deduction_days: 3 },
];

describe("resolvePenaltyDays", () => {
  it("below the lowest band → 0", () => expect(resolvePenaltyDays(2, bands)).toBe(0));
  it("matches inclusive band", () => {
    expect(resolvePenaltyDays(3, bands)).toBe(0.5);
    expect(resolvePenaltyDays(4, bands)).toBe(0.5);
    expect(resolvePenaltyDays(6, bands)).toBe(2);
  });
  it("open-ended top band", () => expect(resolvePenaltyDays(20, bands)).toBe(3));
  it("empty bands → 0", () => expect(resolvePenaltyDays(10, [])).toBe(0));
});

describe("validateBands", () => {
  it("accepts ordered non-overlapping", () => expect(validateBands(bands).ok).toBe(true));
  it("rejects overlap", () => {
    const bad: PenaltyBand[] = [
      { min_late_days: 3, max_late_days: 5, deduction_days: 1 },
      { min_late_days: 5, max_late_days: 7, deduction_days: 2 },
    ];
    expect(validateBands(bad).ok).toBe(false);
  });
  it("rejects min>max", () => {
    expect(validateBands([{ min_late_days: 5, max_late_days: 3, deduction_days: 1 }]).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/attendance/late-penalty-bands.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/attendance/late-penalty-bands.ts
export type PenaltyBand = { min_late_days: number; max_late_days: number | null; deduction_days: number };

export function resolvePenaltyDays(lateDays: number, bands: PenaltyBand[]): number {
  for (const b of bands) {
    const withinLower = lateDays >= b.min_late_days;
    const withinUpper = b.max_late_days === null || lateDays <= b.max_late_days;
    if (withinLower && withinUpper) return b.deduction_days;
  }
  return 0;
}

export function validateBands(bands: PenaltyBand[]): { ok: true } | { ok: false; error: string } {
  const sorted = [...bands].sort((a, b) => a.min_late_days - b.min_late_days);
  let prevMax = 0;
  for (const b of sorted) {
    if (b.max_late_days !== null && b.min_late_days > b.max_late_days) {
      return { ok: false, error: `Band min (${b.min_late_days}) exceeds max (${b.max_late_days}).` };
    }
    if (b.min_late_days <= prevMax) {
      return { ok: false, error: `Bands overlap at ${b.min_late_days} late days.` };
    }
    prevMax = b.max_late_days ?? 31;
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- tests/attendance/late-penalty-bands.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendance/late-penalty-bands.ts tests/attendance/late-penalty-bands.test.ts
git commit -m "feat(late-policy): pure penalty-band resolver + validator"
```

---

### Task B4: Pure penalty-deduction calc + late-count helper

**Files:**
- Create: `src/lib/payroll/late-penalty.ts`
- Test: `tests/payroll/late-penalty.test.ts`

**Interfaces:**
- Consumes: `resolvePenaltyDays` (B3).
- Produces:
  ```ts
  export function computeLatePenaltyDeduction(args: {
    lateDays: number; bands: import("@/lib/attendance/late-penalty-bands").PenaltyBand[];
    grossMonthly: number; workingDays: number;
  }): { penaltyDays: number; deduction: number }; // deduction = round(gross/workingDays * penaltyDays)
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { computeLatePenaltyDeduction } from "@/lib/payroll/late-penalty";

const bands = [
  { min_late_days: 3, max_late_days: 4, deduction_days: 0.5 },
  { min_late_days: 5, max_late_days: 7, deduction_days: 2 },
];

describe("computeLatePenaltyDeduction", () => {
  it("half-day band", () => {
    const r = computeLatePenaltyDeduction({ lateDays: 3, bands, grossMonthly: 52000, workingDays: 26 });
    expect(r.penaltyDays).toBe(0.5);
    expect(r.deduction).toBe(1000); // 2000/day * 0.5
  });
  it("two-day band", () => {
    const r = computeLatePenaltyDeduction({ lateDays: 6, bands, grossMonthly: 52000, workingDays: 26 });
    expect(r.penaltyDays).toBe(2);
    expect(r.deduction).toBe(4000);
  });
  it("no band → zero", () => {
    const r = computeLatePenaltyDeduction({ lateDays: 1, bands, grossMonthly: 52000, workingDays: 26 });
    expect(r.deduction).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/payroll/late-penalty.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/payroll/late-penalty.ts
import { resolvePenaltyDays, type PenaltyBand } from "@/lib/attendance/late-penalty-bands";

export function computeLatePenaltyDeduction(args: {
  lateDays: number;
  bands: PenaltyBand[];
  grossMonthly: number;
  workingDays: number;
}): { penaltyDays: number; deduction: number } {
  const penaltyDays = resolvePenaltyDays(args.lateDays, args.bands);
  if (penaltyDays <= 0 || args.workingDays <= 0) return { penaltyDays: 0, deduction: 0 };
  const perDay = args.grossMonthly / args.workingDays;
  return { penaltyDays, deduction: Math.round(perDay * penaltyDays) };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- tests/payroll/late-penalty.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/payroll/late-penalty.ts tests/payroll/late-penalty.test.ts
git commit -m "feat(payroll): pure late-penalty deduction calc"
```

---

### Task B5: Wire penalty into `processPayrollRun`, `updatePayrollEntry`, `recompute-entry`

**Files:**
- Modify: `src/actions/payroll.ts` (`processPayrollRun` ~550-738; `updatePayrollEntry` ~949-1039)
- Modify: `src/lib/payroll/recompute-entry.ts` (~18-93)

**Interfaces:**
- Consumes: `computeLatePenaltyDeduction` (B4), the org's enabled `late_policies` row + its `late_penalty_bands`, `resolveCoveredEmployeeIds` (`@/lib/attendance/late-policy-targets`), the `is_late` monthly count (same query shape as the reconcile cron), `late_policy_flags` for waive/override.
- Produces: `payroll_entries.late_penalty_days` + `late_penalty_deduction` populated; both folded into `total_deductions` and `net_pay` everywhere they are computed.

- [ ] **Step 1: `processPayrollRun` — load policy + bands + late counts.** Near where leaves/LOP are fetched (~612), add: fetch the enabled `late_policies` row for the org; if `consequence IN ('salary_deduction','both')`, fetch its `late_penalty_bands` (ordered by `sort`), its targets → `resolveCoveredEmployeeIds`, and per covered employee count `attendance_records` rows with `is_late = true` and `date` in `[${payMonth}-01, ${payMonth}-31]` into `lateCountMap`. Also fetch `late_policy_flags` for the month into `waivedSet` (employee_ids with `status='overridden'`).

- [ ] **Step 2: `processPayrollRun` — compute per entry.** Inside the `.map()` (~658), for each employee:

```ts
let latePenaltyDays = 0, latePenaltyDeduction = 0;
if (penaltyEnabled && covered.has(s.employee_id) && !waivedSet.has(s.employee_id)) {
  const r = computeLatePenaltyDeduction({
    lateDays: lateCountMap[s.employee_id] ?? 0,
    bands: penaltyBands,
    grossMonthly: s.gross_monthly,
    workingDays: runData.working_days,
  });
  latePenaltyDays = r.penaltyDays;
  latePenaltyDeduction = r.deduction;
}
```

Add to the entry object: `late_penalty_days: latePenaltyDays, late_penalty_deduction: latePenaltyDeduction`. Update `total_deductions` (~686) to `employee_pf + professional_tax + adjustedTds + lopDeduction + latePenaltyDeduction`, and therefore `net_pay` (~688) `= max(0, gross_monthly + totalLineItems − totalDeductions)`.

- [ ] **Step 3: `recompute-entry.ts` — include the stored penalty.** Read `late_penalty_deduction` from the entry row (select it in the entry fetch), and change `totalDeductions` (~61) to `employee_pf + professional_tax + adjustedTds + (lop_deduction ?? 0) + (late_penalty_deduction ?? 0)`. `netPay` formula unchanged otherwise. Do **not** alter TDS for the penalty (net-only, mirrors LOP).

- [ ] **Step 4: `updatePayrollEntry` — allow manual override of penalty days.** Extend the `updates` shape to accept optional `late_penalty_days?: number`. When provided, re-derive `late_penalty_deduction = round((gross_salary / workingDays) * late_penalty_days)`; include it in `total_deductions` (~1011) and `net_pay` (~1012); persist both columns (~1014-1028). The subsequent `recomputeEntryFromLineItems(entryId)` (~1035) will read the stored `late_penalty_deduction` and keep it.

- [ ] **Step 5: Run payroll tests**

Run: `npm test -- tests/payroll/`
Expected: PASS (existing + no regression). Add one integration-style assertion if a suitable harness exists; otherwise the pure calc in B4 covers the math.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/actions/payroll.ts src/lib/payroll/recompute-entry.ts
git commit -m "feat(payroll): fold late-penalty deduction into net pay (process + recompute + edit)"
```

---

### Task B6: Extend `upsertLatePolicy` + late-policy config UI

**Files:**
- Modify: `src/actions/late-policy.ts` (`PolicySchema` ~25-36; `getLatePolicy` ~38-52; `upsertLatePolicy` ~54-99)
- Create: `src/components/settings/late-penalty-bands-editor.tsx`
- Modify: `src/components/settings/late-policy-card.tsx`

**Interfaces:**
- Consumes: `validateBands` (B3).
- Produces: `PolicySchema` gains `consequence: z.enum(["block_bonus","salary_deduction","both","none"])` and `bands: z.array(z.object({ min_late_days: z.number().int().min(1).max(31), max_late_days: z.number().int().min(1).max(31).nullable(), deduction_days: z.number().min(0).max(31) }))`. `getLatePolicy` also returns `bands`. `upsertLatePolicy` validates bands via `validateBands`, persists `consequence` on the policy, then delete-and-reinsert `late_penalty_bands` (same pattern as targets).

- [ ] **Step 1: Extend the action.** Add the fields to `PolicySchema`; in `upsertLatePolicy`, after the targets delete/reinsert, if `consequence` implies deduction, run `validateBands(input.bands)` and return its error on failure; then `delete from late_penalty_bands where policy_id = …` and insert the new rows with `sort` = index. Set `consequence` in the policy upsert payload. In `getLatePolicy`, also select the policy's bands ordered by `sort` and return them.

- [ ] **Step 2: Build `LatePenaltyBandsEditor`** (`"use client"`) — repeatable rows: `min` (number), `max` (number, empty = open-ended → null), `deduction_days` (number, step 0.5). Add/remove row buttons. Shows a live inline validation message from a client copy of `validateBands`. Emits `bands` up via `onChange`.

- [ ] **Step 3: Wire into `late-policy-card.tsx`** — add a **Consequence** `<select>` (Block bonus / Deduct salary / Both / None). When the value implies deduction, render `<LatePenaltyBandsEditor value={bands} onChange={setBands} />`. Include `consequence` + `bands` in the `upsertLatePolicy` payload. Seed a helpful default when empty: `[{3,4,0.5},{5,7,2}]`.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/actions/late-policy.ts src/components/settings/late-penalty-bands-editor.tsx src/components/settings/late-policy-card.tsx
git commit -m "feat(late-policy): consequence selector + graduated penalty-band editor"
```

---

### Task B7: Payroll-row late-penalty chip + waive

**Files:**
- Create: `src/components/payroll/late-penalty-chip.tsx`
- Modify: `src/components/payroll/payroll-client.tsx` (row render ~447-467; entry-edit path)

**Interfaces:**
- Consumes: `overrideLateFlag` (`@/actions/late-policy`) for waive; entry fields `late_penalty_days`, `late_penalty_deduction`.
- Produces: `<LatePenaltyChip entry month onWaived />` rendering "Late penalty · {days} day(s) (₹{amount})" with an admin "Waive" button (reason required) → `overrideLateFlag({ employeeId, month, reason })` → `router.refresh()`.

- [ ] **Step 1: Build the chip** — mirror `bonus-ineligible-badge.tsx` structure. Render only when `entry.late_penalty_deduction > 0`. Waive prompts for a reason (small inline form / dialog), calls `overrideLateFlag`, toasts, refreshes. Use `formatCurrency`.

- [ ] **Step 2: Render in the payroll row** — next to the existing bonus-ineligible badge (`payroll-client.tsx:457-467`), add `<LatePenaltyChip entry={entry} month={run.month} onWaived={() => router.refresh()} />`. Ensure the entry row query/props include the two new columns (they come from `payroll_entries`).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/payroll/late-penalty-chip.tsx src/components/payroll/payroll-client.tsx
git commit -m "feat(payroll): late-penalty chip + admin waive on payroll rows"
```

---

## Final verification

- [ ] `npm test` — full suite green.
- [ ] `npm run build` — succeeds.
- [ ] `npm run lint` — no new errors.
- [ ] Manual smoke (dev): ADMS-ingest a 4-punch day → Punch Timeline shows 2 intervals, worked = span − lunch; add a manual punch as employee → lands `pending`, excluded from total; admin approves → recompute; void a device punch → excluded; configure bands in Settings → Late Policy; process a payroll run for an employee over the band threshold → net pay shows the late-penalty deduction; waive → deduction clears on refresh.

## Self-Review notes (spec coverage)

- Phase 2 pairing model → A1/A2. Punch types infer-vs-explicit → A7 (`punch_type` stored for manual, inferred for device). Missed/manual + approval → A7. Duplicates → existing dedupe + `status='duplicate'`/`superseded_by` (A3 columns; marking is a follow-up polish, dedupe suppression already works). Void → A7 (`voided`). Audit → A4 + A7. UX timeline → A8 (+ employee read-only). OT/payroll repoint (decision #4) → A9. Manager-dept + admin-auto-approve (decision #3) → A7. Penalty bands + payroll integration (new requirement) → B1–B7. Bonus-block retained + configurable (decision) → B1 `consequence` + B6.
- Deferred (explicitly): unifying legacy web/`/api/attendance/punch` into the event pipeline (decision #5 → follow-up phase); overnight-shift lateness; auto-close badge.
