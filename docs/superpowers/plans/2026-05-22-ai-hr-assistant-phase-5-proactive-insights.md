# AI HR Assistant — Phase 5: Proactive Insights — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin-only proactive insight cards to the dashboard home, computed by a daily cron from deterministic SQL rules (no LLM), with a manual refresh button and same-day fallback.

**Architecture:** A registry of pure rule functions (`fetch` + pure `evaluate`) runs per org in a daily cron, writing the top insights to a new `assistant_insights` table. The admin dashboard reads the top 3 non-dismissed rows for today; a server action powers manual refresh + dismissal, and getInsights computes inline if today's sweep hasn't run.

**Tech Stack:** Next.js 14 App Router (server components + server actions), TypeScript strict, Supabase (admin client, RLS-advisory), Vercel Cron, vitest, Tailwind + lucide-react.

**Design ref:** `docs/superpowers/specs/2026-05-22-ai-hr-assistant-phase-5-design.md`

---

## File structure

**Create:**
- `supabase/migrations/028_assistant_insights.sql` — table DDL (also run in SQL Editor)
- `src/lib/assistant/insights/types.ts` — `Insight`, `InsightCategory`, `InsightContext`, `InsightRule`, `AdminSupabase`
- `src/lib/assistant/insights/constants.ts` — thresholds + IST date helpers
- `src/lib/assistant/insights/engine.ts` — `isRuleApplicable`, `selectTopInsights`, `buildContext`, `runInsightsForOrg`, `persistInsights`
- `src/lib/assistant/insights/registry.ts` — ordered list of all 11 rules
- `src/lib/assistant/insights/rules/*.ts` — 11 rule files
- `src/actions/assistant-insights.ts` — `getInsights`, `refreshInsights`, `dismissInsight`
- `src/app/api/cron/assistant-insights/route.ts` — daily sweep
- `src/components/dashboard/insights-cards.tsx` — client UI
- `tests/assistant/insights/engine.test.ts`
- `tests/assistant/insights/rules.test.ts`
- `tests/assistant/insights/deep-links.test.ts`
- `tests/assistant/insights/cron-auth.test.ts`

**Modify:**
- `src/app/dashboard/page.tsx` — render `<InsightsCards>` in the admin branch
- `vercel.json` — register the cron
- `src/lib/assistant/posthog-events.ts` — add insight event variants
- `CLAUDE.md` — cron row, migration 028, Phase 5 → shipped, gotcha entries
- `docs/planning/ai-hr-assistant-plan.md` — Phase 5 → shipped

---

## Task 1: Migration `028_assistant_insights.sql`

**Files:**
- Create: `supabase/migrations/028_assistant_insights.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 028_assistant_insights.sql — Phase 5 proactive insights
create table if not exists public.assistant_insights (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  rule_key      text not null,
  category      text not null check (category in ('leave','compliance','people','ops')),
  priority      int  not null,
  title         text not null,
  body          text not null,
  metric_count  int,
  deep_link     text not null,
  computed_for  date not null,
  created_at    timestamptz not null default now(),
  dismissed_at  timestamptz,
  dismissed_by  uuid references public.employees(id),
  unique (org_id, rule_key, computed_for)
);

create index if not exists assistant_insights_org_day_idx
  on public.assistant_insights (org_id, computed_for);
create index if not exists assistant_insights_active_idx
  on public.assistant_insights (org_id, computed_for) where dismissed_at is null;

alter table public.assistant_insights enable row level security;
-- Advisory only — service-role bypasses RLS (see CLAUDE.md gotcha #5).
drop policy if exists assistant_insights_admin_rw on public.assistant_insights;
create policy assistant_insights_admin_rw on public.assistant_insights
  for all using (true) with check (true);
```

- [ ] **Step 2: Apply it**

Run the file's contents in the Supabase Dashboard SQL Editor (project `imjwqktxzahhnfmfbtfc`). Supabase CLI is unavailable on Windows (CLAUDE.md). Verify with:

```sql
select count(*) from public.assistant_insights;
```
Expected: `0` (table exists, empty).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/028_assistant_insights.sql
git commit -m "feat(assistant): migration 028 — assistant_insights table"
```

---

## Task 2: Types + constants

**Files:**
- Create: `src/lib/assistant/insights/types.ts`
- Create: `src/lib/assistant/insights/constants.ts`

- [ ] **Step 1: Write `types.ts`**

```ts
import type { createAdminSupabase } from "@/lib/supabase/server";
import type { OrgPlan, PlanFeature } from "@/config/plans";

export type AdminSupabase = ReturnType<typeof createAdminSupabase>;

export type InsightCategory = "leave" | "compliance" | "people" | "ops";

export interface Insight {
  ruleKey: string;
  category: InsightCategory;
  priority: number;
  title: string;
  body: string;
  metricCount: number | null;
  deepLink: string;
}

export interface InsightContext {
  orgId: string;
  plan: OrgPlan;
  /** "now" expressed in IST wall-clock (UTC fields hold IST). Use for date math only. */
  today: Date;
  flags: {
    jambaHireEnabled: boolean;
    attendanceEnabled: boolean;
    grievancesEnabled: boolean;
  };
}

export interface InsightRule<TData = unknown> {
  key: string;
  category: InsightCategory;
  basePriority: number;
  deepLink: string;
  requiredFeature?: PlanFeature;
  requiredFlag?: keyof InsightContext["flags"];
  fetch(supabase: AdminSupabase, ctx: InsightContext): Promise<TData>;
  /** PURE: data + ctx in, one Insight or null out. No I/O. */
  evaluate(data: TData, ctx: InsightContext): Insight | null;
}
```

- [ ] **Step 2: Write `constants.ts`**

```ts
export const PENDING_LEAVE_DAYS = 3;
export const PROBATION_DAYS = 90;
export const PROBATION_LOOKAHEAD_DAYS = 7;
export const STALLED_STAGE_DAYS = 7;
export const NEW_JOINER_DAYS = 7;
export const REVIEW_CYCLE_END_DAYS = 7;
export const BALANCE_EXPIRY_DAYS = 45;
export const MIN_LEAVE_BALANCE_FLAG = 5;        // days remaining to count
export const LEAVE_CONCENTRATION_MIN = 3;       // employees overlapping in one dept
export const LEAVE_CONCENTRATION_WINDOW_DAYS = 14;
export const TOP_INSIGHTS = 3;

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** A Date whose UTC fields equal IST wall-clock. For date-precision math only. */
export function istNow(now: Date = new Date()): Date {
  return new Date(now.getTime() + IST_OFFSET_MS);
}

/** "YYYY-MM-DD" for the IST calendar day. */
export function istDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Add days to a Date, returning a new Date. */
export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/assistant/insights/types.ts src/lib/assistant/insights/constants.ts
git commit -m "feat(assistant): insights types + constants"
```

---

## Task 3: Engine gating + top-N selection (pure, TDD)

**Files:**
- Create: `src/lib/assistant/insights/engine.ts` (gating + selection only this task)
- Test: `tests/assistant/insights/engine.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { isRuleApplicable, selectTopInsights } from "@/lib/assistant/insights/engine";
import type { InsightRule, InsightContext, Insight } from "@/lib/assistant/insights/types";

const ctx = (over: Partial<InsightContext> = {}): InsightContext => ({
  orgId: "o1",
  plan: "growth",
  today: new Date("2026-05-22T00:00:00.000Z"),
  flags: { jambaHireEnabled: false, attendanceEnabled: false, grievancesEnabled: false },
  ...over,
});

