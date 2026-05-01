# Pricing Overhaul — Phase 1: Foundations & Plumbing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the database schema, type definitions, billing config, environment variable hygiene, and webhook safeguards needed for Phases 2 and 3 — without changing any existing user-facing behavior.

**Architecture:** Purely additive. No existing code path changes behavior. New schema columns and tables sit unused until Phase 2 wires the new pricing logic. Existing `growth` and `business` subscriptions continue working unchanged. The only behavioral changes are server-side: admin-role guard on billing actions and webhook event deduplication — both invisible to end users on the happy path.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase Postgres + RLS, Razorpay, Clerk auth.

**Spec:** See `docs/superpowers/specs/2026-05-01-pricing-overhaul-design.md` for full design rationale and Phases 2-3 scope.

**Audit:** See `docs/billing/2026-05-01-payment-flow-audit.md` for the 12 known bugs. Phase 1 covers fixes #7, #8, #9, #10, #11.

**Testing posture:** Project has no Jest/Vitest setup. Each task ends with manual verification (TypeScript check, SQL inspection, build) plus a git commit. Verification steps replace test runs.

---

## Task 1: Run database migrations on Supabase

**Files:** No code changes. SQL run manually on the live Supabase project (`imjwqktxzahhnfmfbtfc`) via the Dashboard SQL Editor.

**Why manual:** Per the project's `CLAUDE.md` gotcha, Supabase CLI does not install globally on Windows. New tables/columns since the initial migration are added via the SQL Editor.

- [ ] **Step 1: Open the Supabase SQL Editor**

Go to the Supabase Dashboard for the JambaHR project. Navigate to **SQL Editor → New query**.

- [ ] **Step 2: Run the column additions on `organizations`**

Paste and run this exact SQL block:

```sql
alter table organizations
  add column if not exists billing_cycle text check (billing_cycle in ('monthly','annual')),
  add column if not exists subscription_status text check (subscription_status in ('active','paused','halted','pending','cancelled')),
  add column if not exists platform_fee_paid integer not null default 0,
  add column if not exists gstin text,
  add column if not exists custom_features jsonb,
  add column if not exists custom_per_feature_rate integer,
  add column if not exists custom_platform_fee integer,
  add column if not exists custom_max_employees integer,
  add column if not exists subscription_paused_at timestamptz;
```

Expected: `Success. No rows returned.`

- [ ] **Step 3: Update the `plan` check constraint to include `'custom'`**

Paste and run:

```sql
alter table organizations drop constraint if exists organizations_plan_check;
alter table organizations
  add constraint organizations_plan_check
  check (plan in ('starter','growth','business','custom'));
```

Expected: `Success. No rows returned.`

- [ ] **Step 4: Create `custom_plan_requests` table**

Paste and run:

```sql
create table if not exists custom_plan_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  requested_by_employee_id uuid references employees(id) on delete set null,
  requested_features jsonb not null,
  requested_employees integer not null check (requested_employees >= 1),
  requested_billing_cycle text not null check (requested_billing_cycle in ('monthly','annual')),
  status text not null default 'pending'
    check (status in ('pending','counter_offered','accepted','rejected','approved','cancelled')),
  founder_platform_fee integer,
  founder_per_feature_rate integer,
  founder_max_employees integer,
  founder_notes text,
  rejection_reason text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  activated_at timestamptz
);
create index if not exists idx_custom_plan_requests_org_status
  on custom_plan_requests (org_id, status);
alter table custom_plan_requests enable row level security;
```

Expected: `Success. No rows returned.`

- [ ] **Step 5: Create `webhook_events` table**

Paste and run:

```sql
create table if not exists webhook_events (
  id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);
alter table webhook_events enable row level security;
```

Expected: `Success. No rows returned.`

- [ ] **Step 6: Verify all changes exist**

Paste and run this verification query:

```sql
select
  (select count(*) from information_schema.columns
    where table_name = 'organizations'
    and column_name in ('billing_cycle','subscription_status','platform_fee_paid','gstin',
                        'custom_features','custom_per_feature_rate','custom_platform_fee',
                        'custom_max_employees','subscription_paused_at')) as new_org_columns,
  (select count(*) from information_schema.tables
    where table_name = 'custom_plan_requests') as has_custom_plan_requests,
  (select count(*) from information_schema.tables
    where table_name = 'webhook_events') as has_webhook_events;
```

Expected: `new_org_columns = 9, has_custom_plan_requests = 1, has_webhook_events = 1`.

