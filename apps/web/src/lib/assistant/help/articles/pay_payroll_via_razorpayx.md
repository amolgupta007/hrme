---
id: pay_payroll_via_razorpayx
title: Pay payroll via RazorpayX
summary: Initiate online salary disbursement from a processed payroll run.
route_key: payroll_disbursement
allowed_roles: [owner, admin]
plan_tier: business
keywords: [pay now, disbursement, razorpayx, initiate, salary]
---

# Pay payroll via RazorpayX

## Prerequisites
- RazorpayX is connected (Settings → Payroll → RazorpayX).
- The payroll run is in **Processed** status.
- All employees have bank details + synced beneficiaries.
- Your RazorpayX wallet has enough balance for the total payable.

## Steps

1. Open **Dashboard → Payroll** → expand the run you want to pay.
2. Click **Pay Now via RazorpayX**.
3. The **pre-flight check** opens:
   - Total payable vs wallet balance
   - Per-employee bank verification (penny-drop)
   - Any blocked employees (missing bank, failed verification)
4. Fix any blocked employees first (re-verify or fix bank details).
5. Click **Initiate batch**.
6. The batch enters **awaiting approval** state.
7. A **different admin** must now open the run and click **Approve & Pay** to actually trigger the payouts (maker-checker). Single-person mode can be enabled in Settings.
8. After approval, the batch goes to **processing**. RazorpayX webhooks update each employee's status as payouts complete.

The run flips to **paid** automatically once all payouts complete.
