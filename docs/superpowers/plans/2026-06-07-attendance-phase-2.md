# Attendance PRD 01 Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a weekly roster grid with drag-to-assign and conflict detection, manager-scoped shift assignment (own department), overtime computation + approval workflow + push-to-payroll, per-employee week-off override, and alternate-Saturday support — the strict Phase 2 scope from PRD 01 §11.

**Architecture:** Five new migrations (`shift_assignments.type`, `ot_records`, `payroll_line_items.category += 'overtime'`, `employee_week_off_override`, `week_off_policy.alt_saturday_rule`). Three new pure helpers (TDD): conflict detection, OT computation, week-off v2 with override + alt-Sat. Server-action surface extends `src/actions/shifts.ts` + `src/actions/week-off.ts` and adds `src/actions/overtime.ts`. Roster grid built with @dnd-kit (reuses JambaHire pipeline pattern). Two new tabs on `/dashboard/attendance` (Roster, Overtime) plus an Overtime card under Settings → Attendance. Manager scope derived from `departments.head_id` (no new `employees.manager_id` column). Out-of-scope per PRD §11: regularization workflow (Phase 3), half-day automation (Phase 3), holiday integration (Phase 3), monthly roster view (Phase 3 polish), reporting-chain manager_id column (Phase 3 refactor if needed).

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind + Radix + CVA, Supabase Postgres (admin client; RLS advisory), Clerk (admin + manager scope), Vitest for pure helpers, `@dnd-kit/core` + `@dnd-kit/sortable` (already deps for JambaHire), existing `sonner` toast / `lucide-react` icons / `Button` + `CollapsibleSection` primitives.

---

## Scope Lockdown (read first)

**In scope (PRD 01 §11 Phase 2):**
1. **Rotational shift assignment** — add `type ∈ {fixed, rotational}` column on `shift_assignments`. Rotational chips render as "tentative" (lighter colour, ? badge). Drag-to-fix or explicit "Confirm" promotes to fixed.
2. **Roster grid** — weekly view, employees as rows, days as columns, drag-shift-into-cell to assign. Reuses @dnd-kit pattern from JambaHire pipeline.
3. **Conflict detection** — soft warnings (toast) for: already-assigned that day, assigning on week-off, assigning an inactive shift. Doesn't block — admin/manager can override.
4. **Manager scope** — owners + admins can assign for any employee. Managers can assign only for employees in departments where `departments.head_id = manager.employee_id`.
5. **Overtime computation** — `worked_minutes - shift_total_minutes` per day if > 0. Or weekly variant (worked > `weekly_threshold_hours × 60`).
6. **OT approval** — admin reviews pending OT records on `/dashboard/attendance` → Overtime tab. Approve / Reject (with reason). Maker-checker toggleable per-org via settings.
7. **Push OT to payroll** — admin clicks "Push approved OT to [Month] payroll" → inserts `payroll_line_items` rows with `category='overtime'`, `taxable=true`, `amount = OT minutes × hourly rate × multiplier`. Idempotent.
8. **Per-employee week-off override** — `employee_week_off_override` table overrides the org's `week_off_policy` for specific employees (e.g. one 6-day employee in a 5-day org).
9. **Alternate-Saturday support** — `week_off_policy.alt_saturday_rule ∈ {'none', 'odd_off', 'even_off'}`. Odd = 1st+3rd Sat off; Even = 2nd+4th.

**Out of scope (defer to Phase 3 / never):**
- Regularization request/approval workflow.
- Half-day automation, short-leave automation.
- Holiday calendar integration with shifts.
- Monthly roster view (Phase 3 — weekly only in Phase 2).
- `employees.manager_id` reporting-chain column (use dept-head model for now).
- OT auto-push-on-approval (always manual button in Phase 2).
- OT for legacy `attendance_records` with no `shift_id` (only post-Phase-1 records with shift_id get OT).
- Bulk-assign-rotational-pattern (e.g. "M-W-F morning, T-T evening" with one click — Phase 3).
- Mobile-app drag-and-drop (Phase 2 desktop only — touch fallback via @dnd-kit touch sensor).
- Drag from one cell to another (Phase 2 = drag from palette → cell only; cell-to-cell move is Phase 3).
- Custom OT cap (e.g. "max 50 OT hours/month/employee" — Phase 3).

**Resolved open decisions:**
- **OD-1:** Manager scope via `departments.head_id`. No new column.
- **OD-2:** Add `'overtime'` to `payroll_line_items.category` CHECK.
- **OD-3:** OT threshold default = `per_day`; weekly opt-in via setting.
- **OD-4:** OT multiplier default = `1.5`.
- **OD-5:** OT approval required = `true` default; toggleable.
- **OD-6:** Hourly rate = `gross_monthly / (working_days × shift.total_hours)`.
- **OD-7:** Rotational assignments display as tentative chips; promote-to-fixed via drag or button.
- **OD-8:** Alt-Sat enum: `none / odd_off / even_off`.
- **OD-9:** Roster lives as a new tab on `/dashboard/attendance`; Overtime is also a new tab.
- **OD-10:** Conflicts = soft toast warnings, don't block.
- **OD-11:** Migrations 037–041.
- **OD-12:** OT settings under Settings → Attendance → Overtime card.
- **OD-13:** OT approval surface = Overtime tab on attendance page.
- **OD-14:** Push-to-payroll = manual button. Idempotent.

**Authorization model:**
- Admin (owner + admin): roster CRUD any dept, OT settings + approve/push, week-off overrides for any employee.
- Manager: roster CRUD only for own dept (where `departments.head_id = manager.employee_id`). Cannot manage OT or week-off overrides. Can view Overtime tab in read-only mode.
- Employee: views own roster cell + own OT history (read-only); no edits.

---

## File Structure

### Migrations (`supabase/migrations/`)
- Create: `037_shift_assignments_type.sql` — `type TEXT NOT NULL DEFAULT 'fixed' CHECK (type IN ('fixed','rotational'))`.
- Create: `038_ot_records.sql` — `ot_records` table.
- Create: `039_payroll_line_items_overtime.sql` — drop & recreate the category CHECK with `'overtime'`.
- Create: `040_employee_week_off_override.sql` — per-employee override table.
- Create: `041_week_off_policy_alt_saturday.sql` — add `alt_saturday_rule` column.

### Pure helpers (Vitest)
- Modify: `src/lib/attendance/week-off.ts` — v2 `isWeekOff` accepts optional `override` + handles alt-Sat. Export `isAltSaturdayOff(date, rule)`. Keep v1 signature as overload for back-compat.
- Create: `src/lib/attendance/ot.ts` — `computeDailyOvertimeMinutes(workedMinutes, shiftMinutes)`, `computeWeeklyOvertimeMinutes(workedTotalMinutes, weeklyThresholdHours)`, `computeHourlyRate(grossMonthly, workingDays, shiftHours)`.
- Create: `src/lib/attendance/conflict-detection.ts` — `detectAssignmentConflicts(target, existing, weekOff)` returns `Conflict[]` (type: `'double_assigned' | 'week_off' | 'inactive_shift'`).
- Tests: `tests/attendance/ot.test.ts`, `tests/attendance/conflict-detection.test.ts`, `tests/attendance/week-off-v2.test.ts`.

### Server actions
- Modify: `src/actions/shifts.ts`:
  - Add `getRosterGrid(input: { from: string; to: string; employee_ids?: string[] })` — returns `{ employees, days, cells }`.
  - Add `assignShiftToCell(input: { employee_id, shift_id, date, type? })` — single-day assignment shortcut.
  - Add `setAssignmentType(assignmentId, type)` — promote rotational → fixed.
  - Add helper `getManagerScopedEmployeeIds(orgId, managerEmployeeId)` — dept-head model.
  - Modify `assignShiftToEmployees` + `assignShiftToDepartment` to accept the `type` arg.
  - Modify all admin-only mutations to also accept managers (with dept-scope check).
