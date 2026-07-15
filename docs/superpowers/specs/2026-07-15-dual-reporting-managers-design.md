# Dual Reporting Managers — Design

**Date:** 2026-07-15 · **Status:** Approved by Amol (brainstorm session) · **Approach:** A — second column
**Goal:** an employee can have up to two reporting managers with permanently equal powers, so approvals and team oversight never bottleneck on one person.

## Requirements (locked)

- Permanent shared management (matrix-lite), NOT temporary delegation. Cap: exactly 2 managers.
- Equal power for both managers in: **objectives approvals**, **performance reviews** (either completes the single manager review), **attendance/punch approval scope**, **org chart & directory display + CSV import**.
- **Leave:** notification routing only — request emails go to the employee's manager(s) + owners/admins (fallback: today's all-manager blast when no manager set). Approval rights unchanged (`isManagerOrAbove`).

## Current-state facts this design builds on

- `employees.reporting_manager_id` exists; consumed by objectives (`manager_id` snapshot at submission, `objectives.ts:237-278`), reviews (`reviewer_id` assignment, `reviews.ts:139-160`), org tree, employee form, CSV import.
- Leave approvals are org-wide role-gated (`leaves.ts:276,344`), request emails blast every active owner/admin/manager (`leaves.ts:230-236`).
- Manager scope for attendance/punches/JambaGeo = `departments.head_id` via `getManagerScopedEmployeeIds` (`src/lib/attendance/manager-scope.ts`), consumed by `canApprovePunch` (`punch-permissions.ts:18`).

## 1. Data model (one migration, next free number)

- `employees.reporting_manager_2_id uuid NULL REFERENCES employees(id) ON DELETE SET NULL`
  - `CHECK (reporting_manager_2_id IS NULL OR reporting_manager_2_id <> id)`
  - `CHECK (reporting_manager_2_id IS NULL OR reporting_manager_2_id IS DISTINCT FROM reporting_manager_id)`
- `reviews.manager_review_submitted_by uuid NULL REFERENCES employees(id)` — audit of who actually wrote a shared review.
- Idempotent SQL; applied to live DB via Supabase MCP AND checked into `supabase/migrations/`; regenerate types (`npm run db:generate` → packages/supabase).
- No backfill: NULL second slot ≡ current single-manager behavior.

## 2. Authorization helper — single source of truth

New plain module `apps/web/src/lib/managers.ts` (NOT "use server"; unit-tested):

- `managerIdsOf(emp: { reporting_manager_id: string | null; reporting_manager_2_id: string | null }): string[]` — 0–2 ids, deduped.
- `isManagerOfEmployee(actorEmployeeId: string, emp: …): boolean` — pure.
- `getDirectReportIds(supabase, orgId, managerEmployeeId): Promise<string[]>` — one query: `.or(reporting_manager_id.eq.X, reporting_manager_2_id.eq.X)`, `status != terminated`, org-scoped.

No consumer re-implements the relationship. All checks below are **live** (current employees row), not snapshots.

## 3. Module changes

### Objectives
- `approveObjective`/`rejectObjective`: allow when `isAdmin(role)` OR `isManagerOfEmployee(actor, objectiveOwnerRow)` (live). The stored `objectives.manager_id` (snapshot of primary at submission) is retained for display/back-compat; it no longer solely gates approval.
- Manager-facing pending/team objective queries: widen from `manager_id = me` to `employee_id IN getDirectReportIds(me)`; keep admin behavior unchanged.

### Reviews
- `submitManagerReview` guard: `reviewer_id === me` OR `isManagerOfEmployee(me, revieweeRow)` OR admin (match whatever admin behavior exists today — do not narrow it).
- On submit, set `manager_review_submitted_by = actor.employeeId`. Existing "preserve the other side's data" merge semantics (gotcha #36 `normalizeGoalsData`) unchanged.
- `reviewer_id` assignment at cycle creation stays primary-manager (unchanged). UI requirement: the review row/dialog shows the submitter's name when `manager_review_submitted_by` differs from `reviewer_id` (e.g. "Manager review by B"); no other reviewer-display changes.

### Attendance / punch scope
- `getManagerScopedEmployeeIds(orgId, managerId)` returns **union**(department-head members [unchanged], `getDirectReportIds`).
- Downstream inherits automatically: Team Today, roster grid, punch approvals (`canApprovePunch` scopedEmployeeIds), Phase D mobile regularization approvals later.
- **Accepted side effect:** JambaGeo manager scope uses the same helper, so managers also see their direct reports' leads. Consistent "my team" semantics; explicitly accepted.

### Leave (notification routing only)
- `requestLeave` recipients: `managerIdsOf(employee)` resolved to active employees with emails, PLUS all active owner/admins. If the employee has no managers set → current behavior (all active owner/admin/manager).
- `approveLeave`/`rejectLeave` guards unchanged.

## 4. UI & import

- **Employee form** (`employee-form.tsx`): "Secondary manager (optional)" select; options exclude the employee themself and the chosen primary; both saved by `addEmployee`/`updateEmployee` (schema + zod updated).
- **Profile / directory card:** "Reports to A · also B".
- **Org tree** (`org-tree.tsx`): tree stays keyed on the primary edge; secondary shown as a badge/annotation on the node ("also reports to X"). No dual-edge graph.
- **CSV importer:** optional `reporting_manager_2_email` column; resolved/validated exactly like `reporting_manager_email` (same manager-email map); template/docs updated; row error when it matches the employee's own email or duplicates manager 1.
- Employee directory table: no new column (avoid clutter); relationship visible on profile/directory card.

## 5. Non-goals

- N > 2 managers (junction table deferred; mechanical backfill path exists if ever needed).
- Time-bound delegation / out-of-office handoff (composes on top later).
- Restricting leave approval to managers-of-record.
- Dual/averaged manager ratings in reviews.
- Mobile app changes (Phase D plan untouched; PRD-03 approvals inbox will consume `managers.ts` later).
- No RLS work (service-role pattern, CLAUDE.md gotcha #5).

## 6. Testing & integrity

- Unit tests: `managers.ts` (dedupe, null slots, self-exclusion), objective-approval predicate, leave-recipient resolution (managers set vs not), scope-union helper.
- Existing suites green (389+). Assistant help articles mentioning "reporting manager" (employee add/import, objectives, reviews) get a one-line update + `npm run embed:help` on prod after merge if edited.
- Manual e2e on test1 org: set a second manager, verify objective approval + review submit by manager #2, Team Today visibility, leave email recipients (Resend dashboard).

## 7. Rollout

Single feature branch/PR (schema + code together). Migration is additive; deploy order irrelevant. Existing orgs see zero behavior change until a second manager is set — except leave-email routing, which tightens immediately for employees who already have a (primary) manager; flagged in the PR description as intended.
