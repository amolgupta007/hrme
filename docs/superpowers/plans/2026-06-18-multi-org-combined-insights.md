# Multi-Org Combined Insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an owner/admin who belongs to multiple orgs roll up Insights analytics across the orgs they own/admin — combined headline totals **plus** a per-org breakdown — while every other module stays single-tenant.

**Architecture:** Approach A — parameterize the 7 existing Insights server actions with a server-validated `orgIds[]`. A single pure resolver (`resolveScopedOrgIds`) intersects the client's requested org IDs with the caller's owner/admin "eligible set" (never trusting client input). Each action queries `.in("org_id", ids)` and returns the existing combined fields (computed from raw rows) plus a new `byOrg` breakdown. A URL-driven multi-select (`?orgs=`) in the Insights nav drives the selection; default is the active org only.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (service-role admin client), Recharts, Vitest. Reuses `getMyOrgs()` from the just-merged Clerk-org-decoupling work.

## Global Constraints

- **Insights stays owner/admin + `analytics` feature only.** The **active org** must have `analytics` to reach `/insights` at all — unchanged. Combined pulls in other owner/admin orgs regardless of THEIR plan.
- **Never trust client org IDs.** Every requested org ID must be intersected with the caller's owner/admin memberships server-side (mirrors `switchActiveOrg`).
- **Default scope = active org only.** No `?orgs` param → today's single-org behavior, byte-for-byte. Combining is opt-in.
- **Scope control renders only when the eligible set ≥ 2 orgs.**
- **Combined rates/medians are computed from raw rows**, never averaged from per-org pre-totals.
- **Insights-only.** Do not touch any non-insights module.
- TypeScript strict; `typescript.ignoreBuildErrors` is on, so `npm run build` "✓ Compiled successfully" is the build signal (a later Windows worker OOM after that line is environmental — retry once).
- Tests: `npx vitest run`. Build: `npm run build`.

---

## File Structure

**New:**
- `src/lib/insights/org-scope.ts` — pure `resolveScopedOrgIds()` (security core) + `EligibleOrg` type.
- `tests/insights/org-scope.test.ts` — resolver unit tests.
- `src/lib/insights/by-org.ts` — `groupByOrg()` helper + `ByOrg<T>` / `ExcludedOrg` types.
- `tests/insights/by-org.test.ts` — grouping helper unit tests.
- `src/components/insights/org-scope-select.tsx` — client multi-select that drives `?orgs=`.
- `src/components/insights/per-org-split.tsx` — compact per-org chip row under a KPI.

**Modified:**
- `src/actions/insights.ts` — `requireInsightsAccess(orgIds?)` + all 7 actions parameterized.
- `src/app/insights/layout.tsx` — fetch eligible orgs, pass to nav.
- `src/components/insights/insights-nav.tsx` — accept + render the scope select.
- `src/components/insights/charts.tsx` — `MultiTrendLine` (one line per org).
- `src/app/insights/page.tsx`, `workforce/`, `leave/`, `payroll/`, `hiring/`, `performance/page.tsx` — read `searchParams.orgs`, pass to action, render `byOrg` / `excludedOrgs`.

---

## Task 1: Pure org-scope resolver (security core)

**Files:**
- Create: `src/lib/insights/org-scope.ts`
- Test: `tests/insights/org-scope.test.ts`

**Interfaces:**
- Produces: `type EligibleOrg = { id: string; name: string }`; `resolveScopedOrgIds(eligible: EligibleOrg[], requested: string[] | null | undefined, activeOrgId: string): { orgIds: string[]; orgs: EligibleOrg[] }`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/insights/org-scope.test.ts
import { describe, it, expect } from "vitest";
import { resolveScopedOrgIds } from "@/lib/insights/org-scope";

const ELIGIBLE = [
  { id: "a", name: "Acme" },
  { id: "b", name: "Beta" },
];

