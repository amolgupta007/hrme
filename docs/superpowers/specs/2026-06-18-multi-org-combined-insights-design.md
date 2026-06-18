# Multi-Org Combined Insights — Design Spec

**Date:** 2026-06-18
**Status:** Approved (brainstorm) — pending spec review
**Depends on:** Clerk Organizations decoupling (Option 0, merged 2026-06-18) — multi-org membership + the top-left org switcher are the foundation this builds on.

---

## 1. Goal

A single owner/admin who belongs to multiple organizations can, **in the Insights module only**, roll up analytics across several of their orgs into one combined view — with a combined headline total **and** a per-org breakdown. Every other module stays strictly tenant-isolated to the active org. Insights is the one place where a multi-org owner gets the cross-company picture.

## 2. Context

- Multi-tenancy lives in Supabase `organizations` + `employees`; the active org is a validated cookie (`getCurrentUser().orgId`). `getMyOrgs()` returns the caller's `{ orgId, name, role }[]` memberships.
- The Insights module (`/insights/*`, owner/admin + `analytics` feature) has 7 server actions in `src/actions/insights.ts`, one per tab (Overview, Workforce, Leave & Attendance, Payroll, Hiring, Performance). Each calls `requireInsightsAccess()`, reads a single `user.orgId`, runs a `Promise.all` of Supabase queries all `.eq("org_id", orgId)`, and aggregates in JS — except attendance, which uses the per-org Postgres RPC `insights_attendance_monthly(p_org_id, p_from, p_to)` (migration 059).
- Charts are Recharts wrappers in `src/components/insights/charts.tsx`; the tab bar is `src/components/insights/insights-nav.tsx`.

## 3. Locked decisions (from brainstorm)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Which orgs can combine | Orgs the caller **owns or admins** (the "eligible set" = `getMyOrgs()` filtered to role ∈ {owner, admin}) |
| 2 | Presentation | **Combined total + per-org breakdown** (headline rollup + per-org split/series) |
| 3 | Entry control | **Org multi-select** in the Insights header; shown only when eligible set ≥ 2 |
| 4 | Cross-plan inclusion | Include **all** owner/admin orgs regardless of their plan (Starter org still rolls up) |
| 5 | Implementation approach | **A** — parameterize the existing 7 actions with a server-validated `orgIds[]` |
| 6 | Default scope | **Active org only**; combining is opt-in (select additional orgs) |
| 7 | Per-tab module gaps | Roll up only the selected orgs that have the module; surface an `excludedOrgs` note |
| 8 | Attendance RPC | Loop the existing per-org RPC per selected org and merge — **no new migration** |

## 4. Design

### 4.1 Security model (the crux)

`requireInsightsAccess(requestedOrgIds?: string[])` is extended:

1. Auth + the **active org** must have the `analytics` feature + caller `isAdmin` (unchanged — this is what licenses Insights at all).
2. Compute the **eligible set** = `getMyOrgs()` filtered to role ∈ {owner, admin} → `{ id, name }[]`.
3. Resolve the working org list:
   - `requestedOrgIds` absent/empty → `[activeOrgId]` (today's behavior; fully back-compatible).
   - present → keep only IDs that are in the eligible set; **silently drop any that aren't** (never trust client input — mirrors `switchActiveOrg`'s authority check). If the filter yields empty, fall back to `[activeOrgId]`.
4. Return `{ user, orgIds: string[], orgs: { id, name }[] }` where `orgs` is the label map for the resolved set.

This is the single chokepoint that guarantees a caller can never pull analytics for an org they don't own/admin, regardless of what the client sends.

### 4.2 Server — Approach A (all 7 actions)

Each action's signature gains an optional `orgIds?: string[]`. Inside:
- `const access = await requireInsightsAccess(orgIds)` → use `access.orgIds` + `access.orgs`.
- Every `.eq("org_id", orgId)` becomes `.in("org_id", access.orgIds)`, and each SELECT that feeds a grouped metric also selects `org_id`.
- Aggregation produces **both**:
  - the existing combined fields, now computed across the whole row set **from raw rows** (so rates, ratios, medians, and attrition stay mathematically correct — never an average-of-averages); and
  - a new `byOrg: { orgId: string; orgName: string; ...sameMetrics }[]` breakdown, grouping the same rows by `org_id`.
- When `access.orgIds` has one entry, `byOrg` has one element identical to the combined fields — existing single-org UI is unaffected.

