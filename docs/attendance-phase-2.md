# Attendance Phase 2 — Roster + Overtime + Week-off overrides (PRD 01)

**Shipped:** 2026-06-08
**Scope:** PRD 01 §11 Phase 2. Regularization, half-day automation, holiday integration are Phase 3.

## What managers + admins can do now
1. Drag-assign shifts onto employee × day cells (weekly roster grid).
2. Promote a tentative (rotational) assignment to fixed by clicking the cell.
3. Get soft warnings for double-assigned days, week-off clashes, or inactive shifts.
4. (Admin only) Enable Overtime tracking (off by default) with multiplier + threshold mode.
5. (Admin only) Compute OT records for any date range; approve, reject, or bulk-approve.
6. (Admin only) Push approved OT into a payroll run as `category='overtime'` line items.
7. (Admin only) Set per-employee week-off overrides; configure alternate-Saturday at org level.

## Out of scope (Phase 3)
- Regularization request/approval workflow
- Half-day / short-leave automation
- Holiday calendar integration with shifts
- Monthly roster view
- Reporting-chain `employees.manager_id` column
- Cell-to-cell drag in roster grid
- ISO-week grouping for multi-week weekly-OT compute
- Custom OT cap (e.g. 50h/month/employee)

## Migrations (apply in order)
- `037_shift_assignments_type.sql`
- `038_ot_records.sql`
- `039_payroll_line_items_overtime.sql`
- `040_employee_week_off_override.sql`
- `041_week_off_policy_alt_saturday.sql`

## Manager scope
Manager M owns dept D iff `departments.head_id = M.employee_id`. No new column added.

## Help articles
- `use_roster_grid.md`
- `configure_overtime.md`
- `approve_overtime.md`
- `push_overtime_to_payroll.md`
- `set_employee_week_off_override.md`

## Route registry entries
- `attendance_roster` — Attendance → Roster tab
- `attendance_overtime` — Attendance → Overtime tab
- `settings_overtime` — Settings → Attendance → Overtime card
- `settings_week_off_override` — Settings → Attendance → Week-off overrides

## Key files
- Migrations: `supabase/migrations/037-041_*.sql`
- Pure helpers (Vitest-covered):
  - `src/lib/attendance/conflict-detection.ts`
  - `src/lib/attendance/ot.ts`
  - `src/lib/attendance/week-off.ts` (v2)
- Shared types/constants: `src/lib/attendance/overtime-types.ts`
- Server actions:
  - `src/actions/shifts.ts` (extended: `getRosterGrid`, `assignShiftToCell`, `setAssignmentType`, manager-scope helpers)
  - `src/actions/overtime.ts` (new — full surface)
  - `src/actions/week-off.ts` (extended: alt-Sat + override CRUD)
- Roster grid: `src/components/attendance/{roster-grid, roster-cell, shift-palette, roster-week-nav}.tsx`
- Overtime tab: `src/components/attendance/{overtime-tab, overtime-record-row}.tsx`
- Overtime settings: `src/components/settings/overtime-card.tsx`
- Week-off enhancements: `src/components/settings/{week-off-card (updated), week-off-override-list, week-off-override-dialog}.tsx`
- Wired into: `src/components/attendance/attendance-client.tsx`, `src/app/dashboard/attendance/page.tsx`, `src/components/settings/attendance-section.tsx`, `src/app/dashboard/settings/page.tsx`
- Shared payroll recompute: `src/lib/payroll/recompute-entry.ts` (extracted from `src/actions/payroll.ts` so `overtime.ts` can use it)