const rule = (over: Partial<InsightRule> = {}): InsightRule => ({
  key: "r", category: "leave", basePriority: 10, deepLink: "/dashboard/leaves",
  fetch: async () => ({}), evaluate: () => null, ...over,
});

describe("isRuleApplicable", () => {
  it("allows a rule with no gates", () => {
    expect(isRuleApplicable(rule(), ctx())).toBe(true);
  });
  it("blocks a feature-gated rule on starter", () => {
    expect(isRuleApplicable(rule({ requiredFeature: "training" }), ctx({ plan: "starter" }))).toBe(false);
  });
  it("allows a feature-gated rule on growth", () => {
    expect(isRuleApplicable(rule({ requiredFeature: "training" }), ctx({ plan: "growth" }))).toBe(true);
  });
  it("blocks a flag-gated rule when the flag is off", () => {
    expect(isRuleApplicable(rule({ requiredFlag: "grievancesEnabled" }), ctx())).toBe(false);
  });
  it("allows a flag-gated rule when the flag is on", () => {
    const c = ctx({ flags: { jambaHireEnabled: false, attendanceEnabled: false, grievancesEnabled: true } });
    expect(isRuleApplicable(rule({ requiredFlag: "grievancesEnabled" }), c)).toBe(true);
  });
});

describe("selectTopInsights", () => {
  const ins = (priority: number): Insight => ({
    ruleKey: "k", category: "leave", priority, title: "t", body: "b", metricCount: 1, deepLink: "/dashboard/leaves",
  });
  it("returns the 3 highest-priority insights, descending", () => {
    const out = selectTopInsights([ins(10), ins(50), ins(30), ins(90), ins(20)]);
    expect(out.map((i) => i.priority)).toEqual([90, 50, 30]);
  });
  it("returns all when fewer than 3", () => {
    expect(selectTopInsights([ins(5)]).length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/assistant/insights/engine.test.ts`
Expected: FAIL — `isRuleApplicable`/`selectTopInsights` not exported.

- [ ] **Step 3: Write the engine functions**

```ts
// src/lib/assistant/insights/engine.ts
import { hasFeature } from "@/config/plans";
import { TOP_INSIGHTS } from "./constants";
import type { Insight, InsightContext, InsightRule } from "./types";

export function isRuleApplicable(rule: InsightRule, ctx: InsightContext): boolean {
  if (rule.requiredFeature && !hasFeature(ctx.plan, rule.requiredFeature)) return false;
  if (rule.requiredFlag && !ctx.flags[rule.requiredFlag]) return false;
  return true;
}

export function selectTopInsights(insights: Insight[], n: number = TOP_INSIGHTS): Insight[] {
  return [...insights].sort((a, b) => b.priority - a.priority).slice(0, n);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/assistant/insights/engine.test.ts`
Expected: PASS (all 7).

- [ ] **Step 5: Commit**

```bash
git add src/lib/assistant/insights/engine.ts tests/assistant/insights/engine.test.ts
git commit -m "feat(assistant): insights engine gating + top-N selection"
```

---

## Task 4: Leave rules (3)

**Files:**
- Create: `src/lib/assistant/insights/rules/leave-pending-approvals.ts`
- Create: `src/lib/assistant/insights/rules/leave-concentration.ts`
- Create: `src/lib/assistant/insights/rules/leave-balance-expiry.ts`
- Test: `tests/assistant/insights/rules.test.ts` (start it here; later tasks append `describe` blocks)

- [ ] **Step 1: Write `leave-pending-approvals.ts`**

```ts
import { PENDING_LEAVE_DAYS, addDays } from "../constants";
import type { AdminSupabase, Insight, InsightContext, InsightRule } from "../types";

interface PendingRow { id: string; created_at: string }

export const leavePendingApprovals: InsightRule<PendingRow[]> = {
  key: "leave_pending_approvals",
  category: "leave",
  basePriority: 100,
  deepLink: "/dashboard/leaves",
  async fetch(supabase: AdminSupabase, ctx: InsightContext) {
    const { data } = await supabase
      .from("leave_requests")
      .select("id, created_at")
      .eq("org_id", ctx.orgId)
      .eq("status", "pending");
    return (data ?? []) as PendingRow[];
  },
  evaluate(rows: PendingRow[], ctx: InsightContext): Insight | null {
    const cutoff = addDays(ctx.today, -PENDING_LEAVE_DAYS);
    const aging = rows.filter((r) => new Date(r.created_at) < cutoff).length;
    if (aging === 0) return null;
    return {
      ruleKey: this.key, category: "leave", priority: this.basePriority,
      title: "Leave approvals waiting",
      body: `${aging} leave request${aging === 1 ? "" : "s"} pending more than ${PENDING_LEAVE_DAYS} days`,
      metricCount: aging, deepLink: this.deepLink,
    };
  },
};
```

- [ ] **Step 2: Write `leave-concentration.ts`**

```ts
import { LEAVE_CONCENTRATION_MIN, LEAVE_CONCENTRATION_WINDOW_DAYS, addDays } from "../constants";
import type { AdminSupabase, Insight, InsightContext, InsightRule } from "../types";

interface ConcData {
  leaves: Array<{ employee_id: string; start_date: string; end_date: string }>;
  deptByEmployee: Record<string, string | null>;
}

export const leaveConcentration: InsightRule<ConcData> = {
  key: "leave_concentration",
  category: "leave",
  basePriority: 70,
  deepLink: "/dashboard/leaves",
  async fetch(supabase: AdminSupabase, ctx: InsightContext): Promise<ConcData> {
    const windowEnd = addDays(ctx.today, LEAVE_CONCENTRATION_WINDOW_DAYS).toISOString().slice(0, 10);
    const todayStr = ctx.today.toISOString().slice(0, 10);
    const { data: leaves } = await supabase
      .from("leave_requests")
      .select("employee_id, start_date, end_date")
      .eq("org_id", ctx.orgId)
      .eq("status", "approved")
      .gte("end_date", todayStr)
      .lte("start_date", windowEnd);
    const { data: emps } = await supabase
      .from("employees")
      .select("id, department_id")
      .eq("org_id", ctx.orgId);
    const deptByEmployee: Record<string, string | null> = {};
    for (const e of (emps ?? []) as Array<{ id: string; department_id: string | null }>) {
      deptByEmployee[e.id] = e.department_id;
    }
    return { leaves: (leaves ?? []) as ConcData["leaves"], deptByEmployee };
  },
  evaluate(data: ConcData, _ctx: InsightContext): Insight | null {
    const perDept: Record<string, Set<string>> = {};
    for (const lv of data.leaves) {
      const dept = data.deptByEmployee[lv.employee_id];
      if (!dept) continue;
      (perDept[dept] ??= new Set()).add(lv.employee_id);
    }
    let worst = 0;
    for (const set of Object.values(perDept)) worst = Math.max(worst, set.size);
    if (worst < LEAVE_CONCENTRATION_MIN) return null;
    return {
      ruleKey: this.key, category: "leave", priority: this.basePriority,
      title: "Upcoming leave is concentrated",
      body: `${worst} people in one department are on approved leave in the next ${LEAVE_CONCENTRATION_WINDOW_DAYS} days`,
      metricCount: worst, deepLink: this.deepLink,
    };
  },
};
```

- [ ] **Step 3: Write `leave-balance-expiry.ts`**

```ts
import { BALANCE_EXPIRY_DAYS, MIN_LEAVE_BALANCE_FLAG, addDays } from "../constants";
import type { AdminSupabase, Insight, InsightContext, InsightRule } from "../types";

interface BalRow { employee_id: string; total_days: number; used_days: number; carried_forward_days: number }

export const leaveBalanceExpiry: InsightRule<BalRow[]> = {
  key: "leave_balance_expiry",
  category: "leave",
  basePriority: 40,
  deepLink: "/dashboard/leaves",
  async fetch(supabase: AdminSupabase, ctx: InsightContext) {
    const { data } = await supabase
      .from("leave_balances")
      .select("employee_id, total_days, used_days, carried_forward_days")
      .eq("org_id", ctx.orgId);
    return (data ?? []) as BalRow[];
  },
  evaluate(rows: BalRow[], ctx: InsightContext): Insight | null {
    // Only fires within BALANCE_EXPIRY_DAYS before Dec 31 (calendar leave-year, v1 simplification).
    const yearEnd = new Date(`${ctx.today.getUTCFullYear()}-12-31T00:00:00.000Z`);
    const windowStart = addDays(yearEnd, -BALANCE_EXPIRY_DAYS);
    if (ctx.today < windowStart || ctx.today > yearEnd) return null;
    const employees = new Set<string>();
    for (const b of rows) {
      const remaining = (b.total_days ?? 0) + (b.carried_forward_days ?? 0) - (b.used_days ?? 0);
      if (remaining >= MIN_LEAVE_BALANCE_FLAG) employees.add(b.employee_id);
    }
    if (employees.size === 0) return null;
    return {
      ruleKey: this.key, category: "leave", priority: this.basePriority,
      title: "Unused leave expiring soon",
      body: `${employees.size} employee${employees.size === 1 ? "" : "s"} still hold ${MIN_LEAVE_BALANCE_FLAG}+ days of leave before year-end`,
      metricCount: employees.size, deepLink: this.deepLink,
    };
  },
};
```

- [ ] **Step 4: Write the leave-rules tests**

```ts
// tests/assistant/insights/rules.test.ts
import { describe, it, expect } from "vitest";
import type { InsightContext } from "@/lib/assistant/insights/types";
import { leavePendingApprovals } from "@/lib/assistant/insights/rules/leave-pending-approvals";
import { leaveConcentration } from "@/lib/assistant/insights/rules/leave-concentration";
import { leaveBalanceExpiry } from "@/lib/assistant/insights/rules/leave-balance-expiry";

const ctx = (today: string): InsightContext => ({
  orgId: "o1", plan: "growth", today: new Date(today),
  flags: { jambaHireEnabled: false, attendanceEnabled: false, grievancesEnabled: false },
});

describe("leave_pending_approvals", () => {
  it("flags requests older than 3 days", () => {
    const out = leavePendingApprovals.evaluate(
      [{ id: "1", created_at: "2026-05-10T00:00:00Z" }, { id: "2", created_at: "2026-05-21T00:00:00Z" }],
      ctx("2026-05-22T00:00:00Z"));
    expect(out?.metricCount).toBe(1);
  });
  it("returns null when none are aging", () => {
    expect(leavePendingApprovals.evaluate([{ id: "2", created_at: "2026-05-21T00:00:00Z" }], ctx("2026-05-22T00:00:00Z"))).toBeNull();
  });
});

describe("leave_concentration", () => {
  it("flags when a department has 3+ overlapping leaves", () => {
    const out = leaveConcentration.evaluate({
      leaves: [
        { employee_id: "a", start_date: "2026-05-23", end_date: "2026-05-25" },
        { employee_id: "b", start_date: "2026-05-24", end_date: "2026-05-26" },
        { employee_id: "c", start_date: "2026-05-23", end_date: "2026-05-24" },
      ],
      deptByEmployee: { a: "eng", b: "eng", c: "eng" },
    }, ctx("2026-05-22T00:00:00Z"));
    expect(out?.metricCount).toBe(3);
  });
  it("returns null below the threshold", () => {
    const out = leaveConcentration.evaluate({
      leaves: [{ employee_id: "a", start_date: "2026-05-23", end_date: "2026-05-25" }],
      deptByEmployee: { a: "eng" },
    }, ctx("2026-05-22T00:00:00Z"));
    expect(out).toBeNull();
  });
});

describe("leave_balance_expiry", () => {
  const balances = [
    { employee_id: "a", total_days: 18, used_days: 5, carried_forward_days: 0 }, // 13 remaining
    { employee_id: "b", total_days: 8, used_days: 6, carried_forward_days: 0 },  // 2 remaining
  ];
  it("fires inside the year-end window", () => {
    const out = leaveBalanceExpiry.evaluate(balances, ctx("2026-12-01T00:00:00Z"));
    expect(out?.metricCount).toBe(1);
  });
  it("is silent outside the window", () => {
    expect(leaveBalanceExpiry.evaluate(balances, ctx("2026-05-22T00:00:00Z"))).toBeNull();
  });
});
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/assistant/insights/rules.test.ts`
Expected: PASS (6).

- [ ] **Step 6: Commit**

```bash
git add src/lib/assistant/insights/rules/leave-*.ts tests/assistant/insights/rules.test.ts
git commit -m "feat(assistant): leave insight rules"
```

---

## Task 5: Compliance rules (2)

**Files:**
- Create: `src/lib/assistant/insights/rules/training-overdue.ts`
- Create: `src/lib/assistant/insights/rules/docs-unacknowledged.ts`
- Test: append `describe` blocks to `tests/assistant/insights/rules.test.ts`

- [ ] **Step 1: Write `training-overdue.ts`**

```ts
import type { AdminSupabase, Insight, InsightContext, InsightRule } from "../types";

interface OverdueRow { id: string }

export const trainingOverdue: InsightRule<OverdueRow[]> = {
  key: "training_overdue",
  category: "compliance",
  basePriority: 90,
  deepLink: "/dashboard/training",
  requiredFeature: "training",
  async fetch(supabase: AdminSupabase, ctx: InsightContext) {
    const { data } = await supabase
      .from("training_enrollments")
      .select("id")
      .eq("org_id", ctx.orgId)
      .eq("status", "overdue");
    return (data ?? []) as OverdueRow[];
  },
  evaluate(rows: OverdueRow[]): Insight | null {
    const n = rows.length;
    if (n === 0) return null;
    return {
      ruleKey: this.key, category: "compliance", priority: this.basePriority,
      title: "Mandatory training overdue",
      body: `${n} training enrollment${n === 1 ? "" : "s"} are overdue`,
      metricCount: n, deepLink: this.deepLink,
    };
  },
};
```

- [ ] **Step 2: Write `docs-unacknowledged.ts`**

```ts
import type { AdminSupabase, Insight, InsightContext, InsightRule } from "../types";

interface DocsData {
  requiredDocIds: string[];
  acksByDoc: Record<string, Set<string>>;
  activeEmployeeIds: string[];
}

export const docsUnacknowledged: InsightRule<DocsData> = {
  key: "docs_unacknowledged",
  category: "compliance",
  basePriority: 85,
  deepLink: "/dashboard/documents",
  requiredFeature: "documents",
  async fetch(supabase: AdminSupabase, ctx: InsightContext): Promise<DocsData> {
    const { data: docs } = await supabase
      .from("documents")
      .select("id")
      .eq("org_id", ctx.orgId)
      .eq("requires_acknowledgment", true)
      .eq("is_company_wide", true);
    const requiredDocIds = ((docs ?? []) as Array<{ id: string }>).map((d) => d.id);
    const { data: emps } = await supabase
      .from("employees")
      .select("id")
      .eq("org_id", ctx.orgId)
      .eq("status", "active");
    const activeEmployeeIds = ((emps ?? []) as Array<{ id: string }>).map((e) => e.id);
    const acksByDoc: Record<string, Set<string>> = {};
    if (requiredDocIds.length > 0) {
      const { data: acks } = await supabase
        .from("document_acknowledgments")
        .select("document_id, employee_id")
        .in("document_id", requiredDocIds);
      for (const a of (acks ?? []) as Array<{ document_id: string; employee_id: string }>) {
        (acksByDoc[a.document_id] ??= new Set()).add(a.employee_id);
      }
    }
    return { requiredDocIds, acksByDoc, activeEmployeeIds };
  },
  evaluate(data: DocsData): Insight | null {
    let outstanding = 0;
    for (const docId of data.requiredDocIds) {
      const acked = data.acksByDoc[docId] ?? new Set<string>();
      for (const empId of data.activeEmployeeIds) if (!acked.has(empId)) outstanding++;
    }
    if (outstanding === 0) return null;
    return {
      ruleKey: this.key, category: "compliance", priority: this.basePriority,
      title: "Documents need acknowledgement",
      body: `${outstanding} required-document acknowledgement${outstanding === 1 ? "" : "s"} outstanding`,
      metricCount: outstanding, deepLink: this.deepLink,
    };
  },
};
```

- [ ] **Step 3: Append tests to `rules.test.ts`**

```ts
import { trainingOverdue } from "@/lib/assistant/insights/rules/training-overdue";
import { docsUnacknowledged } from "@/lib/assistant/insights/rules/docs-unacknowledged";

describe("training_overdue", () => {
  it("flags when there are overdue enrollments", () => {
    expect(trainingOverdue.evaluate([{ id: "1" }, { id: "2" }])?.metricCount).toBe(2);
  });
  it("returns null when none overdue", () => {
    expect(trainingOverdue.evaluate([])).toBeNull();
  });
});

describe("docs_unacknowledged", () => {
  it("counts missing (doc, employee) pairs", () => {
    const out = docsUnacknowledged.evaluate({
      requiredDocIds: ["d1"],
      acksByDoc: { d1: new Set(["e1"]) },
      activeEmployeeIds: ["e1", "e2", "e3"],
    });
    expect(out?.metricCount).toBe(2);
  });
  it("returns null when fully acknowledged", () => {
    const out = docsUnacknowledged.evaluate({
      requiredDocIds: ["d1"], acksByDoc: { d1: new Set(["e1"]) }, activeEmployeeIds: ["e1"],
    });
    expect(out).toBeNull();
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/assistant/insights/rules.test.ts`
Expected: PASS (10 total).

- [ ] **Step 5: Commit**

```bash
git add src/lib/assistant/insights/rules/training-overdue.ts src/lib/assistant/insights/rules/docs-unacknowledged.ts tests/assistant/insights/rules.test.ts
git commit -m "feat(assistant): compliance insight rules"
```

---

## Task 6: People rules (3)

**Files:**
- Create: `src/lib/assistant/insights/rules/new-joiners.ts`
- Create: `src/lib/assistant/insights/rules/probation-window.ts`
- Create: `src/lib/assistant/insights/rules/review-cycle-incomplete.ts`
- Test: append to `tests/assistant/insights/rules.test.ts`

- [ ] **Step 1: Write `new-joiners.ts`**

```ts
import { NEW_JOINER_DAYS, addDays } from "../constants";
import type { AdminSupabase, Insight, InsightContext, InsightRule } from "../types";

interface JoinerRow { id: string; date_of_joining: string }

export const newJoiners: InsightRule<JoinerRow[]> = {
  key: "new_joiners",
  category: "people",
  basePriority: 60,
  deepLink: "/dashboard/employees",
  async fetch(supabase: AdminSupabase, ctx: InsightContext) {
    const since = addDays(ctx.today, -NEW_JOINER_DAYS).toISOString().slice(0, 10);
    const { data } = await supabase
      .from("employees")
      .select("id, date_of_joining")
      .eq("org_id", ctx.orgId)
      .eq("status", "active")
      .gte("date_of_joining", since);
    return (data ?? []) as JoinerRow[];
  },
  evaluate(rows: JoinerRow[]): Insight | null {
    const n = rows.length;
    if (n === 0) return null;
    return {
      ruleKey: this.key, category: "people", priority: this.basePriority,
      title: "New joiners this week",
      body: `${n} employee${n === 1 ? "" : "s"} joined in the last ${NEW_JOINER_DAYS} days`,
      metricCount: n, deepLink: this.deepLink,
    };
  },
};
```

- [ ] **Step 2: Write `probation-window.ts`**

```ts
import { PROBATION_DAYS, PROBATION_LOOKAHEAD_DAYS, addDays } from "../constants";
import type { AdminSupabase, Insight, InsightContext, InsightRule } from "../types";

interface EmpRow { id: string; date_of_joining: string }

export const probationWindow: InsightRule<EmpRow[]> = {
  key: "probation_window",
  category: "people",
  basePriority: 55,
  deepLink: "/dashboard/employees",
  async fetch(supabase: AdminSupabase, ctx: InsightContext) {
    const { data } = await supabase
      .from("employees")
      .select("id, date_of_joining")
      .eq("org_id", ctx.orgId)
      .eq("status", "active");
    return (data ?? []) as EmpRow[];
  },
  evaluate(rows: EmpRow[], ctx: InsightContext): Insight | null {
    const windowEnd = addDays(ctx.today, PROBATION_LOOKAHEAD_DAYS);
    let count = 0;
    for (const e of rows) {
      const probationEnd = addDays(new Date(e.date_of_joining), PROBATION_DAYS);
      if (probationEnd >= ctx.today && probationEnd <= windowEnd) count++;
    }
    if (count === 0) return null;
    return {
      ruleKey: this.key, category: "people", priority: this.basePriority,
      title: "Probation reviews due",
      body: `${count} employee${count === 1 ? "" : "s"} reach ${PROBATION_DAYS}-day probation within a week`,
      metricCount: count, deepLink: this.deepLink,
    };
  },
};
```

- [ ] **Step 3: Write `review-cycle-incomplete.ts`**

```ts
import { REVIEW_CYCLE_END_DAYS, addDays } from "../constants";
import type { AdminSupabase, Insight, InsightContext, InsightRule } from "../types";

interface ReviewData {
  cycles: Array<{ id: string; end_date: string | null }>;
  incompleteByCycle: Record<string, number>;
}

export const reviewCycleIncomplete: InsightRule<ReviewData> = {
  key: "review_cycle_incomplete",
  category: "people",
  basePriority: 75,
  deepLink: "/dashboard/reviews",
  requiredFeature: "reviews",
  async fetch(supabase: AdminSupabase, ctx: InsightContext): Promise<ReviewData> {
    const { data: cyc } = await supabase
      .from("review_cycles")
      .select("id, end_date")
      .eq("org_id", ctx.orgId)
      .eq("status", "active");
    const cycles = (cyc ?? []) as ReviewData["cycles"];
    const incompleteByCycle: Record<string, number> = {};
    for (const c of cycles) {
      const { data: revs } = await supabase
        .from("reviews")
        .select("status")
        .eq("org_id", ctx.orgId)
        .eq("cycle_id", c.id);
      incompleteByCycle[c.id] = ((revs ?? []) as Array<{ status: string }>)
        .filter((r) => r.status !== "completed").length;
    }
    return { cycles, incompleteByCycle };
  },
  evaluate(data: ReviewData, ctx: InsightContext): Insight | null {
    const windowEnd = addDays(ctx.today, REVIEW_CYCLE_END_DAYS);
    let worst = 0;
    for (const c of data.cycles) {
      if (!c.end_date) continue;
      const end = new Date(c.end_date);
      if (end >= ctx.today && end <= windowEnd) {
        worst = Math.max(worst, data.incompleteByCycle[c.id] ?? 0);
      }
    }
    if (worst === 0) return null;
    return {
      ruleKey: this.key, category: "people", priority: this.basePriority,
      title: "Review cycle closing soon",
      body: `${worst} review${worst === 1 ? "" : "s"} still incomplete in a cycle ending this week`,
      metricCount: worst, deepLink: this.deepLink,
    };
  },
};
```

- [ ] **Step 4: Append tests to `rules.test.ts`**

```ts
import { newJoiners } from "@/lib/assistant/insights/rules/new-joiners";
import { probationWindow } from "@/lib/assistant/insights/rules/probation-window";
import { reviewCycleIncomplete } from "@/lib/assistant/insights/rules/review-cycle-incomplete";

describe("new_joiners", () => {
  it("counts joiners in the window", () => {
    expect(newJoiners.evaluate([{ id: "a", date_of_joining: "2026-05-20" }])?.metricCount).toBe(1);
  });
  it("returns null with no joiners", () => expect(newJoiners.evaluate([])).toBeNull());
});

describe("probation_window", () => {
  it("flags an employee hitting 90 days within a week", () => {
    // joined 2026-02-24 → +90d ≈ 2026-05-25, within a week of 2026-05-22
    const out = probationWindow.evaluate([{ id: "a", date_of_joining: "2026-02-24" }], ctx("2026-05-22T00:00:00Z"));
    expect(out?.metricCount).toBe(1);
  });
  it("ignores employees far from probation end", () => {
    expect(probationWindow.evaluate([{ id: "a", date_of_joining: "2026-05-01" }], ctx("2026-05-22T00:00:00Z"))).toBeNull();
  });
});

describe("review_cycle_incomplete", () => {
  it("flags an incomplete cycle ending this week", () => {
    const out = reviewCycleIncomplete.evaluate(
      { cycles: [{ id: "c1", end_date: "2026-05-26" }], incompleteByCycle: { c1: 4 } },
      ctx("2026-05-22T00:00:00Z"));
    expect(out?.metricCount).toBe(4);
  });
  it("returns null when the cycle ends far away", () => {
    const out = reviewCycleIncomplete.evaluate(
      { cycles: [{ id: "c1", end_date: "2026-08-01" }], incompleteByCycle: { c1: 4 } },
      ctx("2026-05-22T00:00:00Z"));
    expect(out).toBeNull();
  });
});
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/assistant/insights/rules.test.ts`
Expected: PASS (16 total).

- [ ] **Step 6: Commit**

```bash
git add src/lib/assistant/insights/rules/new-joiners.ts src/lib/assistant/insights/rules/probation-window.ts src/lib/assistant/insights/rules/review-cycle-incomplete.ts tests/assistant/insights/rules.test.ts
git commit -m "feat(assistant): people insight rules"
```

---

## Task 7: Ops rules (3)

**Files:**
- Create: `src/lib/assistant/insights/rules/grievances-urgent.ts`
- Create: `src/lib/assistant/insights/rules/hiring-stalled.ts`
- Create: `src/lib/assistant/insights/rules/attendance-anomalies.ts`
- Test: append to `tests/assistant/insights/rules.test.ts`

- [ ] **Step 1: Write `grievances-urgent.ts`**

```ts
import type { AdminSupabase, Insight, InsightContext, InsightRule } from "../types";

interface GrvRow { id: string }

export const grievancesUrgent: InsightRule<GrvRow[]> = {
  key: "grievances_urgent",
  category: "ops",
  basePriority: 110,
  deepLink: "/dashboard/grievances",
  requiredFlag: "grievancesEnabled",
  async fetch(supabase: AdminSupabase, ctx: InsightContext) {
    const { data } = await supabase
      .from("grievances")
      .select("id")
      .eq("org_id", ctx.orgId)
      .eq("severity", "urgent")
      .in("status", ["open", "in_review"]);
    return (data ?? []) as GrvRow[];
  },
  evaluate(rows: GrvRow[]): Insight | null {
    const n = rows.length;
    if (n === 0) return null;
    return {
      ruleKey: this.key, category: "ops", priority: this.basePriority,
      title: "Urgent grievances open",
      body: `${n} urgent grievance${n === 1 ? "" : "s"} awaiting resolution`,
      metricCount: n, deepLink: this.deepLink,
    };
  },
};
```

- [ ] **Step 2: Write `hiring-stalled.ts`**

```ts
import { STALLED_STAGE_DAYS, addDays } from "../constants";
import type { AdminSupabase, Insight, InsightContext, InsightRule } from "../types";

interface AppRow { id: string; updated_at: string }

export const hiringStalled: InsightRule<AppRow[]> = {
  key: "hiring_stalled",
  category: "ops",
  basePriority: 80,
  deepLink: "/hire/candidates",
  requiredFlag: "jambaHireEnabled",
  async fetch(supabase: AdminSupabase, ctx: InsightContext) {
    const { data } = await supabase
      .from("applications")
      .select("id, updated_at")
      .eq("org_id", ctx.orgId)
      .not("stage", "in", '("hired","rejected")');
    return (data ?? []) as AppRow[];
  },
  evaluate(rows: AppRow[], ctx: InsightContext): Insight | null {
    const cutoff = addDays(ctx.today, -STALLED_STAGE_DAYS);
    const stalled = rows.filter((r) => new Date(r.updated_at) < cutoff).length;
    if (stalled === 0) return null;
    return {
      ruleKey: this.key, category: "ops", priority: this.basePriority,
      title: "Candidates stalled in pipeline",
      body: `${stalled} application${stalled === 1 ? "" : "s"} have not moved in over ${STALLED_STAGE_DAYS} days`,
      metricCount: stalled, deepLink: this.deepLink,
    };
  },
};
```

> Note: the `.not("stage", "in", ...)` filter string uses PostgREST list syntax. If type-checking complains (Supabase v2 `never` inference — CLAUDE.md gotcha #3), cast the builder call site; the build ignores TS errors anyway.

- [ ] **Step 3: Write `attendance-anomalies.ts`**

```ts
import { addDays } from "../constants";
import type { AdminSupabase, Insight, InsightContext, InsightRule } from "../types";

interface AttRow { auto_closed: boolean }

export const attendanceAnomalies: InsightRule<AttRow[]> = {
  key: "attendance_anomalies",
  category: "ops",
  basePriority: 50,
  deepLink: "/dashboard/attendance",
  requiredFlag: "attendanceEnabled",
  async fetch(supabase: AdminSupabase, ctx: InsightContext) {
    const yesterday = addDays(ctx.today, -1).toISOString().slice(0, 10);
    const { data } = await supabase
      .from("attendance_records")
      .select("auto_closed")
      .eq("org_id", ctx.orgId)
      .eq("date", yesterday);
    return (data ?? []) as AttRow[];
  },
  evaluate(rows: AttRow[]): Insight | null {
    const n = rows.filter((r) => r.auto_closed).length;
    if (n === 0) return null;
    return {
      ruleKey: this.key, category: "ops", priority: this.basePriority,
      title: "Attendance needs review",
      body: `${n} shift${n === 1 ? "" : "s"} were auto-closed yesterday`,
      metricCount: n, deepLink: this.deepLink,
    };
  },
};
```

- [ ] **Step 4: Append tests to `rules.test.ts`**

```ts
import { grievancesUrgent } from "@/lib/assistant/insights/rules/grievances-urgent";
import { hiringStalled } from "@/lib/assistant/insights/rules/hiring-stalled";
import { attendanceAnomalies } from "@/lib/assistant/insights/rules/attendance-anomalies";

describe("grievances_urgent", () => {
  it("flags urgent open grievances", () => {
    expect(grievancesUrgent.evaluate([{ id: "1" }])?.priority).toBe(110);
  });
  it("returns null when none", () => expect(grievancesUrgent.evaluate([])).toBeNull());
});

describe("hiring_stalled", () => {
  it("flags applications not moved in 7 days", () => {
    const out = hiringStalled.evaluate(
      [{ id: "1", updated_at: "2026-05-10T00:00:00Z" }, { id: "2", updated_at: "2026-05-21T00:00:00Z" }],
      ctx("2026-05-22T00:00:00Z"));
    expect(out?.metricCount).toBe(1);
  });
  it("returns null when all are fresh", () => {
    expect(hiringStalled.evaluate([{ id: "2", updated_at: "2026-05-21T00:00:00Z" }], ctx("2026-05-22T00:00:00Z"))).toBeNull();
  });
});

describe("attendance_anomalies", () => {
  it("counts auto-closed shifts", () => {
    expect(attendanceAnomalies.evaluate([{ auto_closed: true }, { auto_closed: false }])?.metricCount).toBe(1);
  });
  it("returns null when none auto-closed", () => {
    expect(attendanceAnomalies.evaluate([{ auto_closed: false }])).toBeNull();
  });
});
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/assistant/insights/rules.test.ts`
Expected: PASS (22 total).

- [ ] **Step 6: Commit**

```bash
git add src/lib/assistant/insights/rules/grievances-urgent.ts src/lib/assistant/insights/rules/hiring-stalled.ts src/lib/assistant/insights/rules/attendance-anomalies.ts tests/assistant/insights/rules.test.ts
git commit -m "feat(assistant): ops insight rules"
```

---

## Task 8: Registry + orchestration (runInsightsForOrg, persistInsights, buildContext)

**Files:**
- Create: `src/lib/assistant/insights/registry.ts`
- Modify: `src/lib/assistant/insights/engine.ts` (add `buildContext`, `runInsightsForOrg`, `persistInsights`)
- Test: `tests/assistant/insights/deep-links.test.ts`

- [ ] **Step 1: Write `registry.ts`**

```ts
import type { InsightRule } from "./types";
import { grievancesUrgent } from "./rules/grievances-urgent";
import { leavePendingApprovals } from "./rules/leave-pending-approvals";
import { trainingOverdue } from "./rules/training-overdue";
import { docsUnacknowledged } from "./rules/docs-unacknowledged";
import { hiringStalled } from "./rules/hiring-stalled";
import { reviewCycleIncomplete } from "./rules/review-cycle-incomplete";
import { leaveConcentration } from "./rules/leave-concentration";
import { newJoiners } from "./rules/new-joiners";
import { probationWindow } from "./rules/probation-window";
import { attendanceAnomalies } from "./rules/attendance-anomalies";
import { leaveBalanceExpiry } from "./rules/leave-balance-expiry";

// Ordered by basePriority (descending) for readability; engine re-sorts results anyway.
export const INSIGHT_RULES: InsightRule[] = [
  grievancesUrgent,
  leavePendingApprovals,
  trainingOverdue,
  docsUnacknowledged,
  hiringStalled,
  reviewCycleIncomplete,
  leaveConcentration,
  newJoiners,
  probationWindow,
  attendanceAnomalies,
  leaveBalanceExpiry,
];
```

- [ ] **Step 2: Add orchestration to `engine.ts`**

Append to `src/lib/assistant/insights/engine.ts`:

```ts
import { istNow, istDateString } from "./constants";
import type { AdminSupabase, Insight, InsightContext } from "./types";
import type { OrgPlan } from "@/config/plans";
import { INSIGHT_RULES } from "./registry";

export async function buildContext(supabase: AdminSupabase, orgId: string): Promise<InsightContext> {
  const { data } = await supabase
    .from("organizations")
    .select("plan, settings")
    .eq("id", orgId)
    .single();
  const row = (data ?? {}) as { plan?: string; settings?: Record<string, unknown> };
  const settings = row.settings ?? {};
  return {
    orgId,
    plan: (row.plan as OrgPlan) ?? "starter",
    today: istNow(),
    flags: {
      jambaHireEnabled: !!settings["jambahire_enabled"],
      attendanceEnabled: !!settings["attendance_enabled"],
      grievancesEnabled: !!settings["grievances_enabled"],
    },
  };
}

export async function runInsightsForOrg(supabase: AdminSupabase, orgId: string): Promise<Insight[]> {
  const ctx = await buildContext(supabase, orgId);
  const out: Insight[] = [];
  for (const rule of INSIGHT_RULES) {
    if (!isRuleApplicable(rule, ctx)) continue;
    try {
      const data = await rule.fetch(supabase, ctx);
      const insight = rule.evaluate(data, ctx);
      if (insight) out.push(insight);
    } catch (err) {
      console.warn(`[insights] rule ${rule.key} failed for org ${orgId}:`, err);
    }
  }
  return out;
}

/** Replace today's non-dismissed rows for the org with a fresh set. Keeps dismissed rows. */
export async function persistInsights(supabase: AdminSupabase, orgId: string, insights: Insight[]): Promise<void> {
  const computedFor = istDateString(istNow());
  await supabase
    .from("assistant_insights")
    .delete()
    .eq("org_id", orgId)
    .eq("computed_for", computedFor)
    .is("dismissed_at", null);
  if (insights.length === 0) return;
  const rows = insights.map((i) => ({
    org_id: orgId, rule_key: i.ruleKey, category: i.category, priority: i.priority,
    title: i.title, body: i.body, metric_count: i.metricCount, deep_link: i.deepLink,
    computed_for: computedFor,
  }));
  await supabase.from("assistant_insights").upsert(rows, { onConflict: "org_id,rule_key,computed_for" });
}
```

- [ ] **Step 3: Write the deep-link integrity test**

```ts
// tests/assistant/insights/deep-links.test.ts
import { describe, it, expect } from "vitest";
import { INSIGHT_RULES } from "@/lib/assistant/insights/registry";

describe("insight rule registry", () => {
  it("has 11 rules with unique keys", () => {
    expect(INSIGHT_RULES.length).toBe(11);
    expect(new Set(INSIGHT_RULES.map((r) => r.key)).size).toBe(11);
  });
  it("every deepLink points to a known dashboard or hire route", () => {
    for (const r of INSIGHT_RULES) {
      expect(r.deepLink.startsWith("/dashboard/") || r.deepLink.startsWith("/hire/")).toBe(true);
    }
  });
  it("every rule has a positive basePriority and valid category", () => {
    const cats = new Set(["leave", "compliance", "people", "ops"]);
    for (const r of INSIGHT_RULES) {
      expect(r.basePriority).toBeGreaterThan(0);
      expect(cats.has(r.category)).toBe(true);
    }
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/assistant/insights/deep-links.test.ts`
Expected: PASS (3).

- [ ] **Step 5: Commit**

```bash
git add src/lib/assistant/insights/registry.ts src/lib/assistant/insights/engine.ts tests/assistant/insights/deep-links.test.ts
git commit -m "feat(assistant): insights registry + orchestration"
```

---

## Task 9: Server actions

**Files:**
- Create: `src/actions/assistant-insights.ts`

- [ ] **Step 1: Write the actions**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import { istNow, istDateString } from "@/lib/assistant/insights/constants";
import { runInsightsForOrg, persistInsights, selectTopInsights } from "@/lib/assistant/insights/engine";
import type { Insight } from "@/lib/assistant/insights/types";
import type { ActionResult } from "@/types";

function mapRow(r: Record<string, unknown>): Insight {
  return {
    ruleKey: String(r.rule_key), category: r.category as Insight["category"],
    priority: Number(r.priority), title: String(r.title), body: String(r.body),
    metricCount: r.metric_count == null ? null : Number(r.metric_count),
    deepLink: String(r.deep_link),
  };
}

async function readTop(supabase: ReturnType<typeof createAdminSupabase>, orgId: string): Promise<Insight[]> {
  const computedFor = istDateString(istNow());
  const { data } = await supabase
    .from("assistant_insights")
    .select("rule_key, category, priority, title, body, metric_count, deep_link")
    .eq("org_id", orgId)
    .eq("computed_for", computedFor)
    .is("dismissed_at", null)
    .order("priority", { ascending: false })
    .limit(3);
  return ((data ?? []) as Array<Record<string, unknown>>).map(mapRow);
}

export async function getInsights(): Promise<ActionResult<Insight[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };
  if (!user.assistantEnabled || (user.plan !== "growth" && user.plan !== "business" && user.plan !== "custom")) {
    return { success: true, data: [] };
  }
  const supabase = createAdminSupabase();
  const computedFor = istDateString(istNow());

  // Same-day fallback: if NO rows exist for today (cron hasn't run), compute inline.
  const { count } = await supabase
    .from("assistant_insights")
    .select("id", { count: "exact", head: true })
    .eq("org_id", user.orgId)
    .eq("computed_for", computedFor);
  if ((count ?? 0) === 0) {
    const fresh = await runInsightsForOrg(supabase, user.orgId);
    await persistInsights(supabase, user.orgId, fresh);
  }
  return { success: true, data: await readTop(supabase, user.orgId) };
}

export async function refreshInsights(): Promise<ActionResult<Insight[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };
  const supabase = createAdminSupabase();
  const fresh = await runInsightsForOrg(supabase, user.orgId);
  await persistInsights(supabase, user.orgId, fresh);
  revalidatePath("/dashboard");
  return { success: true, data: selectTopInsights(fresh) };
}

export async function dismissInsight(ruleKey: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };
  const supabase = createAdminSupabase();
  const computedFor = istDateString(istNow());
  const { error } = await supabase
    .from("assistant_insights")
    .update({ dismissed_at: new Date().toISOString(), dismissed_by: user.employeeId })
    .eq("org_id", user.orgId)
    .eq("computed_for", computedFor)
    .eq("rule_key", ruleKey);
  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard");
  return { success: true, data: undefined };
}
```

> `dismissInsight` keys on `rule_key` (stable per day per org) rather than the row UUID, so the client doesn't need to carry DB ids. Per-org dismissal (design §9.1).

- [ ] **Step 2: Type-check the file compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no NEW errors referencing `assistant-insights.ts`. (Pre-existing Supabase `never` errors elsewhere are expected — gotcha #3.)

- [ ] **Step 3: Commit**

```bash
git add src/actions/assistant-insights.ts
git commit -m "feat(assistant): insights server actions (get/refresh/dismiss)"
```

---

## Task 10: Cron route + vercel.json + posthog events

**Files:**
- Create: `src/app/api/cron/assistant-insights/route.ts`
- Modify: `vercel.json`
- Modify: `src/lib/assistant/posthog-events.ts`
- Test: `tests/assistant/insights/cron-auth.test.ts`

- [ ] **Step 1: Write the cron route**

```ts
// src/app/api/cron/assistant-insights/route.ts
import { createAdminSupabase } from "@/lib/supabase/server";
import { runInsightsForOrg, persistInsights } from "@/lib/assistant/insights/engine";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminSupabase();
  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, plan, settings")
    .in("plan", ["growth", "business", "custom"]);

  let swept = 0;
  for (const o of (orgs ?? []) as Array<{ id: string; settings?: Record<string, unknown> }>) {
    if (!o.settings?.["assistant_enabled"]) continue;
    try {
      const insights = await runInsightsForOrg(supabase, o.id);
      await persistInsights(supabase, o.id, insights);
      swept++;
    } catch (err) {
      console.warn(`[assistant-insights] org ${o.id} failed:`, err);
    }
  }

  return NextResponse.json({ ok: true, swept });
}
```

- [ ] **Step 2: Register the cron in `vercel.json`**

Add this object to the `crons` array (after the `assistant-redact` entry, before the closing `]`):

```json
    ,{
      "path": "/api/cron/assistant-insights",
      "schedule": "0 2 * * *"
    }
```

(Final array tail should read: the `assistant-redact` entry, then this one. Ensure valid JSON — the new object needs a leading comma after the previous `}`.)

- [ ] **Step 3: Add PostHog event variants**

In `src/lib/assistant/posthog-events.ts`, extend the `AssistantEvent` union — add these members before the closing `;`:

```ts
  | { name: "insight_shown"; props: { rule_key: string } }
  | { name: "insight_clicked"; props: { rule_key: string } }
  | { name: "insight_dismissed"; props: { rule_key: string } }
  | { name: "insights_refreshed"; props: { count: number } }
```

- [ ] **Step 4: Write the cron auth test**

```ts
// tests/assistant/insights/cron-auth.test.ts
import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/cron/assistant-insights/route";

describe("assistant-insights cron auth", () => {
  it("rejects requests without the bearer token", async () => {
    const res = await GET(new Request("https://x/api/cron/assistant-insights"));
    expect(res.status).toBe(401);
  });
  it("rejects a wrong token", async () => {
    const res = await GET(new Request("https://x/api/cron/assistant-insights", {
      headers: { authorization: "Bearer nope" },
    }));
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 5: Run the cron auth test**

Run: `npx vitest run tests/assistant/insights/cron-auth.test.ts`
Expected: PASS (2). (Unauthorized path returns before any DB access, so no Supabase env is needed.)

- [ ] **Step 6: Commit**

```bash
git add src/app/api/cron/assistant-insights/route.ts vercel.json src/lib/assistant/posthog-events.ts tests/assistant/insights/cron-auth.test.ts
git commit -m "feat(assistant): insights daily cron + posthog events"
```

---

## Task 11: Dashboard UI — InsightsCards component + page wiring

**Files:**
- Create: `src/components/dashboard/insights-cards.tsx`
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Write the client component**

```tsx
// src/components/dashboard/insights-cards.tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Lightbulb, RefreshCw, X, ChevronRight,
  CalendarClock, ShieldAlert, Users, Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { trackAssistant } from "@/lib/assistant/posthog-events";
import { refreshInsights, dismissInsight } from "@/actions/assistant-insights";
import type { Insight, InsightCategory } from "@/lib/assistant/insights/types";

const CATEGORY_META: Record<InsightCategory, { icon: typeof Lightbulb; tint: string }> = {
  leave: { icon: CalendarClock, tint: "text-sky-600 bg-sky-50" },
  compliance: { icon: ShieldAlert, tint: "text-amber-600 bg-amber-50" },
  people: { icon: Users, tint: "text-violet-600 bg-violet-50" },
  ops: { icon: Activity, tint: "text-rose-600 bg-rose-50" },
};

export function InsightsCards({ insights: initial }: { insights: Insight[] }) {
  const [insights, setInsights] = useState<Insight[]>(initial);
  const [pending, startTransition] = useTransition();

  if (insights.length === 0) return null; // hide entirely when nothing to surface

  const onRefresh = () =>
    startTransition(async () => {
      const res = await refreshInsights();
      if (res.success) {
        setInsights(res.data);
        trackAssistant({ name: "insights_refreshed", props: { count: res.data.length } });
      } else {
        toast.error(res.error);
      }
    });

  const onDismiss = (ruleKey: string) => {
    setInsights((cur) => cur.filter((i) => i.ruleKey !== ruleKey)); // optimistic
    trackAssistant({ name: "insight_dismissed", props: { rule_key: ruleKey } });
    startTransition(async () => {
      const res = await dismissInsight(ruleKey);
      if (!res.success) toast.error(res.error);
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Lightbulb className="h-4 w-4 text-accent" /> Insights
        </h2>
        <button
          onClick={onRefresh}
          disabled={pending}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", pending && "animate-spin")} /> Refresh
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {insights.map((i) => {
          const meta = CATEGORY_META[i.category];
          const Icon = meta.icon;
          return (
            <div key={i.ruleKey} className="relative rounded-xl border border-border bg-card p-4">
              <button
                aria-label="Dismiss"
                onClick={() => onDismiss(i.ruleKey)}
                className="absolute right-2 top-2 rounded p-1 text-muted-foreground/60 hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <div className={cn("inline-flex rounded-lg p-2", meta.tint)}>
                <Icon className="h-4 w-4" />
              </div>
              <p className="mt-3 text-sm font-semibold text-foreground">{i.title}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{i.body}</p>
              <Link
                href={i.deepLink}
                onClick={() => trackAssistant({ name: "insight_clicked", props: { rule_key: i.ruleKey } })}
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                View <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the admin dashboard branch**

In `src/app/dashboard/page.tsx`:

1. Add imports near the other component imports at the top:

```tsx
import { InsightsCards } from "@/components/dashboard/insights-cards";
import { getInsights } from "@/actions/assistant-insights";
```

2. In the admin branch (after `const statCards = buildStatCards(data);`, around line 258), fetch insights:

```tsx
  const insightsResult = await getInsights();
  const insights = insightsResult.success ? insightsResult.data : [];
```

3. In the admin JSX `return (...)`, insert the section between the announcement-banners block and the stat-cards block (after the closing `)}` of `latestAnnouncements`, before `{/* Stat cards */}`):

```tsx
      {/* Proactive insights (admin only) */}
      <InsightsCards insights={insights} />
```

- [ ] **Step 3: Build to verify it compiles + renders**

Run: `npm run build`
Expected: build succeeds, no new errors. The route map still lists `/dashboard` and now `/api/cron/assistant-insights`.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/insights-cards.tsx src/app/dashboard/page.tsx
git commit -m "feat(assistant): insights cards on admin dashboard"
```

---

## Task 12: Docs + full verification

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/planning/ai-hr-assistant-plan.md`

- [ ] **Step 1: Update `CLAUDE.md`**

1. In the Cron Jobs table, add a row:

```
| `/api/cron/assistant-insights` | `0 2 * * *` | 7:30am | Phase 5 — recompute admin dashboard proactive-insight cards per enabled org (deterministic rules, no LLM). Bearer CRON_SECRET. |
```

2. In the AI Assistant migrations line, append `028` description: `028 (Phase 5 — assistant_insights table)`.

3. In the AI Assistant "Phase progression" list, change the Phase 5 line to:

```
- **Phase 5** (shipped 2026-05-22) — proactive insights: admin-only deterministic insight cards on the dashboard (11 SQL-backed rules, no LLM), daily cron + manual refresh + same-day fallback, per-org dismissal. Gated on assistant_enabled + Growth/Business. Migration 028. **Still no write tools (OQ-9).**
```

4. Add gotcha entries (next numbers after 74):

```
75. **Phase 5 insights are deterministic, NOT LLM**: `src/lib/assistant/insights/` rules query Supabase directly (admin client) and emit plain facts — no model in the loop, no INR-budget interaction. This is the same access pattern as `getDashboardData`; it does NOT depend on the parked Phase 3 structured-data tools.
76. **Insight rule shape = `fetch` (impure) + `evaluate` (pure)**: only `evaluate` is unit-tested (fixtures, no DB). Add a new rule by creating `rules/<key>.ts` and registering it in `registry.ts`; the deep-links test asserts the registry stays at the expected count with unique keys + valid routes.
77. **Insight dismissal is per-org, keyed by `rule_key`+`computed_for`**: any admin dismissing hides the card for the org's admins that day; the daily cron regenerates fresh rows. Per-user dismissal is a deliberate v1 omission.
78. **`getInsights` has a same-day fallback**: if no `assistant_insights` rows exist for today (cron hasn't run yet), it computes + persists inline on first admin load. `refreshInsights` (manual button) always recomputes and replaces today's non-dismissed rows.
```

- [ ] **Step 2: Update the planning doc**

In `docs/planning/ai-hr-assistant-plan.md`, change the `### Phase 5 — Proactive Insights` heading line to append ` — shipped 2026-05-22` and update its bullets to past tense (background sweep implemented as `/api/cron/assistant-insights`, 11 rules, admin-only).

- [ ] **Step 3: Run the full assistant test suite**

Run: `npx vitest run tests/assistant`
Expected: PASS, including the 4 new insights files (engine 7, rules 22, deep-links 3, cron-auth 2).

- [ ] **Step 4: Lint + build**

Run: `npm run lint`
Expected: no new errors (the `no-orphan-dashboard-route` rule is satisfied — no new `/dashboard/*` page was added).

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/planning/ai-hr-assistant-plan.md
git commit -m "docs(assistant): Phase 5 proactive insights — cron, migration 028, gotchas 75-78"
```

---

## Manual smoke test (after deploy or on a seeded local org)

1. Ensure the demo org (`test1`) has `assistant_enabled = true` and plan growth/business.
2. Open `/dashboard` as an admin → an "Insights" section appears with up to 3 cards (only if any rule fires on the seed data).
3. Click **Refresh** → cards recompute (spinner, then list updates).
4. Click ✕ on a card → it disappears; reload → still gone for today.
5. Hit `GET /api/cron/assistant-insights` with `Authorization: Bearer $CRON_SECRET` → `{ ok: true, swept: N }`.
6. Open `/dashboard` as an **employee** → no Insights section (admins-only).

---

## Self-review notes (author)

- **Spec coverage:** §3 gating → Task 9 actions + Task 10 cron filter; §4 table → Task 1; §5 engine/rules → Tasks 2–8; §6 cron/actions/UI → Tasks 9–11; §7 tests → Tasks 3–10; §8 docs → Task 12. All covered.
- **Type consistency:** `Insight`/`InsightRule`/`InsightContext`/`AdminSupabase` defined in Task 2 and used unchanged throughout. `dismissInsight(ruleKey)` matches the component call. `selectTopInsights`/`runInsightsForOrg`/`persistInsights`/`buildContext`/`isRuleApplicable` names are consistent across engine, actions, and cron.
- **Known caveat:** Supabase v2 may infer `never` on some `.from()` chains (gotcha #3); the build ignores TS errors, and pure `evaluate` tests don't touch the client, so suite stays green.
