# JambaHR Payment Flow Audit — Bugs & Gaps

**Date:** 2026-05-01
**Status:** Documented; fixes scoped into the upcoming pricing-overhaul plan.

This document captures every bug, gap, and risk found during a full audit of the existing Razorpay-based payment flow. Each item is referenced by file:line and tagged for severity.

---

## Critical bugs

### 1. `cancelSubscription` reads the wrong column
**File:** `src/actions/billing.ts:67-86`

`cancelSubscription` calls `razorpay.subscriptions.cancel(org.stripe_customer_id, true)` — but `stripe_customer_id` is **never written** by the Razorpay webhook. Only `stripe_subscription_id` is set on `subscription.activated` (`src/app/api/webhooks/razorpay/route.ts:30-44`). The guard `if (!org.stripe_customer_id)` always returns `{ success: false, error: "No active subscription" }`, so cancel is broken.

Compounding: the function is exported but **never called from any UI** — there's no Cancel button anywhere. Dead code that would be broken if invoked.

**Fix:** select and use `stripe_subscription_id`. Add a Cancel button to `billing-section.tsx`. Restrict to admin role.

### 2. Upgrade does not cancel the old subscription
**File:** `src/actions/billing.ts:35-65`

When an org upgrades Growth → Business, `createSubscription("business")` creates a new Razorpay subscription, but the existing Growth subscription is **not** cancelled. The webhook updates `plan="business"` but the Growth subscription continues charging until its 12 cycles complete. The org pays both subscriptions in parallel.

**Fix:** before creating the new subscription, cancel any existing one (look up via `stripe_subscription_id`). Or use Razorpay's update-subscription API to switch plans without cancelling.

### 3. Subscriptions auto-expire after 1 year
**File:** `src/actions/billing.ts:50`

`total_count: 12` is hardcoded — Razorpay treats this as "12 monthly cycles total". After 12 charges, the subscription transitions to `completed` and the webhook (`route.ts:51-61`) silently downgrades the org to Starter. There is no renewal flow, no warning email, no in-app notice. The pricing page (`src/app/pricing/page.tsx:122`) advertises "Cancel anytime" without mentioning the cap.

**Fix:** remove `total_count` (defaults to indefinite billing in Razorpay) or implement a renewal flow before completion. Notify users 14 days before expiry if we keep the cap.

### 4. Race condition: page reload before webhook fires
**File:** `src/components/settings/billing-section.tsx:84`

The Razorpay client-side `handler` runs on payment success and calls `window.location.reload()` after 2 seconds. The DB update happens only via the webhook. If the webhook is delayed (Razorpay typically delivers within 1-3 seconds, but can take longer), the user sees stale plan state on reload — a confusing first impression after a successful payment.

**Fix:** poll the org's plan field after success, or use optimistic updates with reconciliation. Better: show a success state with "Your subscription is being activated…" and poll until the DB confirms.

---

## Lifecycle gaps

### 5. `subscription.paused` and `subscription.halted` don't restrict access
**File:** `src/app/api/webhooks/razorpay/route.ts:64-91`

`subscription.paused` sends an email to admins but **does not change `plan`** — the org keeps full paid access while paused. `subscription.halted` (Razorpay's state when retries exhausted) is **not handled at all** — falls through to the `default` warn-and-ignore branch.

**Fix:** decide policy. Options:
- Hard downgrade on pause/halt (immediate access loss)
- Grace period: 7-day soft state where access remains but a banner warns
- Track a separate `subscription_status` column distinct from `plan` so we can show "paid plan, payment failed, retrying" without clobbering the plan tier.

### 6. No `subscription.pending` or `subscription.resumed` handling
**File:** `src/app/api/webhooks/razorpay/route.ts:24-148`

Razorpay's full state machine includes `pending`, `paused`, `resumed`, `halted` events — only a subset is handled. Resume after pause needs explicit logic to restore access if we implement #5 with grace periods.

---

## Security gaps

### 7. Any role can trigger an upgrade
**File:** `src/actions/billing.ts:35-65`

`createSubscription` does not check the calling user's role. An employee can create a Razorpay subscription on behalf of their org. Guard rails depend solely on the UI hiding the upgrade button — but the server action is callable directly.

**Fix:** add `isAdmin(user.role)` check at the top of `createSubscription` and `cancelSubscription` (when fixed).

---

## Operational gaps

### 8. Razorpay env vars missing from `.env.example`
**File:** `.env.example`

Only Stripe env vars are documented. A new developer cloning the repo would have no idea Razorpay is the active provider until checkout is attempted at runtime, where the `!` non-null assertions on `process.env.RAZORPAY_*` would crash.

**Fix:** add `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_GROWTH_PLAN_ID`, `RAZORPAY_BUSINESS_PLAN_ID`, `RAZORPAY_WEBHOOK_SECRET` to `.env.example` with comments.

---

## Idempotency and retry concerns

### 9. No webhook event deduplication
**File:** `src/app/api/webhooks/razorpay/route.ts`

If Razorpay retries a `payment.failed` or `subscription.paused` event (e.g., because our 5xx response timed out), the email send loop fires again. Admins receive duplicate emails. The DB writes are idempotent (set operations) but emails are not.

**Fix:** dedupe on `event.id` — store processed event IDs in a small `webhook_events` table or in `organizations.settings.processed_event_ids` (capped). Skip if already processed.

---

## Dead and conflicting code

### 10. Legacy Stripe webhook handler is fully active
**File:** `src/app/api/webhooks/stripe/route.ts` (117 lines)

The Stripe webhook handler is real, functional code with proper signature verification. It writes to the same `organizations` columns as the Razorpay handler. If `STRIPE_WEBHOOK_SECRET` is set in any environment, both handlers could fire and produce conflicting state.

**Fix:** delete the file or rename to `route.ts.archived`. Remove the Stripe-related env vars from `.env.example` for clarity.

### 11. Duplicate PLANS constant in `src/lib/stripe.ts`
**File:** `src/lib/stripe.ts`

A second `PLANS` export with USD pricing exists alongside the active `src/lib/razorpay.ts` `PLANS`. The Stripe one is referenced nowhere meaningful but instantiates a Stripe client at import time, requiring the key.

**Fix:** delete `src/lib/stripe.ts`.

---

## UX gaps in `billing-section.tsx`

### 12. No subscription status display
**File:** `src/components/settings/billing-section.tsx`

The page shows the current plan and an upgrade button, but no:
- Next billing date
- Current month's bill amount
- Subscription status (active / paused / cancelled / completed)
- Payment method on file
- Past invoices

`getOrgProfile` (`src/actions/settings.ts:44-57`) doesn't even select `stripe_subscription_id` so this data isn't available client-side.

**Fix:** add `getBillingStatus()` server action that fetches the live subscription from Razorpay and returns next-billing-date, status, last-payment. Render in `billing-section.tsx`.

---

## Data model gaps for new pricing

The current schema has:
- `plan` (enum: starter | growth | business)
- `stripe_customer_id` (reused for Razorpay; rarely populated)
- `stripe_subscription_id` (Razorpay subscription ID)
- `max_employees`

Missing for the upcoming pricing overhaul:
- One-time platform fee paid? (boolean or timestamp)
- Custom plan: which features unlocked? (JSONB array)
- Billing cycle: monthly / annual
- Subscription status separate from plan tier
- Provider-agnostic columns (current names are Stripe legacy)

These will be addressed in the pricing-overhaul design spec.
