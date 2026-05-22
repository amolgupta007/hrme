# AI HR Assistant — Phase 5: Proactive Insights — Design

**Date:** 2026-05-22
**Status:** Approved (brainstorming complete) → ready for implementation plan
**Planning ref:** `docs/planning/ai-hr-assistant-plan.md` §5 (Phase 5), OQ-9 (read-only forever)

---

## 1. Summary

Phase 5 adds **proactive insight cards** to the admin dashboard home. A daily background
sweep computes a small set of **deterministic, SQL-backed facts** about the org
("4 leave requests pending more than 3 days", "2 mandatory trainings overdue") and renders
the **top 3** as dismissible cards that deep-link into the relevant existing dashboard page.

There is **no LLM** in this feature. Insights are computed by pure rule functions over
tenant data using the admin Supabase client — the **same server-side access pattern the
dashboard already uses** (`getDashboardData`, `assistant-admin-data.ts`). No tenant data is
exposed to any model, so this does **not** depend on (or reopen) the parked Phase 3
structured-data tools.

---

## 2. Goals / Non-goals

### Goals
- Surface time-sensitive HR signals admins would otherwise have to hunt for.
- Zero token cost, zero INR-budget interaction, fully deterministic and unit-testable.
- Cheap dashboard page loads (precomputed), with a manual refresh + same-day fallback.

### Non-goals
- No write tools / actions of any kind (OQ-9 — read-only forever).
- No LLM-generated or LLM-phrased content in v1.
- No employee- or manager-facing insight cards in v1 (admins/owners only).
- No per-user dismissal in v1 (per-org dismissal is the v1 simplification).
- No voice, no Cmd+K entry point.

---

## 3. Scope & gating

- **Audience:** admins/owners only. Server-checked via `getCurrentUser()` → `isAdmin(role)`.
- **Org gate:** reuse the existing `organizations.settings.assistant_enabled` flag
  (admins already opt into the assistant). **No new org flag is introduced.**
- **Plan gate:** Growth and Business only; Starter excluded — consistent with assistant
  availability (`canUseAssistant` / `src/config/plans.ts`).
- **No LLM, no token metering, no `assistant_budget` interaction.**

---

## 4. Data model — migration `028_assistant_insights.sql`

New table `assistant_insights`:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK (default gen_random_uuid) | |
| `org_id` | uuid NOT NULL, FK → organizations | |
| `rule_key` | text NOT NULL | stable rule identifier, e.g. `leave_pending_approvals` |
| `category` | text NOT NULL | one of `leave` / `compliance` / `people` / `ops` |
| `priority` | int NOT NULL | higher = surfaced first |
| `title` | text NOT NULL | short headline |
| `body` | text NOT NULL | one-line detail |
| `metric_count` | int NULL | the headline number, if any |
| `deep_link` | text NOT NULL | path to an existing dashboard route |
| `computed_for` | date NOT NULL | IST date the sweep represents |
| `created_at` | timestamptz NOT NULL default now() | |
| `dismissed_at` | timestamptz NULL | per-org dismissal |
| `dismissed_by` | uuid NULL, FK → employees | who dismissed |

- Indexes: `(org_id, computed_for)`, partial index `WHERE dismissed_at IS NULL`.
- Uniqueness: `UNIQUE (org_id, rule_key, computed_for)` so re-runs (cron + manual refresh +
  fallback) **upsert** rather than duplicate.
