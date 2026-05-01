# Pricing Overhaul + Custom Plan + Billing Bug Fixes — Design

**Date:** 2026-05-01
**Status:** Approved by user
**Audit reference:** `docs/billing/2026-05-01-payment-flow-audit.md` (12 documented bugs/gaps)

## Goal

Replace JambaHR's current 3-tier subscription model with a redesigned pricing structure:
- One-time platform fees added to each paid tier (₹2,999 Growth / ₹6,999 Business)
- Monthly and annual billing cycles (annual = 10× monthly = 2 months free)
- New "Custom" tier where customers pick individual features at ₹120/feature/employee/month, gated by founder approval
- GST treated exclusively (added at checkout) for B2B compliance and ITC eligibility
- Roll the 12 known billing flow bugs from the audit into the implementation rather than leaving them unfixed

## Why

The existing 3-tier subscription is too rigid: starter→growth→business is too few choices, the Growth tier has no monetization friction, and the audit revealed serious lifecycle bugs (silent 1-year auto-expiry, broken cancel, parallel charging on upgrade) that block any responsible go-to-market expansion. Adding a Custom tier serves customers who want a tailored feature set at a fair price, the platform fee creates onboarding-revenue offsets for support costs, and annual billing improves cash flow and reduces churn risk.

## Pricing Model — The Locked Decisions

### Tier matrix (all amounts ex-GST 18%)

| Tier | Platform fee (one-time) | Monthly recurring | Annual recurring | Max employees |
|---|---|---|---|---|
| **Starter** | Free | Free | Free | 10 |
| **Growth** | ₹2,999 | ₹500 / employee / month | ₹5,000 / employee / year | 200 |
| **Business** | ₹6,999 | ₹800 / employee / month | ₹8,000 / employee / year | 500 |
| **Custom** | Founder-set (default ₹4,999 in picker) | ₹120 × selected_features × employees / month | ₹1,200 × selected_features × employees / year | Founder-set (default 200) |

### Behaviors

- **GST-exclusive pricing.** Display "+ GST" suffix on every paid figure on `/pricing` and `/dashboard/settings#billing`. Razorpay's tax-invoice feature handles CGST 9% + SGST 9% (intra-MH) or IGST 18% (inter-state) once the JambaHR GSTIN is registered. Customer GSTIN collected at first checkout.
- **Annual = 10× monthly.** Communicated as "Save 2 months — pay annually". Pricing page has a Monthly/Annual toggle.
- **Platform fee on upgrade: delta only.** General rule: `delta = max(0, target_tier_platform_fee − platform_fee_paid)`. Examples:
  - Starter → Growth: delta = ₹2,999 (paid 0 before)
  - Growth → Business: delta = ₹6,999 − ₹2,999 = ₹4,000
  - Growth → Custom: delta = max(0, founder_set_fee − ₹2,999)
  - Business → Custom: delta = max(0, founder_set_fee − ₹6,999) — usually 0 for typical Custom pricing
  - Any tier → Starter: free (downgrade, no fee change)
  - No refunds on downgrade (consistent with the no-refund-on-cancel rule)
  
  `platform_fee_paid` accumulates in paise on every successful upgrade. Existing orgs sit at 0 (grandfathering).
- **Existing orgs grandfathered.** No backfill UPDATE on existing paid orgs. They keep their state. Their `platform_fee_paid` defaults to 0; any future upgrade pays the full new-tier platform fee (consistent with grandfathering — they get no credit for the past).
- **Downgrades have no refund.** Customer keeps access until end of billing cycle, then drops to lower tier.
- **Subscriptions don't auto-expire.** Audit bug #3 (`total_count: 12` silently terminating after 1 year) is fixed — both monthly and annual subscriptions run indefinitely. The cycle (monthly vs yearly) is determined by the Razorpay plan's `period` setting, not by a count cap. Customer cancels explicitly when they want to stop.
- **Customer GSTIN is optional.** If absent, Razorpay generates non-GST invoices. Encouraged but not required.

