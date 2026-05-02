# Pricing Overhaul — Phase 2: Monthly/Annual + GST + UI Overhaul

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the user-visible portion of the new pricing model — Monthly/Annual toggle on the pricing page, GST-exclusive pricing display, full Settings → Billing rewrite (status, plan management, invoices, billing details), and the lifecycle webhook handlers (pause/halt/resume) plus a grace-period cron.

**Architecture:** Phase 2 builds on Phase 1's foundations. The new `src/config/billing.ts` (Phase 1) becomes the single source of truth for prices and platform fees. `src/lib/razorpay.ts` is refactored from `Record<plan, single-id>` to `Record<plan, { monthly, annual }>`. `src/actions/billing.ts` is rewritten to support cycle, delta-on-upgrade, working cancel, polling-based activation confirmation, and cancel-old-on-upgrade. The Settings → Billing UI breaks into four focused sub-cards. New webhook handlers cover pause/halt/resume; a daily cron downgrades orgs past their 7-day grace period.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind, Razorpay, Clerk auth, Supabase (admin client), Resend email, Vercel cron.

**Spec:** `docs/superpowers/specs/2026-05-01-pricing-overhaul-design.md` (sections 1-5).
**Audit:** `docs/billing/2026-05-01-payment-flow-audit.md`. Phase 2 fixes #1, #2, #3, #4, #5, #6, #12.

**Testing posture:** Project has no Jest/Vitest setup. Each task ends with `npx tsc --noEmit`, `npm run build`, or browser smoke test plus a git commit.

**TypeScript baseline (after Phase 1 merge):** ~301 lines from `npx tsc --noEmit | wc -l`. Don't introduce new errors beyond the project's known Supabase v2 `never`-inference pattern.

---

## Task 1: Create 4 Razorpay plans (manual prerequisite)

**Files:** None. Manual setup in the Razorpay dashboard. Required before Task 3 can be tested end-to-end.

- [ ] **Step 1: Open Razorpay dashboard**

Sign in to https://dashboard.razorpay.com (use the same account that owns the existing JambaHR plans). Switch to **Test Mode** for development; the same plans must later be created in **Live Mode** before merging to production.

- [ ] **Step 2: Create the four plans**

In the dashboard, go to **Products → Subscriptions → Plans → New Plan**. Create:

| Plan name | Period | Interval | Amount | Currency | Notes |
|---|---|---|---|---|---|
| `JambaHR Growth — Monthly` | `monthly` | 1 | ₹500 | INR | "Per employee, billed monthly" |
| `JambaHR Growth — Annual` | `yearly` | 1 | ₹5,000 | INR | "Per employee, billed annually (10× monthly)" |
| `JambaHR Business — Monthly` | `monthly` | 1 | ₹800 | INR | "Per employee, billed monthly" |
| `JambaHR Business — Annual` | `yearly` | 1 | ₹8,000 | INR | "Per employee, billed annually (10× monthly)" |

The amount is per-employee per cycle (Razorpay subscriptions multiply by employee count via the `quantity` field at subscription creation time, not via plan amount).

After creating each, copy its **Plan ID** (looks like `plan_XXXXXXXXXXXXXX`).

- [ ] **Step 3: Add env vars**

Add to `.env.local`:

```
RAZORPAY_GROWTH_MONTHLY_PLAN_ID=plan_xxxx
RAZORPAY_GROWTH_ANNUAL_PLAN_ID=plan_xxxx
RAZORPAY_BUSINESS_MONTHLY_PLAN_ID=plan_xxxx
RAZORPAY_BUSINESS_ANNUAL_PLAN_ID=plan_xxxx
```

Also add the same four to **Vercel → Project Settings → Environment Variables** for both Preview and Production environments. Mark them as encrypted.

- [ ] **Step 4: No code commit**

This task makes no code changes. Note in your worklog that the plans are created.

---

## Task 2: Refactor `src/lib/razorpay.ts` PLANS shape

**Files:** Modify `src/lib/razorpay.ts`

Switch `PLANS` from a single-`planId` shape to a cycle-keyed shape, and decouple display strings from the constant (those move to the pricing page driven by `src/config/billing.ts`).

- [ ] **Step 1: Replace the file with the new shape**

Replace the entire content of `src/lib/razorpay.ts` with:

```ts
import Razorpay from "razorpay";
import type { OrgPlan } from "@/config/plans";
import type { BillingCycle } from "@/types";

export const razorpay = new Razorpay({
  key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

/**
 * Razorpay plan IDs by tier and cycle. Custom plans are minted on-the-fly
 * per approval (Phase 3) — no env vars needed for them.
 */
export const PLAN_IDS: Record<"growth" | "business", Record<BillingCycle, string>> = {
  growth: {
    monthly: process.env.RAZORPAY_GROWTH_MONTHLY_PLAN_ID!,
    annual: process.env.RAZORPAY_GROWTH_ANNUAL_PLAN_ID!,
  },
  business: {
    monthly: process.env.RAZORPAY_BUSINESS_MONTHLY_PLAN_ID!,
    annual: process.env.RAZORPAY_BUSINESS_ANNUAL_PLAN_ID!,
  },
};

/**
 * Resolve the Razorpay plan ID for a given tier + cycle. Throws if unknown.
 * Use only for `growth` and `business`. Custom uses dynamic plan creation.
 */
export function resolvePlanId(plan: "growth" | "business", cycle: BillingCycle): string {
  const id = PLAN_IDS[plan][cycle];
  if (!id) throw new Error(`Missing plan ID for ${plan}/${cycle}. Check env vars.`);
  return id;
}

/**
 * Max employee cap per tier. Custom is per-org via custom_max_employees column.
 */
export const MAX_EMPLOYEES: Record<Exclude<OrgPlan, "custom">, number> = {
  starter: 10,
  growth: 200,
  business: 500,
};
```

The old `PLANS` object with `name`, `description`, `price`, `features` strings is gone. The pricing page (Task 9) generates those from `src/config/billing.ts` + `src/config/plans.ts`. The Settings → Billing UI (Tasks 10-14) does the same.

- [ ] **Step 2: Update consumers — `src/actions/billing.ts`**

The current `src/actions/billing.ts` imports `PLANS` and `PlanKey`:

```ts
import { razorpay, PLANS, type PlanKey } from "@/lib/razorpay";
```

That import will break. Task 3 rewrites this file entirely; for now, change the import to:

```ts
import { razorpay, resolvePlanId, MAX_EMPLOYEES } from "@/lib/razorpay";
```

And update the body to use `resolvePlanId(planKey, "monthly")` and `MAX_EMPLOYEES[planKey]` until Task 3 fully rewrites it. Don't break the build.

If Task 3 is being worked on immediately after Task 2 (recommended), you can skip the temporary patch and just commit Task 2 + Task 3 together. The implementer should decide based on workflow.

- [ ] **Step 3: Update consumers — `src/components/settings/billing-section.tsx`**

The current file imports nothing from `@/lib/razorpay` (it only uses `createSubscription` from `@/actions/billing`), so no change needed here. But Task 14 rewrites this file; flagging for awareness.

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit 2>&1 | wc -l
```

Expected: ≤ 305 (small drift acceptable). If errors mention `PLANS` or `PlanKey`, the import-side updates from Step 2 weren't applied.

- [ ] **Step 5: Commit**

```bash
git add src/lib/razorpay.ts src/actions/billing.ts
git commit -m "refactor(billing): cycle-keyed PLAN_IDs, MAX_EMPLOYEES; drop display strings from razorpay.ts"
```

---

## Task 3: Rewrite `src/actions/billing.ts` — full pricing flow

**Files:** Modify `src/actions/billing.ts`

This is the biggest single rewrite in Phase 2. Fixes audit bugs #1 (broken cancel), #2 (no cancel-old-on-upgrade), #3 (auto-expiry from `total_count: 12`).

- [ ] **Step 1: Replace the entire file content**

Replace `src/actions/billing.ts` with:

```ts
"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { razorpay, resolvePlanId, MAX_EMPLOYEES } from "@/lib/razorpay";
import {
  PLATFORM_FEES,
  computeRecurringPaise,
  computePlatformFeeDelta,
} from "@/config/billing";
import type { ActionResult, OrgPlan } from "@/types";
import type { BillingCycle } from "@/types";