- Modify: `src/actions/week-off.ts`:
  - Add `getEmployeeWeekOffOverride(employeeId)`.
  - Add `upsertEmployeeWeekOffOverride(input: { employee_id, week_type, off_days, effective_from })`.
  - Add `deleteEmployeeWeekOffOverride(employeeId)`.
  - Modify `getWeekOffPolicy` to include `alt_saturday_rule`.
  - Modify `upsertWeekOffPolicy` to accept `alt_saturday_rule`.
- Create: `src/actions/overtime.ts`:
  - `getOvertimeSettings()` / `updateOvertimeSettings(input)` — reads/writes `org.settings.attendance.overtime`.
  - `getOvertimeRecords({ status?, from?, to?, employee_id? })`.
  - `computeAndRecordOvertime({ from, to })` — admin batch.
  - `approveOvertime(recordId)` / `rejectOvertime(recordId, reason)` / `bulkApproveOvertime(recordIds[])`.
  - `pushOvertimeToPayroll(month)` — creates `payroll_line_items` rows. Idempotent.
- Modify: `src/actions/attendance.ts`:
  - Extend `listAttendance` to optionally include shift_id-derived OT preview.

### UI — Roster grid
- Create: `src/components/attendance/roster-grid.tsx` — top-level weekly grid.
- Create: `src/components/attendance/roster-cell.tsx` — droppable cell.
- Create: `src/components/attendance/shift-palette.tsx` — sidebar of draggable shift chips.
- Create: `src/components/attendance/roster-week-nav.tsx` — prev/next week + date picker.

### UI — Overtime
- Create: `src/components/attendance/overtime-tab.tsx` — list + bulk actions.
- Create: `src/components/attendance/overtime-record-row.tsx` — single row with approve/reject.
- Create: `src/components/settings/overtime-card.tsx` — new sub-card in Settings → Attendance.

### UI — Week-off enhancements
- Modify: `src/components/settings/week-off-card.tsx` — add `AltSaturdayPicker` inline.
- Create: `src/components/settings/week-off-override-list.tsx` — admin manages all overrides.
- Create: `src/components/settings/week-off-override-dialog.tsx` — per-employee override editor.

### UI — Tabs + settings wiring
- Modify: `src/components/attendance/attendance-client.tsx` — add Roster + Overtime tabs.
- Modify: `src/components/settings/attendance-section.tsx` — register Overtime card + Week-off Overrides card.
- Modify: `src/app/dashboard/attendance/page.tsx` — fetch roster + overtime + settings + manager scope.
- Modify: `src/app/dashboard/settings/page.tsx` — fetch overtime settings + week-off overrides.

### Assistant integration
- Modify: `src/lib/assistant/route-registry.ts` — add `attendance_roster`, `attendance_overtime`, `settings_overtime`, `settings_week_off_override` entries.
- Create: `src/lib/assistant/help/articles/use_roster_grid.md`.
- Create: `src/lib/assistant/help/articles/configure_overtime.md`.
- Create: `src/lib/assistant/help/articles/approve_overtime.md`.
- Create: `src/lib/assistant/help/articles/push_overtime_to_payroll.md`.
- Create: `src/lib/assistant/help/articles/set_employee_week_off_override.md`.
- Modify: `tests/assistant/help-loader.test.ts` — bump count from 31 → 36.

### Documentation
- Modify: `CLAUDE.md` — Attendance Phase 2 entry under Attendance Module.
- Create: `docs/attendance-phase-2.md` — operator doc.

### Commit convention
Per-task commits, scope-prefixed (`feat(attendance):` / `fix(attendance):` / `chore(attendance):` / `docs(attendance):`). NO `Co-Authored-By` lines.

---

## Task Decomposition

> **Note on size:** This plan has 23 tasks across 3 sub-modules. Subagent-driven execution will run them serially with two-stage review per task. Estimated 3–4 hours of subagent execution end-to-end. Final cross-task review at T23 should catch integration gaps.

---

### MODULE 2A — Roster grid + rotation + manager scope + conflict detection

#### Task 1: Migration `037_shift_assignments_type.sql`

**Files:** Create `supabase/migrations/037_shift_assignments_type.sql`

- [ ] **Step 1: Author**

```sql
-- 037_shift_assignments_type.sql — Attendance Phase 2: distinguish fixed vs
-- rotational (tentative) assignments. Default 'fixed' keeps existing rows valid.
-- Idempotent.

ALTER TABLE public.shift_assignments
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'fixed';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shift_assignments_type_check'
  ) THEN
    ALTER TABLE public.shift_assignments
      ADD CONSTRAINT shift_assignments_type_check
      CHECK (type IN ('fixed', 'rotational'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS shift_assignments_type_idx
  ON public.shift_assignments (org_id, type);

COMMENT ON COLUMN public.shift_assignments.type IS
  'Phase 2: fixed = committed assignment; rotational = tentative placeholder shown in the roster grid as a lighter chip. Drag-to-fix or setAssignmentType promotes to fixed.';
```

- [ ] **Step 2: Apply via `mcp__plugin_supabase_supabase__apply_migration`** (name `037_shift_assignments_type`). Verify column exists + CHECK constraint.
- [ ] **Step 3: Commit** `feat(attendance): add shift_assignments.type column (Phase 2)`

---

#### Task 2: Pure helper `src/lib/attendance/conflict-detection.ts` (TDD)

**Files:**
- Create: `src/lib/attendance/conflict-detection.ts`
- Test: `tests/attendance/conflict-detection.test.ts`

- [ ] **Step 1: Failing tests**

```typescript
import { describe, it, expect } from "vitest";
import {
  detectAssignmentConflicts,
  type Conflict,
  type TargetAssignment,
  type ExistingAssignment,
} from "@/lib/attendance/conflict-detection";

const morning = { id: "s1", name: "Morning", active: true };
const inactive = { id: "s2", name: "Old Shift", active: false };
const weekOff = { week_type: 6 as const, off_days: [0] }; // Sundays off

describe("detectAssignmentConflicts", () => {
  it("returns no conflicts for a clean weekday assignment", () => {
    const target: TargetAssignment = { employee_id: "e1", date: "2026-06-08", shift: morning }; // Monday
    expect(detectAssignmentConflicts(target, [], weekOff)).toEqual([]);
  });

  it("flags double_assigned when an existing assignment overlaps the same date", () => {
    const existing: ExistingAssignment[] = [
      { id: "a1", employee_id: "e1", shift_id: "sX", shift_name: "Evening", date_from: "2026-06-01", date_to: null },
    ];
    const target: TargetAssignment = { employee_id: "e1", date: "2026-06-08", shift: morning };
    const conflicts = detectAssignmentConflicts(target, existing, weekOff);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe("double_assigned");
  });

  it("flags week_off when the date falls on an org week-off day", () => {
    const target: TargetAssignment = { employee_id: "e1", date: "2026-06-07", shift: morning }; // Sunday
    const conflicts = detectAssignmentConflicts(target, [], weekOff);
    expect(conflicts.some((c) => c.type === "week_off")).toBe(true);
  });

  it("flags inactive_shift when the shift is not active", () => {
    const target: TargetAssignment = { employee_id: "e1", date: "2026-06-08", shift: inactive };
    const conflicts = detectAssignmentConflicts(target, [], weekOff);
    expect(conflicts.some((c) => c.type === "inactive_shift")).toBe(true);
  });

  it("accumulates multiple conflicts simultaneously", () => {
    const existing: ExistingAssignment[] = [
      { id: "a1", employee_id: "e1", shift_id: "sX", shift_name: "Evening", date_from: "2026-06-01", date_to: null },
    ];
    const target: TargetAssignment = { employee_id: "e1", date: "2026-06-07", shift: inactive }; // Sun + double + inactive
    const conflicts = detectAssignmentConflicts(target, existing, weekOff);
    expect(conflicts.map((c) => c.type).sort()).toEqual(["double_assigned", "inactive_shift", "week_off"]);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**
- [ ] **Step 3: Implement**

```typescript
// src/lib/attendance/conflict-detection.ts
import { isWeekOff, type WeekOffPolicy } from "./week-off";

