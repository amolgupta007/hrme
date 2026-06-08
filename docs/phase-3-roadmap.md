# Phase 3 Roadmap — Attendance + Payroll

**Last updated:** 2026-06-08, end of session that shipped Attendance Phase 1+2 and Payroll Phase 1+2.

This document captures every deferred item across PRD 01 (Attendance) and PRD 02 (Payroll) — both canonical Phase-3 scope from each PRD's `§11 Phasing` section AND engineering deferrals flagged during Phase 1/2 implementation reviews.

Use this as the canonical backlog when picking up Attendance Phase 3 or Payroll Phase 3.

---

## PRD 01 — Attendance Phase 3

### Canonical Phase 3 (from PRD 01 §11)

| Item | Description | Estimated tasks |
|---|---|---|
| **Regularization workflow** | Employee requests correction (e.g. forgot to clock in, manually adjust clock-out time); manager approves. Optional toggle per-org. Audit trail. | ~6–8 tasks |
| **Half-day / short-leave automation** | Auto-flag half-day when worked hours < `shifts.half_day_threshold_minutes`. Short-leave (configurable max minutes) without marking absent. Integrate with payroll LOP calc. | ~5–6 tasks |
| **Holiday calendar integration** | The `holidays` table integrates with shifts. Public holiday overlapping a night shift logic, holiday-pay computation (2x multiplier configurable), holiday-on-week-off interaction. | ~5–7 tasks |

### Engineering deferrals from Phase 1/2

| Item | Origin | Notes |
|---|---|---|
| **Monthly roster view** | Phase 2 plan deferral | Phase 2 shipped weekly view only. Monthly grid needs different layout + virtualization. |
| **`employees.manager_id` reporting-chain column** | Phase 2 manager-scope used `departments.head_id` | If org needs cross-dept reporting chains, switch to a `manager_id` FK. Migration + backfill. |
| **Cell-to-cell drag in roster grid** | Phase 2 plan: palette → cell only | Drag-and-drop from one assigned cell to another to move shift around. |
| **Configurable overnight attribution** | Phase 1 hard-coded start-date; Phase 2 didn't make it configurable | Some orgs want end-date attribution (e.g. Indian factory law). New org setting + flow through `attributedDateForClockIn`. |
| **ISO-week grouping for multi-week weekly-OT compute** | Phase 2 simplification | `computeAndRecordOvertime` weekly mode currently treats whole `from..to` range as one bucket. Should group by ISO week (Mon–Sun) when range spans >7 days. |
| **Custom OT cap per employee (e.g. 50h/month)** | Phase 2 plan deferral | Statutory in some Indian states. Add `ot_cap_minutes_monthly` to `salary_structures` or `employees`. |
| **Auto-push of approved OT to payroll** | Phase 2 = manual button only | Cron that auto-pushes when payroll run is processed but not paid. |
| **Auto-closed attendance badge in UI history rows** | CLAUDE.md gotcha #40 | Data is in `attendance_records.auto_closed` column; UI never renders it. Small UX polish. |
| **Per-org workday-hours per day-of-week** | CLAUDE.md "Pending Work" | Currently single value `standard_workday_hours`. Some orgs need different hours per day (e.g. Sat = 5h). Schema: `standard_workday_hours_by_day jsonb`. |
| **Email notification to employee on auto-closed shift** | CLAUDE.md "Pending Work" — intentionally deferred | "We auto-closed your shift at midnight because you didn't clock out." Resend template + cron hook. |
| **Edit shift assignments (not just delete)** | User feedback 2026-06-08 (this session) | We shipped `deleteShiftAssignment` but no `updateShiftAssignment`. Users currently must delete + recreate to change date range or notes. Small action + UI dialog. |

### Sensible Phase 3 bundle for Attendance

If you want to ship a coherent next phase, group:
- Regularization workflow (canonical) — biggest piece
- Half-day automation (canonical) — depends on regularization for the manual override path
- Holiday calendar integration (canonical)
- Monthly roster view (UI polish)
- Auto-closed badge + auto-close email (cheap completeness)
- Edit shift assignments (user-requested gap)

Estimated: ~25–30 tasks, similar scale to Attendance Phase 2.

Defer to Phase 4 / never:
- `manager_id` refactor (only if reporting-chain becomes a sales objection)
- ISO-week OT grouping (only when a customer asks for multi-week compute)
- Custom OT cap (only when a state-statutory request comes in)
- Auto-push OT (manual works; admin maker-checker is the safer default)

---

## PRD 02 — Payroll Phase 3

### Canonical Phase 3 (from PRD 02 §11)

