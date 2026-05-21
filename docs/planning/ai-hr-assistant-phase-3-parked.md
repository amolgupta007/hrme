# AI HR Assistant — Phase 3 (Structured Data Tools) — PARKED

> **Status: PARKED (2026-05-21).** Not being built yet — pick up only when it's a real requirement.
> This doc captures the discovery + design decisions so Phase 3 can start without re-investigating.
> Phases 0–2 are shipped on `main`. Parent plan: `docs/planning/ai-hr-assistant-plan.md` (§2.3 tool schemas, §4.1 role matrix, §6 Phase 3, §6.5 scope toggles).

---

## What Phase 3 is

Read-only "structured data" tools so the assistant can answer questions over live tenant data:
- "How much leave do I have left?" / "Who has unused leave?"
- "Show my team's pending leave requests"
- "Which of my reports are due for a review?"
- "Download my payslip" / "Has payroll run this month?"

Everything **role-scoped**: employee → self only; manager → self + direct team; admin → whole org.
**Read-only forever** (locked decision OQ-9 — no write tools, ever).
Gated per-org behind `assistant_tenant_data_enabled` (already stubbed "coming soon" in Settings → AI Assistant).

---

## Discovery findings (verified 2026-05-21)

### 1. Manager → team relationship — `employees.reporting_manager_id`

- **`employees.reporting_manager_id`** (UUID FK → employees, `001_initial_schema.sql:64`, index `idx_employees_manager:71`) is the single source of truth.
- Reviews (`reviews.ts:139,160`) and objectives (`objectives.ts:143,237`) already assign managers via this column.
- **Caveat — current app is looser than the assistant needs:** leave approvals (`leaves.ts:291`) and `getTeamTodayAttendance` (`attendance.ts:258`) are **role-based org-wide** today — ANY manager can approve/see ANY employee, NOT scoped by `reporting_manager_id`. Phase 3 data tools must introduce *proper* team-scoping (`WHERE reporting_manager_id = me`) regardless of that looser approval behaviour.
- `departments.head_id` exists (`:36,:77`) but is **not** used for access control anywhere today.
- **No "get my reports" helper exists** — Phase 3 must add one (e.g. `getDirectReportIds(employeeId)` → `select id from employees where reporting_manager_id = $1 and status != 'terminated'`).

### 2. Existing read actions (model on these; write fresh scoped query fns for tools)

| Domain | Action | File:line | Current scope |
|---|---|---|---|
| Employees | `listEmployees()` | `employees.ts:62` | org-wide, no role filter |
| Leaves | `requestLeave()` | `leaves.ts:176` | self |
| Leaves | `approveLeave()` | `leaves.ts:285` | role-based, org-wide (not team-scoped) |
| Attendance | `getTeamTodayAttendance()` | `attendance.ts:258` | role-based, org-wide |
| Reviews | `listReviewCycles()` | `reviews.ts:62` | admin |
| Objectives | `listObjectives()` (internal) | `objectives.ts:113` | — |
| Payroll | `getMyCompensation()` | `payroll.ts:180` | **self only** |
| Payroll | `getSalaryStructures()` | `payroll.ts:122` | **admin only** |
| Holidays | (read directly from `holidays`, org-scoped) | `001:243` | org |

> Don't reuse these directly — their scoping semantics differ from the assistant's. Build dedicated parameterized query functions per tool, each enforcing the role matrix below.

### 3. Role helpers (`src/lib/current-user.ts`)

- `getCurrentUser()` → `{ orgId, role, employeeId, assistantTenantDataEnabled?, ... }` (note: `assistantTenantDataEnabled` is NOT yet on UserContext — add it, mirroring `assistantTenantDocsEnabled`).
- `isAdmin(role)` (`:135`), `isManagerOrAbove(role)` (`:142`). No team helper — add one.

### 4. Compensation / PII — lives in `salary_structures` (`018_payroll_schema_capture.sql:57`)

- Sensitive fields: `ctc, basic_monthly, hra_monthly, special_allowance_monthly, gross_monthly, net_monthly, employee_pf_monthly, professional_tax_monthly, tds_monthly`.
- `getMyCompensation` = self path; `getSalaryStructures` = admin path. **Managers cannot see team comp today** — keep it that way (payroll tools are self-only + admin-only; NO manager team payroll).

### 5. Leave balance — `leave_balances` (`001:100`)

- Columns: `total_days, used_days, carried_forward_days` (per employee/policy/year).
- **unused = total_days + carried_forward_days − used_days**. No existing function — compute in the tool.

### 6. Tenure / probation — partial

- `employees.date_of_joining` (DATE, `:57`) + `employment_type` (`:59`) exist.
- **No `probation_end_date` column.** "Probation ending this month" is NOT answerable cleanly. "Joined recently / tenure" IS (via `date_of_joining`).