type PaidPlanKey = "growth" | "business";

type OrgContext = {
  id: string;
  clerk_org_id: string;
  plan: OrgPlan;
  stripe_subscription_id: string | null;
  platform_fee_paid: number;
  billing_cycle: BillingCycle | null;
};

async function getOrgContext(): Promise<OrgContext | null> {
  const { userId, orgId } = auth();
  if (!userId) return null;

  const supabase = createAdminSupabase();
  const select = "id, clerk_org_id, plan, stripe_subscription_id, platform_fee_paid, billing_cycle";

  if (orgId) {
    const { data } = await supabase
      .from("organizations")
      .select(select)
      .eq("clerk_org_id", orgId)
      .single();
    return (data as OrgContext) ?? null;
  }

  const memberships = await clerkClient().users.getOrganizationMembershipList({ userId });
  const firstOrg = memberships.data[0]?.organization;
  if (!firstOrg) return null;

  const { data } = await supabase
    .from("organizations")
    .select(select)
    .eq("clerk_org_id", firstOrg.id)
    .single();
  return (data as OrgContext) ?? null;
}

/**
 * Create a Razorpay subscription for the requested plan + cycle.
 *
 * Behavior:
 * - Cancels any existing subscription before creating the new one (fixes audit #2).
 * - Adds the platform-fee delta as an upfront `addons[]` item on the first invoice.
 * - No `total_count` cap — subscription runs until cancelled (fixes audit #3).
 * - Records `platform_fee_paid` increment in DB note for the webhook to apply.
 * - Returns `{ subscriptionId, keyId, amount }` for the client checkout.
 */
export async function createSubscription(args: {
  planKey: PaidPlanKey;
  billingCycle: BillingCycle;
  employeeCount: number;
}): Promise<
  ActionResult<{
    subscriptionId: string;
    keyId: string;
    platformFeeDelta: number;
    recurringAmount: number;
  }>
> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only owners and admins can manage billing" };

  const org = await getOrgContext();
  if (!org) return { success: false, error: "Organization not found" };

  const { planKey, billingCycle, employeeCount } = args;

  if (employeeCount < 1) return { success: false, error: "Employee count must be at least 1" };
  if (employeeCount > MAX_EMPLOYEES[planKey]) {
    return { success: false, error: `${planKey} supports up to ${MAX_EMPLOYEES[planKey]} employees` };
  }

  const platformFeeDelta = computePlatformFeeDelta(PLATFORM_FEES[planKey], org.platform_fee_paid);
  const recurringAmount = computeRecurringPaise(planKey, billingCycle, employeeCount);

  try {
    // 1. Cancel any existing subscription (fixes audit #2 — no parallel charging on upgrade).
    if (org.stripe_subscription_id) {
      try {
        await razorpay.subscriptions.cancel(org.stripe_subscription_id, false);
      } catch (cancelErr) {
        console.warn("Old subscription cancel failed (continuing):", cancelErr);
        // Don't block the new subscription on a stale cancel error — the customer
        // may have already cancelled in the Razorpay dashboard.
      }
    }

    // 2. Create the new subscription.
    const subscriptionParams: Parameters<typeof razorpay.subscriptions.create>[0] = {
      plan_id: resolvePlanId(planKey, billingCycle),
      // total_count omitted — subscription runs indefinitely until cancelled.
      quantity: employeeCount,
      notes: {
        org_id: org.id,
        plan: planKey,
        cycle: billingCycle,
        platform_fee_delta: String(platformFeeDelta),
      },
    };

    if (platformFeeDelta > 0) {
      subscriptionParams.addons = [
        {
          item: {
            name: "Platform fee",
            amount: platformFeeDelta,
            currency: "INR",
          },
        },
      ];
    }

    const subscription = await razorpay.subscriptions.create(subscriptionParams);

    return {
      success: true,
      data: {
        subscriptionId: subscription.id,
        keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
        platformFeeDelta,
        recurringAmount,
      },
    };
  } catch (error: any) {
    console.error("Failed to create Razorpay subscription:", error);
    return { success: false, error: error?.message ?? "Failed to create subscription" };
  }
}

/**
 * Cancel the org's current subscription at end of period (fixes audit #1).
 * Customer keeps access until the end of their current billing cycle.
 * The DB downgrade happens via the `subscription.completed` webhook.
 */
export async function cancelSubscription(): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only owners and admins can manage billing" };

  const org = await getOrgContext();
  if (!org) return { success: false, error: "Organization not found" };
  if (!org.stripe_subscription_id) return { success: false, error: "No active subscription" };

  try {
    // `cancel_at_cycle_end: true` (second arg) keeps access until the period ends.
    await razorpay.subscriptions.cancel(org.stripe_subscription_id, true);
    return { success: true, data: undefined };
  } catch (error: any) {
    console.error("Failed to cancel subscription:", error);
    return { success: false, error: error?.message ?? "Failed to cancel subscription" };
  }
}
```

Key behaviors enforced:
- Admin role guard (kept from Phase 1).
- Reads `stripe_subscription_id` (NOT `stripe_customer_id` — fixes audit #1).
- Cancels any existing subscription before creating a new one (fixes audit #2).
- No `total_count` cap (fixes audit #3).
- Adds platform-fee delta as `addons[]` on first invoice.
- Sets `cancel_at_cycle_end: true` on cancel — customer retains access until period ends.

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit 2>&1 | wc -l
```

Expected: similar to baseline (some shift acceptable for the new `OrgContext` type and Supabase `never` inference).

If `BillingCycle` import fails, verify it's exported from `@/types/index.ts` (Phase 1 added it).

- [ ] **Step 3: No commit yet**

The current `billing-section.tsx` calls `createSubscription(planKey: "growth" | "business")` — a single positional argument. Our new signature is `createSubscription({ planKey, billingCycle, employeeCount })`. The call site is broken until Task 11 rewrites the UI.

Leave the working tree dirty; Task 11 commits both together with a follow-up (or Task 14 commits the final shape).

If you want to commit Task 3 alone for review purposes, also stub `billing-section.tsx`'s `handleUpgrade` to call:

```ts
const result = await createSubscription({
  planKey,
  billingCycle: "monthly",
  employeeCount: profile.employee_count,
});
```

Then commit:

```bash
git add src/actions/billing.ts src/components/settings/billing-section.tsx
git commit -m "feat(billing): rewrite createSubscription with cycle/delta/cancel-old; fix cancelSubscription column bug"
```

---

## Task 4: Add `getBillingStatus` and `pollBillingActivation` actions

**Files:** Modify `src/actions/billing.ts` (add two new exports)

Audit bug #4 (race condition on activation) needs a polling mechanism instead of `window.location.reload()`. Audit bug #12 (no status display) needs a way for the UI to fetch the live Razorpay subscription state.

- [ ] **Step 1: Append both actions**

Append to `src/actions/billing.ts` (below the existing `cancelSubscription`):