export type Conflict = {
  type: "double_assigned" | "week_off" | "inactive_shift";
  message: string;
};

export type TargetAssignment = {
  employee_id: string;
  date: string; // YYYY-MM-DD
  shift: { id: string; name: string; active: boolean };
};

export type ExistingAssignment = {
  id: string;
  employee_id: string;
  shift_id: string;
  shift_name?: string;
  date_from: string;
  date_to: string | null;
};

function dateInRange(date: string, from: string, to: string | null): boolean {
  if (date < from) return false;
  if (to && date > to) return false;
  return true;
}

export function detectAssignmentConflicts(
  target: TargetAssignment,
  existing: ExistingAssignment[],
  weekOff: WeekOffPolicy
): Conflict[] {
  const conflicts: Conflict[] = [];

  if (!target.shift.active) {
    conflicts.push({ type: "inactive_shift", message: `${target.shift.name} is inactive — historical only` });
  }

  const overlaps = existing.filter(
    (e) => e.employee_id === target.employee_id && dateInRange(target.date, e.date_from, e.date_to)
  );
  if (overlaps.length > 0) {
    const names = overlaps.map((o) => o.shift_name ?? "another shift").join(", ");
    conflicts.push({ type: "double_assigned", message: `Already assigned: ${names}` });
  }

  if (isWeekOff(target.date, weekOff)) {
    conflicts.push({ type: "week_off", message: `${target.date} is a week-off day` });
  }

  return conflicts;
}
```

- [ ] **Step 4: Run, verify PASS (5 tests)**
- [ ] **Step 5: Commit** `feat(attendance): conflict-detection helper (TDD)`

---

#### Task 3: `getManagerScopedEmployeeIds` helper + server actions

**Files:** Modify `src/actions/shifts.ts`

- [ ] **Step 1: Add the manager-scope helper (non-exported)**

Place inside `src/actions/shifts.ts` near `requireAdmin`:

```typescript
/**
 * Returns the set of employee IDs a manager can operate on (own department(s)
 * via departments.head_id). Admins see all. Returns null = no scope (e.g.
 * employee role); caller decides whether to allow.
 */
async function getManagerScopedEmployeeIds(orgId: string, managerEmployeeId: string): Promise<string[]> {
  const sb = createAdminSupabase();
  const { data: ownedDepts } = await sb
    .from("departments")
    .select("id")
    .eq("org_id", orgId)
    .eq("head_id", managerEmployeeId);
  const deptIds = (ownedDepts ?? []).map((d: any) => d.id);
  if (deptIds.length === 0) return [];
  const { data: emps } = await sb
    .from("employees")
    .select("id")
    .eq("org_id", orgId)
    .in("department_id", deptIds)
    .neq("status", "terminated");
  return (emps ?? []).map((e: any) => e.id);
}

/** Like requireAdmin but allows managers with explicit dept-scope. */
async function requireAdminOrManager() {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" as const };
  if (!isAdmin(user.role) && user.role !== "manager") {
    return { error: "Insufficient permissions" as const };
  }
  return { user };
}
```

- [ ] **Step 2: Commit** `feat(attendance): manager-scope helper for shift assignment`

---

#### Task 4: `getRosterGrid` + `assignShiftToCell` + `setAssignmentType` server actions

**Files:** Modify `src/actions/shifts.ts`

- [ ] **Step 1: Add types**

```typescript
export type RosterCell = {
  date: string;
  assignment_id: string | null;
  shift_id: string | null;
  shift_name: string | null;
  type: "fixed" | "rotational" | null;
};

export type RosterRow = {
  employee_id: string;
  employee_name: string;
  department: string | null;
  cells: RosterCell[]; // length = days.length
};

export type RosterGrid = {
  days: string[]; // YYYY-MM-DD per col
  rows: RosterRow[];
  shifts: Shift[]; // for the palette
};
```

- [ ] **Step 2: Add `getRosterGrid`**

```typescript
export async function getRosterGrid(input: { from: string; to: string }): Promise<ActionResult<RosterGrid>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role) && user.role !== "manager") {
    return { success: false, error: "Insufficient permissions" };
  }

  const sb = createAdminSupabase();
  const days = enumerateDays(input.from, input.to);

  // Manager scope
  let scopedEmployeeIds: string[] | null = null;
  if (user.role === "manager" && user.employeeId) {
    scopedEmployeeIds = await getManagerScopedEmployeeIds(user.orgId, user.employeeId);
    if (scopedEmployeeIds.length === 0) {
      return { success: true, data: { days, rows: [], shifts: [] } };
    }
  }

  const empQuery = sb
    .from("employees")
    .select("id, first_name, last_name, department_id, departments(name)")
    .eq("org_id", user.orgId)
    .neq("status", "terminated")
    .order("first_name");
  const { data: employees } = scopedEmployeeIds
    ? await empQuery.in("id", scopedEmployeeIds)
    : await empQuery;

  const empIds = (employees ?? []).map((e: any) => e.id);
  if (empIds.length === 0) {
    return { success: true, data: { days, rows: [], shifts: [] } };
  }

  const [{ data: assignments }, { data: shifts }] = await Promise.all([
    sb.from("shift_assignments")
      .select("id, employee_id, shift_id, date_from, date_to, type, shifts(name)")
      .eq("org_id", user.orgId)
      .in("employee_id", empIds)
      .lte("date_from", input.to)
      .or(`date_to.is.null,date_to.gte.${input.from}`),
    sb.from("shifts")
      .select("*")
      .eq("org_id", user.orgId)
      .eq("active", true)
      .order("is_default", { ascending: false }),
  ]);

  const assignByEmp = new Map<string, any[]>();
  for (const a of (assignments ?? []) as any[]) {
    if (!assignByEmp.has(a.employee_id)) assignByEmp.set(a.employee_id, []);
    assignByEmp.get(a.employee_id)!.push(a);
  }

  const rows: RosterRow[] = (employees ?? []).map((emp: any) => {
    const myAssignments = assignByEmp.get(emp.id) ?? [];
    const cells: RosterCell[] = days.map((d) => {
      const hit = myAssignments.find((a) => a.date_from <= d && (!a.date_to || a.date_to >= d));
      return {
        date: d,
        assignment_id: hit?.id ?? null,
        shift_id: hit?.shift_id ?? null,
        shift_name: hit?.shifts?.name ?? null,
        type: (hit?.type as "fixed" | "rotational") ?? null,
      };
    });
    return {
      employee_id: emp.id,
      employee_name: `${emp.first_name} ${emp.last_name}`,
      department: emp.departments?.name ?? null,
      cells,
    };
  });

  return { success: true, data: { days, rows, shifts: (shifts ?? []) as Shift[] } };
}

