# PRD 02 — Payroll Module (Enhancement)

**Product:** JambaHR
**Module:** Payroll & Disbursement
**Status:** Draft for review
**Owner:** Amol (Product Owner / Lead Dev)
**Build priority:** 2 of 5
**Doc type:** Combined Product + Business Requirements

---

## 1. Background & Problem

JambaHR's payroll handles Indian statutory components (PF, ESI, PT, TDS, LWF) and has a payslip PDF download. Two gaps remain: (1) salary **structure is not owner-configurable** — orgs can't tune Basic % / Special Allowance % or add ad-hoc allowances/bonuses; (2) there is **no online disbursement** — owners process payroll but still pay out via their bank manually. This PRD adds configurable payroll structure and **one-click bulk online salary disbursement with maker-checker**, plus payslip delivery via email and in-app.

## 2. Goals

- Owner/admin can **customize salary structure** (Basic %, Special Allowance %, etc.) applied to **new payroll runs**.
- Add **ad-hoc special allowances / bonuses** and manual payment entries as needed.
- **Online disbursement** of salaries from the platform to employee bank accounts.
- **One-click bulk payout** after a payroll run is processed.
- **Maker-checker approval** before money moves (configurable approver).
- **Payslip delivery** to employees via **email + in-app**.
- Statutory components (PF/ESI/PT/TDS/LWF) **auto-recompute** when Basic changes.

## 3. Non-Goals (this phase)

- Replacing the existing statutory engine (reused, just re-triggered on config change).
- Full-and-final settlement automation (future).
- Loan/advance lifecycle management beyond a single advance entry (future).

## 4. Payment Rail Decision (Recommendation)

Researched options (June 2026): RazorpayX Payouts, Cashfree Payouts, PayU.

**Recommendation: RazorpayX Payouts.**

Rationale:
- Native **maker-checker** workflow with configurable approval thresholds, role-based access, and audit logging — directly satisfies our requirement.
- **Penny-drop validation** (₹1 verify + name reverse-lookup) reduces failed payouts and support tickets.
- **Bulk/batch payout API** with per-transaction status callbacks; disburse to bank account or UPI VPA.
- Best **developer experience and docs** in the Indian market — important for a solo dev moving fast.
- Same-vendor path if we later add inbound payments (subscriptions/billing already on Stripe; can revisit).

Cashfree has the **lowest published payout fees** and excellent payout infra — keep as a **secondary/fallback** rail and a price-negotiation lever, especially as volume grows. Exact per-payout pricing must be confirmed via sales quote before launch.

> **Open decision D1:** Confirm RazorpayX as primary. Get written quotes from RazorpayX + Cashfree for payout per-transaction fees at expected volume before integration sign-off.

## 5. Success Metrics

- % of payroll runs disbursed online via platform (vs manual bank).
- Payout success rate ≥ 99% (post penny-drop).
- Time from "payroll processed" → "all employees paid" (target: < 2 minutes for bulk).
- % payslips delivered (email + in-app) within 1 minute of disbursement.

## 6. Roles & Permissions (Maker-Checker)

| Capability | Owner | Admin/HR (Maker) | Approver (Checker) | Employee |
|---|---|---|---|---|
| Configure salary structure (%) | ✅ | ✅ | — | ❌ |
| Add allowance/bonus/manual entry | ✅ | ✅ | — | ❌ |
| Initiate bulk payout (maker) | ✅ | ✅ | — | ❌ |
| Approve/reject payout (checker) | ✅ | ❌* | ✅ | ❌ |
| View/download payslip | ✅ | ✅ | — | ✅ (self) |

> *Owner configures **who** the checker is. Maker ≠ Checker enforced (segregation of duties). Owner may self-approve only if org explicitly allows single-person mode (small orgs).

## 7. Functional Requirements