### Custom plan delivery — hybrid (self-serve picker, founder approves)

- Customer picks features in `/dashboard/settings/custom-plan` from a list of ~10 individually-selectable features (Documents, Reviews, Objectives, Training, Hiring JD, Payroll, ATS, Interview Scheduling, Offer Letters, Onboarding Workflows). Infrastructure-only feature flags (`api`, `analytics`, `semantic_search`, `ai_*`) are not in the picker — they only ship as part of full Business tier.
- Live calculator updates: `selected_features × employees × ₹120 = monthly`, `× 10 = annual`, plus default ₹4,999 platform fee.
- Submit creates a `custom_plan_requests` row in status `pending`. Email goes to `amol@jambahr.com` with link to superadmin review.
- Customer sees "Request submitted, awaiting review" banner in Settings → Billing.
- Founder reviews in `/superadmin → Custom Plans` tab. Editable fields: platform fee, per-feature rate, max employees, founder notes. Decision: Approve / Reject / Counter-offer.
- On Approve: `razorpay.plans.create()` mints a per-org plan, `razorpay.subscriptions.create()` activates it, customer receives email with checkout link, org gets `plan='custom'` after payment + webhook.
- Counter-offer flow: customer sees the modified proposal, must accept before going to checkout. State machine: `pending → counter_offered → accepted | rejected | approved → active`.

## Architecture

Three independent surfaces, plus folded-in audit fixes:

| Surface | What it does | Where |
|---|---|---|
| **Pricing page** | Marketing display of 4 tiers + cycle toggle | `/pricing` |
| **Settings → Billing** | Current plan status, upgrade/downgrade/cancel, invoices, billing details | `/dashboard/settings#billing` (composed of new sub-cards) |
| **Custom plan picker + approval queue** | Customer-side feature picker + founder-side review | `/dashboard/settings/custom-plan`, `/superadmin#custom-plans` |
| **Razorpay flow** | Subscription with platform fee as upfront `addons[]` | `src/actions/billing.ts`, `src/app/api/webhooks/razorpay/route.ts` |

```
Pricing page  →  Upgrade button  →  createSubscription({plan, cycle, employees})
                                            │
                              (Razorpay subscription with addons[platform_fee_delta])
                                            │
                                  Razorpay checkout modal
                                            │
                                       Customer pays
                                            │
                            ┌───────────────┴───────────────┐
                       Client handler                 Webhook event
                       (poll status                   subscription.activated →
                        every 2s for 30s)             write plan, status,
                                                      billing_cycle, platform_fee_paid

Custom request  →  Superadmin queue  →  Approve  →  razorpay.plans.create()
                                                  →  razorpay.subscriptions.create()
                                                  →  email customer with checkout link
```

## Razorpay Implementation — Single Subscription with Upfront Addon

Razorpay's Subscriptions API supports an `addons[]` array on creation — a one-time amount added to the **first invoice only**, after which the subscription bills its normal recurring amount. This is the standard "setup fee" pattern.

```ts
razorpay.subscriptions.create({
  plan_id: PLAN_IDS[planKey][billingCycle],   // e.g., RAZORPAY_GROWTH_ANNUAL_PLAN_ID
  // total_count omitted = indefinite billing (fixes audit #3).
  // The plan itself defines the cycle: growth_monthly's plan has period='monthly',
  // growth_annual's plan has period='yearly'. Cancellation is explicit only.
  addons: platformFeeDelta > 0
    ? [{ item: { amount: platformFeeDelta * 100, name: "Platform fee" } }]
    : undefined,
  notes: { org_id, plan: planKey, cycle: billingCycle, fee_paid: platformFeeDelta },
});
```

The 4 Razorpay plans (`growth_monthly`, `growth_annual`, `business_monthly`, `business_annual`) are configured in the Razorpay dashboard with the appropriate `period` (`monthly` or `yearly`) and `interval` (`1`). The subscription itself stays cycle-agnostic — it just charges according to the plan's period.

