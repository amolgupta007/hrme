---
id: reconcile_disbursement
title: Reconcile a disbursement batch
summary: Check per-employee payout status and retry failures.
route_key: payroll_disbursement
allowed_roles: [owner, admin]
plan_tier: business
keywords: [reconcile, retry, failed, csv, payout status]
---

# Reconcile a disbursement batch

## Steps

1. Open **Dashboard → Payroll** → expand a run with a disbursement batch.
2. The **Disbursement** section shows the batch summary and per-employee items.
3. Each item shows: Employee, Amount, Status, Fee, RazorpayX Payout ID, Failure reason (if any).
4. If any items have **failed** status:
   - Click **Retry N failed** to retry only the failed items.
   - JambaHR re-calls RazorpayX with new idempotency keys.
   - Successful retries flip individual statuses to `paid`.
5. Click **Download CSV** to export a full reconciliation report for accounting.

Once all items reach `paid`, the run flips to **paid** automatically and a payslip email goes out (Payroll Phase 1 feature).