### 7.1 Configurable Salary Structure (Settings → Payroll)
- Owner/admin sets **Basic %** of CTC/gross and **Special Allowance %**, plus other components (HRA, conveyance, etc.).
- Validation: components must sum correctly; warn on statutory implications (e.g. PF wage definition).
- Changes apply to **new payroll runs only** (no retroactive recompute of past runs).
- Effective-from date stored; past payslips immutable.

### 7.2 Ad-hoc Allowances, Bonuses & Manual Entries
- Add a one-time **special allowance** or **bonus** to an employee or a group for a given cycle.
- Add a **manual payment entry** (e.g. reimbursement, incentive) with note/category.
- All ad-hoc items appear on the payslip and in the disbursement total.

### 7.3 Statutory Auto-Recompute
- When Basic changes, recompute PF, ESI, PT, TDS, LWF for affected (future) runs automatically.
- Show a preview/diff before finalizing the run.

### 7.4 Online Disbursement (Bulk, One-Click)
- After a run is **processed**, show a **"Pay Now"** action.
- Pre-flight: penny-drop validation of all beneficiary accounts; flag invalid/missing bank details.
- Maker initiates → Checker approves → funds move via RazorpayX bulk payout.
- Per-employee payout status tracked (queued, processing, paid, failed) with retry on failure.
- Reconciliation view: total disbursed, fees, failures, downloadable report.

### 7.5 Payslip Delivery
- On successful payout (or on demand), generate payslip PDF (existing generator reused).
- Deliver via **email** (Resend, already in stack) **and** make available **in-app** (employee self-service).
- Employee in-app: list of payslips by month, view + download.

## 8. Data Model (high level — Supabase)

- `salary_structure_config` (id, org_id, basic_pct, special_allowance_pct, components_json, effective_from, created_by)
- `payroll_runs` (extend: + structure_config_id snapshot, status, processed_at)
- `payroll_line_items` (extend: + ad_hoc_type, ad_hoc_amount, note)
- `disbursement_batches` (id, org_id, run_id, maker_id, checker_id, status, provider[razorpayx], total_amount, fees, created_at, approved_at)
- `disbursement_items` (id, batch_id, employee_id, amount, beneficiary_ref, penny_drop_status, payout_status, provider_payout_id, failure_reason)
- `payslip_deliveries` (id, employee_id, run_id, email_status, inapp_status, pdf_url)

> Store provider IDs + idempotency keys. RLS by org_id. Never store raw bank credentials beyond what the provider tokenizes; prefer provider-side fund accounts.

## 9. Security & Compliance

- Maker-checker segregation enforced server-side.
- Audit log for every config change, approval, and payout.
- DPDP Act: bank details are sensitive personal data — encrypt at rest, access-logged, minimal exposure in UI.
- Idempotency keys mandatory on payout calls (provider requirement).

## 10. Dependencies

- Attendance OT + day-count feed (PRD 01).
- RazorpayX account + KYC + current account setup (business prerequisite, lead time).
- Resend (email) — already integrated.

## 11. Phasing

**Phase 1 (MVP)**
- Configurable salary structure (new runs) + statutory auto-recompute + preview.
- Ad-hoc allowance/bonus/manual entries.
- Payslip delivery: email + in-app.

**Phase 2**
- RazorpayX integration: penny-drop, single + bulk payout, maker-checker, status tracking, reconciliation.

**Phase 3**
- Failure auto-retry, fallback rail (Cashfree), advance-salary handling, F&F settlement.

## 12. Open Decisions / Assumptions

- **D1:** Confirm RazorpayX primary; obtain payout fee quotes (RazorpayX + Cashfree).
- **D2:** Single-person approval mode allowed for very small orgs? (default: allowed via explicit toggle.)
- **A1:** "Advance Salary" (from the whiteboard) treated as a manual payment entry in Phase 1; full advance lifecycle deferred.
- **A2:** Funding model = pre-funded RazorpayX current account (vs auto-debit threshold). Confirm.