**Why single subscription, not Order + Subscription?**
- One charge on customer's card statement (vs. two confusing transactions).
- One webhook event to coordinate (`subscription.activated`).
- Single source of truth in our DB.

**Plan IDs (env vars):**
```
RAZORPAY_GROWTH_MONTHLY_PLAN_ID
RAZORPAY_GROWTH_ANNUAL_PLAN_ID
RAZORPAY_BUSINESS_MONTHLY_PLAN_ID
RAZORPAY_BUSINESS_ANNUAL_PLAN_ID
```

Created once in the Razorpay dashboard with per-employee base amounts. Custom tier creates plans on-the-fly per approval (`razorpay.plans.create()`), since each Custom org has unique pricing.

## Database Schema Changes

All changes via Supabase SQL Editor (project convention). All `add column` statements idempotent.

### `organizations` — 9 new columns

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

### Plan check constraint extended

```sql
alter table organizations drop constraint if exists organizations_plan_check;
alter table organizations
  add constraint organizations_plan_check
  check (plan in ('starter','growth','business','custom'));
```

### New table: `custom_plan_requests`

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
```

### New table: `webhook_events` — fixes audit bug #9 (idempotency)

```sql
create table if not exists webhook_events (
  id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);
```

Razorpay event IDs (`evt_...`) inserted with `INSERT … ON CONFLICT (id) DO NOTHING`. If conflict → already processed → return 200 silently. Weekly cron drops events older than 30 days.

### NO backfill UPDATE

Per user instruction, no UPDATE statement runs against existing paid orgs. They retain their current state with NULL `billing_cycle` and NULL `subscription_status`. Code-level handling:

- `subscription_status IS NULL AND plan != 'starter'` → treated as `'active'` for access checks
- `billing_cycle IS NULL` → defaults to `'Monthly'` in UI render, but the value is written explicitly the next time the customer takes any billing action (upgrade, cancel, switch)
- `platform_fee_paid` defaults to 0 for everyone (column default) — existing orgs effectively pay full platform fee on next upgrade, consistent with grandfathering

### Money is stored in paise (integer)

Every monetary column (`platform_fee_paid`, `custom_per_feature_rate`, `custom_platform_fee`) is `integer` in paise. Avoids float/decimal precision issues and matches Razorpay's API convention. UI formats to `₹X,XXX` at render.

### RLS

Both new tables have RLS enabled. Server actions use the admin client (project pattern). RLS is defense-in-depth — no policies needed since clients never query these tables directly via Data API.

## Bug Fixes Folded Into This Work

| Audit # | Fix | Where |
|---|---|---|
| 1 | Cancel uses `stripe_subscription_id`; UI button added | `billing.ts:cancelSubscription`, `billing-section.tsx` |
| 2 | Upgrade cancels old subscription before creating new | `billing.ts:createSubscription` (before razorpay.subscriptions.create) |
| 3 | `total_count: 12` removed; monthly = indefinite, annual = 1 cycle then auto-renew | `billing.ts:createSubscription` |
| 4 | Polling fix: 2s polling for 30s instead of `window.location.reload()` | `billing-section.tsx` activation handler |
| 5 | `subscription.paused`/`halted` set `subscription_status`, schedule grace-period downgrade via cron | webhook + new `/api/cron/billing-grace-period` |
| 6 | New handlers: `subscription.resumed`, `subscription.pending` | webhook |
| 7 | Admin-role guard on `createSubscription`, `cancelSubscription` | both billing actions |
| 8 | Razorpay env vars added to `.env.example`; Stripe vars removed | `.env.example` |
| 9 | Webhook event deduplication via `webhook_events` table | webhook handler entry |
| 10 | Delete `src/app/api/webhooks/stripe/route.ts` | file deletion |
| 11 | Delete `src/lib/stripe.ts` | file deletion |
| 12 | New billing-status card with next billing date, status, payment method | `billing-status-card.tsx` |

## UI Surfaces

### Pricing page (`/pricing`)

- Header: Monthly/Annual toggle (Annual selected by default with "Save 2 months" badge).
- 4 cards: Starter, Growth, Business, Custom. All driven from `src/config/plans.ts` and `src/config/billing.ts` (single source of truth — no more hand-coded `tiers` array).
- Each card: `Platform fee: ₹X (one-time)` line + `Recurring: ₹Y / employee / month + GST` line. Numbers swap when toggling cycle.
- Custom card: "From ₹120 / feature / employee / month + GST" + "Build your plan" button → picker.
- FAQ copy fixed: "Cancel anytime. You retain access until the end of your billing cycle."

### Settings → Billing (`billing-section.tsx`)

Composed of 4 sub-cards in order:

1. **Billing Status** — current plan, recurring amount, billing cycle, max employees, next billing date (live from Razorpay), subscription status (`active`/`paused`/`cancelled`/`pending`).
2. **Plan management** — Upgrade buttons with exact amount-due (delta + first cycle), Switch-to-Annual button (shows savings), Cancel button with confirmation modal ("You'll keep access until [next billing date]").
3. **Invoices** — list of past Razorpay invoices with download links (Razorpay generates GST-compliant tax invoices once GSTIN is set).
4. **Billing details** — GSTIN field (validated against regex), billing address, contact email for invoices.

### Custom plan picker (`/dashboard/settings/custom-plan`)

- Feature checklist (~10 features in selectable groups for visual clarity)
- Employee count input (defaults to current org count, capped at 500)
- Monthly / Annual toggle
- Live price calculator
- Note: "Custom plans are reviewed by our team within 1 business day"
- Submit → `requestCustomPlan` action

### Superadmin Custom Plans tab (`/superadmin`)

- List of pending requests with org, employees, features, requested cycle
- Per-request editable fields: platform fee, per-feature rate, max employees, founder notes
- Decision buttons: Approve / Reject (with reason) / Counter-offer (with modified proposal)

## Email Templates (5 new)

All in `src/components/emails/`:
- `custom-plan-request-received.tsx` — to founder (`amol@jambahr.com`)
- `custom-plan-under-review.tsx` — to customer
- `custom-plan-counter-offer.tsx` — to customer (with new pricing)
- `custom-plan-approved.tsx` — to customer (with checkout link)
- `custom-plan-rejected.tsx` — to customer (with rejection reason)

Plus 1 new lifecycle email:
- `subscription-grace-period-ending.tsx` — to admins, 3 days before access drops on paused/halted orgs

Imports `FROM_EMAIL` / `FOUNDER_EMAIL_FROM` / `NOREPLY_EMAIL_FROM` per project convention (`src/lib/resend.ts`).

## Cron Jobs (Vercel)

| Route | Schedule | Purpose |
|---|---|---|
| `/api/cron/billing-grace-period` | `0 4 * * *` (daily 4am UTC = 9:30am IST) | Find orgs with `subscription_status IN ('paused','halted')` and `subscription_paused_at < now() - interval '7 days'`. Downgrade to Starter. Email admins. |
| `/api/cron/webhook-events-cleanup` | `0 5 * * 0` (weekly Sunday 5am UTC) | `DELETE FROM webhook_events WHERE processed_at < now() - interval '30 days'`. |

Both require `Authorization: Bearer CRON_SECRET` per project convention.

## Razorpay Dashboard Configuration (Manual)

1. Create 4 plans in Razorpay dashboard:
   - `growth_monthly` — ₹500, monthly cycle
   - `growth_annual` — ₹5,000, annual cycle
   - `business_monthly` — ₹800, monthly cycle
   - `business_annual` — ₹8,000, annual cycle
2. Capture plan IDs and add to Vercel env vars.
3. Once Maharashtra GSTIN is registered: configure GST collection in Razorpay account settings (state, GSTIN, default tax rate 18%). Razorpay then auto-generates compliant tax invoices.

## Phasing — Three Implementation Plans

This design ships in three consecutive plans, each with its own writing-plans cycle:

### Phase 1 — Foundations & invisible bug fixes (~1.5 days)
- DB migration (all 9 new columns + 2 new tables + plan constraint update)
- `src/config/billing.ts`
- Refactor `src/lib/razorpay.ts` to new PLANS shape
- `.env.example` cleanup
- Delete `src/lib/stripe.ts` and `src/app/api/webhooks/stripe/route.ts`
- Webhook idempotency via `webhook_events` table
- Admin-role guard on billing actions
- Audit fixes covered: #7, #8, #9, #10, #11
- **No user-visible change** — pure plumbing, ships safely

### Phase 2 — Monthly/Annual + GST + UI overhaul + lifecycle bug fixes (~3 days)
- Pricing page Monthly/Annual toggle, 4th Custom card placeholder, GST suffix everywhere
- Settings → Billing rewrite (4 sub-cards)
- Cancel button + working `cancelSubscription`
- Cancel-old-on-upgrade
- Polling fix on subscription activation
- Delta-on-upgrade platform fee logic
- Pause/halt/resume webhook handlers + grace-period cron
- Audit fixes covered: #1, #2, #3, #4, #5, #6, #12
- **End of phase 2: new pricing model live for Starter/Growth/Business**

### Phase 3 — Custom plan end-to-end (~2 days)
- `custom_plan_requests` flow (DB already migrated in Phase 1)
- Customer picker UI + page
- Superadmin queue UI + actions
- 5 email templates
- Dynamic Razorpay plan creation on approval
- Counter-offer state machine
- **End of phase 3: Custom tier live, full feature complete**

Each phase has its own writing-plans cycle so reviews stay manageable.

## Out of Scope

- Refunds (rejected during brainstorm)
- Promo codes / coupons
- Self-serve plan switching for Custom (founder approval gates all changes)
- Currency support beyond INR
- Multi-org billing (one Razorpay sub per org, by design)
- Migrating existing orgs to annual or to platform-fee-paid status (grandfathered, never touched)
- Razorpay Payouts (not needed for subscriptions)

## Risks / Gotchas

1. **Razorpay tax-invoice setup is gated by JambaHR's own GSTIN.** Until your Maharashtra GSTIN is registered, invoices issue without GST breakdown — we're collecting GST-exclusive amounts but not remitting/showing the tax line. Acceptable for the brief window before registration completes; once registered, configure Razorpay and re-issue any invoices needed for compliance.
2. **Custom plan creation race.** If a founder approves a Custom request and `razorpay.plans.create()` succeeds but `razorpay.subscriptions.create()` fails, we have an orphan plan in Razorpay. The action wraps both in a try/catch and rolls back the request status to `pending` with an error note for the founder to retry. Plans in Razorpay are reusable, so the orphan is harmless but worth tracking.
3. **NULL `subscription_status` for legacy orgs.** Until they take any billing action, legacy orgs sit at NULL. Access checks must explicitly handle this case (`status IS NULL AND plan != 'starter'` → treat as active). Audit any new code that reads `subscription_status` to verify NULL fallback.
4. **Counter-offer state machine.** Customer can cancel-during-counter-offer (status `cancelled`) or accept-then-not-pay (status `accepted` but no Razorpay subscription). The picker UI handles cancel; the not-paid case is a 7-day timeout that reverts the request to `cancelled` automatically (added to the grace-period cron).
5. **Existing test1 org.** Sits at `plan='business'`, `billing_cycle=NULL`, `subscription_status=NULL` after migration. Billing UI shows "Monthly" by default but is harmless — actions write the value explicitly when the customer next interacts.
6. **Webhook event TTL.** 30-day cleanup of `webhook_events` is safe because Razorpay's max retry window is 24 hours. If retry windows ever extend, increase the TTL.