```ts
export type BillingStatus = {
  plan: OrgPlan;
  billingCycle: BillingCycle | null;
  subscriptionStatus: string | null;
  maxEmployees: number;
  nextBillingAt: string | null;
  currentBillAmount: number | null; // paise
  paymentMethod: string | null;
};

/**
 * Fetch live billing status. Combines DB row + live Razorpay subscription data.
 * Returns null subscription details for Starter (no Razorpay sub).
 */
export async function getBillingStatus(): Promise<ActionResult<BillingStatus>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const org = await getOrgContext();
  if (!org) return { success: false, error: "Organization not found" };

  const supabase = createAdminSupabase();
  const { data: row } = await supabase
    .from("organizations")
    .select("plan, billing_cycle, subscription_status, max_employees, stripe_subscription_id")
    .eq("id", org.id)
    .single();
  if (!row) return { success: false, error: "Organization not found" };

  const orgRow = row as {
    plan: OrgPlan;
    billing_cycle: BillingCycle | null;
    subscription_status: string | null;
    max_employees: number;
    stripe_subscription_id: string | null;
  };

  let nextBillingAt: string | null = null;
  let currentBillAmount: number | null = null;
  let paymentMethod: string | null = null;

  if (orgRow.stripe_subscription_id) {
    try {
      const sub = await razorpay.subscriptions.fetch(orgRow.stripe_subscription_id);
      const chargeAt = (sub as { charge_at?: number }).charge_at;
      if (typeof chargeAt === "number") {
        nextBillingAt = new Date(chargeAt * 1000).toISOString();
      }
      // Razorpay's subscription object includes `current_start` and `current_end`
      // for the active cycle. The price the customer will see is plan amount × quantity.
      const planAmount = (sub as { plan_id: string; quantity?: number }).quantity ?? 1;
      // We won't compute exact amount here — let Razorpay display it.
      currentBillAmount = null;
      paymentMethod = null;
      void planAmount;
    } catch (e) {
      console.warn("getBillingStatus: razorpay fetch failed", e);
    }
  }

  return {
    success: true,
    data: {
      plan: orgRow.plan,
      billingCycle: orgRow.billing_cycle,
      // Treat NULL as 'active' for legacy paid orgs (per design spec).
      subscriptionStatus:
        orgRow.subscription_status ?? (orgRow.plan !== "starter" ? "active" : null),
      maxEmployees: orgRow.max_employees,
      nextBillingAt,
      currentBillAmount,
      paymentMethod,
    },
  };
}

/**
 * Poll the org's plan after a checkout. Used by the client to confirm the
 * webhook has activated the new subscription. Caller polls every 2s until
 * `activated` is true or 30s elapses.
 */
export async function pollBillingActivation(args: {
  expectedPlan: PaidPlanKey;
}): Promise<ActionResult<{ activated: boolean; plan: OrgPlan }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const org = await getOrgContext();
  if (!org) return { success: false, error: "Organization not found" };

  return {
    success: true,
    data: {
      activated: org.plan === args.expectedPlan,
      plan: org.plan,
    },
  };
}
```