describe("resolveScopedOrgIds", () => {
  it("defaults to the active org only when no orgs requested", () => {
    const r = resolveScopedOrgIds(ELIGIBLE, null, "a");
    expect(r.orgIds).toEqual(["a"]);
    expect(r.orgs).toEqual([{ id: "a", name: "Acme" }]);
  });

  it("keeps only requested ids that are in the eligible set", () => {
    const r = resolveScopedOrgIds(ELIGIBLE, ["a", "b"], "a");
    expect(r.orgIds).toEqual(["a", "b"]);
  });

  it("silently drops requested ids that are NOT eligible (tamper guard)", () => {
    const r = resolveScopedOrgIds(ELIGIBLE, ["a", "evil"], "a");
    expect(r.orgIds).toEqual(["a"]);
  });

  it("falls back to the active org when the request filters to empty", () => {
    const r = resolveScopedOrgIds(ELIGIBLE, ["evil"], "a");
    expect(r.orgIds).toEqual(["a"]);
  });

  it("dedupes and preserves eligible-set order", () => {
    const r = resolveScopedOrgIds(ELIGIBLE, ["b", "a", "b"], "a");
    expect(r.orgIds).toEqual(["a", "b"]);
  });

  it("returns empty when activeOrgId is not eligible and nothing valid requested", () => {
    const r = resolveScopedOrgIds([], ["x"], "a");
    expect(r.orgIds).toEqual([]);
    expect(r.orgs).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/insights/org-scope.test.ts`
Expected: FAIL — `resolveScopedOrgIds` is not defined.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/insights/org-scope.ts
export type EligibleOrg = { id: string; name: string };

/**
 * Resolve the set of org ids an Insights query may span.
 *
 * `eligible` is the caller's owner/admin org list (authority). `requested` is
 * the client-supplied selection (untrusted). We keep only requested ids that
 * appear in `eligible`, in eligible-set order, deduped. If the request is
 * absent or filters to empty, fall back to the active org. The active org is
 * only honored if it is itself eligible.
 */
export function resolveScopedOrgIds(
  eligible: EligibleOrg[],
  requested: string[] | null | undefined,
  activeOrgId: string
): { orgIds: string[]; orgs: EligibleOrg[] } {
  const byId = new Map(eligible.map((o) => [o.id, o]));

  let ids: string[];
  if (requested && requested.length > 0) {
    const wanted = new Set(requested);
    ids = eligible.map((o) => o.id).filter((id) => wanted.has(id));
  } else {
    ids = [];
  }

  if (ids.length === 0) {
    ids = byId.has(activeOrgId) ? [activeOrgId] : [];
  }

  return { orgIds: ids, orgs: ids.map((id) => byId.get(id)!).filter(Boolean) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/insights/org-scope.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/insights/org-scope.ts tests/insights/org-scope.test.ts
git commit -m "feat(insights): pure org-scope resolver (owner/admin authority, tamper-guarded)"
```

---

## Task 2: Extend `requireInsightsAccess` with validated `orgIds`

**Files:**
- Modify: `src/actions/insights.ts` (the `requireInsightsAccess` helper, ~line 162)

**Interfaces:**
- Consumes: `resolveScopedOrgIds`, `EligibleOrg` (Task 1); `getMyOrgs` from `@/actions/active-org`.
- Produces: `requireInsightsAccess(requestedOrgIds?: string[])` now returns, on success, `{ ok: true; user; orgIds: string[]; orgs: EligibleOrg[] }`. `orgIds` is the validated working set; `orgs` is the label map.

- [ ] **Step 1: Add imports at the top of `src/actions/insights.ts`**

Add to the existing import block:

```typescript
import { getMyOrgs } from "@/actions/active-org";
import { resolveScopedOrgIds } from "@/lib/insights/org-scope";
```

- [ ] **Step 2: Replace the `requireInsightsAccess` function**

Replace the existing helper (the one returning `{ ok, user }`) with:

```typescript
async function requireInsightsAccess(requestedOrgIds?: string[]) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { ok: false as const, error: "Unauthorized" };
  if (!hasFeature(user.plan ?? "starter", "analytics", user.customFeatures ?? null)) {
    return { ok: false as const, error: "Insights requires the Business plan" };
  }
  // Eligible set = orgs the caller owns or admins. Active org always included
  // (it licensed entry); other owner/admin orgs may be combined in.
  const memberships = await getMyOrgs();
  const eligible = memberships
    .filter((m) => m.role === "owner" || m.role === "admin")
    .map((m) => ({ id: m.orgId, name: m.name }));
  // Guarantee the active org is in the eligible map even if a role row lagged.
  if (!eligible.some((o) => o.id === user.orgId)) {
    eligible.unshift({ id: user.orgId, name: user.orgName });
  }
  const { orgIds, orgs } = resolveScopedOrgIds(eligible, requestedOrgIds, user.orgId);
  return { ok: true as const, user, orgIds, orgs };
}
```

- [ ] **Step 3: Verify the suite still passes (no action wired yet)**

Run: `npx vitest run`
Expected: PASS (215 + 6 from Task 1 = 221).

- [ ] **Step 4: Commit**

```bash
git add src/actions/insights.ts
git commit -m "feat(insights): requireInsightsAccess resolves a validated multi-org scope"
```

---

## Task 3: `groupByOrg` aggregation helper

**Files:**
- Create: `src/lib/insights/by-org.ts`
- Test: `tests/insights/by-org.test.ts`

**Interfaces:**
- Produces:
  - `type ByOrg<T> = ({ orgId: string; orgName: string } & T)[]`
  - `type ExcludedOrg = { orgName: string; reason: string }`
  - `groupByOrg<Row, T>(rows: Row[], orgs: { id: string; name: string }[], getOrgId: (r: Row) => string, build: (rowsForOrg: Row[]) => T): ByOrg<T>` — runs `build` once per org over that org's rows, returning a per-org array in `orgs` order (orgs with no rows still get an entry, built from `[]`).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/insights/by-org.test.ts
import { describe, it, expect } from "vitest";
import { groupByOrg } from "@/lib/insights/by-org";

type Row = { org_id: string; n: number };
const ORGS = [
  { id: "a", name: "Acme" },
  { id: "b", name: "Beta" },
];

describe("groupByOrg", () => {
  it("runs the builder once per org over that org's rows, in orgs order", () => {
    const rows: Row[] = [
      { org_id: "a", n: 1 },
      { org_id: "b", n: 10 },
      { org_id: "a", n: 2 },
    ];
    const out = groupByOrg(rows, ORGS, (r) => r.org_id, (rs) => ({
      sum: rs.reduce((s, r) => s + r.n, 0),
    }));
    expect(out).toEqual([
      { orgId: "a", orgName: "Acme", sum: 3 },
      { orgId: "b", orgName: "Beta", sum: 10 },
    ]);
  });

  it("includes orgs with zero rows (builder gets an empty array)", () => {
    const out = groupByOrg([] as Row[], ORGS, (r) => r.org_id, (rs) => ({ count: rs.length }));
    expect(out).toEqual([
      { orgId: "a", orgName: "Acme", count: 0 },
      { orgId: "b", orgName: "Beta", count: 0 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/insights/by-org.test.ts`
Expected: FAIL — `groupByOrg` not defined.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/insights/by-org.ts
export type ByOrg<T> = ({ orgId: string; orgName: string } & T)[];
export type ExcludedOrg = { orgName: string; reason: string };

export function groupByOrg<Row, T extends object>(
  rows: Row[],
  orgs: { id: string; name: string }[],
  getOrgId: (r: Row) => string,
  build: (rowsForOrg: Row[]) => T
): ByOrg<T> {
  const byOrg = new Map<string, Row[]>();
  for (const o of orgs) byOrg.set(o.id, []);
  for (const r of rows) {
    const id = getOrgId(r);
    if (byOrg.has(id)) byOrg.get(id)!.push(r);
  }
  return orgs.map((o) => ({
    orgId: o.id,
    orgName: o.name,
    ...build(byOrg.get(o.id) ?? []),
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/insights/by-org.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/insights/by-org.ts tests/insights/by-org.test.ts
git commit -m "feat(insights): groupByOrg per-org aggregation helper"
```

---

## Task 4: Workforce action → multi-org (worked pattern)

**Files:**
- Modify: `src/actions/insights.ts` (`getWorkforceInsights`, ~line 1226; and the `WorkforceInsights` type)

**Interfaces:**
- Consumes: `requireInsightsAccess(orgIds)` (Task 2), `groupByOrg`, `ByOrg` (Task 3).
- Produces: `getWorkforceInsights(orgIds?: string[])`. `WorkforceInsights` gains `byOrg: ByOrg<{ active: number; attritionRatePct: number; avgTenureYears: number }>`.

> This is the reference transformation. Every other action task (5–9) follows the same four moves: (a) accept `orgIds?`, (b) `requireInsightsAccess(orgIds)` → `.in("org_id", access.orgIds)` with `org_id` selected, (c) keep the existing combined aggregation over ALL rows, (d) add a `byOrg` via `groupByOrg`.

- [ ] **Step 1: Extend the `WorkforceInsights` type**

Find the `WorkforceInsights` type/interface in `src/actions/insights.ts` and add a `byOrg` field to it:

```typescript
// inside WorkforceInsights:
  byOrg: import("@/lib/insights/by-org").ByOrg<{
    active: number;
    attritionRatePct: number;
    avgTenureYears: number;
  }>;
```

(If the file prefers top-level imports, add `import type { ByOrg } from "@/lib/insights/by-org";` to the import block and use `ByOrg<{...}>` directly.)

- [ ] **Step 2: Rewrite `getWorkforceInsights` to accept and scope by `orgIds`**

```typescript
export async function getWorkforceInsights(
  orgIds?: string[]
): Promise<ActionResult<WorkforceInsights>> {
  const access = await requireInsightsAccess(orgIds);
  if (!access.ok) return { success: false, error: access.error };
  const supabase = createAdminSupabase();
  const ids = access.orgIds;

  const [employeesResult, departmentsResult] = await Promise.all([
    supabase
      .from("employees")
      .select("id, org_id, date_of_joining, status, department_id, employment_type, updated_at")
      .in("org_id", ids),
    supabase.from("departments").select("id, name").in("org_id", ids),
  ]);

  const employees = (employeesResult.data ?? []) as (EmployeeRow & { org_id: string })[];
  const active = employees.filter((e) => e.status !== "terminated");
  const { headcountTrend, joinersLeavers, joiners12m, leavers12m, attritionRatePct, attritionTrend } =
    buildWorkforceSeries(employees);

  // ... KEEP the existing deptDistribution / typeSplit / tenureBuckets / avgTenureYears
  //     blocks verbatim — they already operate over `active` (now the combined set).

  const byOrg = groupByOrg(employees, access.orgs, (e) => e.org_id, (rows) => {
    const a = rows.filter((e) => e.status !== "terminated");
    const s = buildWorkforceSeries(rows);
    // avg tenure for this org's active employees
    const now = Date.now();
    let sum = 0, n = 0;
    for (const e of a) {
      if (!e.date_of_joining) continue;
      const yrs = (now - new Date(e.date_of_joining).getTime()) / (365.25 * 24 * 3600 * 1000);
      if (yrs < 0) continue;
      sum += yrs; n += 1;
    }
    return {
      active: a.length,
      attritionRatePct: s.attritionRatePct,
      avgTenureYears: n > 0 ? Math.round((sum / n) * 10) / 10 : 0,
    };
  });

  return {
    success: true,
    data: {
      totals: { active: active.length, joiners12m, leavers12m, attritionRatePct, avgTenureYears },
      headcountTrend, deptDistribution, typeSplit, joinersLeavers, attritionTrend, tenureBuckets,
      byOrg,
    },
  };
}
```

Add `import { groupByOrg } from "@/lib/insights/by-org";` to the imports if not already present.

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add src/actions/insights.ts
git commit -m "feat(insights): workforce insights support multi-org scope + byOrg breakdown"
```

---

## Task 5: Overview action → multi-org

**Files:**
- Modify: `src/actions/insights.ts` (`getOverviewInsights`, ~line 174; `OverviewInsights` type)

**Interfaces:**
- Produces: `getOverviewInsights(orgIds?: string[])`; `OverviewInsights` gains `byOrg: ByOrg<{ headcount: number; attritionRatePct: number; monthlyCostInr: number; pendingLeaves: number }>` (use the fields already computed per the overview KPIs; match their exact names/types as defined in the existing `OverviewInsights`).

- [ ] **Step 1: Accept `orgIds`, scope every query**

Apply the four moves from Task 4:
- Change the signature to `getOverviewInsights(orgIds?: string[])`.
- `const access = await requireInsightsAccess(orgIds); ... const ids = access.orgIds;`
- In the `Promise.all`, change every `.eq("org_id", orgId)` to `.in("org_id", ids)` and add `org_id` to each `select(...)` that feeds the byOrg KPIs (employees, leave_requests, payroll_entries, etc.).
- Keep all existing combined aggregation verbatim (it now spans the set).

- [ ] **Step 2: Build the `byOrg` breakdown**

After the combined fields are computed, add a `byOrg` that recomputes the overview headline KPIs per org. Use `groupByOrg` over the employees rows for headcount/attrition, and per-org filters for cost/pending-leaves. Example for the headcount/attrition portion:

```typescript
const byOrg = groupByOrg(employees, access.orgs, (e) => e.org_id, (rows) => {
  const s = buildWorkforceSeries(rows);
  return {
    headcount: rows.filter((e) => e.status !== "terminated").length,
    attritionRatePct: s.attritionRatePct,
    monthlyCostInr: costByOrg.get(/* this org id via closure */ "") ?? 0, // replace per note below
    pendingLeaves: pendingByOrg.get("") ?? 0,
  };
});
```

Because `groupByOrg`'s builder only receives that org's *employee* rows, precompute per-org maps for the non-employee metrics first:

```typescript
const costByOrg = new Map<string, number>();
for (const r of (payrollRows ?? [])) costByOrg.set(r.org_id, (costByOrg.get(r.org_id) ?? 0) + (r.net_pay ?? 0));
const pendingByOrg = new Map<string, number>();
for (const r of (leaveRows ?? [])) if (r.status === "pending") pendingByOrg.set(r.org_id, (pendingByOrg.get(r.org_id) ?? 0) + 1);
```

then in the builder reference `costByOrg.get(/* orgId */)`. To get the orgId inside the builder, switch that builder to read it from the first row OR build `byOrg` by mapping `access.orgs` directly instead of `groupByOrg` for Overview:

```typescript
const byOrg = access.orgs.map((o) => {
  const rows = employees.filter((e) => e.org_id === o.id);
  const s = buildWorkforceSeries(rows);
  return {
    orgId: o.id, orgName: o.name,
    headcount: rows.filter((e) => e.status !== "terminated").length,
    attritionRatePct: s.attritionRatePct,
    monthlyCostInr: costByOrg.get(o.id) ?? 0,
    pendingLeaves: pendingByOrg.get(o.id) ?? 0,
  };
});
```

(Use whichever of `monthlyCostInr` / `pendingLeaves` the existing Overview KPIs actually expose; match their names.)

- [ ] **Step 3: Build verify**

Run: `npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add src/actions/insights.ts
git commit -m "feat(insights): overview insights support multi-org scope + byOrg"
```

---

## Task 6: Leave & Attendance action → multi-org (+ per-org RPC loop)

**Files:**
- Modify: `src/actions/insights.ts` (`getLeaveAttendanceInsights`, ~line 410; its return type)

**Interfaces:**
- Produces: `getLeaveAttendanceInsights(orgIds?: string[])`; gains `byOrg` (leave totals per org) and, for the attendance section, an `excludedOrgs: ExcludedOrg[]` for selected orgs without `attendance_enabled`.

- [ ] **Step 1: Scope leave queries; accept `orgIds`**

- Signature `getLeaveAttendanceInsights(orgIds?: string[])`, `requireInsightsAccess(orgIds)`, `const ids = access.orgIds`.
- Every leave/holiday query `.eq("org_id", orgId)` → `.in("org_id", ids)`, selecting `org_id`.

- [ ] **Step 2: Loop the attendance RPC per org and merge**

The attendance RPC is per-org. Determine which selected orgs have attendance enabled, call the RPC for each, merge by month, and keep per-org series. Replace the single `supabase.rpc("insights_attendance_monthly", { p_org_id: orgId, ... })` call with:

```typescript
// orgs with attendance on (read settings flag the same way the rest of the
// codebase does — organizations.settings.attendance_enabled):
const { data: orgRows } = await supabase
  .from("organizations")
  .select("id, name, settings")
  .in("id", ids);
const attnOrgs = (orgRows ?? []).filter(
  (o: any) => o.settings?.attendance_enabled === true
);
const excludedOrgs: ExcludedOrg[] = (orgRows ?? [])
  .filter((o: any) => o.settings?.attendance_enabled !== true)
  .map((o: any) => ({ orgName: o.name, reason: "attendance not enabled" }));

const rpcResults = await Promise.all(
  attnOrgs.map((o: any) =>
    supabase
      .rpc("insights_attendance_monthly", { p_org_id: o.id, p_from: from, p_to: to })
      .then((res) => ({ orgId: o.id, orgName: o.name, rows: (res.data ?? []) as AttnMonthRow[] }))
  )
);

// Combined monthly buckets = sum across orgs per month label:
const monthMap = new Map<string, number>();
for (const r of rpcResults) for (const m of r.rows) {
  monthMap.set(m.month, (monthMap.get(m.month) ?? 0) + Number(m.avg_present ?? m.total ?? 0));
}
// Build the existing combined attendance series shape from monthMap, and keep
// rpcResults as the per-org attendance series for the breakdown.
```

(Match `AttnMonthRow` and the exact RPC output columns to migration 059's `insights_attendance_monthly` return. If the migration isn't applied, the existing "run migration 059" provision hint logic still applies — keep it, now per the `attnOrgs` set.)

- [ ] **Step 3: Add the leave `byOrg` + return `excludedOrgs`**

```typescript
const byOrg = groupByOrg(leaveRows, access.orgs, (r) => r.org_id, (rows) => ({
  totalRequests: rows.length,
  approved: rows.filter((r) => r.status === "approved").length,
  daysTaken: rows.filter((r) => r.status === "approved").reduce((s, r) => s + (r.days ?? 0), 0),
}));
// add `byOrg` and `attendance: { ..., excludedOrgs }` to the returned data object.
```

- [ ] **Step 4: Build verify**

Run: `npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 5: Commit**

```bash
git add src/actions/insights.ts
git commit -m "feat(insights): leave & attendance multi-org (per-org RPC merge + excluded orgs)"
```

---

## Task 7: Payroll action → multi-org (+ module gating)

**Files:**
- Modify: `src/actions/insights.ts` (`getPayrollInsights`, ~line 623; return type)

**Interfaces:**
- Produces: `getPayrollInsights(orgIds?: string[])`; returns `data: PayrollInsights | null` and, when `data` is non-null, `byOrg` + `excludedOrgs: ExcludedOrg[]`.

- [ ] **Step 1: Restrict to selected orgs that have the payroll feature**

Payroll requires the `payroll` feature. Determine which selected orgs qualify (read each org's plan/customFeatures via the `organizations` rows + `hasFeature(plan, "payroll", customFeatures)`), compute over those, and exclude the rest:

```typescript
const access = await requireInsightsAccess(orgIds);
if (!access.ok) return { success: false, error: access.error };
const supabase = createAdminSupabase();
const { data: orgRows } = await supabase
  .from("organizations")
  .select("id, name, plan, custom_features")
  .in("id", access.orgIds);
const payrollOrgs = (orgRows ?? []).filter((o: any) =>
  hasFeature(o.plan ?? "starter", "payroll", o.custom_features ?? null)
);
const excludedOrgs: ExcludedOrg[] = (orgRows ?? [])
  .filter((o: any) => !payrollOrgs.some((p: any) => p.id === o.id))
  .map((o: any) => ({ orgName: o.name, reason: "payroll not enabled" }));

if (payrollOrgs.length === 0) {
  return { success: true, data: null }; // existing upgrade/enable hint path
}
const ids = payrollOrgs.map((o: any) => o.id);
const orgsForBreakdown = payrollOrgs.map((o: any) => ({ id: o.id, name: o.name }));
```

- [ ] **Step 2: Scope queries to `ids`, add `byOrg` + `excludedOrgs`**

- All payroll queries `.eq("org_id", orgId)` → `.in("org_id", ids)`, selecting `org_id`.
- Keep combined totals over all rows (cost is a sum — safe).
- `const byOrg = groupByOrg(payrollEntryRows, orgsForBreakdown, (r) => r.org_id, (rows) => ({ monthlyCostInr: rows.reduce((s, r) => s + (r.net_pay ?? 0), 0), headcountPaid: new Set(rows.map((r) => r.employee_id)).size }));`
- Add `byOrg` and `excludedOrgs` to the returned `data`.

- [ ] **Step 3: Build verify**

Run: `npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add src/actions/insights.ts
git commit -m "feat(insights): payroll multi-org with per-org feature gating + byOrg"
```

---

## Task 8: Hiring action → multi-org (+ module gating)

**Files:**
- Modify: `src/actions/insights.ts` (`getHiringInsights`, ~line 839; return type)

**Interfaces:**
- Produces: `getHiringInsights(orgIds?: string[])`; `data: HiringInsights | null` with `byOrg` + `excludedOrgs` when non-null.

- [ ] **Step 1: Restrict to selected orgs with JambaHire enabled**

Hiring requires `organizations.settings.jambahire_enabled`. Same shape as Task 7 Step 1 but the predicate is `o.settings?.jambahire_enabled === true`; `reason: "JambaHire not enabled"`. If none qualify → `{ success: true, data: null }`.

- [ ] **Step 2: Scope queries to `ids`, add `byOrg` + `excludedOrgs`**

- Jobs/candidates/applications/offers queries `.eq("org_id", orgId)` → `.in("org_id", ids)`, selecting `org_id`.
- Keep the combined funnel/counts over all rows.
- `const byOrg = groupByOrg(applicationRows, orgsForBreakdown, (r) => r.org_id, (rows) => ({ inPipeline: rows.filter((r) => !["hired","rejected"].includes(r.stage)).length, hired: rows.filter((r) => r.stage === "hired").length }));`
- Add `byOrg` + `excludedOrgs` to `data`.

- [ ] **Step 3: Build verify**

Run: `npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add src/actions/insights.ts
git commit -m "feat(insights): hiring multi-org with per-org JambaHire gating + byOrg"
```

---

## Task 9: Performance action → multi-org

**Files:**
- Modify: `src/actions/insights.ts` (`getPerformanceTrainingInsights`, ~line 1053; return type)

**Interfaces:**
- Produces: `getPerformanceTrainingInsights(orgIds?: string[])`; gains `byOrg` (review completion + training compliance per org).

- [ ] **Step 1: Accept `orgIds`, scope every query, add `byOrg`**

Apply the Task 4 moves. Reviews/training queries `.eq("org_id", orgId)` → `.in("org_id", ids)`, selecting `org_id`. Keep combined aggregation. Add:

```typescript
const byOrg = groupByOrg(trainingEnrollmentRows, access.orgs, (r) => r.org_id, (rows) => ({
  enrollments: rows.length,
  completed: rows.filter((r) => r.status === "completed").length,
  compliancePct: rows.length ? Math.round((rows.filter((r) => r.status === "completed").length / rows.length) * 1000) / 10 : 0,
}));
```

(`compliancePct` per org is computed from that org's raw rows — correct, not an average of averages.)

- [ ] **Step 2: Build verify**

Run: `npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add src/actions/insights.ts
git commit -m "feat(insights): performance & training multi-org + byOrg"
```

---

## Task 10: `MultiTrendLine` chart (one line per org)

**Files:**
- Modify: `src/components/insights/charts.tsx`

**Interfaces:**
- Produces: `MultiTrendLine({ data, series, format, valueSuffix })` where `data: { label: string; [orgKey: string]: number | string }[]` and `series: { key: string; label: string; color: string }[]`.

- [ ] **Step 1: Add the component after `TrendLine`**

```typescript
export function MultiTrendLine({
  data,
  series,
  format = "plain",
  valueSuffix = "",
}: {
  data: Array<{ label: string } & Record<string, number | string>>;
  series: { key: string; label: string; color: string }[];
  format?: ValueFormat;
  valueSuffix?: string;
}) {
  if (!data.length || !series.length) return <EmptyChart />;
  const fmt = makeFormatter(format, valueSuffix);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid stroke={CHART_GRID_STROKE} vertical={false} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} width={48} tickFormatter={format !== "plain" ? fmt : undefined} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, n) => [fmt(v), String(n)]} cursor={{ stroke: "rgba(148,163,184,0.25)" }} />
        {series.map((s) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color}
            strokeWidth={2} dot={{ r: 2, fill: s.color, strokeWidth: 0 }} animationDuration={600} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Build verify**

Run: `npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add src/components/insights/charts.tsx
git commit -m "feat(insights): MultiTrendLine chart (one series per org)"
```

---

## Task 11: `PerOrgSplit` KPI sub-component

**Files:**
- Create: `src/components/insights/per-org-split.tsx`

**Interfaces:**
- Consumes: `INSIGHT_COLORS` from `@/lib/insights/chart-theme`.
- Produces: `PerOrgSplit({ items })` where `items: { orgName: string; value: string }[]`. Renders a compact chip row; renders nothing when `items.length <= 1`.

- [ ] **Step 1: Write the component**

```typescript
"use client";
import { ORG_SERIES_COLORS } from "@/lib/insights/chart-theme";

export function PerOrgSplit({ items }: { items: { orgName: string; value: string }[] }) {
  if (items.length <= 1) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
      {items.map((it, i) => (
        <span key={it.orgName} className="flex items-center gap-1 text-[11px] text-slate-400">
          <span className="h-2 w-2 rounded-full" style={{ background: ORG_SERIES_COLORS[i % ORG_SERIES_COLORS.length] }} />
          <span className="text-slate-300">{it.orgName}</span>
          <span className="tabular-nums text-slate-100">{it.value}</span>
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add `ORG_SERIES_COLORS` to the chart theme**

In `src/lib/insights/chart-theme.ts`, export a stable per-org palette:

```typescript
export const ORG_SERIES_COLORS = ["#a78bfa", "#34d399", "#f472b6", "#60a5fa", "#fbbf24", "#22d3ee"];
```

- [ ] **Step 3: Build verify**

Run: `npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add src/components/insights/per-org-split.tsx src/lib/insights/chart-theme.ts
git commit -m "feat(insights): PerOrgSplit KPI chip row + org series palette"
```

---

## Task 12: `OrgScopeSelect` control + nav/layout wiring

**Files:**
- Create: `src/components/insights/org-scope-select.tsx`
- Modify: `src/components/insights/insights-nav.tsx`
- Modify: `src/app/insights/layout.tsx`

**Interfaces:**
- Consumes: `getMyOrgs` (`@/actions/active-org`).
- Produces: `<InsightsNav eligibleOrgs={EligibleOrg[]} activeOrgId={string} />` renders `<OrgScopeSelect>` when `eligibleOrgs.length >= 2`. `OrgScopeSelect` reads/writes `?orgs=` and reloads via `router.push`.

- [ ] **Step 1: Build `OrgScopeSelect`**

```typescript
"use client";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Building2, Check, ChevronDown } from "lucide-react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { EligibleOrg } from "@/lib/insights/org-scope";

export function OrgScopeSelect({ eligibleOrgs, activeOrgId }: { eligibleOrgs: EligibleOrg[]; activeOrgId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const raw = sp.get("orgs");
  const selected = new Set(raw ? raw.split(",").filter(Boolean) : [activeOrgId]);

  function apply(next: Set<string>) {
    const ids = eligibleOrgs.map((o) => o.id).filter((id) => next.has(id));
    const params = new URLSearchParams(Array.from(sp.entries()));
    // Only the active org selected → omit the param (clean default URL)
    if (ids.length <= 1 && ids[0] === activeOrgId) params.delete("orgs");
    else params.set("orgs", ids.join(","));
    router.push(`${pathname}?${params.toString()}`);
  }
  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) { if (next.size > 1) next.delete(id); } else next.add(id);
    apply(next);
  }
  const label = selected.size <= 1 ? eligibleOrgs.find((o) => selected.has(o.id))?.name ?? "This org" : `${selected.size} orgs`;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/[0.08]">
        <Building2 className="h-3.5 w-3.5 text-violet-300" />
        <span className="max-w-[140px] truncate">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-[220px] rounded-lg border border-white/10 bg-slate-900 p-1 shadow-xl">
          <DropdownMenu.Label className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-slate-500">Combine organizations</DropdownMenu.Label>
          {eligibleOrgs.map((o) => (
            <DropdownMenu.CheckboxItem key={o.id} checked={selected.has(o.id)}
              onSelect={(e) => { e.preventDefault(); toggle(o.id); }}
              className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-slate-200 outline-none hover:bg-white/[0.06]">
              <span className="truncate">{o.name}{o.id === activeOrgId ? " (current)" : ""}</span>
              {selected.has(o.id) && <Check className="h-4 w-4 text-violet-300" />}
            </DropdownMenu.CheckboxItem>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
```

- [ ] **Step 2: Pass eligible orgs from the layout into the nav**

In `src/app/insights/layout.tsx`, after the existing access checks, fetch eligible orgs and pass them to `<InsightsNav>`:

```typescript
import { getMyOrgs } from "@/actions/active-org";
// ...
const memberships = await getMyOrgs();
const eligibleOrgs = memberships
  .filter((m) => m.role === "owner" || m.role === "admin")
  .map((m) => ({ id: m.orgId, name: m.name }));
// render:
<InsightsNav eligibleOrgs={eligibleOrgs} activeOrgId={user.orgId} />
```

- [ ] **Step 3: Render the control in `InsightsNav`**

Add props and render `OrgScopeSelect` in the right side of the nav bar (next to the Print button), only when `eligibleOrgs.length >= 2`:

```typescript
import { OrgScopeSelect } from "./org-scope-select";
import type { EligibleOrg } from "@/lib/insights/org-scope";

export function InsightsNav({ eligibleOrgs = [], activeOrgId = "" }: { eligibleOrgs?: EligibleOrg[]; activeOrgId?: string }) {
  // ...existing...
  // in the right-hand cluster of the bar:
  {eligibleOrgs.length >= 2 && <OrgScopeSelect eligibleOrgs={eligibleOrgs} activeOrgId={activeOrgId} />}
}
```

- [ ] **Step 4: Build verify**

Run: `npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 5: Commit**

```bash
git add src/components/insights/org-scope-select.tsx src/components/insights/insights-nav.tsx src/app/insights/layout.tsx
git commit -m "feat(insights): org-scope multi-select in the insights nav (URL-driven)"
```

---

## Task 13: Wire pages to read `?orgs` and render per-org breakdown

**Files:**
- Modify: `src/app/insights/page.tsx`, `src/app/insights/workforce/page.tsx`, `src/app/insights/leave/page.tsx`, `src/app/insights/payroll/page.tsx`, `src/app/insights/hiring/page.tsx`, `src/app/insights/performance/page.tsx`

**Interfaces:**
- Consumes: each action's `orgIds?` param (Tasks 4–9); `PerOrgSplit` (Task 11); `MultiTrendLine` (Task 10).

- [ ] **Step 1: Read `searchParams.orgs` and pass to the action (every page)**

Each page is an async server component. Add the `searchParams` prop and parse it:

```typescript
export default async function WorkforceInsightsPage({
  searchParams,
}: {
  searchParams?: { orgs?: string };
}) {
  const orgIds = searchParams?.orgs?.split(",").filter(Boolean);
  const result = await getWorkforceInsights(orgIds);
  // ...unchanged...
}
```

Apply the identical change to all six pages, calling the matching action.

- [ ] **Step 2: Render the per-org split under combined KPIs (where `byOrg` exists)**

For each KPI whose combined value has a per-org breakdown, add `PerOrgSplit` beneath it. Example (Workforce active headcount):

```tsx
<div>
  <KpiCard label="Active" value={String(d.totals.active)} sub="Current headcount" />
  <PerOrgSplit items={d.byOrg.map((o) => ({ orgName: o.orgName, value: String(o.active) }))} />
</div>
```

`PerOrgSplit` renders nothing when there's one org, so single-org pages are visually unchanged.

- [ ] **Step 3: Render `excludedOrgs` notes on module-gated tabs**

On the Payroll, Hiring, and Leave pages, when `data?.excludedOrgs?.length`, render a quiet note above the grid:

```tsx
{d.excludedOrgs && d.excludedOrgs.length > 0 && (
  <p className="text-xs text-slate-500">
    Not included: {d.excludedOrgs.map((o) => `${o.orgName} (${o.reason})`).join(", ")}
  </p>
)}
```

- [ ] **Step 4: Build verify**

Run: `npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 5: Commit**

```bash
git add src/app/insights
git commit -m "feat(insights): pages read ?orgs scope + render per-org split and excluded-org notes"
```

---

## Task 14: Full verification + docs

**Files:**
- Modify: `CLAUDE.md` (Insights Module section)

- [ ] **Step 1: Run the full suite + build**

Run: `npx vitest run` → expect all green (215 baseline + 8 new = 223).
Run: `npm run build` → `✓ Compiled successfully`.

- [ ] **Step 2: Document in CLAUDE.md**

In the `## Insights Module` section, add a "Multi-org combined view" note: owner/admin can combine analytics across the orgs they own/admin via the `?orgs=` multi-select in the Insights nav (shown when eligible ≥ 2); default is active-org-only; server validates requested org IDs against the owner/admin set in `requireInsightsAccess`; each action returns combined fields + `byOrg`; module-gated tabs (payroll/hiring/attendance) roll up only orgs with the feature and list `excludedOrgs`; attendance loops the per-org RPC. Insights-only — every other module stays single-tenant.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(insights): document multi-org combined view"
```

---

## Self-Review notes (for the implementer)

- **Spec coverage:** §4.1 security → Tasks 1–2; §4.2 actions+byOrg → Tasks 4–9; §4.3 attendance RPC loop → Task 6; §4.4 module gating → Tasks 6–8; §4.5 UI (scope control, KPI split, multi-series) → Tasks 10–13; §4.6 defaults/back-compat → Tasks 1, 12, 13.
- **Match existing field names:** Tasks 5/7/8 reference KPI fields (`monthlyCostInr`, `pendingLeaves`, etc.) generically — when implementing, open the real `OverviewInsights` / `PayrollInsights` / `HiringInsights` types and use their actual field names. Do not invent fields.
- **Rates from raw rows:** every per-org rate/percent (attrition, compliance) is computed inside the `byOrg` builder from that org's rows — never by averaging combined numbers.
