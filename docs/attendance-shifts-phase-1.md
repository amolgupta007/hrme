# Attendance Phase 1 — Shifts + Week-Off (PRD 01)

**Shipped:** 2026-06-07
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
- On first open of Shift Master, auto-seeds a "General" shift from the org's
  existing `standard_workday_hours` value.

## Out of scope (Phase 2+)
- Rotational rotation, roster grid, drag-to-assign.
- OT computation, multiplier config, OT → payroll.
- Per-employee week-off override, alternate-Saturday.
- Half-day automation, regularization workflow, holiday integration.
- Configurable overnight attribution (start-date vs end-date).
- Manager-scoped shift assignment.
- Clocking out next morning for an overnight shift (clockOut still matches today's IST date).

## Migrations (apply in order)
- `029_shifts.sql`
- `030_shift_assignments.sql`
- `031_week_off_policy.sql`
- `032_attendance_records_shift_columns.sql`

## Files
- Schema: `supabase/migrations/029_shifts.sql`, `030_shift_assignments.sql`, `031_week_off_policy.sql`, `032_attendance_records_shift_columns.sql`
- Pure helpers: `src/lib/attendance/shift-time.ts`, `src/lib/attendance/attribute-date.ts`, `src/lib/attendance/week-off.ts`
- Server actions: `src/actions/shifts.ts`, `src/actions/week-off.ts`
- Wired into clock-in: `src/actions/attendance.ts` (`clockIn`)
- Cron: `src/app/api/cron/attendance-auto-clockout/route.ts`
- Settings UI: `src/components/settings/attendance-section.tsx` + 5 sub-cards under `src/components/settings/`
- Attendance page chip: `src/components/attendance/attendance-client.tsx`
- Help articles: `src/lib/assistant/help/articles/{configure_shifts,assign_shift,configure_week_off}.md`
- Route registry: `src/lib/assistant/route-registry.ts` (`settings_attendance` key)
