---
id: connect_razorpayx
title: Connect RazorpayX
summary: Add your RazorpayX API credentials so JambaHR can disburse salaries online.
route_key: settings_razorpayx
allowed_roles: [owner, admin]
plan_tier: business
keywords: [razorpayx, connect, api key, webhook, disbursement, setup]
---

# Connect RazorpayX

Before you can pay employees online from JambaHR, you must connect your own RazorpayX account. JambaHR never holds your funds — money flows from YOUR RazorpayX wallet to YOUR employees.

## Prerequisites
- A RazorpayX business account (sign up at razorpay.com → enable RazorpayX).
- KYC completed.
- A funded current account linked to RazorpayX as the source.

## Steps

1. Sign in to RazorpayX dashboard → **Settings** → **API Keys**. Generate a new key pair (Test mode keys start with `rzp_test_`, live with `rzp_live_`).
2. Settings → **Webhooks** → **Add webhook** → URL `https://jambahr.com/api/webhooks/razorpayx`. Generate a webhook secret and copy it.
3. Note your **Account ID** (under Settings → API or Account) and your **Virtual Account Number** (the RazorpayX wallet account, looks like a regular bank account number).
4. In JambaHR → **Settings → Payroll → RazorpayX** → click **Connect RazorpayX**.
5. Paste: Key ID, Key Secret, Webhook Secret, Account ID, Virtual Account Number.
6. **Test mode** auto-toggles based on the key prefix.
7. Click **Save & connect**.
8. Click **Test connection** to verify the credentials work.

Credentials are encrypted at rest. JambaHR never displays plaintext secrets back.