function enumerateDays(from: string, to: string): string[] {
  const days: string[] = [];
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  for (let d = start; d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}
```

- [ ] **Step 3: Add `assignShiftToCell`**

```typescript
const CellAssignSchema = z.object({
  employee_id: z.string().uuid(),
  shift_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(["fixed", "rotational"]).default("fixed"),
});

export async function assignShiftToCell(input: z.infer<typeof CellAssignSchema>): Promise<ActionResult<{ id: string }>> {
  const guard = await requireAdminOrManager();
  if ("error" in guard) return { success: false, error: guard.error };
  const parsed = CellAssignSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  // Manager scope check
  if (guard.user.role === "manager") {
    const scoped = await getManagerScopedEmployeeIds(guard.user.orgId, guard.user.employeeId!);
    if (!scoped.includes(parsed.data.employee_id)) {
      return { success: false, error: "You can only assign shifts to your team" };
    }
  }

  const sb = createAdminSupabase();
  // Verify shift + employee belong to org
  const [{ data: empOk }, { data: shiftOk }] = await Promise.all([
    sb.from("employees").select("id").eq("org_id", guard.user.orgId).eq("id", parsed.data.employee_id).maybeSingle(),
    sb.from("shifts").select("id").eq("org_id", guard.user.orgId).eq("id", parsed.data.shift_id).maybeSingle(),
  ]);
  if (!empOk) return { success: false, error: "Employee not found in your organisation" };
  if (!shiftOk) return { success: false, error: "Shift not found in your organisation" };

  const { data, error } = await sb
    .from("shift_assignments")
    .insert({
      org_id: guard.user.orgId,
      employee_id: parsed.data.employee_id,
      shift_id: parsed.data.shift_id,
      date_from: parsed.data.date,
      date_to: parsed.data.date, // single-day cell assignment
      type: parsed.data.type,
      assigned_by: guard.user.employeeId,
    } as any)
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/attendance");
  return { success: true, data: { id: (data as { id: string }).id } };
}
```

- [ ] **Step 4: Add `setAssignmentType`**

```typescript
export async function setAssignmentType(assignmentId: string, type: "fixed" | "rotational"): Promise<ActionResult<void>> {
  const guard = await requireAdminOrManager();
  if ("error" in guard) return { success: false, error: guard.error };

  const sb = createAdminSupabase();
  const { data: row } = await sb
    .from("shift_assignments")
    .select("id, org_id, employee_id")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!row || (row as any).org_id !== guard.user.orgId) return { success: false, error: "Assignment not found" };

  if (guard.user.role === "manager") {
    const scoped = await getManagerScopedEmployeeIds(guard.user.orgId, guard.user.employeeId!);
    if (!scoped.includes((row as any).employee_id)) {
      return { success: false, error: "You can only edit your team's assignments" };
    }
  }

  const { error } = await sb.from("shift_assignments").update({ type } as any).eq("id", assignmentId);
  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/attendance");
  return { success: true, data: undefined };
}
```

- [ ] **Step 5: Lint + commit** `feat(attendance): roster server actions (getRosterGrid, assignShiftToCell, setAssignmentType)`

---

#### Task 5: `RosterGrid` + `RosterCell` components (drag-drop)

**Files:**
- Create: `src/components/attendance/roster-grid.tsx`
- Create: `src/components/attendance/roster-cell.tsx`
- Create: `src/components/attendance/shift-palette.tsx`
- Create: `src/components/attendance/roster-week-nav.tsx`

- [ ] **Step 1: Build `shift-palette.tsx`** — sidebar of draggable shift chips. Reuse `useDraggable` from `@dnd-kit/core` (see `src/components/hire/pipeline-client.tsx` for the pattern).

```typescript
"use client";
import { useDraggable } from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import type { Shift } from "@/actions/shifts";

function DraggableShift({ shift }: { shift: Shift }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `shift-${shift.id}`,
    data: { shift },
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-xs cursor-grab active:cursor-grabbing hover:border-primary/50"
    >
      <GripVertical className="h-3 w-3 text-muted-foreground" />
      <span className="font-medium">{shift.name}</span>
      <span className="text-muted-foreground">{shift.start_time}–{shift.end_time}</span>
    </div>
  );
}

export function ShiftPalette({ shifts }: { shifts: Shift[] }) {
  return (
    <div className="space-y-2 p-3 rounded-xl border border-border bg-card">
      <p className="text-xs font-semibold text-muted-foreground">Drag a shift onto a cell</p>
      {shifts.map((s) => <DraggableShift key={s.id} shift={s} />)}
      {shifts.length === 0 && <p className="text-xs text-muted-foreground">No active shifts. Configure them in Settings → Attendance.</p>}
    </div>
  );
}
```

- [ ] **Step 2: Build `roster-cell.tsx`** — droppable cell.

```typescript
"use client";
import { useDroppable } from "@dnd-kit/core";
import type { RosterCell as Cell } from "@/actions/shifts";

interface Props {
  cell: Cell;
  employeeId: string;
  onClickAssignment?: (assignmentId: string) => void;
}

