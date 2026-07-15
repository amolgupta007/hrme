# Dual Reporting Managers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** an employee can have up to two reporting managers with permanently equal powers — objectives visibility, review submission, attendance/punch scope, directory display, CSV import, and leave-request routing all honor either manager.

**Architecture:** one nullable `employees.reporting_manager_2_id` column + one shared relationship module (`src/lib/managers.ts`) that every consumer calls; per-module edits are small and mechanical. Spec: `docs/superpowers/specs/2026-07-15-dual-reporting-managers-design.md`.

**Tech Stack:** Next.js 14 server actions, Supabase (service-role), Zod, vitest.

## Spec reconciliation (supersedes spec §3-Objectives first bullet)

Investigation showed `approveObjectives`/`rejectObjectives` are ALREADY org-wide role-gated (`isManagerOrAbove` only — `objectives.ts:375-421`), exactly like leave approvals. The real single-manager bottleneck is visibility: `listPendingApprovals` and `getPendingObjectivesCount` filter `manager_id = me`, so a second manager never sees pending items. Therefore: **widen the list/count queries; leave the approve/reject guards untouched** (tightening them would restrict currently-working behavior, which we explicitly declined for leave). Task 9 adds this note to the spec.

## Global Constraints

- Branch: `feat/dual-reporting-managers` off current `main`. Never `git add -A`; no Co-Authored-By trailers.
- Migration applied to live HRme DB via Supabase MCP `apply_migration` AND checked into `supabase/migrations/`; migration number = next free (expected `101`, VERIFY by listing the dir first).
- `packages/supabase/src/database.types.ts` is regenerated only (`cd apps/web && npm run db:generate`), never hand-edited.
- New pure logic lives in plain modules (never exported from `"use server"` files — CLAUDE.md gotcha #85).
- Web typecheck is advisory (gotcha #3); gates are `npm run lint` + `npm run test` in apps/web (389+ tests must stay green) and CI's turbo typecheck for packages.
- `employee-schema.ts` lives in `packages/shared/src/employees/` (apps/web path is a re-export shim) — edit the shared file; packages are strictly typechecked.
- Existing behavior must not narrow: leave/objective approve guards unchanged; admins' current review abilities unchanged.

---

### Task 1: Migration + regenerated DB types

**Files:**
- Create: `supabase/migrations/101_dual_reporting_managers.sql` (verify 101 is free: `ls supabase/migrations/ | sort -n | tail -3`)
- Modify (generated): `packages/supabase/src/database.types.ts`

**Interfaces:**
- Produces: `employees.reporting_manager_2_id` (uuid, nullable), `reviews.manager_review_submitted_by` (uuid, nullable) — consumed by every later task.

- [ ] **Step 1: Write the migration**

```sql
-- 101_dual_reporting_managers.sql
-- Second reporting manager (equal powers) + review submitted-by audit.
-- Spec: docs/superpowers/specs/2026-07-15-dual-reporting-managers-design.md
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS reporting_manager_2_id uuid NULL REFERENCES employees(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE employees
    ADD CONSTRAINT employees_rm2_not_self
    CHECK (reporting_manager_2_id IS NULL OR reporting_manager_2_id <> id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE employees
    ADD CONSTRAINT employees_rm2_not_duplicate
    CHECK (reporting_manager_2_id IS NULL OR reporting_manager_2_id IS DISTINCT FROM reporting_manager_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_employees_reporting_manager_2 ON employees(reporting_manager_2_id);

ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS manager_review_submitted_by uuid NULL REFERENCES employees(id);
```

- [ ] **Step 2: Apply to live DB via Supabase MCP** (`apply_migration`, project `imjwqktxzahhnfmfbtfc`, name `dual_reporting_managers`). Controller does this if the implementer lacks MCP access — flag in report if skipped.
- [ ] **Step 3: Probe constraints** (MCP `execute_sql`): insert-free check — `UPDATE employees SET reporting_manager_2_id = id WHERE false;` parses; then `SELECT conname FROM pg_constraint WHERE conname LIKE 'employees_rm2%';` → expect both rows.
- [ ] **Step 4: Regenerate types**: `cd apps/web && npm run db:generate`. Expect `reporting_manager_2_id` and `manager_review_submitted_by` in the diff of `packages/supabase/src/database.types.ts`.
- [ ] **Step 5: Commit** — `git add supabase/migrations/101_dual_reporting_managers.sql packages/supabase/src/database.types.ts` → `feat(db): reporting_manager_2_id + manager_review_submitted_by (migration 101)`

### Task 2: `src/lib/managers.ts` relationship module (TDD)

**Files:**
- Create: `apps/web/src/lib/managers.ts`
- Test: `apps/web/tests/employees/managers.test.ts`

**Interfaces:**
- Produces (exact signatures — later tasks import these):
  - `type ManagedEmployee = { reporting_manager_id: string | null; reporting_manager_2_id: string | null }`
  - `managerIdsOf(emp: ManagedEmployee): string[]`
  - `isManagerOfEmployee(actorEmployeeId: string, emp: ManagedEmployee): boolean`
  - `getDirectReportIds(orgId: string, managerEmployeeId: string): Promise<string[]>`

- [ ] **Step 1: Write failing tests**

```ts
// apps/web/tests/employees/managers.test.ts
import { describe, it, expect } from "vitest";
import { managerIdsOf, isManagerOfEmployee } from "@/lib/managers";

describe("managerIdsOf", () => {
  it("returns both managers when set", () => {
    expect(managerIdsOf({ reporting_manager_id: "a", reporting_manager_2_id: "b" })).toEqual(["a", "b"]);
  });
  it("skips null slots", () => {
    expect(managerIdsOf({ reporting_manager_id: null, reporting_manager_2_id: "b" })).toEqual(["b"]);
    expect(managerIdsOf({ reporting_manager_id: "a", reporting_manager_2_id: null })).toEqual(["a"]);
    expect(managerIdsOf({ reporting_manager_id: null, reporting_manager_2_id: null })).toEqual([]);
  });
  it("dedupes (defense in depth vs the DB check)", () => {
    expect(managerIdsOf({ reporting_manager_id: "a", reporting_manager_2_id: "a" })).toEqual(["a"]);
  });
});

describe("isManagerOfEmployee", () => {
  const emp = { reporting_manager_id: "a", reporting_manager_2_id: "b" };
  it("true for either slot", () => {
    expect(isManagerOfEmployee("a", emp)).toBe(true);
    expect(isManagerOfEmployee("b", emp)).toBe(true);
  });
  it("false otherwise", () => {
    expect(isManagerOfEmployee("c", emp)).toBe(false);
    expect(isManagerOfEmployee("a", { reporting_manager_id: null, reporting_manager_2_id: null })).toBe(false);
  });
});
```

- [ ] **Step 2: Run** `cd apps/web && npx vitest run tests/employees/managers.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement**

```ts
// apps/web/src/lib/managers.ts
// Single source of truth for the reporting-manager relationship (up to 2 slots).
// Plain module — NOT "use server" (gotcha #85). Spec:
// docs/superpowers/specs/2026-07-15-dual-reporting-managers-design.md
import { createAdminSupabase } from "@/lib/supabase/server";

export type ManagedEmployee = {
  reporting_manager_id: string | null;
  reporting_manager_2_id: string | null;
};

export function managerIdsOf(emp: ManagedEmployee): string[] {
  const ids = [emp.reporting_manager_id, emp.reporting_manager_2_id].filter(
    (id): id is string => !!id
  );
  return [...new Set(ids)];
}

export function isManagerOfEmployee(actorEmployeeId: string, emp: ManagedEmployee): boolean {
  return managerIdsOf(emp).includes(actorEmployeeId);
}

/** Non-terminated employees reporting to this manager via either slot. Org-scoped. */
export async function getDirectReportIds(
  orgId: string,
  managerEmployeeId: string
): Promise<string[]> {
  const sb = createAdminSupabase();
  const { data } = await sb
    .from("employees")
    .select("id")
    .eq("org_id", orgId)
    .or(`reporting_manager_id.eq.${managerEmployeeId},reporting_manager_2_id.eq.${managerEmployeeId}`)
    .neq("status", "terminated");
  return ((data ?? []) as { id: string }[]).map((e) => e.id);
}
```

- [ ] **Step 4: Run tests** → PASS. Full suite `npm run test` → green.
- [ ] **Step 5: Commit** — `feat: managers.ts dual-slot relationship helpers`

### Task 3: Schema, employee form, add/update actions, CSV import

**Files:**
- Modify: `packages/shared/src/employees/employee-schema.ts:24` (area), `apps/web/src/components/dashboard/employee-form.tsx:225-237`, `apps/web/src/actions/employees.ts` (addEmployee ~:207, updateEmployee ~:304, bulkImportEmployees ~:519,674-676,719 + ImportRow type)
- Test: extend `apps/web/tests/employees/` (existing dir; follow its file naming)

**Interfaces:**
- Consumes: nothing new. Produces: `reportingManager2Id` in the employee zod schema; `reporting_manager_2_email` CSV column.

- [ ] **Step 1: Shared schema** — next to the existing line `reportingManagerId: z.string().uuid().optional().or(z.literal(""))` add:

```ts
    reportingManager2Id: z.string().uuid().optional().or(z.literal("")),
```

- [ ] **Step 2: Form field** — in `employee-form.tsx` directly below the existing "Reporting Manager" `<Field>` block add (and add `reportingManager2Id: employee?.reporting_manager_2_id ?? ""` to the form's initial state where `reportingManagerId` is initialized):

```tsx
            <Field label="Secondary manager (optional)">
              <SelectField
                value={form.reportingManager2Id}
                onValueChange={(v) => set("reportingManager2Id", v)}
                placeholder="No secondary manager"
                options={employees
                  .filter((e) => e.id !== employee?.id && e.id !== form.reportingManagerId)
                  .map((e) => ({ value: e.id, label: `${e.first_name} ${e.last_name}` }))}
              />
            </Field>
```

Also: when the primary select changes to the value currently in `reportingManager2Id`, clear the secondary (`if (v === form.reportingManager2Id) set("reportingManager2Id", "")` inside the primary's onValueChange).

- [ ] **Step 3: addEmployee / updateEmployee payloads** — next to each existing `reporting_manager_id: validated.data.reportingManagerId || null,` line add:

```ts
      reporting_manager_2_id:
        validated.data.reportingManager2Id && validated.data.reportingManager2Id !== validated.data.reportingManagerId
          ? validated.data.reportingManager2Id
          : null,
```

- [ ] **Step 4: CSV import** — `ImportRow` gains `reporting_manager_2_email?: string;`. In the row loop next to the existing `reportingManagerId` resolution add:

```ts
    let reportingManager2Id = row.reporting_manager_2_email
      ? (managerEmailMap.get(row.reporting_manager_2_email.toLowerCase()) ?? null)
      : null;
    if (reportingManager2Id && emailOk && row.reporting_manager_2_email!.toLowerCase() === rowEmail.toLowerCase()) {
      errors.push({ row: rowNum, reason: "reporting_manager_2_email cannot be the employee's own email", data: row });
      continue;
    }
    if (reportingManager2Id && reportingManager2Id === reportingManagerId) reportingManager2Id = null; // silent dedupe
```

and `reporting_manager_2_id: reportingManager2Id,` in the `toInsert.push({...})`. Update the CSV template/column docs where `reporting_manager_email` is documented (grep `reporting_manager_email` under `apps/web/src/components/dashboard/import-client.tsx` and the help article `src/lib/assistant/help/articles/` that mentions the importer — add the new optional column; note in the report if the help article changed so `embed:help` runs post-merge).

- [ ] **Step 5: Tests** — if `apps/web/tests/employees/` has pure-logic tests (e.g. schema), add: schema accepts empty/uuid `reportingManager2Id`; rejects non-uuid. (The CSV branch logic is inside the action — assert the pure parts you can reach; do not build a Supabase mock harness.)
- [ ] **Step 6: Run** `npm run test` + `npm run lint` → green. **Commit** — `feat(employees): secondary reporting manager in form, actions, CSV import`

### Task 4: Objectives visibility for either manager

**Files:**
- Modify: `apps/web/src/actions/objectives.ts` — `listPendingApprovals` (~:125-150) and `getPendingObjectivesCount` (~:487)

**Interfaces:**
- Consumes: `getDirectReportIds` (Task 2). Guards on approve/reject: UNCHANGED (see Spec reconciliation).

- [ ] **Step 1:** In `listPendingApprovals`, replace the single filter `.eq("manager_id", empId)` with a live either-slot union (legacy `manager_id` kept so a manager still sees items snapshotted to them before a reassignment):

```ts
  const reportIds = await getDirectReportIds(ctx.orgId, empId);
  const orClauses = [`manager_id.eq.${empId}`];
  if (reportIds.length > 0) orClauses.push(`employee_id.in.(${reportIds.join(",")})`);
  const { data, error } = await supabase
    .from("objectives")
    .select(OBJ_SELECT)
    .eq("org_id", ctx.orgId)
    .eq("status", "submitted")
    .or(orClauses.join(","))
    .order("submitted_at", { ascending: true });
```

- [ ] **Step 2:** Apply the identical pattern to `getPendingObjectivesCount` (same or-clause, count query).
- [ ] **Step 3:** `npm run test` + `npm run lint` green; manual sanity note in report (no automated coverage exists for objectives — flagged gap, out of scope to build a harness now).
- [ ] **Step 4: Commit** — `feat(objectives): pending approvals visible to both reporting managers`

### Task 5: Reviews — either manager submits; record who

**Files:**
- Modify: `apps/web/src/actions/reviews.ts` (`submitManagerReview` ~:406-431), `apps/web/src/components/reviews/review-dialog.tsx` (~:193-204)

**Interfaces:**
- Consumes: `isManagerOfEmployee` (Task 2), `reviews.manager_review_submitted_by` (Task 1).

- [ ] **Step 1:** Widen the guard. Change the review select to include the reviewee and their manager slots, then:

```ts
  const { data: review } = await supabase
    .from("reviews")
    .select("reviewer_id, goals, employee_id")
    .eq("id", reviewId)
    .eq("org_id", user.orgId)
    .single();
  if (!review) return { success: false, error: "Review not found" };

  let allowed = (review as any).reviewer_id === user.employeeId;
  if (!allowed && user.employeeId) {
    const { data: reviewee } = await supabase
      .from("employees")
      .select("reporting_manager_id, reporting_manager_2_id")
      .eq("id", (review as any).employee_id)
      .eq("org_id", user.orgId)
      .single();
    allowed = !!reviewee && isManagerOfEmployee(user.employeeId, reviewee as any);
  }
  if (!allowed) {
    return { success: false, error: "Only the employee's reporting managers can submit this review" };
  }
```

(Do NOT add an admin bypass — admins who aren't assigned/related cannot submit today; behavior preserved.)

- [ ] **Step 2:** In the same action's update payload add `manager_review_submitted_by: user.employeeId,`.
- [ ] **Step 3:** Display — where the reviews list/dialog data is assembled (follow `reviewer_id` name resolution in `reviews.ts` / `reviews-client.tsx`), resolve `manager_review_submitted_by` to a name and in `review-dialog.tsx` under the title subtitle render, add:

```tsx
              {review.manager_review_submitted_by_name &&
                review.manager_review_submitted_by !== review.reviewer_id && (
                  <p className="text-xs text-muted-foreground">
                    Manager review by {review.manager_review_submitted_by_name}
                  </p>
                )}
```

(Thread the two fields through the review list type the same way `employee_name` already flows; if reviewer names aren't currently resolved anywhere, resolve via the same employees map used for `employee_name`.)

- [ ] **Step 4:** `npm run test` + `npm run lint` green. **Commit** — `feat(reviews): either reporting manager can submit; submitted-by recorded and shown`

### Task 6: Manager scope union (attendance/punches/geo)

**Files:**
- Modify: `apps/web/src/lib/attendance/manager-scope.ts` (whole function shown below)

**Interfaces:**
- Consumes: `getDirectReportIds` (Task 2). All 15 call sites (shifts, attendance-punches, geo-*) inherit automatically — no call-site edits.

- [ ] **Step 1:** Replace the function body:

```ts
export async function getManagerScopedEmployeeIds(
  orgId: string,
  managerEmployeeId: string,
): Promise<string[]> {
  const sb = createAdminSupabase();
  const { data: ownedDepts } = await sb
    .from("departments")
    .select("id")
    .eq("org_id", orgId)
    .eq("head_id", managerEmployeeId);
  const deptIds = (ownedDepts ?? []).map((d: any) => d.id);

  const deptMemberIds: string[] = [];
  if (deptIds.length > 0) {
    const { data: emps } = await sb
      .from("employees")
      .select("id")
      .eq("org_id", orgId)
      .in("department_id", deptIds)
      .neq("status", "terminated");
    deptMemberIds.push(...((emps ?? []) as { id: string }[]).map((e) => e.id));
  }

  // Union with direct reports (either reporting-manager slot) — spec 2026-07-15.
  // Accepted side effect: JambaGeo manager scope broadens identically.
  const reportIds = await getDirectReportIds(orgId, managerEmployeeId);
  return [...new Set([...deptMemberIds, ...reportIds])];
}
```

with the static import added at the top of the file: `import { getDirectReportIds } from "@/lib/managers";`

- [ ] **Step 2:** `npm run test` + `npm run lint` green (geo + attendance suites exist in tests/). **Commit** — `feat(attendance): manager scope = dept-head members ∪ direct reports (both slots)`

### Task 7: Leave request routing

**Files:**
- Create: `apps/web/src/lib/leaves/request-recipients.ts` (pure)
- Modify: `apps/web/src/actions/leaves.ts:217-260` (recipient block)
- Test: `apps/web/tests/employees/leave-recipients.test.ts`

**Interfaces:**
- Produces: `resolveLeaveRecipients(input): string[]` (pure — unit-testable).

- [ ] **Step 1: Failing tests**

```ts
// apps/web/tests/employees/leave-recipients.test.ts
import { describe, it, expect } from "vitest";
import { resolveLeaveRecipients } from "@/lib/leaves/request-recipients";

const admins = [{ id: "ad1", role: "admin", email: "admin@x.com" }];
const mgrs = [
  { id: "m1", role: "manager", email: "m1@x.com" },
  { id: "m2", role: "manager", email: "m2@x.com" },
];
const all = [...admins, ...mgrs];

describe("resolveLeaveRecipients", () => {
  it("routes to managers-of-record plus admins when managers set", () => {
    expect(resolveLeaveRecipients(["m1"], all).sort()).toEqual(["admin@x.com", "m1@x.com"]);
  });
  it("includes both managers", () => {
    expect(resolveLeaveRecipients(["m1", "m2"], all).sort()).toEqual(["admin@x.com", "m1@x.com", "m2@x.com"]);
  });
  it("falls back to everyone when no managers of record", () => {
    expect(resolveLeaveRecipients([], all).sort()).toEqual(["admin@x.com", "m1@x.com", "m2@x.com"]);
  });
  it("drops empty emails and dedupes", () => {
    const withBlank = [...all, { id: "m3", role: "manager", email: null }];
    expect(resolveLeaveRecipients(["m3"], withBlank).sort()).toEqual(["admin@x.com"]);
  });
});
```

- [ ] **Step 2:** Run → FAIL (module not found).
- [ ] **Step 3: Implement**

```ts
// apps/web/src/lib/leaves/request-recipients.ts
// Pure recipient resolution for leave-request emails (spec 2026-07-15):
// managers-of-record + owner/admins when the employee has managers; otherwise
// the historical all-manager blast. Plain module (gotcha #85).
export type LeaveNotifiable = { id: string; role: string; email: string | null };

export function resolveLeaveRecipients(
  managerIdsOfEmployee: string[],
  activeManagerPlus: LeaveNotifiable[]
): string[] {
  const withEmail = activeManagerPlus.filter((p) => !!p.email?.trim());
  const admins = withEmail.filter((p) => p.role === "owner" || p.role === "admin");
  const managersOfRecord = withEmail.filter((p) => managerIdsOfEmployee.includes(p.id));
  const chosen = managerIdsOfEmployee.length > 0 ? [...managersOfRecord, ...admins] : withEmail;
  return [...new Set(chosen.map((p) => p.email!.trim()))];
}
```

- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Wire into `requestLeave`** — change the employee select to include manager slots and the managers query to include `id, role`:

```ts
      supabase
        .from("employees")
        .select("first_name, last_name, reporting_manager_id, reporting_manager_2_id")
        .eq("id", validated.data.employeeId)
        .single(),
      ...
      supabase
        .from("employees")
        .select("id, role, email")
        .eq("org_id", ctx.orgId)
        .in("role", ["owner", "admin", "manager"])
        .eq("status", "active"),
```

then replace the `managerEmails` line with:

```ts
    const managerEmails = resolveLeaveRecipients(
      managerIdsOf(employee as any),
      (managers ?? []) as LeaveNotifiable[]
    );
```

(imports: `resolveLeaveRecipients`, `type LeaveNotifiable` from `@/lib/leaves/request-recipients`; `managerIdsOf` from `@/lib/managers`.)

- [ ] **Step 6:** Full `npm run test` + `npm run lint` green. **Commit** — `feat(leaves): route request emails to managers-of-record + admins (fallback: all managers)`

### Task 8: Directory + org-tree display

**Files:**
- Modify: `apps/web/src/actions/directory.ts` (~:35, :53-72), `apps/web/src/components/directory/directory-client.tsx` (~:184-191), `apps/web/src/components/directory/org-tree.tsx` (buildTree :15-28 untouched; node card ~:218-235)

**Interfaces:**
- Produces: `manager_2_name: string | null` and `reporting_manager_2_id` on `DirectoryEmployee`.

- [ ] **Step 1:** `directory.ts` — add `reporting_manager_2_id` to the select string; next to the existing `manager_name` mapping add:

```ts
    reporting_manager_2_id: e.reporting_manager_2_id,
    manager_2_name: e.reporting_manager_2_id ? (empMap.get(e.reporting_manager_2_id) ?? null) : null,
```

and extend the `DirectoryEmployee` type accordingly.

- [ ] **Step 2:** Directory card — extend the existing "Reports to" block:

```tsx
      {e.manager_name && (
        <div className="pt-2.5 border-t border-border flex items-center gap-2">
          <UserCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Reports to</span>
          <span className="text-xs font-medium truncate">
            {e.manager_name}
            {e.manager_2_name ? ` · also ${e.manager_2_name}` : ""}
          </span>
        </div>
      )}
```

(When only manager 2 is set — primary null — show the block with `e.manager_2_name` alone: adjust the condition to `(e.manager_name || e.manager_2_name)` and render whichever exists.)

- [ ] **Step 3:** Org tree — `buildTree` stays keyed on the primary edge (single-parent tree; employees with ONLY a secondary manager remain roots — acceptable). In the node card, under the name/designation lines add a small badge when `node.manager_2_name` exists:

```tsx
        {node.manager_2_name && (
          <span className="text-[10px] text-muted-foreground truncate">also → {node.manager_2_name}</span>
        )}
```

- [ ] **Step 4: Profile page "Reports to" (spec §4 — new display, none exists today).** In `apps/web/src/actions/profile.ts` `getMyProfile`: after the employee row is loaded, resolve manager names with one extra query and add them to the returned profile (extend `EmployeeProfile` with `manager_name: string | null; manager_2_name: string | null`):

```ts
  const managerIds = [emp.reporting_manager_id, emp.reporting_manager_2_id].filter(Boolean) as string[];
  let managerNames = new Map<string, string>();
  if (managerIds.length > 0) {
    const { data: mgrs } = await supabase
      .from("employees")
      .select("id, first_name, last_name")
      .in("id", managerIds);
    managerNames = new Map(
      ((mgrs ?? []) as any[]).map((m) => [m.id, `${m.first_name} ${m.last_name}`])
    );
  }
  // include in the returned profile object:
  //   manager_name: emp.reporting_manager_id ? managerNames.get(emp.reporting_manager_id) ?? null : null,
  //   manager_2_name: emp.reporting_manager_2_id ? managerNames.get(emp.reporting_manager_2_id) ?? null : null,
```

(`getMyProfile`'s employee select must include both `reporting_manager_id, reporting_manager_2_id` — add them if absent.) In `profile-client.tsx`'s header card, under the role/employment line add:

```tsx
            {(profile.manager_name || profile.manager_2_name) && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Reports to {[profile.manager_name, profile.manager_2_name].filter(Boolean).join(" · ")}
              </p>
            )}
```

- [ ] **Step 5:** `npm run lint` + `npm run test` green. **Commit** — `feat(directory): show secondary manager on cards, org-tree nodes, and profile`

### Task 9: Docs, spec reconciliation, final verification

**Files:**
- Modify: `docs/superpowers/specs/2026-07-15-dual-reporting-managers-design.md` (§3 Objectives), `CLAUDE.md` (short blurb near the RBAC/server-action-guards area)

- [ ] **Step 1:** Spec §3-Objectives: replace the guard bullet with the reconciliation (guards were already org-wide role-gated; lists/count widened instead — mirror this plan's "Spec reconciliation" section).
- [ ] **Step 2:** CLAUDE.md: add 3-4 lines: employees support TWO reporting managers (`reporting_manager_2_id`, migration 101); relationship helpers in `src/lib/managers.ts` — always use them; either manager sees pending objectives + can submit the manager review (`manager_review_submitted_by` audits who); manager scope = dept-head ∪ direct reports; leave request emails route to managers-of-record + admins with all-manager fallback.
- [ ] **Step 3:** Full gates from repo root: `cd apps/web && npm run lint && npm run test` green; `npx turbo typecheck --filter=@jambahr/shared` green (schema change lives there). If any help article was edited in Task 3, note "run `npm run embed:help` on prod post-merge" in the PR body.
- [ ] **Step 4: Commit** — `docs: dual reporting managers — spec reconciliation + CLAUDE.md`

## Manual e2e after merge (Amol + controller, test1 org)

Set a second manager on one employee → verify: pending objective visible to both managers; manager #2 submits a review (shows "Manager review by …"); manager #2 sees the employee in Team Today/punch approvals; leave request email lands only with the two managers + admins (Resend dashboard).