Return types are extended additively (`byOrg?` plus, where relevant, `excludedOrgs?`), so existing consumers compile unchanged.

### 4.3 Attendance (per-org RPC)

`getLeaveAttendanceInsights` calls `insights_attendance_monthly` once per selected org via `Promise.all`, then merges: combined monthly buckets = per-month sum across orgs; per-org series retained for the breakdown. No schema change. (Future optimization: an array-param RPC — out of scope here.)

### 4.4 Per-tab module gating

Payroll (`payroll` feature), Hiring (`jambahire_enabled`), and the attendance section (`attendance_enabled`) can be on in one selected org and off in another. Per affected tab:
- Restrict the working set to the selected orgs that have the module; compute the combined view over those.
- Return `excludedOrgs: { orgName: string; reason: string }[]` for the rest; the tab renders a quiet inline note ("Not included: Beta Inc — payroll not enabled").
- If **no** selected org has the module → the existing enable/upgrade hint (`data: null`), worded for the multi-org case.

### 4.5 UI

- **Scope control** (`src/components/insights/org-scope-select.tsx`, new): a multi-select dropdown mounted in `InsightsNav`, rendered **only when the eligible set ≥ 2**. One checkbox per eligible org; the **active org is checked by default**, others unchecked. Selection is written to the URL as `?orgs=id1,id2` (omitted when only the active org is selected) so it is shareable and persists across the 6 tab navigations. A client component updates the querystring via `router.push`.
- **Page wiring**: each `/insights/*` page reads `searchParams.orgs`, splits to an array, and passes it to its action. Absent → single active org.
- **KPI cards**: headline shows the combined total; a compact per-org chip row sits beneath (`Acme 25 · Beta 17`). Single-org (no `byOrg` split) renders exactly as today.
- **Trend charts**: render one series per org, color-keyed by org. `StackedBars` grouped mode already supports this; `TrendLine` / `TrendArea` gain a small multi-series variant in `charts.tsx`. Combined-total-only charts (e.g., the hiring funnel) show the rollup with a per-org note rather than N funnels.
- Everything stays on the existing dark Insights canvas; this is additive chrome.

### 4.6 Back-compatibility & defaults

- Caller with **< 2** eligible orgs: no scope control ever renders; every action runs with `[activeOrgId]`; the module is byte-for-byte today's experience.
- Caller with ≥ 2 eligible orgs: lands on the **active org only** (no `?orgs`); opts into combined by checking more orgs. No surprise rollup on first load.

## 5. Components & boundaries

| Unit | Responsibility |
|------|----------------|
| `requireInsightsAccess(orgIds?)` | Auth + analytics gate + validate requested orgs against the owner/admin eligible set; the sole tenancy authority |
| 7 actions in `insights.ts` | Per-tab aggregation over `.in("org_id", ids)`, returning combined fields + `byOrg` (+ `excludedOrgs` where module-gated) |
| `OrgScopeSelect` (client) | Render eligible orgs, drive `?orgs=` querystring; hidden when eligible < 2 |
| Insights pages | Read `?orgs`, pass to action, pass `byOrg`/`excludedOrgs` to components |
| `charts.tsx` multi-series | Render one series per org from `byOrg` |
| KPI / section components | Combined headline + per-org split rendering |

## 6. Testing

- **Access helper:** requested orgs intersect to the eligible set; foreign IDs dropped; empty/absent → `[activeOrgId]`; non-admin/active-org-without-analytics still rejected.
- **Aggregation:** from a fixture rowset spanning 2 orgs — combined totals correct, `byOrg` correct, and a **rate/median** metric computed from raw rows (not averaged from per-org pre-totals).
- **Attendance merge:** per-org RPC results merge to correct combined monthly buckets + per-org series.
- **Module gating:** an org lacking payroll is excluded with the right `excludedOrgs` reason; all-excluded → enable hint.
- **Default/back-compat:** no `orgIds` → single active org shape, identical to pre-change output.

## 7. Out of scope

- Combined view anywhere outside `/insights/*` (all other modules stay single-tenant).
- A multi-org Postgres RPC for attendance (per-org loop is sufficient at SMB org counts).
- Cross-org writes or drill-through from a combined chart into another org's module.
- Persisting the org selection server-side (URL param is the source of truth; per-device, shareable).
- Org-set presets / saved comparisons.
