---
id: approve_disbursement
title: Approve a disbursement batch
summary: Maker-checker step — review and approve a payroll batch initiated by another admin.
route_key: payroll_disbursement
allowed_roles: [owner, admin]
plan_tier: business
keywords: [approve, maker checker, disbursement, batch]
---

# Approve a disbursement batch

By default, JambaHR enforces maker-checker: the admin who initiates a batch is NOT the admin who approves it. This prevents single-person fraud.

## Steps

1. Open **Dashboard → Payroll** → expand the run with the pending batch.
2. In the **Disbursement** section, the batch shows status **awaiting approval**.
3. Review:
   - Who initiated the batch
   - Total amount
   - Employee count
4. Click **Approve & Pay**.
5. RazorpayX is called with all payouts in a single bulk request.
6. The batch flips to **processing**, and per-employee statuses update as RazorpayX confirms each payout (usually within seconds for IMPS).

If you ARE the maker, the system will reject your approval unless single-person approval is enabled (Settings → Payroll → RazorpayX → Allow single-person approval).