| Item | Description | Estimated tasks |
|---|---|---|
| **Failure auto-retry with exponential backoff** | Phase 2 is admin-initiated manual retry. Phase 3 = cron that retries failed `disbursement_items` with backoff (5min, 30min, 2hr, 6hr, give up). | ~4–5 tasks |
| **Cashfree fallback rail** | Secondary payout provider when RazorpayX is down. Per-org config: primary + fallback. Routing logic on RazorpayX 5xx or rate-limit. | ~12–15 tasks (full integration like RazorpayX but smaller since the framework exists) |
| **Advance-salary handling** | Full lifecycle: employee requests advance, admin approves, payroll deducts from next N runs. Schema: `salary_advances` table with installment plan. | ~10–12 tasks |
| **F&F settlement** | Full-and-final settlement automation on termination. Calculates pro-rata salary, leave encashment, gratuity, recovery of advances, notice-period adjustments. | ~15–18 tasks (largest piece in Phase 3) |

### Engineering deferrals from Phase 1/2

| Item | Origin | Priority |
|---|---|---|
| **Real-time wallet balance polling** | `getWalletBalance()` returns `null` in `src/actions/disbursement.ts` | **High** — UX says "Balance: unknown" today. RazorpayX `/banking_account_statement/balance` endpoint or equivalent. Easy 1-task fix once endpoint shape is confirmed against current Razorpay docs. |
| **Confirm `/payouts_batches` endpoint shape** | TODO in `src/lib/razorpayx.ts` | **High** — first live-mode integration test will reveal correct shape. Per-item fallback already in place. |
| **Levenshtein / Jaro-Winkler name-match scoring** | Phase 2 uses lowercased exact-match in `src/actions/penny-drop.ts` | **Medium** — false-positives on common Indian name variations ("Rajesh Kumar" vs "Rajesh Kumar Sharma"). Crude impl works; better scoring is a real UX upgrade. |
| **eNACH setup wizard inside JambaHR** | Phase 2 links out to RazorpayX dashboard | **Medium** — better customer onboarding, but link-out works. |
| **KMS / HSM key rotation (envelope encryption)** | Phase 2 uses env-var AES-256-GCM key | **Medium** — required at scale (50+ orgs). Currently a single key encrypts everything; rotation requires re-encrypting every row. |
| **`payroll_runs.status` TypeScript union widening** | DB CHECK includes `disbursing`/`disbursement_failed`; TS union narrowly types as `'draft' \| 'processed' \| 'paid'`. Casts in place | **Low** — type debt, no runtime impact. |
| **Per-source separation in `webhook_events` table** | Razorpay-subscription + RazorpayX share the same dedupe table | **Low** — collision risk is theoretical. |
| **Server-side PDF generation for payslips** | Phase 1 deferral — HTML email body only | **Low** — browser print works for now. PDF attachments are a customer request when they appear. |
| **Multi-currency support** | INR-only today | **Low** — only matters if you sell outside India. |
| **RazorpayX Connected Accounts / Partner program** | Architecturally indefinitely deferred | **Low** — adds Partner Banking compliance. Only worth it at 50+ orgs to streamline customer onboarding. |
| **Group bulk-apply ad-hoc line items** | Phase 1 = per-entry only | **Low** — admins can add same line item to multiple employees one by one. Bulk apply would be a UX nice-to-have. |
| **Phase 1.5 nice-to-have: optimistic local patch for penny-drop re-verify** | `src/components/payroll/disbursement-preflight-dialog.tsx` does full preflight reload on per-row re-verify | **Low** — 200-500ms latency hit; acceptable for now. |
| **Phase 1.5 nice-to-have: contact-id reuse on resync** | `syncBeneficiary` always re-creates Contact; orphan Contacts accrue in RazorpayX dashboard | **Low** — no functional impact; periodic cleanup task for ops. |

### Sensible Phase 3 bundle for Payroll

If shipping next:
- **Wallet balance polling** + endpoint confirmation (Phase 2.5 quick win, ~2 tasks)
- **Name-match upgrade** (Phase 2.5 quick win, ~2 tasks)
- **F&F settlement** (canonical, largest piece)
- **Advance-salary handling** (canonical, second-largest)
- **Failure auto-retry with backoff** (canonical, ~4 tasks)

Estimated: ~30–35 tasks total. Defer Cashfree until you've seen RazorpayX reliability data in production for several months — premature redundancy.

Defer to Phase 4 / never:
- Connected Accounts / Partner (only at 50+ orgs)
- KMS rotation (only at scale)
- Multi-currency (only for international expansion)
- PDF attachments (only on customer demand)

---

## Session-specific operational follow-ups

These are NOT phase work — they're operational items that surfaced during this session and need a one-time action before things work cleanly in production.

### Critical / required before customer use