The `currentBillAmount` and `paymentMethod` fields are scaffolded but left at `null` for v1 — the UI just shows "next billing date" and "status". A v2 task can wire them.

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit 2>&1 | wc -l
```

Expected: similar drift to Task 3.

```bash
git add src/actions/billing.ts
git commit -m "feat(billing): add getBillingStatus and pollBillingActivation server actions"
```

(If you bundled Task 3 + Task 4 in one commit, skip this commit step.)

---

## Task 5: Update Razorpay webhook handlers

**Files:** Modify `src/app/api/webhooks/razorpay/route.ts`

Audit bugs #5 (paused/halted don't restrict access) and #6 (no resumed/pending handlers). Plus we now write `subscription_status`, `billing_cycle`, and `platform_fee_paid` on the relevant events.

- [ ] **Step 1: Update `subscription.activated` handler**

Find the `case "subscription.activated":` block (~line 43 in the current file). Replace its body with:

```ts
case "subscription.activated": {
  const subscription = event.payload.subscription.entity;
  const orgId = subscription.notes?.org_id;
  const planKey = subscription.notes?.plan;
  const cycle = subscription.notes?.cycle ?? "monthly";
  const platformFeeDelta = Number(subscription.notes?.platform_fee_delta ?? 0);

  if (orgId && planKey) {
    // Increment platform_fee_paid by the delta paid on this checkout.
    const { data: row } = await supabase
      .from("organizations")
      .select("platform_fee_paid")
      .eq("id", orgId)
      .single();
    const currentPaid = (row as { platform_fee_paid: number } | null)?.platform_fee_paid ?? 0;

    await supabase
      .from("organizations")
      .update({
        stripe_subscription_id: subscription.id,
        plan: planKey,
        billing_cycle: cycle,
        subscription_status: "active",
        max_employees: planKey === "business" ? 500 : 200,
        platform_fee_paid: currentPaid + platformFeeDelta,
        subscription_paused_at: null,
      })
      .eq("id", orgId);
  }
  break;
}
```

Key changes:
- Sets `billing_cycle` from the subscription notes.
- Sets `subscription_status: "active"`.
- Increments `platform_fee_paid` by the recorded delta.
- Clears `subscription_paused_at` if the org was previously paused.

- [ ] **Step 2: Update `subscription.cancelled` and `subscription.completed`**

Replace the existing `case "subscription.cancelled": case "subscription.completed":` block with:

```ts
case "subscription.cancelled":
case "subscription.completed": {
  const subscription = event.payload.subscription.entity;

  await supabase
    .from("organizations")
    .update({
      plan: "starter",
      max_employees: 10,
      stripe_subscription_id: null,
      stripe_customer_id: null,
      billing_cycle: null,
      subscription_status: "cancelled",
      subscription_paused_at: null,
    })
    .eq("stripe_subscription_id", subscription.id);
  break;
}
```

Adds `billing_cycle: null` and `subscription_status: "cancelled"`. Note: we do NOT reset `platform_fee_paid` — once paid, the org has historical credit toward any future upgrade per the design (delta-on-upgrade rule).

- [ ] **Step 3: Replace the `subscription.paused` handler**

The existing handler emails admins but doesn't change DB state — fix this. Replace:

```ts
case "subscription.paused": {
  const subscription = event.payload.subscription.entity;
  console.warn(`Subscription ${subscription.id} paused`);

  // Record paused status and timestamp; access stays until 7-day grace ends (cron).
  await supabase
    .from("organizations")
    .update({
      subscription_status: "paused",
      subscription_paused_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id);

  // Look up org + admins for the email
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("stripe_subscription_id", subscription.id)
    .single();

  if (org) {
    const orgData = org as { id: string; name: string };
    const { data: admins } = await supabase
      .from("employees")
      .select("email, first_name")
      .eq("org_id", orgData.id)
      .in("role", ["owner", "admin"])
      .eq("status", "active");

    if (admins && admins.length > 0) {
      const html = await render(
        SubscriptionPausedEmail({
          orgName: orgData.name,
          dashboardUrl: "https://jambahr.com/dashboard/settings",
        })
      );

      await resend.emails.send({
        from: FROM_EMAIL,
        to: (admins as { email: string }[]).map((a) => a.email),
        subject: "JambaHR – Your subscription is paused",
        html,
      });
    }
  }
  break;
}
```

This requires the new `SubscriptionPausedEmail` component (Task 6). For now, the import will fail until Task 6 lands. Leave the import comment-flagged; commit after Task 6.

Add the import at the top of the file (with the other component imports):

```ts
import { SubscriptionPausedEmail } from "@/components/emails/subscription-paused";
```

- [ ] **Step 4: Add `subscription.halted` and `subscription.resumed` handlers**

Add these new `case` blocks above the `default:`:

```ts
case "subscription.halted": {
  const subscription = event.payload.subscription.entity;
  await supabase
    .from("organizations")
    .update({
      subscription_status: "halted",
      subscription_paused_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id);
  // Reuse the same email — both paused/halted communicate "subscription on hold".
  // (Skipping a separate halted email for v1 — both states resolve via the same flow.)
  break;
}

case "subscription.resumed": {
  const subscription = event.payload.subscription.entity;
  await supabase
    .from("organizations")
    .update({
      subscription_status: "active",
      subscription_paused_at: null,
    })
    .eq("stripe_subscription_id", subscription.id);
  break;
}

case "subscription.pending": {
  const subscription = event.payload.subscription.entity;
  await supabase
    .from("organizations")
    .update({ subscription_status: "pending" })
    .eq("stripe_subscription_id", subscription.id);
  break;
}
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit 2>&1 | wc -l
```

Expected: increase due to `SubscriptionPausedEmail` import (resolves after Task 6) plus more `never`-inference noise on the new updates. If error count exceeds 320, investigate.

- [ ] **Step 6: No commit yet**

Hold the commit until Task 6 (email templates) lands so the import resolves. Combine into one commit:

```bash
git add src/app/api/webhooks/razorpay/route.ts src/components/emails/subscription-paused.tsx src/components/emails/subscription-grace-period-ending.tsx
git commit -m "feat(webhook): handle paused/halted/resumed/pending; record cycle and status"
```

---

## Task 6: Add subscription lifecycle email templates

**Files:**
- Create: `src/components/emails/subscription-paused.tsx`
- Create: `src/components/emails/subscription-grace-period-ending.tsx`

Two new templates following the project's `@react-email/components` pattern (mirror `src/components/emails/payment-failed.tsx` structure).

- [ ] **Step 1: Create `subscription-paused.tsx`**

Create `src/components/emails/subscription-paused.tsx`:

```tsx
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export interface SubscriptionPausedEmailProps {
  orgName: string;
  dashboardUrl: string;
}

export function SubscriptionPausedEmail({ orgName, dashboardUrl }: SubscriptionPausedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your JambaHR subscription is paused — action needed</Preview>
      <Body style={{ fontFamily: "system-ui, sans-serif", background: "#f5f5f5", padding: "40px 0" }}>
        <Container style={{ background: "#fff", borderRadius: 8, padding: 32, maxWidth: 560, margin: "0 auto" }}>
          <Heading as="h1" style={{ fontSize: 22, color: "#0f7068" }}>Subscription paused</Heading>
          <Text>Hello {orgName} team,</Text>
          <Text>
            Your JambaHR subscription has been paused. This usually happens when a recent payment couldn&apos;t
            be processed. You&apos;ll keep full access for the next 7 days while we attempt to recover.
          </Text>
          <Text>
            Please update your payment method or resolve the issue from your billing dashboard:
          </Text>
          <Section style={{ textAlign: "center", margin: "24px 0" }}>
            <Link
              href={dashboardUrl}
              style={{
                background: "#0f7068",
                color: "#fff",
                padding: "10px 20px",
                borderRadius: 6,
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              Manage billing
            </Link>
          </Section>
          <Text style={{ fontSize: 13, color: "#666" }}>
            If the issue isn&apos;t resolved within 7 days, your account will be moved to the free Starter plan
            and paid features will be temporarily disabled. Re-activating later restores everything.
          </Text>
          <Text style={{ fontSize: 13, color: "#666" }}>
            Questions? Reply to this email or write to support@jambahr.com.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default SubscriptionPausedEmail;
```

- [ ] **Step 2: Create `subscription-grace-period-ending.tsx`**

Create `src/components/emails/subscription-grace-period-ending.tsx`:

```tsx
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export interface GracePeriodEndingEmailProps {
  orgName: string;
  daysRemaining: number;
  dashboardUrl: string;
}

export function SubscriptionGracePeriodEndingEmail({
  orgName,
  daysRemaining,
  dashboardUrl,
}: GracePeriodEndingEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{`Your subscription access ends in ${daysRemaining} days`}</Preview>
      <Body style={{ fontFamily: "system-ui, sans-serif", background: "#f5f5f5", padding: "40px 0" }}>
        <Container style={{ background: "#fff", borderRadius: 8, padding: 32, maxWidth: 560, margin: "0 auto" }}>
          <Heading as="h1" style={{ fontSize: 22, color: "#b45309" }}>
            Action needed: access ending soon
          </Heading>
          <Text>Hello {orgName} team,</Text>
          <Text>
            Your JambaHR subscription has been on hold for several days. In <strong>{daysRemaining} days</strong>,
            your account will be downgraded to the free Starter plan and paid features will be disabled.
          </Text>
          <Text>
            To restore your subscription, update your payment method now:
          </Text>
          <Section style={{ textAlign: "center", margin: "24px 0" }}>
            <Link
              href={dashboardUrl}
              style={{
                background: "#0f7068",
                color: "#fff",
                padding: "10px 20px",
                borderRadius: 6,
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              Restore subscription
            </Link>
          </Section>
          <Text style={{ fontSize: 13, color: "#666" }}>
            Once downgraded, your data is preserved — re-subscribing restores all paid features.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default SubscriptionGracePeriodEndingEmail;
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit 2>&1 | wc -l
```

Expected: error count drops by ~2-5 (the previously-broken `SubscriptionPausedEmail` import in Task 5 now resolves).

- [ ] **Step 4: Commit (with Task 5)**

```bash
git add src/components/emails/subscription-paused.tsx src/components/emails/subscription-grace-period-ending.tsx src/app/api/webhooks/razorpay/route.ts
git commit -m "feat(webhook): handle paused/halted/resumed/pending; new email templates for lifecycle events"
```

---

## Task 7: Add grace-period cron route

**Files:**
- Create: `src/app/api/cron/billing-grace-period/route.ts`
- Modify: `vercel.json` (add cron entry)

Daily cron that:
1. Finds orgs with `subscription_status IN ('paused','halted')` and `subscription_paused_at < now() - interval '7 days'`.
2. Downgrades them to Starter (sets plan='starter', clears subscription columns).
3. Sends a final email to admins.

Plus: 3 days before the 7-day window expires, send the grace-period-ending warning.

- [ ] **Step 1: Create the cron route**

Create `src/app/api/cron/billing-grace-period/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { render } from "@react-email/render";
import { resend, FROM_EMAIL } from "@/lib/resend";
import { SubscriptionGracePeriodEndingEmail } from "@/components/emails/subscription-grace-period-ending";

const GRACE_DAYS = 7;
const WARNING_BEFORE_END_DAYS = 3; // send warning at day 4 (3 days before end)

export async function GET(req: Request) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminSupabase();
  const now = new Date();
  const downgradeCutoff = new Date(now.getTime() - GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const warningStart = new Date(
    now.getTime() - (GRACE_DAYS - WARNING_BEFORE_END_DAYS) * 24 * 60 * 60 * 1000
  ).toISOString();
  const warningEnd = new Date(
    now.getTime() - (GRACE_DAYS - WARNING_BEFORE_END_DAYS - 1) * 24 * 60 * 60 * 1000
  ).toISOString();

  // 1. Downgrade orgs past the grace period.
  const { data: dueOrgs, error: downgradeFetchError } = await supabase
    .from("organizations")
    .select("id, name")
    .in("subscription_status", ["paused", "halted"])
    .lt("subscription_paused_at", downgradeCutoff);

  if (downgradeFetchError) {
    console.error("billing-grace-period: fetch error", downgradeFetchError);
    return NextResponse.json({ error: downgradeFetchError.message }, { status: 500 });
  }

  let downgraded = 0;
  for (const org of (dueOrgs ?? []) as { id: string; name: string }[]) {
    const { error: updateError } = await supabase
      .from("organizations")
      .update({
        plan: "starter",
        max_employees: 10,
        billing_cycle: null,
        subscription_status: "cancelled",
        stripe_subscription_id: null,
        stripe_customer_id: null,
        subscription_paused_at: null,
      })
      .eq("id", org.id);
    if (updateError) {
      console.error(`billing-grace-period: downgrade failed for ${org.id}`, updateError);
      continue;
    }
    downgraded++;
    console.log(`billing-grace-period: downgraded org ${org.id} (${org.name}) to starter`);
  }

  // 2. Send warning to orgs about to be downgraded (warning window).
  const { data: warnOrgs, error: warnFetchError } = await supabase
    .from("organizations")
    .select("id, name")
    .in("subscription_status", ["paused", "halted"])
    .gte("subscription_paused_at", warningEnd)
    .lt("subscription_paused_at", warningStart);

  if (warnFetchError) {
    console.error("billing-grace-period: warning fetch error", warnFetchError);
    return NextResponse.json({ error: warnFetchError.message }, { status: 500 });
  }

  let warned = 0;
  for (const org of (warnOrgs ?? []) as { id: string; name: string }[]) {
    const { data: admins } = await supabase
      .from("employees")
      .select("email")
      .eq("org_id", org.id)
      .in("role", ["owner", "admin"])
      .eq("status", "active");

    if (!admins || admins.length === 0) continue;

    try {
      const html = await render(
        SubscriptionGracePeriodEndingEmail({
          orgName: org.name,
          daysRemaining: WARNING_BEFORE_END_DAYS,
          dashboardUrl: "https://jambahr.com/dashboard/settings",
        })
      );
      await resend.emails.send({
        from: FROM_EMAIL,
        to: (admins as { email: string }[]).map((a) => a.email),
        subject: "JambaHR – Your subscription access ends in 3 days",
        html,
      });
      warned++;
    } catch (e) {
      console.error(`billing-grace-period: warning email failed for ${org.id}`, e);
    }
  }

  return NextResponse.json({ downgraded, warned });
}
```

- [ ] **Step 2: Add cron entry to `vercel.json`**

Read the current `vercel.json`. Find the `crons` array (or create one if none). Add:

```json
{
  "path": "/api/cron/billing-grace-period",
  "schedule": "0 4 * * *"
}
```

`0 4 * * *` is 4am UTC = 9:30am IST. Same authorization-header pattern as existing crons (`Bearer ${CRON_SECRET}`).

- [ ] **Step 3: Type-check + build**

```bash
npx tsc --noEmit 2>&1 | wc -l
npm run build 2>&1 | tail -10
```

Expected: build compiles successfully. The page-data-collection step may fail locally on `RESEND_API_KEY` (pre-existing), but compilation must pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/billing-grace-period/route.ts vercel.json
git commit -m "feat(billing): add grace-period cron — downgrade after 7 days, warn at day 4"
```

---

## Task 8: GSTIN validation utility

**Files:** Create `src/lib/gstin.ts`

Tiny utility for validating Indian GSTIN format. The Razorpay tax-invoice feature accepts a valid GSTIN at checkout; we only need format validation client-side.

- [ ] **Step 1: Create the file**

Create `src/lib/gstin.ts`:

```ts
/**
 * GSTIN format: 15 chars
 *  - 2 digits state code
 *  - 10 chars PAN (5 letters + 4 digits + 1 letter)
 *  - 1 digit entity number (1-9 or A-Z)
 *  - 1 letter "Z"
 *  - 1 char check (0-9 or A-Z)
 *
 * Reference: https://gstindia.com/gstin-format/
 */
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function isValidGSTIN(value: string): boolean {
  if (!value) return false;
  return GSTIN_REGEX.test(value.trim().toUpperCase());
}

/**
 * Normalize a GSTIN for storage: trim and uppercase.
 * Returns null for invalid input.
 */
export function normalizeGSTIN(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return isValidGSTIN(normalized) ? normalized : null;
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit 2>&1 | wc -l
```

```bash
git add src/lib/gstin.ts
git commit -m "feat(billing): add GSTIN validation utility"
```

---

## Task 9: Refactor pricing page — Monthly/Annual toggle, 4 cards, GST suffix

**Files:** Modify `src/app/pricing/page.tsx`

Current state: hand-coded `tiers` array with 3 cards, no cycle toggle, no GST suffix, "Cancel anytime" misleadingly suggests no auto-expiry.

After: cycle toggle, 4 cards (Starter/Growth/Business/Custom), config-driven, GST suffix on every paid figure, fixed FAQ copy.

- [ ] **Step 1: Read the current file**

Read `src/app/pricing/page.tsx`. Note its layout: hero, tier cards, FAQ. The cards are likely in a server component with hand-coded amounts.

- [ ] **Step 2: Replace tiers data with config-driven values**

Replace the hand-coded tier array with:

```tsx
import { PLATFORM_FEES, PER_EMPLOYEE_MONTHLY_RATE, ANNUAL_MULTIPLIER, formatPaise } from "@/config/billing";
```

Then build the tiers in the page body:

```tsx
const cycleToggle = "annual" as const; // default; client component will toggle this

const tiers = [
  {
    key: "starter" as const,
    name: "Starter",
    platformFee: 0,
    monthlyPerEmp: 0,
    annualPerEmp: 0,
    maxEmployees: 10,
    features: [
      "Employee directory",
      "Leave management",
      "Announcements",
      "Org chart",
    ],
    cta: "Get Started Free",
    href: "/sign-up",
    highlight: false,
  },
  {
    key: "growth" as const,
    name: "Growth",
    platformFee: PLATFORM_FEES.growth,
    monthlyPerEmp: PER_EMPLOYEE_MONTHLY_RATE.growth,
    annualPerEmp: PER_EMPLOYEE_MONTHLY_RATE.growth * ANNUAL_MULTIPLIER,
    maxEmployees: 200,
    features: [
      "Everything in Starter",
      "Documents + acknowledgments",
      "Performance reviews + OKRs",
      "Training & compliance",
      "AI hiring JD generator",
    ],
    cta: "Start Growth",
    href: "/sign-up",
    highlight: true,
  },
  {
    key: "business" as const,
    name: "Business",
    platformFee: PLATFORM_FEES.business,
    monthlyPerEmp: PER_EMPLOYEE_MONTHLY_RATE.business,
    annualPerEmp: PER_EMPLOYEE_MONTHLY_RATE.business * ANNUAL_MULTIPLIER,
    maxEmployees: 500,
    features: [
      "Everything in Growth",
      "Full payroll (PF, PT, TDS)",
      "JambaHire ATS + interviews + offers",
      "AI-powered features",
      "Priority support",
    ],
    cta: "Start Business",
    href: "/sign-up",
    highlight: false,
  },
  {
    key: "custom" as const,
    name: "Custom",
    platformFee: PLATFORM_FEES.custom,
    monthlyPerEmp: 0, // computed at picker time
    annualPerEmp: 0,
    maxEmployees: 200,
    features: [
      "Pick only the features you need",
      "₹120 / feature / employee / month",
      "Founder review within 1 business day",
      "Cancel anytime",
    ],
    cta: "Build your plan",
    href: "/dashboard/settings/custom-plan",
    highlight: false,
    isCustom: true,
  },
];
```

- [ ] **Step 3: Convert the page to a client component for the toggle**

Since the cycle toggle requires `useState`, convert `src/app/pricing/page.tsx` to a `"use client";` page (it has no auth or server-only data fetching). Add at the top:

```tsx
"use client";
import { useState } from "react";
```

- [ ] **Step 4: Add the toggle and render the 4 cards**

Above the tier grid, render:

```tsx
const [cycle, setCycle] = useState<"monthly" | "annual">("annual");

// ... in JSX, before the cards:
<div className="flex items-center justify-center gap-3 mb-10">
  <button
    onClick={() => setCycle("monthly")}
    className={`px-4 py-2 rounded-lg text-sm font-medium ${
      cycle === "monthly" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
    }`}
  >
    Monthly
  </button>
  <button
    onClick={() => setCycle("annual")}
    className={`px-4 py-2 rounded-lg text-sm font-medium ${
      cycle === "annual" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
    }`}
  >
    Annual <span className="ml-1 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">Save 2 months</span>
  </button>
</div>
```

For each tier card, render the price line based on the toggle. The Starter and Custom cards have special formats; Growth and Business use the standard pattern:

```tsx
{/* Inside each card, replace the hand-coded price line with: */}
{tier.key === "starter" && (
  <p className="text-3xl font-bold tracking-tight">Free</p>
)}
{(tier.key === "growth" || tier.key === "business") && (
  <>
    <p className="text-xs text-muted-foreground mt-1">
      {formatPaise(tier.platformFee)} platform fee + GST (one-time)
    </p>
    <p className="text-3xl font-bold tracking-tight">
      {cycle === "monthly"
        ? `${formatPaise(tier.monthlyPerEmp)} / employee / month`
        : `${formatPaise(tier.annualPerEmp)} / employee / year`}
    </p>
    <p className="text-xs text-muted-foreground mt-1">+ 18% GST</p>
  </>
)}
{tier.key === "custom" && (
  <>
    <p className="text-xs text-muted-foreground mt-1">
      Platform fee from {formatPaise(tier.platformFee)} + GST (one-time)
    </p>
    <p className="text-3xl font-bold tracking-tight">
      ₹120 / feature / employee / month
    </p>
    <p className="text-xs text-muted-foreground mt-1">+ 18% GST · Founder review required</p>
  </>
)}
```

Make the grid `md:grid-cols-4` so all four tiers fit. On smaller screens, stack as `grid-cols-1` then `grid-cols-2`.

- [ ] **Step 5: Fix the FAQ "Cancel anytime" copy**

Find the FAQ section. Replace the misleading "Cancel anytime" answer with something accurate:

```tsx
{
  q: "Can I cancel anytime?",
  a: "Yes. You can cancel from Settings → Billing at any time. You retain access to paid features until the end of your current billing cycle. We don't issue refunds for partial cycles.",
}
```

If there isn't an existing FAQ entry, add one.

- [ ] **Step 6: Build verify**

```bash
npm run build 2>&1 | tail -15
```

Expected: build succeeds (compilation passes; the `RESEND_API_KEY` page-data error is pre-existing). The `/pricing` route should appear in the static routes summary.

Manual smoke check (optional):

```bash
npm run dev
```

Open `http://localhost:3000/pricing` and verify:
- 4 cards render
- Toggle switches prices between monthly and annual
- GST suffix is visible on all paid amounts

- [ ] **Step 7: Commit**

```bash
git add src/app/pricing/page.tsx
git commit -m "feat(pricing): Monthly/Annual toggle, 4 tiers, GST suffix, config-driven, fixed FAQ copy"
```

---

## Task 10: Build `BillingStatusCard`

**Files:** Create `src/components/settings/billing-status-card.tsx`

Server component fetching `getBillingStatus()` and rendering the current plan label, subscription status badge, billing cycle, max employees, and next billing date.

- [ ] **Step 1: Create the component**

Create `src/components/settings/billing-status-card.tsx`:

```tsx
import { CreditCard } from "lucide-react";
import { getBillingStatus } from "@/actions/billing";
import { formatPaise } from "@/config/billing";
import { PLAN_LABELS, PLAN_COLORS } from "@/config/plans";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  paused: "Paused",
  halted: "Payment failed",
  pending: "Pending",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  paused: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  halted: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  pending: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  cancelled: "bg-muted text-muted-foreground",
};

export async function BillingStatusCard() {
  const result = await getBillingStatus();
  if (!result.success) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <p className="text-sm text-destructive">Could not load billing status: {result.error}</p>
      </div>
    );
  }
  const { plan, billingCycle, subscriptionStatus, maxEmployees, nextBillingAt, currentBillAmount } = result.data;

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <CreditCard className="h-5 w-5 text-muted-foreground" />
        <h3 className="font-semibold">Current Plan</h3>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Plan</p>
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${PLAN_COLORS[plan]}`}>
            {PLAN_LABELS[plan]}
          </span>
        </div>
        {subscriptionStatus && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Status</p>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[subscriptionStatus] ?? ""}`}>
              {STATUS_LABELS[subscriptionStatus] ?? subscriptionStatus}
            </span>
          </div>
        )}
        {billingCycle && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Billing Cycle</p>
            <p className="text-sm">{billingCycle === "annual" ? "Annual" : "Monthly"}</p>
          </div>
        )}
        <div>
          <p className="text-xs text-muted-foreground mb-1">Employee Cap</p>
          <p className="text-sm">{maxEmployees}</p>
        </div>
        {nextBillingAt && (
          <div className="sm:col-span-2">
            <p className="text-xs text-muted-foreground mb-1">Next Billing Date</p>
            <p className="text-sm">{formatDate(nextBillingAt)}</p>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit 2>&1 | wc -l
```

```bash
git add src/components/settings/billing-status-card.tsx
git commit -m "feat(billing): add BillingStatusCard for current plan and status display"
```

---

## Task 11: Build `PlanManagementCard`

**Files:** Create `src/components/settings/plan-management-card.tsx`

Client component with:
- Upgrade buttons for higher tiers (with delta amount preview)
- Cancel button + confirmation modal
- Switch-to-Annual button (if currently Monthly)
- Polling logic after Razorpay activation (audit fix #4)

- [ ] **Step 1: Create the component**

Create `src/components/settings/plan-management-card.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Loader2, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createSubscription, cancelSubscription, pollBillingActivation } from "@/actions/billing";
import { PLATFORM_FEES, PER_EMPLOYEE_MONTHLY_RATE, ANNUAL_MULTIPLIER, formatPaise, computePlatformFeeDelta } from "@/config/billing";
import type { OrgPlan } from "@/types";
import type { BillingCycle } from "@/types";

declare global {
  interface Window {
    Razorpay: any;
  }
}

interface PlanManagementCardProps {
  currentPlan: OrgPlan;
  currentCycle: BillingCycle | null;
  platformFeePaid: number;
  employeeCount: number;
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

async function pollUntilActivated(expectedPlan: "growth" | "business"): Promise<boolean> {
  const start = Date.now();
  const TIMEOUT_MS = 30_000;
  const INTERVAL_MS = 2_000;
  while (Date.now() - start < TIMEOUT_MS) {
    const r = await pollBillingActivation({ expectedPlan });
    if (r.success && r.data.activated) return true;
    await new Promise((res) => setTimeout(res, INTERVAL_MS));
  }
  return false;
}

export function PlanManagementCard({
  currentPlan,
  currentCycle,
  platformFeePaid,
  employeeCount,
}: PlanManagementCardProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);

  async function handleUpgrade(planKey: "growth" | "business", cycle: BillingCycle) {
    setLoading(`${planKey}_${cycle}`);
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded) {
        toast.error("Failed to load payment gateway. Please try again.");
        return;
      }

      const result = await createSubscription({ planKey, billingCycle: cycle, employeeCount });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      const { subscriptionId, keyId } = result.data;

      const rzp = new window.Razorpay({
        key: keyId,
        subscription_id: subscriptionId,
        name: "JambaHR",
        description: `${planKey === "business" ? "Business" : "Growth"} Plan (${cycle})`,
        image: "/Jamba.png",
        theme: { color: "#0f7068" },
        handler: async () => {
          toast.loading("Activating your subscription...", { id: "activation" });
          const activated = await pollUntilActivated(planKey);
          toast.dismiss("activation");
          if (activated) {
            toast.success("Subscription activated.");
            window.location.reload();
          } else {
            toast.error("Activation is taking longer than expected. Refresh in a minute or contact support.");
            setLoading(null);
          }
        },
        modal: { ondismiss: () => setLoading(null) },
      });
      rzp.open();
    } catch (error) {
      console.error(error);
      toast.error("Something went wrong. Please try again.");
      setLoading(null);
    }
  }

  async function handleCancel() {
    setShowCancel(false);
    setLoading("cancel");
    try {
      const result = await cancelSubscription();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Subscription cancelled. You'll keep access until the end of this billing cycle.");
      // No reload — webhook will update state when the cycle ends.
    } finally {
      setLoading(null);
    }
  }

  const upgradeOptions: Array<{ planKey: "growth" | "business"; cycle: BillingCycle; label: string; amount: number; delta: number }> = [];
  for (const planKey of ["growth", "business"] as const) {
    if (planKey === currentPlan) continue;
    for (const cycle of ["monthly", "annual"] as const) {
      const recurring = PER_EMPLOYEE_MONTHLY_RATE[planKey] * employeeCount * (cycle === "annual" ? ANNUAL_MULTIPLIER : 1);
      const delta = computePlatformFeeDelta(PLATFORM_FEES[planKey], platformFeePaid);
      upgradeOptions.push({
        planKey,
        cycle,
        label: `${planKey === "business" ? "Business" : "Growth"} — ${cycle === "annual" ? "Annual" : "Monthly"}`,
        amount: recurring,
        delta,
      });
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h3 className="font-semibold mb-4">Plan Management</h3>

      <div className="space-y-3">
        {upgradeOptions.map((opt) => (
          <div key={`${opt.planKey}_${opt.cycle}`} className="flex items-center justify-between gap-4 p-3 rounded-lg border border-border">
            <div>
              <p className="text-sm font-medium">{opt.label}</p>
              <p className="text-xs text-muted-foreground">
                {opt.delta > 0
                  ? `${formatPaise(opt.delta)} platform fee + ${formatPaise(opt.amount)}/${opt.cycle === "annual" ? "year" : "month"}`
                  : `${formatPaise(opt.amount)}/${opt.cycle === "annual" ? "year" : "month"}`}
                {" + GST"}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={loading !== null}
              onClick={() => handleUpgrade(opt.planKey, opt.cycle)}
            >
              {loading === `${opt.planKey}_${opt.cycle}` ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowRight className="mr-1.5 h-3.5 w-3.5" />
              )}
              Upgrade
            </Button>
          </div>
        ))}

        {currentPlan !== "starter" && (
          <div className="flex items-center justify-between gap-4 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
            <div>
              <p className="text-sm font-medium">Cancel subscription</p>
              <p className="text-xs text-muted-foreground">
                You&apos;ll retain access until the end of your current billing cycle.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
              disabled={loading !== null}
              onClick={() => setShowCancel(true)}
            >
              <X className="mr-1.5 h-3.5 w-3.5" />
              Cancel
            </Button>
          </div>
        )}
      </div>

      {showCancel && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-background rounded-lg p-6 max-w-md w-full">
            <h4 className="font-semibold mb-2">Cancel your subscription?</h4>
            <p className="text-sm text-muted-foreground mb-4">
              Your subscription will be cancelled at the end of your current billing cycle. You&apos;ll keep
              full access to all paid features until then. No partial refunds.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowCancel(false)}>
                Keep subscription
              </Button>
              <Button
                variant="outline"
                className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                onClick={handleCancel}
              >
                Yes, cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit 2>&1 | wc -l
```

```bash
git add src/components/settings/plan-management-card.tsx
git commit -m "feat(billing): add PlanManagementCard with upgrade/cancel + polling on activation"
```

---

## Task 12: Build `InvoicesCard`

**Files:** Create `src/components/settings/invoices-card.tsx`

Lists past Razorpay invoices for the org's subscription. Razorpay's API returns `short_url` for each invoice — we render links.

- [ ] **Step 1: Add a server action for fetching invoices**

Append to `src/actions/billing.ts`:

```ts
export type InvoiceSummary = {
  id: string;
  amount: number; // paise
  status: string;
  date: string; // ISO
  url: string | null;
};

export async function listInvoices(): Promise<ActionResult<InvoiceSummary[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only owners and admins can view invoices" };

  const org = await getOrgContext();
  if (!org) return { success: false, error: "Organization not found" };
  if (!org.stripe_subscription_id) return { success: true, data: [] };

  try {
    const invoices = await razorpay.invoices.all({
      subscription_id: org.stripe_subscription_id,
      count: 24,
    } as any);

    const items = ((invoices.items ?? []) as any[]).map((inv) => ({
      id: inv.id as string,
      amount: (inv.amount as number) ?? 0,
      status: (inv.status as string) ?? "unknown",
      date: new Date(((inv.issued_at as number) ?? Date.now() / 1000) * 1000).toISOString(),
      url: (inv.short_url as string) ?? null,
    }));

    return { success: true, data: items };
  } catch (e: any) {
    console.error("listInvoices failed", e);
    return { success: false, error: e?.message ?? "Failed to fetch invoices" };
  }
}
```

- [ ] **Step 2: Create the component**

Create `src/components/settings/invoices-card.tsx`:

```tsx
import { FileText, Download } from "lucide-react";
import { listInvoices } from "@/actions/billing";
import { formatPaise } from "@/config/billing";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const STATUS_COLORS: Record<string, string> = {
  paid: "text-green-700",
  issued: "text-blue-700",
  partially_paid: "text-amber-700",
  expired: "text-muted-foreground",
};

export async function InvoicesCard() {
  const result = await listInvoices();

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <FileText className="h-5 w-5 text-muted-foreground" />
        <h3 className="font-semibold">Invoices</h3>
      </div>

      {!result.success ? (
        <p className="text-sm text-destructive">Could not load invoices: {result.error}</p>
      ) : result.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No invoices yet. Your first invoice will appear here after your first billing cycle.</p>
      ) : (
        <ul className="divide-y divide-border">
          {result.data.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium">{formatDate(inv.date)}</p>
                <p className={`text-xs ${STATUS_COLORS[inv.status] ?? "text-muted-foreground"}`}>
                  {inv.status} · {formatPaise(inv.amount)}
                </p>
              </div>
              {inv.url && (
                <a
                  href={inv.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
                >
                  <Download className="h-3.5 w-3.5" /> Download
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Type-check + commit**

```bash
npx tsc --noEmit 2>&1 | wc -l
```

```bash
git add src/actions/billing.ts src/components/settings/invoices-card.tsx
git commit -m "feat(billing): add listInvoices action and InvoicesCard"
```

---

## Task 13: Build `BillingDetailsCard`

**Files:** Create `src/components/settings/billing-details-card.tsx`

Form for the customer's GSTIN. Submits to a new server action that validates and saves to `organizations.gstin`.

- [ ] **Step 1: Add a server action for updating GSTIN**

Append to `src/actions/billing.ts`:

```ts
export async function updateGSTIN(gstin: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only owners and admins can update billing details" };

  const org = await getOrgContext();
  if (!org) return { success: false, error: "Organization not found" };

  // Empty string clears the GSTIN.
  if (gstin.trim() === "") {
    const supabase = createAdminSupabase();
    await supabase.from("organizations").update({ gstin: null }).eq("id", org.id);
    return { success: true, data: undefined };
  }

  const { isValidGSTIN, normalizeGSTIN } = await import("@/lib/gstin");
  if (!isValidGSTIN(gstin)) {
    return { success: false, error: "Invalid GSTIN format" };
  }

  const normalized = normalizeGSTIN(gstin);
  if (!normalized) return { success: false, error: "Invalid GSTIN format" };

  const supabase = createAdminSupabase();
  const { error } = await supabase.from("organizations").update({ gstin: normalized }).eq("id", org.id);
  if (error) return { success: false, error: error.message };

  return { success: true, data: undefined };
}

export async function getBillingDetails(): Promise<ActionResult<{ gstin: string | null }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const org = await getOrgContext();
  if (!org) return { success: false, error: "Organization not found" };

  const supabase = createAdminSupabase();
  const { data } = await supabase.from("organizations").select("gstin").eq("id", org.id).single();
  return { success: true, data: { gstin: (data as { gstin: string | null } | null)?.gstin ?? null } };
}
```

The dynamic import of `@/lib/gstin` inside `updateGSTIN` keeps the regex util out of the action's static dependency graph (small bundle benefit; not strictly required).

Update `OrgContext` in `getOrgContext()` if needed — it already returns enough fields.

- [ ] **Step 2: Create the component**

Create `src/components/settings/billing-details-card.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { Receipt, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { updateGSTIN, getBillingDetails } from "@/actions/billing";

export function BillingDetailsCard() {
  const [gstin, setGstin] = useState("");
  const [original, setOriginal] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getBillingDetails().then((r) => {
      if (r.success) {
        setGstin(r.data.gstin ?? "");
        setOriginal(r.data.gstin);
      }
    });
  }, []);

  const dirty = gstin.trim().toUpperCase() !== (original ?? "");

  async function handleSave() {
    setSaving(true);
    try {
      const result = await updateGSTIN(gstin);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setOriginal(gstin.trim().toUpperCase() || null);
      toast.success("Billing details updated.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Receipt className="h-5 w-5 text-muted-foreground" />
        <h3 className="font-semibold">Billing Details</h3>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">GSTIN (optional)</label>
          <input
            type="text"
            value={gstin}
            onChange={(e) => setGstin(e.target.value.toUpperCase())}
            placeholder="22ABCDE1234F1Z5"
            maxLength={15}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm font-mono"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Your GSTIN is used to issue GST-compliant tax invoices. Optional.
          </p>
        </div>

        <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
          <Save className="mr-1.5 h-3.5 w-3.5" />
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check + commit**

```bash
npx tsc --noEmit 2>&1 | wc -l
```

```bash
git add src/actions/billing.ts src/components/settings/billing-details-card.tsx
git commit -m "feat(billing): add updateGSTIN/getBillingDetails actions and BillingDetailsCard"
```

---

## Task 14: Compose new `BillingSection`

**Files:** Modify `src/components/settings/billing-section.tsx`

Convert the existing all-in-one billing component into a thin shell that composes the four sub-cards.

- [ ] **Step 1: Replace the file**

Replace `src/components/settings/billing-section.tsx` with:

```tsx
import { BillingStatusCard } from "@/components/settings/billing-status-card";
import { PlanManagementCard } from "@/components/settings/plan-management-card";
import { InvoicesCard } from "@/components/settings/invoices-card";
import { BillingDetailsCard } from "@/components/settings/billing-details-card";
import type { OrgProfile } from "@/actions/settings";

interface BillingSectionProps {
  profile: OrgProfile;
}

export function BillingSection({ profile }: BillingSectionProps) {
  return (
    <div className="space-y-4">
      {/* @ts-expect-error Async server component */}
      <BillingStatusCard />

      <PlanManagementCard
        currentPlan={profile.plan}
        currentCycle={profile.billing_cycle ?? null}
        platformFeePaid={profile.platform_fee_paid ?? 0}
        employeeCount={profile.employee_count}
      />

      {/* @ts-expect-error Async server component */}
      <InvoicesCard />

      <BillingDetailsCard />
    </div>
  );
}
```

`@ts-expect-error` directives on async server components are a Next.js 14 quirk (the type of an async server component used in a non-async parent triggers a benign warning). Drop them once the parent is converted to async if needed.

- [ ] **Step 2: Update `getOrgProfile` to return new fields**

The `OrgProfile` type (returned by `src/actions/settings.ts:getOrgProfile`) needs `billing_cycle` and `platform_fee_paid`. Read the current `src/actions/settings.ts`, find the `getOrgProfile` select, and add the columns:

```ts
const { data } = await supabase
  .from("organizations")
  .select("id, name, slug, plan, max_employees, settings, stripe_customer_id, billing_cycle, platform_fee_paid")
  .eq("clerk_org_id", orgId)
  .single();
```

Add the same fields to the `OrgProfile` type definition (look for a type or inferred shape).

- [ ] **Step 3: Type-check + build**

```bash
npx tsc --noEmit 2>&1 | wc -l
npm run build 2>&1 | tail -10
```

Expected: `✓ Compiled successfully`. Page-data error from RESEND remains pre-existing.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/billing-section.tsx src/actions/settings.ts
git commit -m "feat(billing): compose Settings → Billing from BillingStatus, PlanManagement, Invoices, BillingDetails cards"
```

---

## Task 15: End-of-phase verification

**Files:** None. Verification + smoke check.

- [ ] **Step 1: Build**

```bash
npm run build 2>&1 | tail -20
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 2: Verify commit graph**

```bash
git log --oneline main..HEAD 2>&1
```

Should show 13 task commits (Task 1 = manual, Task 15 = verification only).

Expected commit titles, in order:
1. `refactor(billing): cycle-keyed PLAN_IDs, MAX_EMPLOYEES; drop display strings from razorpay.ts` (Task 2)
2. `feat(billing): rewrite createSubscription with cycle/delta/cancel-old; fix cancelSubscription column bug` (Task 3)
3. `feat(billing): add getBillingStatus and pollBillingActivation server actions` (Task 4) — or bundled into Task 3's commit
4. `feat(webhook): handle paused/halted/resumed/pending; new email templates for lifecycle events` (Tasks 5+6)
5. `feat(billing): add grace-period cron — downgrade after 7 days, warn at day 4` (Task 7)
6. `feat(billing): add GSTIN validation utility` (Task 8)
7. `feat(pricing): Monthly/Annual toggle, 4 tiers, GST suffix, config-driven, fixed FAQ copy` (Task 9)
8. `feat(billing): add BillingStatusCard for current plan and status display` (Task 10)
9. `feat(billing): add PlanManagementCard with upgrade/cancel + polling on activation` (Task 11)
10. `feat(billing): add listInvoices action and InvoicesCard` (Task 12)
11. `feat(billing): add updateGSTIN/getBillingDetails actions and BillingDetailsCard` (Task 13)
12. `feat(billing): compose Settings → Billing from BillingStatus, PlanManagement, Invoices, BillingDetails cards` (Task 14)

- [ ] **Step 3: Smoke checks (manual)**

If `npm run dev` works locally:

1. Visit `/pricing` — confirm Monthly/Annual toggle works, 4 cards render, GST suffix on paid amounts.
2. Visit `/dashboard/settings` (with the test1 admin account) — confirm 4 sub-cards render, Billing Status shows current Business plan, Plan Management shows no upgrade options (already on Business), Cancel button is visible.
3. Click Cancel → confirmation modal appears → keep subscription → modal dismisses cleanly.
4. (Don't actually cancel test1's live subscription unless intended.)

- [ ] **Step 4: No push**

Per project pattern, the branch stays local. User pushes when ready.

---

## Out of Scope for Phase 2

Phase 3 covers:
- Custom plan picker UI and the `/dashboard/settings/custom-plan` route
- Superadmin Custom Plans queue tab
- Email templates for Custom flow (request-received, under-review, counter-offer, approved, rejected)
- Dynamic Razorpay plan creation on approval (`razorpay.plans.create()`)
- Counter-offer state machine

Future (post-Phase 3):
- Refunds
- Promo codes
- Self-serve plan switching for Custom orgs
- Razorpay tax-invoice configuration once Maharashtra GSTIN registration completes
