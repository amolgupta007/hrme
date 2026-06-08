---
id: add_employee_bank_account
title: Add an employee's bank account (admin)
summary: Capture an employee's bank details so they can receive salary directly.
route_key: payroll_disbursement
allowed_roles: [owner, admin]
plan_tier: business
keywords: [bank, account, employee, disbursement, ifsc, holder name]
---

# Add an employee's bank account

## Steps

1. Open **Dashboard → Employees**.
2. Find the employee's row → click the **⋮** (actions) → **Edit bank account**.
3. Enter:
   - **Holder name** (must match what the bank has on file)
   - **Account number** (9–18 digits)
   - **IFSC** (e.g. FDRL0001234)
   - **Account type** (savings or current)
4. Click **Save**.

JambaHR will automatically:
- Encrypt the account number + IFSC at rest.
- Create a RazorpayX Contact + Fund Account in the background.
- Mark the beneficiary "synced" once RazorpayX confirms.

If the sync fails, the status badge will show the error. Click **Re-sync** to retry.