- RLS: enabled, advisory only (service-role bypasses per gotcha #5 — same as all other tables).
- Created via Supabase SQL Editor (per gotcha #6) AND checked in as migration `028`.

---

## 5. Rules engine — `src/lib/assistant/insights/`

```
src/lib/assistant/insights/
├── types.ts        # Insight, InsightRule, InsightContext, InsightCategory
├── constants.ts    # thresholds: PENDING_LEAVE_DAYS=3, PROBATION_DAYS=90, STALLED_STAGE_DAYS=7,
│                    #   NEW_JOINER_DAYS=7, REVIEW_CYCLE_END_DAYS=7, BALANCE_EXPIRY_DAYS=45, etc.
├── registry.ts     # ordered array of all 11 InsightRule objects
├── engine.ts       # runInsightsForOrg(orgId): resolves plan + module flags, runs applicable rules
└── rules/
    ├── grievances-urgent.ts
    ├── leave-pending-approvals.ts
    ├── training-overdue.ts
    ├── docs-unacknowledged.ts
    ├── hiring-stalled.ts
    ├── review-cycle-incomplete.ts
    ├── leave-concentration.ts
    ├── new-joiners.ts
    ├── probation-window.ts
    ├── attendance-anomalies.ts
    └── leave-balance-expiry.ts
```

### Rule shape (testability)
Each rule separates **fetch** (impure, hits Supabase) from **evaluate** (pure, unit-tested):

```ts
interface InsightRule<TData = unknown> {
  key: string;                 // stable, matches rule_key
  category: InsightCategory;   // leave | compliance | people | ops
  basePriority: number;        // ranking weight
  deepLink: string;            // existing dashboard route
  // Gating — rule is skipped unless ALL apply for the org:
  requiredFeature?: PlanFeature;        // e.g. "training" (Growth+)
  requiredModuleFlag?: ModuleFlagKey;   // e.g. "grievances_enabled"
  fetch(supabase: AdminClient, orgId: string, ctx: InsightContext): Promise<TData>;
  evaluate(data: TData, ctx: InsightContext): Insight | null;  // PURE
}
```

- `evaluate()` returns `null` when the signal is absent (e.g. zero pending approvals) → no card.
- `engine.runInsightsForOrg(orgId)` resolves the org's plan + `settings` module flags once,
  filters the registry to applicable rules, runs each rule's `fetch` then `evaluate`, and
  returns the non-null `Insight[]`.

### The 11 rules (ranked)

| basePriority | key | category | signal | gate |
|---|---|---|---|---|
| 110 | `grievances_urgent` | ops | open `urgent` grievances | `grievances_enabled` |
| 100 | `leave_pending_approvals` | leave | leave_requests pending > `PENDING_LEAVE_DAYS` (3) | all |
| 90 | `training_overdue` | compliance | mandatory training_enrollments overdue | `training` (Growth+) |
| 85 | `docs_unacknowledged` | compliance | employees missing a required company-wide doc ack | `documents` (Growth+) |
| 80 | `hiring_stalled` | ops | applications in a stage > `STALLED_STAGE_DAYS` (7) | `jambahire_enabled` |
| 75 | `review_cycle_incomplete` | people | active review_cycle, incomplete reviews, end_date near | `reviews` (Growth+) |
| 70 | `leave_concentration` | leave | upcoming approved leave clustered in one dept on overlapping dates | all |
| 60 | `new_joiners` | people | employees with date_of_joining in last 7 days | all |
| 55 | `probation_window` | people | employees at `date_of_joining + PROBATION_DAYS` (90, configurable const) | all |
| 50 | `attendance_anomalies` | ops | auto-closed shifts / no-shows for yesterday (IST) | `attendance_enabled` |
| 40 | `leave_balance_expiry` | leave | large unused balances near leave-year end | all |

Final `priority` = `basePriority` (rules may bump it for severity, e.g. urgent count).
Dashboard renders **top 3 by priority desc**, tie-break by `created_at` desc.

---

## 6. Surfaces

### Cron — `src/app/api/cron/assistant-insights/route.ts`
- Schedule `0 2 * * *` UTC (= 7:30am IST, before the workday).
- `Authorization: Bearer ${CRON_SECRET}` enforced in-handler (route is under the
  `/api/cron(.*)` middleware exemption — gotcha re: Clerk rewriting cron requests).
- Iterates orgs where `assistant_enabled = true` AND plan ∈ {growth, business}; for each
  calls `runInsightsForOrg`, then upserts `assistant_insights` for `computed_for = today (IST)`.
- Registered in `vercel.json` crons.

### Server actions — `src/actions/assistant-insights.ts`
- `getInsights(): ActionResult<Insight[]>` — admin-only. Reads top 3 non-dismissed rows for
  `org_id + today (IST)`. If **no rows exist for today**, runs the same-day fallback:
  calls `runInsightsForOrg` + upserts inline, then returns the fresh top 3.
- `refreshInsights(): ActionResult<Insight[]>` — admin-only. Re-runs the engine for the
  caller's org, upserts today's rows (replacing prior non-dismissed ones), returns top 3.
  Powers the manual **Refresh** button. `revalidatePath("/dashboard")`.
- `dismissInsight(id): ActionResult` — admin-only, ownership-checked to caller's org, sets
  `dismissed_at = now()`, `dismissed_by = employeeId`. `revalidatePath("/dashboard")`.

All actions follow the standard pattern: `getCurrentUser` → `isAdmin` guard → admin Supabase
client → `ActionResult<T>`.

### UI — `src/components/dashboard/insights-cards.tsx`
- Client component, rendered only on the **admin** branch of `src/app/dashboard/page.tsx`,
  receiving the server-fetched `Insight[]` and `role`.
- Section header "Insights" + a small **Refresh** button (calls `refreshInsights`, shows
  spinner, toast on error).
- Up to 3 cards: category icon (`lucide-react`), priority-colored `Badge`, title, body,
  **"View →"** button linking to `deep_link`, dismiss ✕ (calls `dismissInsight`, optimistic
  removal).
- **Section is hidden entirely when there are no insights** (no "all clear" placeholder).
- PostHog events via `src/lib/assistant/posthog-events.ts`: `insight_shown`,
  `insight_clicked`, `insight_dismissed`, `insights_refreshed`.

---

## 7. Testing

- **Per-rule** unit tests (`tests/assistant/insights/<rule>.test.ts`): call `evaluate()` with
  fixture data covering present-signal, absent-signal (→ null), and boundary (threshold) cases.
- **Engine** test: module-flag/plan gating filters the registry correctly (e.g. Starter org
  excludes Growth+ rules; grievances-disabled org excludes that rule).
- **Deep-link integrity** test: every rule's `deepLink` resolves to a real `/dashboard/*`
  route (validated against `ROUTE_REGISTRY` where applicable).
- **Cron auth** test: handler rejects requests without the correct Bearer token.
- All run under the existing vitest setup; no live DB required (rules tested via pure
  `evaluate`, fetch layer mocked or covered by integration only where cheap).

---

## 8. Docs & rollout

- Update `CLAUDE.md`: add the cron row, migration `028`, flip Phase 5 status to shipped,
  add gotcha entries (per-org dismissal simplification; insights gate = `assistant_enabled` +
  Growth/Business; deterministic/no-LLM clarification vs parked Phase 3).
- Update `docs/planning/ai-hr-assistant-plan.md` Phase 5 section to "shipped".
- Migration `028` run via Supabase SQL Editor before deploy.
- Env: no new env vars (`CRON_SECRET` already set).

---

## 9. Open simplifications (accepted for v1)

1. **Per-org dismissal** (not per-user) — one admin dismissing hides a card for the org's
   admins that day. Per-user dismissal is a fast-follow if multi-admin orgs complain.
2. **Probation = `date_of_joining + 90d`** — there is no probation column; the 90-day window
   is a named constant, easily changed.
3. **Top 3 only** — additional insights beyond the top 3 are not shown in v1 (no "view all").
4. **Same-day fallback computes inline** on first admin load if the cron hasn't run — bounded
   by the 11 rules, acceptable latency.
