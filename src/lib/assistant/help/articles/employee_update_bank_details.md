---
id: employee_update_bank_details
title: Update your bank account (employee)
summary: Add or change your bank details so payroll can be paid directly.
route_key: profile_bank_account
allowed_roles: [employee, manager, admin, owner]
plan_tier: starter
keywords: [bank, account, profile, employee, self-serve]
---

# Update your bank account

## Steps

1. Open **Dashboard → Profile**.
2. Scroll to the **Bank Account** section.
3. If you don't have one yet: click **Add bank account**. Otherwise: click **Edit**.
4. Enter:
   - **Holder name** (your name as it appears on the bank account)
   - **Account number** (re-enter even if just editing the holder name — JambaHR never decrypts to client-side)
   - **IFSC** (e.g. FDRL0001234)
   - **Account type** (savings or current)
5. Click **Save**.

The status badge shows verification progress. "Synced" means RazorpayX has the beneficiary ready for payouts. "Failed" means there was an issue — contact your admin.

Your bank details are encrypted at rest. Only you and your admin can view the masked summary; no one can see the full account number except via the encrypted database column.