If any number is off, re-run the relevant earlier step.

- [ ] **Step 7: Important — NO backfill UPDATE**

Per the design spec, do NOT run any UPDATE on existing `organizations` rows to populate `billing_cycle` or `subscription_status`. Existing paid orgs (test1) sit at NULL for these fields. Code-level handling treats NULL as "legacy active monthly" wherever it matters. This is intentional.

- [ ] **Step 8: No commit**

This task makes no code changes. Note in your worklog that the migration is applied.

---

## Task 2: Extend database types

**Files:**
- Modify: `src/types/database.types.ts`

This file describes the Supabase table schemas to TypeScript. It must be updated to reflect the new columns and tables so server actions can type-check against them.

- [ ] **Step 1: Read the current file**

Read `src/types/database.types.ts` so you understand its current structure. The `organizations` table type appears as `Tables.organizations` with `Row`, `Insert`, and `Update` shapes. The `plan` field is currently a union literal `"starter" | "growth" | "business"`.

- [ ] **Step 2: Update the `plan` literal in `organizations` Row, Insert, Update**

Find every occurrence of `"starter" | "growth" | "business"` in `Tables.organizations` (typically in `Row.plan`, `Insert.plan`, `Update.plan`) and replace with:

```ts
"starter" | "growth" | "business" | "custom"
```

- [ ] **Step 3: Add 9 new columns to `organizations` Row**

Inside `Tables.organizations.Row`, add these fields. Place them near the existing `plan`, `stripe_customer_id`, `stripe_subscription_id` fields for grouping:

```ts
billing_cycle: "monthly" | "annual" | null
subscription_status: "active" | "paused" | "halted" | "pending" | "cancelled" | null
platform_fee_paid: number
gstin: string | null
custom_features: unknown
custom_per_feature_rate: number | null
custom_platform_fee: number | null
custom_max_employees: number | null
subscription_paused_at: string | null
```

`custom_features` is JSONB. Use `unknown` (Supabase v2 convention) rather than a specific shape — Phase 3 will narrow it.

- [ ] **Step 4: Add the same 9 fields to Insert and Update shapes**

In `Tables.organizations.Insert` and `Tables.organizations.Update`, add the same 9 fields with the same types but make them all optional (`?:`). For Update, the value type should be the field type as written above (e.g., `billing_cycle?: "monthly" | "annual" | null`). For Insert, the same shape but `platform_fee_paid` defaults to 0 in the DB so it can be omitted.

- [ ] **Step 5: Add `custom_plan_requests` table type**

Inside `Database["public"]["Tables"]`, add a new entry alongside `organizations`:

```ts
custom_plan_requests: {
  Row: {
    id: string
    org_id: string
    requested_by_employee_id: string | null
    requested_features: unknown
    requested_employees: number
    requested_billing_cycle: "monthly" | "annual"
    status: "pending" | "counter_offered" | "accepted" | "rejected" | "approved" | "cancelled"
    founder_platform_fee: number | null
    founder_per_feature_rate: number | null
    founder_max_employees: number | null
    founder_notes: string | null
    rejection_reason: string | null
    created_at: string
    reviewed_at: string | null
    activated_at: string | null
  }
  Insert: {
    id?: string
    org_id: string
    requested_by_employee_id?: string | null
    requested_features: unknown
    requested_employees: number
    requested_billing_cycle: "monthly" | "annual"
    status?: "pending" | "counter_offered" | "accepted" | "rejected" | "approved" | "cancelled"
    founder_platform_fee?: number | null
    founder_per_feature_rate?: number | null
    founder_max_employees?: number | null
    founder_notes?: string | null
    rejection_reason?: string | null
    created_at?: string
    reviewed_at?: string | null
    activated_at?: string | null
  }
  Update: {
    id?: string
    org_id?: string
    requested_by_employee_id?: string | null
    requested_features?: unknown
    requested_employees?: number
    requested_billing_cycle?: "monthly" | "annual"
    status?: "pending" | "counter_offered" | "accepted" | "rejected" | "approved" | "cancelled"
    founder_platform_fee?: number | null
    founder_per_feature_rate?: number | null
    founder_max_employees?: number | null
    founder_notes?: string | null
    rejection_reason?: string | null
    created_at?: string
    reviewed_at?: string | null
    activated_at?: string | null
  }
}
```

- [ ] **Step 6: Add `webhook_events` table type**

Inside `Database["public"]["Tables"]`, add:

```ts
webhook_events: {
  Row: {
    id: string
    event_type: string
    processed_at: string
  }
  Insert: {
    id: string
    event_type: string
    processed_at?: string
  }
  Update: {
    id?: string
    event_type?: string
    processed_at?: string
  }
}
```

- [ ] **Step 7: Type-check**

```bash
npx tsc --noEmit 2>&1 | tail -20
```

Expected: no NEW errors. The pre-existing baseline errors in `src/lib/superadmin-data.ts` and other action files (Supabase v2 `never` inference) will still appear — those are unchanged.

If any new error references `plan: "starter" | "growth" | "business"` (the old literal), fix that occurrence in the codebase to include `"custom"`. Common spots: `src/lib/current-user.ts`, `src/types/index.ts`. Fix only what's needed to make tsc clean.

- [ ] **Step 8: Commit**

```bash
git add src/types/database.types.ts
git commit -m "feat(billing): extend database types with new pricing columns and tables"
```

---

## Task 3: Add new billing types

**Files:**
- Modify: `src/types/index.ts`

This file holds shared type aliases like `OrgPlan`. Add new ones for billing cycle and subscription status.

- [ ] **Step 1: Read the current file**

Read `src/types/index.ts`. Find the `OrgPlan` type (currently `"starter" | "growth" | "business"`).

- [ ] **Step 2: Update `OrgPlan` to include `"custom"`**

Change the line to:

```ts
export type OrgPlan = "starter" | "growth" | "business" | "custom";
```

- [ ] **Step 3: Add new billing types**

Add these new exports near `OrgPlan`:

```ts
export type BillingCycle = "monthly" | "annual";

export type SubscriptionStatus = "active" | "paused" | "halted" | "pending" | "cancelled";
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit 2>&1 | tail -20
```

Expected: no new errors. Anywhere `OrgPlan` is used in `switch` statements without a `default` case, TypeScript may now warn about non-exhaustive matching for `"custom"`. Fix any such warnings by adding the `"custom"` case (returning the same as `"business"` is a reasonable v1 placeholder until Phase 3 wires Custom features).

Common locations to check (use grep):
- `src/config/plans.ts` — `hasFeature`, `PLAN_LABELS`, `PLAN_COLORS`, `PLAN_UNLOCK_HIGHLIGHTS`
- `src/lib/razorpay.ts` — `PLANS` literal keys
- `src/components/layout/upgrade-gate.tsx`

For each, add a minimal `"custom"` entry:
- `PLAN_LABELS.custom = "Custom"`
- `PLAN_COLORS.custom` = same value as `PLAN_COLORS.business`
- `PLAN_UNLOCK_HIGHLIGHTS.custom = []` (or whatever the empty default for that map is — Phase 3 will populate)
- `PLAN_FEATURES.custom = []` — empty array, NOT a copy of `PLAN_FEATURES.business`. Phase 3 wires per-org Custom feature reads at runtime via the `custom_features` JSONB column. An empty array here means "no Custom orgs unlocked yet" which is true today and correct for Phase 1.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/config/plans.ts src/lib/razorpay.ts src/components/layout/upgrade-gate.tsx
git commit -m "feat(billing): add BillingCycle, SubscriptionStatus types; extend OrgPlan with 'custom'"
```

(Only stage the files you actually modified — `git status` will tell you.)

---

## Task 4: Create `src/config/billing.ts`

**Files:**
- Create: `src/config/billing.ts`

Single source of truth for billing constants. No consumers in Phase 1; Phase 2 wires it into `billing.ts` and the pricing page.

- [ ] **Step 1: Create the file**

Create `src/config/billing.ts` with this exact content:

```ts
import type { OrgPlan, BillingCycle } from "@/types";

/**
 * GST rate applied to all paid amounts in India (services).
 * Stored as a percent integer; convert to multiplier when computing.
 */
export const GST_PCT = 18;

/**
 * Annual billing = 10x monthly. Customer perception: "2 months free".
 */
export const ANNUAL_MULTIPLIER = 10;

/**
 * Plans that have a recurring charge (Starter is free; Custom is per-org).
 */
export const PAID_PLANS: ReadonlyArray<OrgPlan> = ["growth", "business", "custom"];

/**
 * One-time platform fee per tier, in paise.
 * Custom tier is founder-set per approval; this is the picker default.
 */
export const PLATFORM_FEES: Record<OrgPlan, number> = {
  starter: 0,
  growth: 299900,    // ₹2,999
  business: 699900,  // ₹6,999
  custom: 499900,    // ₹4,999 default; founder may override per-org
};