export function RosterCell({ cell, employeeId, onClickAssignment }: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: `cell-${employeeId}-${cell.date}`,
    data: { employee_id: employeeId, date: cell.date },
  });

  const tentative = cell.type === "rotational";
  return (
    <td
      ref={setNodeRef}
      className={`h-12 align-middle text-center text-xs border border-border ${isOver ? "bg-primary/20" : "bg-card"}`}
    >
      {cell.shift_name ? (
        <button
          type="button"
          onClick={() => cell.assignment_id && onClickAssignment?.(cell.assignment_id)}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tentative ? "bg-primary/10 text-primary/70 border border-dashed border-primary/40" : "bg-primary/15 text-primary"}`}
        >
          {cell.shift_name}{tentative && "?"}
        </button>
      ) : (
        <span className="text-muted-foreground/40">—</span>
      )}
    </td>
  );
}
```

- [ ] **Step 3: Build `roster-week-nav.tsx`** — prev/next week + date picker.

```typescript
"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}

export function RosterWeekNav({ from, to, onChange }: Props) {
  function shift(days: number) {
    const newFrom = new Date(`${from}T00:00:00.000Z`);
    newFrom.setUTCDate(newFrom.getUTCDate() + days);
    const newTo = new Date(newFrom);
    newTo.setUTCDate(newTo.getUTCDate() + 6);
    onChange(newFrom.toISOString().slice(0, 10), newTo.toISOString().slice(0, 10));
  }
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="ghost" onClick={() => shift(-7)}><ChevronLeft className="h-4 w-4" /></Button>
      <span className="text-sm font-medium">{from} → {to}</span>
      <Button size="sm" variant="ghost" onClick={() => shift(7)}><ChevronRight className="h-4 w-4" /></Button>
    </div>
  );
}
```

- [ ] **Step 4: Build `roster-grid.tsx`** — the orchestrator with `DndContext`.

```typescript
"use client";
import * as React from "react";
import { DndContext, useSensors, useSensor, PointerSensor, TouchSensor, KeyboardSensor, type DragEndEvent } from "@dnd-kit/core";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { assignShiftToCell, setAssignmentType, type RosterGrid as Grid } from "@/actions/shifts";
import { detectAssignmentConflicts } from "@/lib/attendance/conflict-detection";
import type { WeekOffPolicy } from "@/lib/attendance/week-off";
import { ShiftPalette } from "./shift-palette";
import { RosterCell } from "./roster-cell";
import { RosterWeekNav } from "./roster-week-nav";

interface Props {
  initial: Grid;
  weekOff: WeekOffPolicy | null;
  from: string;
  to: string;
}

export function RosterGrid({ initial, weekOff, from, to }: Props) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor)
  );

  async function handleDragEnd(event: DragEndEvent) {
    if (!event.over) return;
    const shift = (event.active.data.current as any)?.shift;
    const { employee_id, date } = (event.over.data.current as any) ?? {};
    if (!shift || !employee_id || !date) return;
    setBusy(true);

    // Soft-warn for conflicts
    if (weekOff) {
      const existing = initial.rows.find((r) => r.employee_id === employee_id)?.cells.flatMap((c) => c.assignment_id ? [{ id: c.assignment_id, employee_id, shift_id: c.shift_id!, shift_name: c.shift_name ?? "", date_from: c.date, date_to: c.date }] : []) ?? [];
      const conflicts = detectAssignmentConflicts({ employee_id, date, shift }, existing, weekOff);
      conflicts.forEach((c) => toast.warning(c.message));
    }

    const r = await assignShiftToCell({ employee_id, shift_id: shift.id, date, type: "fixed" });
    setBusy(false);
    if (!r.success) { toast.error(r.error); return; }
    toast.success(`${shift.name} assigned`);
    router.refresh();
  }

  async function handleCellClick(assignmentId: string) {
    // For Phase 2, click on a rotational cell to promote to fixed.
    const cell = initial.rows.flatMap((r) => r.cells).find((c) => c.assignment_id === assignmentId);
    if (!cell || cell.type === "fixed") return;
    const r = await setAssignmentType(assignmentId, "fixed");
    if (!r.success) { toast.error(r.error); return; }
    toast.success("Promoted to fixed");
    router.refresh();
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-[280px_1fr] gap-4">
        <ShiftPalette shifts={initial.shifts} />
        <div className="space-y-3">
          <RosterWeekNav from={from} to={to} onChange={(f, t) => router.push(`/dashboard/attendance?tab=roster&from=${f}&to=${t}`)} />
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full border-collapse text-xs">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left px-3 py-2 border-r border-border min-w-[180px]">Employee</th>
                  {initial.days.map((d) => (
                    <th key={d} className="text-center px-2 py-2 border-r border-border min-w-[90px]">
                      <div className="font-medium">{new Date(`${d}T00:00:00.000Z`).toLocaleDateString("en-IN", { weekday: "short" })}</div>
                      <div className="text-[10px] text-muted-foreground">{d.slice(5)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {initial.rows.map((row) => (
                  <tr key={row.employee_id} className="hover:bg-muted/20">
                    <td className="px-3 py-2 border-r border-border align-middle">
                      <div className="font-medium">{row.employee_name}</div>
                      {row.department && <div className="text-[10px] text-muted-foreground">{row.department}</div>}
                    </td>
                    {row.cells.map((c, idx) => (
                      <RosterCell key={`${row.employee_id}-${idx}`} cell={c} employeeId={row.employee_id} onClickAssignment={handleCellClick} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {initial.rows.length === 0 && <p className="text-sm text-muted-foreground">No employees in scope for this week.</p>}
        </div>
      </div>
    </DndContext>
  );
}
```

- [ ] **Step 5: Lint + build check.**
- [ ] **Step 6: Commit** `feat(attendance): roster grid with drag-drop (Phase 2)`

---

#### Task 6: Wire Roster tab into `attendance-client.tsx`

**Files:** Modify `src/components/attendance/attendance-client.tsx`, `src/app/dashboard/attendance/page.tsx`

- [ ] **Step 1: In `page.tsx`, fetch roster grid when `tab=roster`** (or fetch always for manager+).

Add imports:
```typescript
import { getRosterGrid } from "@/actions/shifts";
import { getWeekOffPolicy } from "@/actions/week-off";
```

Compute the week range (Mon → Sun default):
```typescript
function defaultWeekRange(): { from: string; to: string } {
  const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const dayOfWeek = now.getUTCDay() || 7; // 1..7, Sun = 7
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - (dayOfWeek - 1));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { from: monday.toISOString().slice(0, 10), to: sunday.toISOString().slice(0, 10) };
}
```

Fetch (alongside existing fetches):
```typescript
const { from, to } = defaultWeekRange();
const rosterResult = isManager ? await getRosterGrid({ from, to }) : null;
const weekOffResult = await getWeekOffPolicy();
```

Pass into client:
```typescript
roster={rosterResult?.success ? rosterResult.data : null}
weekOff={weekOffResult?.success ? weekOffResult.data : null}
rosterRange={{ from, to }}
```

- [ ] **Step 2: In `attendance-client.tsx`, add a "Roster" tab** between existing "My History" / "Team Today" tabs:

```typescript
// Add to tabs array (only when isManager):
{ label: "Roster", value: "roster" },
```

```typescript
// Render block:
{activeTab === "roster" && isManager && roster && (
  <RosterGrid initial={roster} weekOff={weekOff} from={rosterRange.from} to={rosterRange.to} />
)}
```

Add imports:
```typescript
import { RosterGrid } from "./roster-grid";
import type { RosterGrid as RosterGridData } from "@/actions/shifts";
import type { WeekOffPolicy } from "@/lib/attendance/week-off";
```

Extend Props with `roster`, `weekOff`, `rosterRange`.

- [ ] **Step 3: Build check + commit** `feat(attendance): Roster tab on attendance page`

---

### MODULE 2B — Overtime computation + approval + payroll feed

#### Task 7: Migration `038_ot_records.sql`

```sql
-- 038_ot_records.sql — Attendance Phase 2: overtime records, per (employee, date).
-- Idempotent.

CREATE TABLE IF NOT EXISTS public.ot_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  attendance_record_id UUID REFERENCES public.attendance_records(id) ON DELETE SET NULL,
  shift_id UUID REFERENCES public.shifts(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  ot_minutes INTEGER NOT NULL CHECK (ot_minutes >= 0),
  multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.5 CHECK (multiplier > 0 AND multiplier <= 5),
  threshold_mode TEXT NOT NULL DEFAULT 'per_day' CHECK (threshold_mode IN ('per_day', 'weekly')),
  hourly_rate INTEGER, -- paise; null = unknown (computed at push-to-payroll time)
  amount INTEGER, -- paise; ot_minutes * multiplier * hourly_rate, computed at push time
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','pushed')),
  approved_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejected_reason TEXT,
  payroll_line_item_id UUID REFERENCES public.payroll_line_items(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, date)
);

CREATE INDEX IF NOT EXISTS ot_records_org_status_date_idx
  ON public.ot_records (org_id, status, date DESC);

CREATE INDEX IF NOT EXISTS ot_records_employee_date_idx
  ON public.ot_records (employee_id, date DESC);

ALTER TABLE public.ot_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ot_records_admin_all ON public.ot_records;
CREATE POLICY ot_records_admin_all ON public.ot_records FOR ALL
  USING (
    auth.jwt() ->> 'org_id' = ot_records.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  )
  WITH CHECK (
    auth.jwt() ->> 'org_id' = ot_records.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  );

DROP POLICY IF EXISTS ot_records_self_read ON public.ot_records;
CREATE POLICY ot_records_self_read ON public.ot_records FOR SELECT
  USING (
    auth.jwt() ->> 'org_id' = ot_records.org_id::text
    AND auth.jwt() ->> 'employee_id' = ot_records.employee_id::text
  );
```

Apply + verify + commit `feat(attendance): add ot_records table (Phase 2)`.

---

#### Task 8: Migration `039_payroll_line_items_overtime.sql`

```sql
-- 039_payroll_line_items_overtime.sql — Attendance Phase 2 / Payroll bridge:
-- extend payroll_line_items.category CHECK to include 'overtime'.
-- Idempotent.

ALTER TABLE public.payroll_line_items
  DROP CONSTRAINT IF EXISTS payroll_line_items_category_check;

ALTER TABLE public.payroll_line_items
  ADD CONSTRAINT payroll_line_items_category_check
  CHECK (category IN ('bonus', 'allowance', 'reimbursement', 'other', 'overtime'));
```

Apply + verify + commit `feat(payroll): extend payroll_line_items.category enum with 'overtime'`.

---

#### Task 9: Pure helper `src/lib/attendance/ot.ts` (TDD)

**Files:**
- Create: `src/lib/attendance/ot.ts`
- Test: `tests/attendance/ot.test.ts`

- [ ] **Step 1: Failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { computeDailyOvertimeMinutes, computeWeeklyOvertimeMinutes, computeHourlyRate } from "@/lib/attendance/ot";

describe("computeDailyOvertimeMinutes", () => {
  it("returns 0 when worked <= shift hours", () => {
    expect(computeDailyOvertimeMinutes(420, 480)).toBe(0); // 7h < 8h
    expect(computeDailyOvertimeMinutes(480, 480)).toBe(0);
  });
  it("returns excess minutes when worked > shift hours", () => {
    expect(computeDailyOvertimeMinutes(540, 480)).toBe(60); // 9h - 8h = 1h
  });
  it("handles null/undefined gracefully", () => {
    expect(computeDailyOvertimeMinutes(null, 480)).toBe(0);
    expect(computeDailyOvertimeMinutes(540, null)).toBe(0);
  });
});

describe("computeWeeklyOvertimeMinutes", () => {
  it("returns 0 when weekly total <= threshold", () => {
    expect(computeWeeklyOvertimeMinutes(2400, 48)).toBe(0); // 40h <= 48h
    expect(computeWeeklyOvertimeMinutes(2880, 48)).toBe(0); // exactly 48h
  });
  it("returns excess weekly minutes when above threshold", () => {
    expect(computeWeeklyOvertimeMinutes(3000, 48)).toBe(120); // 50h - 48h = 2h = 120m
  });
});

describe("computeHourlyRate", () => {
  it("paise = (gross_monthly * 100) / (working_days * shift_hours)", () => {
    // ₹40,000 gross, 26 working days, 8h/day → ~₹192.31/h → 19231 paise
    expect(computeHourlyRate(40000, 26, 8)).toBe(19231);
  });
  it("returns 0 if working_days or shift_hours is 0", () => {
    expect(computeHourlyRate(40000, 0, 8)).toBe(0);
    expect(computeHourlyRate(40000, 26, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**
- [ ] **Step 3: Implement**

```typescript
// src/lib/attendance/ot.ts

export function computeDailyOvertimeMinutes(workedMinutes: number | null | undefined, shiftMinutes: number | null | undefined): number {
  if (!workedMinutes || !shiftMinutes) return 0;
  return Math.max(0, workedMinutes - shiftMinutes);
}

export function computeWeeklyOvertimeMinutes(totalWorkedMinutes: number, weeklyThresholdHours: number): number {
  const threshold = weeklyThresholdHours * 60;
  return Math.max(0, totalWorkedMinutes - threshold);
}

/** Returns the hourly rate in paise (integer). */
export function computeHourlyRate(grossMonthlyRupees: number, workingDays: number, shiftHours: number): number {
  if (workingDays <= 0 || shiftHours <= 0) return 0;
  return Math.round((grossMonthlyRupees * 100) / (workingDays * shiftHours));
}
```

- [ ] **Step 4: Run, verify PASS (8 tests)**
- [ ] **Step 5: Commit** `feat(attendance): OT computation helpers (TDD)`

---

#### Task 10: `src/actions/overtime.ts` — full server-action surface

**Files:** Create `src/actions/overtime.ts`

Implements: `getOvertimeSettings`, `updateOvertimeSettings`, `getOvertimeRecords`, `computeAndRecordOvertime`, `approveOvertime`, `rejectOvertime`, `bulkApproveOvertime`, `pushOvertimeToPayroll`.

(Full code provided in plan annotations; structure mirrors `src/actions/payroll.ts` patterns — admin-guarded, Zod-validated, `createAdminSupabase`, `revalidatePath`. See implementer task brief for exact code.)

Key behaviours:
- `getOvertimeSettings` reads `org.settings.attendance.overtime` JSON; defaults to `{ enabled: false, multiplier: 1.5, threshold_mode: 'per_day', weekly_threshold_hours: 48, approval_required: true }`. **OT is OFF by default** — admin must explicitly opt in.
- **MASTER TOGGLE — `enabled: boolean` gates the entire feature:**
  - `computeAndRecordOvertime` MUST early-return `{ success: false, error: "Overtime is disabled for your organisation" }` if `enabled === false`. Check happens AFTER auth, BEFORE any DB writes.
  - `pushOvertimeToPayroll` MUST early-return the same error if `enabled === false`.
  - `approveOvertime` / `rejectOvertime` / `bulkApproveOvertime` can still run even when `enabled === false` (so admins can finish processing already-computed records after disabling — don't strand pending rows). Document this in the action JSDoc.
  - `updateOvertimeSettings` itself is admin-only (no enabled gate — admin must always be able to flip the switch).
- `computeAndRecordOvertime({ from, to })` iterates `attendance_records` in the range with non-null `shift_id`, computes OT per the org's mode, and upserts `ot_records` rows. Skips dates that already have an `ot_records` row (idempotent).
- `pushOvertimeToPayroll(month)` finds all `approved` OT records for employees with a `payroll_entries` row in that month's run. For each: fetch the employee's `salary_structures.gross_monthly` + the run's `working_days` + the OT's `shift_id` → `shifts.total_hours`. Compute `hourly_rate` via `computeHourlyRate`. Compute `amount = ot_minutes / 60 * hourly_rate * multiplier`. Insert `payroll_line_items` row with `category='overtime'`, `amount` in rupees (paise → rupees), `taxable=true`, `note='OT for YYYY-MM-DD'`. Update OT record status to `pushed`, store `payroll_line_item_id`. Then call `recomputeEntryFromLineItems(entryId)`.
- Idempotency on push: skip OT records with `status='pushed'` and non-null `payroll_line_item_id`.
- **Disabling OT does NOT delete `ot_records` rows** — they stay in the DB. Re-enabling resumes from where the org left off. Document in CLAUDE.md.

Commit `feat(overtime): server-action surface for OT settings + records + approval + push-to-payroll`.

---

#### Task 11: Settings → Overtime card

**Files:**
- Create: `src/components/settings/overtime-card.tsx`
- Modify: `src/components/settings/attendance-section.tsx`
- Modify: `src/app/dashboard/settings/page.tsx`

Card fields:
- `enabled: boolean` — master switch
- `multiplier: number` (default 1.5)
- `threshold_mode: 'per_day' | 'weekly'`
- `weekly_threshold_hours: number` (only shown when threshold_mode === 'weekly'; default 48)
- `approval_required: boolean` (default true)

Live "Compute OT for this week" button → `computeAndRecordOvertime({ from, to })` for current week.

Commit `feat(attendance): Overtime settings card + admin compute action`.

---

#### Task 12: Overtime tab on `/dashboard/attendance`

**Files:**
- Create: `src/components/attendance/overtime-tab.tsx`
- Create: `src/components/attendance/overtime-record-row.tsx`
- Modify: `src/components/attendance/attendance-client.tsx` — register tab
- Modify: `src/app/dashboard/attendance/page.tsx` — fetch pending OT

Tab content:
- Filter: Status (pending / approved / rejected / pushed), date range.
- List of OT records (employee, date, shift, OT minutes, multiplier, status).
- Per-row: Approve / Reject (with reason) — admin only.
- Bulk-approve checkbox.
- "Compute OT for [date range]" button — fires `computeAndRecordOvertime`. **Hidden when `enabled === false`.**
- "Push approved OT to payroll for [Month]" — admin only — fires `pushOvertimeToPayroll(month)`. **Hidden when `enabled === false`.**

**Tab visibility gating:**
- The "Overtime" tab itself is HIDDEN on `/dashboard/attendance` when `settings.attendance.overtime.enabled === false`.
- The page-level fetch (`getOvertimeRecords`) is skipped when disabled.
- Surface a one-line banner in Settings → Attendance → Overtime card when disabled, linking the admin to flip it on.

Commit `feat(attendance): Overtime tab with approval + push-to-payroll (gated on settings.enabled)`.

---

### MODULE 2C — Per-employee week-off override + alt-Saturday

#### Task 13: Migration `040_employee_week_off_override.sql`

```sql
-- 040_employee_week_off_override.sql — Attendance Phase 2: per-employee
-- override of org week-off policy. Idempotent.

CREATE TABLE IF NOT EXISTS public.employee_week_off_override (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL UNIQUE REFERENCES public.employees(id) ON DELETE CASCADE,
  week_type SMALLINT NOT NULL CHECK (week_type IN (5, 6)),
  off_days SMALLINT[] NOT NULL DEFAULT ARRAY[0]::SMALLINT[],
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employee_week_off_override_org_idx
  ON public.employee_week_off_override (org_id);

ALTER TABLE public.employee_week_off_override ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_week_off_override_admin_all ON public.employee_week_off_override;
CREATE POLICY employee_week_off_override_admin_all ON public.employee_week_off_override FOR ALL
  USING (
    auth.jwt() ->> 'org_id' = employee_week_off_override.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  )
  WITH CHECK (
    auth.jwt() ->> 'org_id' = employee_week_off_override.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  );

DROP POLICY IF EXISTS employee_week_off_override_self_read ON public.employee_week_off_override;
CREATE POLICY employee_week_off_override_self_read ON public.employee_week_off_override FOR SELECT
  USING (
    auth.jwt() ->> 'org_id' = employee_week_off_override.org_id::text
    AND auth.jwt() ->> 'employee_id' = employee_week_off_override.employee_id::text
  );

DROP TRIGGER IF EXISTS employee_week_off_override_set_updated_at ON public.employee_week_off_override;
CREATE TRIGGER employee_week_off_override_set_updated_at
  BEFORE UPDATE ON public.employee_week_off_override
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

Apply + verify + commit `feat(attendance): employee_week_off_override table (Phase 2)`.

---

#### Task 14: Migration `041_week_off_policy_alt_saturday.sql`

```sql
-- 041_week_off_policy_alt_saturday.sql — Attendance Phase 2: alternate-Saturday
-- support on the org-level week-off policy.
-- Idempotent.

ALTER TABLE public.week_off_policy
  ADD COLUMN IF NOT EXISTS alt_saturday_rule TEXT NOT NULL DEFAULT 'none';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'week_off_policy_alt_saturday_check'
  ) THEN
    ALTER TABLE public.week_off_policy
      ADD CONSTRAINT week_off_policy_alt_saturday_check
      CHECK (alt_saturday_rule IN ('none', 'odd_off', 'even_off'));
  END IF;
END $$;

COMMENT ON COLUMN public.week_off_policy.alt_saturday_rule IS
  'odd_off = 1st + 3rd Saturdays off; even_off = 2nd + 4th Saturdays off; none = no Saturday rule (use off_days directly).';
```

Apply + verify + commit `feat(attendance): alt_saturday_rule column on week_off_policy`.

---

#### Task 15: Helper `src/lib/attendance/week-off.ts` v2 (TDD)

**Files:**
- Modify: `src/lib/attendance/week-off.ts`
- Test: `tests/attendance/week-off-v2.test.ts`

- [ ] **Step 1: Failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { isWeekOff, isAltSaturdayOff, type WeekOffPolicy, type WeekOffOverride } from "@/lib/attendance/week-off";

describe("isAltSaturdayOff", () => {
  // 2026-06-06 = first Saturday of June 2026
  // 2026-06-13 = second Saturday
  // 2026-06-20 = third Saturday
  // 2026-06-27 = fourth Saturday
  it("odd_off → 1st + 3rd Saturdays off", () => {
    expect(isAltSaturdayOff("2026-06-06", "odd_off")).toBe(true);
    expect(isAltSaturdayOff("2026-06-13", "odd_off")).toBe(false);
    expect(isAltSaturdayOff("2026-06-20", "odd_off")).toBe(true);
    expect(isAltSaturdayOff("2026-06-27", "odd_off")).toBe(false);
  });
  it("even_off → 2nd + 4th Saturdays off", () => {
    expect(isAltSaturdayOff("2026-06-06", "even_off")).toBe(false);
    expect(isAltSaturdayOff("2026-06-13", "even_off")).toBe(true);
    expect(isAltSaturdayOff("2026-06-20", "even_off")).toBe(false);
    expect(isAltSaturdayOff("2026-06-27", "even_off")).toBe(true);
  });
  it("none → always false", () => {
    expect(isAltSaturdayOff("2026-06-06", "none")).toBe(false);
  });
  it("non-Saturday dates always return false", () => {
    expect(isAltSaturdayOff("2026-06-08", "odd_off")).toBe(false); // Monday
  });
});

describe("isWeekOff v2 (with override + alt-Sat)", () => {
  const orgPolicy: WeekOffPolicy = { week_type: 6, off_days: [0], alt_saturday_rule: "odd_off" };

  it("uses org policy when no override", () => {
    expect(isWeekOff("2026-06-07", orgPolicy)).toBe(true);  // Sunday
    expect(isWeekOff("2026-06-08", orgPolicy)).toBe(false); // Monday
    expect(isWeekOff("2026-06-06", orgPolicy)).toBe(true);  // 1st Saturday, odd_off
    expect(isWeekOff("2026-06-13", orgPolicy)).toBe(false); // 2nd Saturday
  });

  it("override fully replaces org policy", () => {
    const override: WeekOffOverride = { week_type: 5, off_days: [0, 6], alt_saturday_rule: "none" };
    expect(isWeekOff("2026-06-06", orgPolicy, override)).toBe(true); // Sat off via override
    expect(isWeekOff("2026-06-13", orgPolicy, override)).toBe(true); // Sat off via override
    expect(isWeekOff("2026-06-08", orgPolicy, override)).toBe(false);
  });

  it("v1 signature still works (no override, no alt-Sat)", () => {
    expect(isWeekOff("2026-06-07", { week_type: 6, off_days: [0] })).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify FAIL** (new exports + alt_saturday_rule not in WeekOffPolicy type).
- [ ] **Step 3: Implement**

```typescript
// src/lib/attendance/week-off.ts
export type AltSaturdayRule = "none" | "odd_off" | "even_off";

export type WeekOffPolicy = {
  week_type: 5 | 6;
  off_days: number[];
  alt_saturday_rule?: AltSaturdayRule; // Phase 2 optional
};

export type WeekOffOverride = {
  week_type: 5 | 6;
  off_days: number[];
  alt_saturday_rule?: AltSaturdayRule;
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

export function isAltSaturdayOff(dateStr: string, rule: AltSaturdayRule): boolean {
  if (rule === "none") return false;
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  if (d.getUTCDay() !== 6) return false; // not Saturday
  const dom = d.getUTCDate();
  const nthSaturday = Math.floor((dom - 1) / 7) + 1; // 1, 2, 3, 4, 5
  if (rule === "odd_off") return nthSaturday % 2 === 1;
  if (rule === "even_off") return nthSaturday % 2 === 0;
  return false;
}

export function isWeekOff(dateStr: string, policy: WeekOffPolicy, override?: WeekOffOverride): boolean {
  const effective = override ?? policy;
  const day = new Date(`${dateStr}T00:00:00.000Z`).getUTCDay();
  if (effective.off_days.includes(day)) return true;
  if (effective.alt_saturday_rule && isAltSaturdayOff(dateStr, effective.alt_saturday_rule)) return true;
  return false;
}
```

- [ ] **Step 4: Run, verify PASS (12 tests across this file)**
- [ ] **Step 5: Commit** `feat(attendance): isWeekOff v2 with override + alt-Saturday`

---

#### Task 16: Week-off override server actions

**Files:** Modify `src/actions/week-off.ts`

- Add `getEmployeeWeekOffOverride(employeeId)`, `upsertEmployeeWeekOffOverride(input)`, `deleteEmployeeWeekOffOverride(employeeId)`, `listAllOverrides()`.
- Modify `getWeekOffPolicy` to include `alt_saturday_rule`.
- Modify `upsertWeekOffPolicy` schema to accept `alt_saturday_rule`.

Commit `feat(attendance): week-off override server actions + alt-Sat in upsert`.

---

#### Task 17: Week-off card UI — alt-Saturday picker + override list

**Files:**
- Modify: `src/components/settings/week-off-card.tsx` — add `AltSaturdayPicker` inline (radio: none / 1st + 3rd / 2nd + 4th).
- Create: `src/components/settings/week-off-override-list.tsx` — admin sees all overrides; add/edit/delete dialog.
- Create: `src/components/settings/week-off-override-dialog.tsx` — per-employee override form.
- Modify: `src/components/settings/attendance-section.tsx` — register overrides list card.
- Modify: `src/app/dashboard/settings/page.tsx` — fetch overrides list.

Commit `feat(attendance): week-off card alt-Sat + per-employee overrides UI`.

---

### MODULE 2D — Docs + final review

#### Task 18: Assistant help articles + route-registry

**Files:**
- Create: `src/lib/assistant/help/articles/use_roster_grid.md`
- Create: `src/lib/assistant/help/articles/configure_overtime.md`
- Create: `src/lib/assistant/help/articles/approve_overtime.md`
- Create: `src/lib/assistant/help/articles/push_overtime_to_payroll.md`
- Create: `src/lib/assistant/help/articles/set_employee_week_off_override.md`
- Modify: `src/lib/assistant/route-registry.ts` — add `attendance_roster`, `attendance_overtime`, `settings_overtime`, `settings_week_off_override` entries.
- Modify: `tests/assistant/help-loader.test.ts` — bump count 31 → 36.
- Run `npm run embed:help`.

Commit `docs(assistant): Phase 2 attendance articles + 4 new route keys`.

---

#### Task 19: CLAUDE.md + operator doc

**Files:**
- Modify: `CLAUDE.md` — append Phase 2 entry under Attendance Module section.
- Create: `docs/attendance-phase-2.md` — operator doc.

Phase 2 CLAUDE.md content includes:
- Roster grid weekly view + drag-drop pattern (reuses @dnd-kit from JambaHire).
- `shift_assignments.type` — fixed vs rotational, promote via drag or button.
- `getRosterGrid` shape (days × employees × cells).
- Manager scope = `departments.head_id` (no new employees.manager_id column in Phase 2).
- OT computation = `worked - shift_total` (per_day) or `weekly_total - threshold * 60` (weekly).
- OT approval flow: pending → approved/rejected → pushed (after admin clicks Push-to-payroll).
- `pushOvertimeToPayroll(month)` inserts `payroll_line_items` rows with `category='overtime'`. Uses `recomputeEntryFromLineItems` to refresh entry totals + TDS.
- `ot_records.payroll_line_item_id` is the back-pointer; status `pushed` + non-null FK = already pushed (idempotency guard).
- `employee_week_off_override.employee_id` is UNIQUE — one override per employee. Effective_from is informational only; latest override always wins.
- `alt_saturday_rule`: `none / odd_off (1st + 3rd) / even_off (2nd + 4th)`. Saturday only; doesn't affect other days.
- Soft-warn conflicts: don't block, just toast. Admin can override.

Commit `docs(attendance): Phase 2 — CLAUDE.md + operator doc`.

---

#### Task 20: Final cross-task review

Dispatch a fresh subagent for an end-to-end review, identical to Attendance Phase 1 + Payroll Phase 1 patterns. Check:

- **Data flow correctness** — roster drag → `assignShiftToCell` → `shift_assignments` row → next roster fetch reflects it. OT compute → `ot_records` → admin approves → push → `payroll_line_items` row → `recomputeEntryFromLineItems` → entry totals update.
- **Manager scope** — manager M tries to assign for an employee NOT in their dept → server rejects. Manager M can see + edit own dept; can't see other depts.
- **Conflict detection** — soft warnings fire on overlapping assignments + week-off-clash.
- **Alt-Saturday** — verify with real June 2026 dates.
- **OT idempotency** — pushing twice doesn't double-create line items.
- **Per-employee override precedence** — override fully replaces org policy (not a merge).
- **Cross-tenant guards** — `pushOvertimeToPayroll`, `assignShiftToCell`, etc. all reject foreign IDs.
- **Lint + build + vitest** all green.

Final reviewer should produce a strict report. Fix anything Critical or Important before merge.

---

#### Task 21: Smoke-test playbook (controller-produced after final review)

Standard smoke-test playbook for `test1` org covering:
- Roster grid: drag a shift, see it persist + reflect on attendance page.
- Manager scope: log in as a manager-role user, confirm only own dept shows.
- Rotational: assign rotational, see lighter chip, click to promote.
- Overtime: clock in past shift hours, run "Compute OT this week", approve, push to payroll for the open run, verify `payroll_entries.net_pay` bumped.
- Week-off override: set one employee to 6-day in a 5-day org; verify their roster cell on Saturday is not flagged as week-off.
- Alt-Saturday: switch to 6-day + odd_off; verify week 1 + week 3 Saturdays render as off.

---

## Self-Review Checklist

**Spec coverage (PRD 01 §11 Phase 2):**
- ✅ Rotational rotation UI + roster grid + conflict detection → T1, T2, T4, T5, T6
- ✅ OT computation + approval + payroll feed → T7, T8, T9, T10, T11, T12
- ✅ Per-employee week-off override + alt-Sat → T13, T14, T15, T16, T17

**Out-of-scope check:**
- ❌ No regularization workflow
- ❌ No half-day automation
- ❌ No holiday-shift integration
- ❌ No monthly roster view (weekly only)
- ❌ No `employees.manager_id` column (dept-head model)
- ❌ No cell-to-cell drag (palette → cell only)
- ❌ No auto-push of approved OT (manual button only)

**Placeholder scan:** None — every task has full code or explicit instructions.

**Type consistency:** `Shift`, `RosterGrid`, `WeekOffPolicy`, `WeekOffOverride`, `Conflict`, `OvertimeRecord` defined once each.

**Integration with shipped features:**
- Payroll Phase 1 `payroll_line_items` is the OT destination ✓
- Payroll Phase 1 `recomputeEntryFromLineItems` auto-fires on insert ✓
- Attendance Phase 1 `shift_assignments`, `attendance_records.shift_id`, `week_off_policy` all extended additively ✓

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-07-attendance-phase-2.md`.**

Two execution options:

1. **Subagent-Driven (recommended, matches the two prior phases)** — fresh subagent per task, two-stage review after each, fast iteration.
2. **Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

**Which approach?**
