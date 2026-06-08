# Payroll PRD 02 Phase 2 — RazorpayX Disbursement

**Shipped:** 2026-06-08
**Scope:** PRD 02 §11 Phase 2 — penny-drop, single + bulk payout, maker-checker, status tracking, reconciliation.

## What admins can do now
1. Connect their org's RazorpayX account (Settings → Payroll → RazorpayX).
2. Test the connection from the dashboard.
3. Add bank accounts for employees (Employees → ⋮ → Edit bank account).
4. Run pre-flight checks (penny-drop + wallet balance) before payout.
5. Initiate a disbursement batch from a processed payroll run.
6. Approve a batch as the checker (different admin).
7. Reconcile per-employee payout statuses + retry failed items.
8. Download CSV reconciliation reports.

## What employees can do now
1. Add or update their own bank account (Profile → Bank Account).
2. View masked summary (last 4 digits, IFSC bank code) + sync status.
3. Cannot see other employees' bank details.

## Customer-side RazorpayX onboarding playbook

(Hand this to your customer org admins.)

### One-time setup
1. **Sign up for RazorpayX** at razorpay.com → enable RazorpayX.
2. **Complete KYC**: PAN, CIN, GST, current-account proof. Takes 3-10 business days.
3. **Link your current account** as the funding source (HDFC, ICICI, Federal Bank, etc.).
4. **Generate API credentials**: RazorpayX dashboard → Settings → API Keys. Note Test Mode vs Live Mode (key prefixes `rzp_test_` vs `rzp_live_`).
5. **Register the webhook**: RazorpayX dashboard → Settings → Webhooks → Add webhook → URL `https://jambahr.com/api/webhooks/razorpayx` → generate secret.
6. **Note your Account ID + Virtual Account Number** from the dashboard.
7. **Paste all 5 credentials into JambaHR** → Settings → Payroll → RazorpayX → Connect.
8. **Click Test Connection** to verify.

### Monthly funding (until eNACH is set up)
1. From your bank's net banking, do an **IMPS transfer** (or NEFT/RTGS) from your current account to your **RazorpayX virtual account number**.
2. Money lands in your RazorpayX wallet in seconds (IMPS) to minutes (NEFT).
3. Then run payroll → Pay Now via RazorpayX → maker-checker approve → done.

### Recommended: eNACH auto-debit
1. Set up RazorpayX → Funding → eNACH mandate from your current account.
2. Approves auto-pull of ₹X on day N every month.
3. Eliminates the manual funding step.

## Out of scope (Phase 3)
- F&F (full-and-final) settlement
- Loan / salary-advance lifecycle
- Cashfree fallback rail
- Automatic retry with exponential backoff (admin-initiated only)
- RazorpayX Partner / Connected Accounts model
- KMS / HSM key rotation (envelope encryption)
- Real-time wallet balance polling
- eNACH setup wizard inside JambaHR
- Two-factor approval beyond maker-checker

## Migrations (apply in order)
- 042_razorpayx_credentials.sql
- 043_employee_bank_accounts.sql
- 044_penny_drop_results.sql
- 045_disbursement_batches.sql
- 046_disbursement_items.sql
- 047_disbursement_audit_log.sql
- 048_payroll_runs_status_disbursing.sql

## Key files
- Crypto: `src/lib/crypto/aes-gcm.ts`
- RazorpayX HTTP client: `src/lib/razorpayx.ts`
- Server actions: `src/actions/razorpayx-credentials.ts`, `src/actions/employee-bank-accounts.ts`, `src/actions/disbursement.ts`, `src/actions/penny-drop.ts`
- Shared reconcile helper: `src/lib/payroll/disbursement-reconcile.ts`
- Settings UI: `src/components/settings/razorpayx-card.tsx`, `razorpayx-connect-dialog.tsx`
- Employee profile UI: `src/components/profile/bank-account-section.tsx`
- Admin bank UI: `src/components/dashboard/employee-bank-account-dialog.tsx`
- Payroll UI: `src/components/payroll/pay-now-button.tsx`, `disbursement-preflight-dialog.tsx`, `approve-disbursement-dialog.tsx`, `disbursement-tab.tsx`, `disbursement-item-row.tsx`
- Webhook: `src/app/api/webhooks/razorpayx/route.ts`
- Help articles: `src/lib/assistant/help/articles/{connect_razorpayx, add_employee_bank_account, pay_payroll_via_razorpayx, approve_disbursement, reconcile_disbursement, employee_update_bank_details}.md`
- Route registry: `src/lib/assistant/route-registry.ts` (`settings_razorpayx`, `payroll_disbursement`, `profile_bank_account`)

## Env vars required (production)
- `RAZORPAYX_CRED_ENCRYPTION_KEY` — 32-byte base64 AES key (generate fresh per env; never reuse across dev/staging/prod)

## Known TODOs for Phase 2.5
- Wire `getWalletBalance()` to RazorpayX `/banking_account_statement/balance` or equivalent — currently returns null
- Confirm `/payouts_batches` endpoint shape against latest RazorpayX docs at first live-mode test
- Consider switching webhook_events table to per-source separation (e.g. `source` column) if event ID collision ever occurs
- Implement Levenshtein / Jaro-Winkler name-match scoring for penny-drop (currently lowercased exact match)
- Auto-roll-forward of `partial_failed` batches now handled by shared `reconcileBatchAndRunStatus` (no longer a TODO)