/**
 * Per-employee monthly recurring rate, in paise.
 * Custom is computed from custom_features × custom_per_feature_rate at runtime.
 */
export const PER_EMPLOYEE_MONTHLY_RATE: Record<Exclude<OrgPlan, "custom">, number> = {
  starter: 0,
  growth: 50000,    // ₹500
  business: 80000,  // ₹800
};

/**
 * Default per-feature rate for Custom plan, in paise per employee per month.
 * Founder may override at approval time.
 */
export const CUSTOM_PER_FEATURE_DEFAULT_RATE = 12000; // ₹120

/**
 * Default max employees for a new Custom plan.
 * Founder may override at approval time.
 */
export const CUSTOM_DEFAULT_MAX_EMPLOYEES = 200;

/**
 * Features individually selectable on the Custom plan picker.
 * Excludes infrastructure-only flags (api, analytics, semantic_search, ai_*)
 * which only ship as part of full Business tier.
 */
export const CUSTOM_PICKER_FEATURES: ReadonlyArray<string> = [
  "documents",
  "reviews",
  "objectives",
  "training",
  "hiring_jd",
  "payroll",
  "ats",
  "interview_scheduling",
  "offer_letters",
  "onboarding_workflows",
];

/**
 * Compute the recurring amount in paise for a paid tier.
 * Custom plans use computeCustomRecurringPaise instead.
 */
export function computeRecurringPaise(
  plan: Exclude<OrgPlan, "custom">,
  cycle: BillingCycle,
  employeeCount: number
): number {
  const monthlyRate = PER_EMPLOYEE_MONTHLY_RATE[plan];
  const monthlyAmount = monthlyRate * employeeCount;
  return cycle === "annual" ? monthlyAmount * ANNUAL_MULTIPLIER : monthlyAmount;
}

/**
 * Compute the recurring amount in paise for a Custom plan.
 */
export function computeCustomRecurringPaise(
  perFeatureRate: number,
  featureCount: number,
  employeeCount: number,
  cycle: BillingCycle
): number {
  const monthlyAmount = perFeatureRate * featureCount * employeeCount;
  return cycle === "annual" ? monthlyAmount * ANNUAL_MULTIPLIER : monthlyAmount;
}

/**
 * Compute the platform fee delta the org must pay to upgrade to a target tier.
 * Returns 0 for downgrades or sideways moves (no refund policy).
 */
export function computePlatformFeeDelta(
  targetPlatformFee: number,
  alreadyPaid: number
): number {
  return Math.max(0, targetPlatformFee - alreadyPaid);
}

/**
 * Format paise as a localized rupee string for display (e.g., 299900 → "₹2,999").
 * Does NOT include "+ GST" suffix — that's the caller's choice.
 */