1. **Set `RAZORPAYX_CRED_ENCRYPTION_KEY` in Vercel env** (production + preview environments).
   - Generate a fresh 32-byte base64 key: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
   - Do NOT reuse the dev key from `.env.local`.
   - **This key MUST never change once any customer connects RazorpayX or stores a bank account** — rotating it requires re-encrypting every encrypted row (Phase 3 envelope-encryption upgrade).
   - Without this set, the entire RazorpayX disbursement flow will fail with AES decrypt errors.

2. **Restore `VOYAGE_API_KEY` in `.env.local`** (was overwritten during P2 of Payroll Phase 2).
   - Pull from your Voyage AI dashboard or check Vercel env settings.
   - Once restored, run `npm run embed:help` to index the 6 new RazorpayX articles into `app_help_chunks`. Without this, the AI assistant won't have help articles for: `connect_razorpayx`, `add_employee_bank_account`, `pay_payroll_via_razorpayx`, `approve_disbursement`, `reconcile_disbursement`, `employee_update_bank_details`.

### Audit items (low priority but worth a sweep)

3. **PostgREST FK-embed disambiguation sweep.**
   - The Roster bug today was caused by `departments(name)` (bare embed) returning HTTP 300 Multiple Choices because both `employees.department_id → departments` AND `departments.head_id → employees` FKs exist.
   - Fixed: `departments!department_id(name)` (the disambiguating syntax).
   - **Other queries in the codebase that might have the same bug:**
     - Any `.select("...other_table(field)...")` where the FK relationship is bidirectional needs `!fk_column` syntax.
     - Worth grepping for `departments(` (without `!`) across `src/actions/` and `src/lib/` and verifying each one passes through PostgREST without 300.
     - Same pattern applies wherever you have circular-FK tables (e.g. `employees ↔ departments`, `applications ↔ candidates`, etc.).

4. **`updateShiftAssignment` action** — user-requested gap from this session.
   - Currently admin can only delete + recreate to change date range / notes.
   - Small task: Zod schema + action + dialog. ~30 min of work.

5. **Sentry / observability for the disbursement pipeline.**
   - Phase 2 logs to `disbursement_audit_log` table, but server-side errors in the webhook + payout calls don't have structured Sentry context yet.
   - Phase 3 candidate: add Sentry breadcrumbs in `createBulkPayout`, `approveDisbursement`, the webhook handler.

---

## What's currently live (for reference when picking up Phase 3)

### Attendance — shipped to main as of 2026-06-08
- **Phase 1** (commit `2838114`): Shift Master, manual shift assignment, overnight handling, org-level week-off
- **Phase 2** (commit `7ef7cb4`): Roster grid (weekly), rotational placeholder, conflict detection, OT computation + approval + push-to-payroll, per-employee week-off override, alt-Saturday
- **Bug fixes** (commits `ecf00be`, `a59fd63`, `2a371c7`):
  - parseHHMM accepts Postgres HH:MM:SS
  - deleteShiftAssignment action + trash UI
  - revalidatePath /dashboard/attendance on shift mutations
  - departments FK disambiguation in getRosterGrid (HTTP 300 fix)

### Payroll — shipped to main as of 2026-06-08
- **Phase 1** (commit `36597c7`): Configurable salary structure ratios, ad-hoc line items, payslip email delivery
- **Phase 2** (commit `68d08cf`): RazorpayX disbursement — per-org credentials, employee bank accounts, beneficiary sync, penny-drop with 30-day cache, disbursement engine with maker-checker, reconciliation tab, webhook with per-org HMAC, post-review fixes for double-pay + duplicate-batch race

### Live DB migrations
- 029–048 (Attendance + Payroll 1/2 + RazorpayX Phase 2)
- 049 (disbursement_batches partial unique index)
- 050 (razorpayx_credentials.account_id UNIQUE)

---

## How to pick this up

1. Decide which module + bundle to ship next (Attendance Phase 3 vs Payroll Phase 3 vs split).
2. Read the canonical PRD `§11 Phasing` for the chosen module.
3. Open this doc and pull the relevant rows from the "Engineering deferrals" section into the plan.
4. Follow the same plan-and-execute pattern as past phases:
   - PRD reading → divergence report against current schema → open decisions with recommendations → plan file under `docs/superpowers/plans/YYYY-MM-DD-<name>.md` → subagent-driven execution → final cross-task review → smoke-test playbook → merge.

The earlier plan files (`2026-06-06-attendance-phase-1-shifts-and-week-off.md`, `2026-06-07-attendance-phase-2.md`, `2026-06-07-payroll-prd-02-phase-1.md`, `2026-06-08-payroll-prd-02-phase-2.md`) are the templates to follow.