---

## Tool inventory + role matrix (from parent plan §2.3 / §4.1)

Tool names MUST use underscores, not dots (Anthropic rejects dots — gotcha #63): `data_employees_find`, etc.

| Tool | Input (Zod) | Allowed for | Scope rule |
|---|---|---|---|
| `data_employees_find` | filters {name?, department?, status?, employment_type?, joined_after?/before?}, limit ≤25 | manager+ | manager → direct reports; admin → org. Compensation fields elided. |
| `data_employees_get` | { id } | self/manager-team/admin | employee → self only; manager → own report; admin → any |
| `data_leaves_balance` | { employee_id? } (default self) | self / team / admin | unused = total+carried−used |
| `data_leaves_requests` | filters {status?, employee_id?, my_team?, date range}, limit | self / team / admin | |
| `data_attendance_summary` | { employee_id?, month?, my_team? } | self / team / admin | (fast-follow) |
| `data_reviews_cycle` | { cycle_id? } | self / team / admin | (fast-follow) |
| `data_objectives_list` | { employee_id?, manager_id?, status?, period_label? } | self / team / admin | |
| `data_holidays_upcoming` | { days_ahead? } | anyone | org-scoped |
| `data_payroll_run_status` | { month? } | **admin only** | |
| `data_payroll_my_payslip` | { month? } | **self only** | |
| `data_org_summary` | {} | **admin only** | counts/aggregates |

**Innermost gate** = per-tool role scoping (above). **Outermost gate** = org `assistant_tenant_data_enabled`. Both required.

---

## Open design decisions (to confirm when building — NOT yet decided)

The following were surfaced but deliberately left open since Phase 3 is parked. Recommendations noted; confirm at build time.

1. **Domain scope for v1** — _Recommended:_ core safe set first (employees, leaves, holidays, objectives, org_summary; payroll self+admin only); defer attendance + reviews tools to a fast-follow. (Alternatives: all 8 at once; or leaves+employees+holidays minimal slice.)
2. **Manager team definition** — _Recommended:_ direct reports only (`reporting_manager_id = me`), matching reviews/objectives. (Alternatives: full recursive sub-tree; or + department-head scoping.)
3. **Per-domain sub-toggles vs single master** — _Recommended:_ single `assistant_tenant_data_enabled` master for v1; per-domain sub-toggles (§6.5) deferred. (Role-scoping already protects data per-user.)
4. **Probation/tenure** — _Recommended:_ defer probation queries; support tenure via existing `date_of_joining`; revisit a `probation_end_date` column only if needed.

---

## Hard constraints / risks (must hold when built)

- **Read-only forever** — no write tools (OQ-9). Not negotiable.
- **Tool names underscored** — Anthropic rejects dots (gotcha #63, #66).
- **Cross-tenant tests mandatory** — every tool tested with two orgs; an org-A user must get zero org-B rows. Plus role tests (employee can't pull team/org data; manager can't pull non-report or org aggregates).
- **Compensation redaction** — `data_employees_*` must elide salary fields for non-admins even if a query path returns them.
- **Result caps** — tools return capped rows (≤25) and let the model summarise; avoids token blowups + math-on-huge-sets. Only `data_org_summary` returns aggregates (admin).
- **`match`-style RPCs not needed** — these are parameterized SQL filters, not vector search. No new pgvector work.
- **Reuses**: Voyage/pgvector NOT involved. Reuses `getCurrentUser`, the tool-factory pattern (`makeAppHelpTools`/`makeDocsTools`), chat-route tool-merge gating, and the Settings toggle scaffold.

---

## When we build it — startup checklist

1. Confirm the 4 open decisions above.
2. Add `assistant_tenant_data_enabled` to `UserContext` (`current-user.ts`) + `toggleAssistantTenantData` action + flip the Settings "Your HR data" row from "coming soon" to a real toggle.
3. Add `getDirectReportIds(employeeId)` team helper.
4. Build `src/lib/assistant/tools/data.ts` (`makeDataTools(ctx)`) — one query fn per tool, each enforcing the role matrix + result caps + compensation redaction.
5. Merge into chat route gated on `assistantTenantDataEnabled`; extend system prompt (data-tool instructions + the same `<source>`/no-injection discipline).
6. Citation/▶ UX: render data-row results (table name + row refs, "open the filtered page" deep-links via ROUTE_REGISTRY).
7. Tests: cross-tenant + per-role for every tool (this is the bulk of the work).
8. CLAUDE.md gotchas + Phase 3 section; smoke test; PR.

**Estimated effort when greenlit:** ~7–9 engineer-days for all 8 families; ~4–5 for the core safe set.