export function formatPaise(paise: number): string {
  const rupees = Math.round(paise / 100);
  return `₹${rupees.toLocaleString("en-IN")}`;
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit 2>&1 | tail -10
```

Expected: no new errors related to `src/config/billing.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/config/billing.ts
git commit -m "feat(billing): add config/billing.ts with rates, fees, and computation helpers"
```

---

## Task 5: Update `.env.example`

**Files:**
- Modify: `.env.example`

The current `.env.example` documents only Stripe vars. Razorpay env vars (which are actually used) are absent — this is audit bug #8. Add Razorpay vars and remove Stripe vars.

- [ ] **Step 1: Read the current file**

Read `.env.example` to see what's there.

- [ ] **Step 2: Replace Stripe section with Razorpay**

Find any Stripe-related entries (e.g., `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_*_PRICE_ID`). Remove them.

Add a new Razorpay section. Place it where the Stripe section was, or near other payment-related config:

```
# ─── Razorpay (active payment provider) ──────────────────────────────────────
NEXT_PUBLIC_RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=

# Plan IDs created in the Razorpay dashboard. Each plan is per-employee.
# Growth: ₹500/employee/month, ₹5,000/employee/year (10x monthly).
# Business: ₹800/employee/month, ₹8,000/employee/year (10x monthly).
RAZORPAY_GROWTH_MONTHLY_PLAN_ID=
RAZORPAY_GROWTH_ANNUAL_PLAN_ID=
RAZORPAY_BUSINESS_MONTHLY_PLAN_ID=
RAZORPAY_BUSINESS_ANNUAL_PLAN_ID=
```

The four plan IDs above are the new Phase 2 / Phase 3 plans. They are added to `.env.example` now so deploy environments are configured ahead of Phase 2 going live. Phase 1 does not consume them.

If the existing `.env.example` already has `RAZORPAY_GROWTH_PLAN_ID` and `RAZORPAY_BUSINESS_PLAN_ID` (single-cycle, legacy), remove those — Phase 2 will replace them with the cycle-specific IDs above.

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "chore(env): add Razorpay vars to .env.example, remove legacy Stripe vars"
```

---

## Task 6: Delete legacy Stripe files

**Files:**
- Delete: `src/lib/stripe.ts`
- Delete: `src/app/api/webhooks/stripe/route.ts`

Audit bugs #10 and #11. The Stripe webhook handler is fully functional code that would conflict with the Razorpay handler if `STRIPE_WEBHOOK_SECRET` ever got set. The legacy `stripe.ts` lib has a duplicate `PLANS` export that's confusing.

- [ ] **Step 1: Find any imports of either file**

```bash
grep -rn "from \"@/lib/stripe\"" src/ 2>&1
grep -rn "from \"./stripe\"" src/ 2>&1
grep -rn "import.*stripe" src/ 2>&1 | grep -v "node_modules" | grep -v "razorpay"
```

Expected: zero results referencing `src/lib/stripe.ts`. The audit confirmed the file is unused by any non-Stripe-webhook code. If you find any unexpected imports, STOP and report.

- [ ] **Step 2: Delete the two files**

```bash
rm src/lib/stripe.ts
rm src/app/api/webhooks/stripe/route.ts
```

- [ ] **Step 3: Type-check + build**

```bash
npx tsc --noEmit 2>&1 | tail -10
```

Expected: no new errors. Pre-existing errors in other files remain.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(billing): remove legacy Stripe lib and webhook handler"
```

The `-A` flag here picks up the deletions. Verify with `git status` first to make sure nothing else is being staged.

---

## Task 7: Add admin-role guard to billing actions

**Files:**
- Modify: `src/actions/billing.ts`

Audit bug #7. Currently `createSubscription` does not check the calling user's role. Add a guard at the top so only `owner` and `admin` can initiate billing actions.

- [ ] **Step 1: Read the current file**

Read `src/actions/billing.ts`. Note the existing pattern for `getOrgContext()` (used at the top of every action) and how role is or isn't used.

- [ ] **Step 2: Update the imports**

At the top of the file, ensure these imports exist (add if missing, do not duplicate):

```ts
import { getCurrentUser, isAdmin } from "@/lib/current-user";
```

- [ ] **Step 3: Add the guard at the top of `createSubscription`**

Find the `createSubscription` function. Immediately after the existing `getOrgContext()` call (or whatever the first line of the function is), add:

```ts
const user = await getCurrentUser();
if (!user) return { success: false, error: "Not authenticated" };
if (!isAdmin(user.role)) return { success: false, error: "Only owners and admins can manage billing" };
```

If `getOrgContext()` already calls `getCurrentUser()` internally and returns the user, reuse that — don't double-fetch. Read the function body to decide; the goal is one call to `getCurrentUser`, not two.

- [ ] **Step 4: Add the same guard at the top of `cancelSubscription`**

Find `cancelSubscription`. Add the same guard immediately after its first auth-related call:

```ts
const user = await getCurrentUser();
if (!user) return { success: false, error: "Not authenticated" };
if (!isAdmin(user.role)) return { success: false, error: "Only owners and admins can manage billing" };
```

Same caveat about reusing if already fetched.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit 2>&1 | tail -10
```

Expected: no new errors. The `getCurrentUser` and `isAdmin` imports should resolve from `src/lib/current-user.ts` (an existing project utility).

- [ ] **Step 6: Commit**

```bash
git add src/actions/billing.ts
git commit -m "fix(billing): require admin role for createSubscription and cancelSubscription"
```

---

## Task 8: Add webhook event idempotency

**Files:**
- Modify: `src/app/api/webhooks/razorpay/route.ts`

Audit bug #9. Razorpay retries failed webhook deliveries. Without idempotency, retried `payment.failed` or `subscription.paused` events send duplicate emails to admins. Use the new `webhook_events` table to dedupe.

- [ ] **Step 1: Read the current file**

Read `src/app/api/webhooks/razorpay/route.ts`. Locate where the request body is parsed into the event object (typically `JSON.parse(body)`), and the early return for HMAC verification failure.

- [ ] **Step 2: Add idempotency check after signature verification**

Immediately after the HMAC signature check passes (where the code first knows the webhook is legitimate), and before the `switch (event.event)` block that dispatches to handlers, add:

```ts
// Dedupe: skip if we've already processed this event id.
// Razorpay retries failed deliveries; without this, duplicate emails fire.
const eventId = event.id as string | undefined;
if (eventId) {
  const supabase = createAdminSupabase();
  const { error: dedupeError } = await supabase
    .from("webhook_events")
    .insert({ id: eventId, event_type: event.event });
  if (dedupeError && dedupeError.code === "23505") {
    // 23505 = unique violation; this event was already processed. Return 200 to stop retries.
    return NextResponse.json({ received: true, deduped: true });
  }
  if (dedupeError) {
    // Some other DB error — log but proceed with handling.
    // Failing the webhook here would cause Razorpay to retry, compounding the problem.
    console.error("webhook_events insert failed:", dedupeError);
  }
}
```

Make sure `createAdminSupabase` is imported at the top of the file. If it's not, add:

```ts
import { createAdminSupabase } from "@/lib/supabase/server";
```

- [ ] **Step 3: Confirm the rest of the handler is unchanged**

Visually verify the `switch (event.event)` block and all its `case` handlers are untouched. The only change to this file should be the idempotency block you just added (and possibly an import).

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit 2>&1 | tail -10
```

Expected: no new errors. The `webhook_events` table is now in `database.types.ts` (Task 2), so the insert call should be type-safe.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/webhooks/razorpay/route.ts
git commit -m "fix(webhook): dedupe Razorpay webhook events to prevent duplicate emails"
```

---

## Task 9: End-of-phase verification

**Files:** No code changes. Smoke test only.

- [ ] **Step 1: Build**

```bash
npm run build 2>&1 | tail -20
```

Expected: `✓ Compiled successfully`. The downstream `RESEND_API_KEY` page-data error from prior runs may still appear — that's a known local-only issue, not Phase 1's concern.

- [ ] **Step 2: Verify the commit graph**

```bash
git log --oneline main..HEAD 2>&1
```

You should see roughly 7 commits from Phase 1 (one per task that ended with a commit). Task 1 (DB migration) makes no commit. Task 9 makes no commit.

Expected commits, in order:
1. `feat(billing): extend database types with new pricing columns and tables`
2. `feat(billing): add BillingCycle, SubscriptionStatus types; extend OrgPlan with 'custom'`
3. `feat(billing): add config/billing.ts with rates, fees, and computation helpers`
4. `chore(env): add Razorpay vars to .env.example, remove legacy Stripe vars`
5. `chore(billing): remove legacy Stripe lib and webhook handler`
6. `fix(billing): require admin role for createSubscription and cancelSubscription`
7. `fix(webhook): dedupe Razorpay webhook events to prevent duplicate emails`

If any are missing, find which task's commit was skipped and recover it before proceeding.

- [ ] **Step 3: Confirm no behavioral change for existing users**

Phase 1 must not break any currently-working flow. Spot checks:

- The pricing page still renders 3 cards with the old prices (Phase 1 doesn't touch `/pricing`).
- The Settings → Billing card still renders the current plan and Upgrade button (Phase 1 doesn't touch it visibly).
- Navigating to `/dashboard` with the test1 org still works (no plan-check failure from the new types).
- An employee role attempting to call `createSubscription` directly via DevTools would now get a 401-style error — this is the only intended behavioral change in Phase 1.

If any of these checks fail, STOP and report.

- [ ] **Step 4: No push**

Per the user's standing instruction, do not push to `origin/main` automatically. Phase 1 lands on the feature branch only. The user pushes when they're ready, after reviewing Phases 2 and 3 plans.

---

## Out of Scope for Phase 1

Anything user-visible. Phase 2 covers:
- Refactor `src/lib/razorpay.ts` to the new monthly+annual PLANS shape
- Refactor `src/actions/billing.ts` to support cycle, delta-on-upgrade, working cancel, polling fix, cancel-old-on-upgrade
- Pricing page Monthly/Annual toggle and 4 cards
- Settings → Billing rewrite (4 sub-cards)
- Pause/halt/resume webhook handlers
- Grace-period cron

Phase 3 covers:
- Custom plan picker UI and server actions
- Superadmin Custom Plans queue
- Email templates for Custom flow
- Dynamic Razorpay plan creation on approval
- Counter-offer state machine

Phase 1 is groundwork only — every change here is invisible to end users on the happy path.
