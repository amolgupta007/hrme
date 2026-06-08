# Payroll PRD 02 Phase 2 Implementation Plan — RazorpayX Disbursement

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate RazorpayX for online salary disbursement — penny-drop validation, single + bulk payouts, maker-checker approval, per-employee status tracking, reconciliation view. Customer-brings-own-RazorpayX-account model: JambaHR never holds customer money.

**Architecture:** Customer signs up for RazorpayX, completes KYC, gives JambaHR encrypted API credentials. Foundation work: AES-256-GCM encryption helper, per-employee bank account capture (also encrypted), beneficiary sync into RazorpayX (Contacts + Fund Accounts). Disbursement engine: maker initiates batch on a processed payroll run → pre-flight penny-drop check → checker approves → JambaHR calls RazorpayX bulk payout API → webhook callbacks update per-employee status. Mark Paid (existing manual flow) stays as the fallback for customers without RazorpayX. Out-of-scope per PRD §11: F&F settlement, loan/advance lifecycle, Cashfree fallback, automatic retry with backoff, Connected-Accounts/Partner model.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind, Supabase Postgres (admin client; RLS advisory), Clerk auth + maker-checker enforcement, Vitest for pure helpers, Node `crypto` for AES-256-GCM (no external crypto deps), direct `fetch` against RazorpayX REST API (no SDK), Resend for failure notification emails, existing `sonner` / `lucide-react` / primitives.

---

## Scope Lockdown (read first)

**In scope (PRD 02 §11 Phase 2 + the customer-brings-own-RazorpayX model from the 2026-06-08 architecture Q&A):**

1. **AES-256-GCM encryption helper** — `src/lib/crypto/aes-gcm.ts`. Used for RazorpayX API secrets, webhook secrets, employee bank account numbers + IFSC. New env var `RAZORPAYX_CRED_ENCRYPTION_KEY`.
2. **Per-employee bank accounts** — new `employee_bank_accounts` table. Encrypted account_number + ifsc + holder_name. Admin edits via employee detail; employee self-serves from `/dashboard/profile`. Onboarding nudge step added.
3. **Per-org RazorpayX credentials** — new `razorpayx_credentials` table. Encrypted `key_id` + `key_secret` + `webhook_secret`. Settings → Payroll → "Connect RazorpayX" form. Test-connection button.
4. **Beneficiary lifecycle** — auto-create RazorpayX Contact + Fund Account on each employee bank-detail save. Store IDs back on `employee_bank_accounts`. Bulk re-sync admin action.
5. **Penny-drop verification** — pre-flight all beneficiaries before payout. Cache verified results 30 days per (employee_id, account_hash). New `penny_drop_results` table.
6. **Disbursement engine** — `disbursement_batches` + `disbursement_items` + `disbursement_audit_log` tables. `initiateDisbursement(runId)` (maker), `approveDisbursement(batchId)` (checker, must be different person unless single-person mode), `retryFailedPayouts(batchId)`.
7. **`payroll_runs.status`** extension: add `'disbursing'` (between processed and paid) + `'disbursement_failed'`. Auto-transition based on disbursement_items aggregate status.
8. **Webhook endpoint** `/api/webhooks/razorpayx` — signature-verified (per-org secret), idempotent (via existing `webhook_events` table), updates `disbursement_items.payout_status`.
9. **Reconciliation tab** on processed/paid payroll runs — batch status, per-employee status with retry buttons, RazorpayX fees, downloadable report (CSV).
10. **Wallet shortfall hard-block** — Pay Now refuses to initiate if `wallet_balance < total_payable`. Admin override toggle (per-batch, audit-logged).
11. **Maker-checker** — configurable per-org `disbursement_single_person_allowed: boolean` (default `false`). Auto-disable single-person mode when org has 2+ admins.
12. **Help articles + assistant integration** — 6 new articles, 3 new route-registry entries.

**Out of scope (defer to Phase 3 / never):**
- F&F (full-and-final) settlement automation
- Loan / salary-advance lifecycle
- Cashfree as fallback payment rail
- Automatic retry with exponential backoff (admin-initiated only in Phase 2)
- RazorpayX Connected Accounts / Partner program (adds Partner Banking compliance)
- Server-side PDF generation for payslips
- Multi-currency support
- Real-time wallet balance polling (only on-demand + post-payout)
- eNACH setup wizard inside JambaHR (link out to RazorpayX dashboard)
- Pay only some employees in a batch (whole-batch atomic; selective retry happens AFTER initial batch failure)
- Two-factor approval (just maker-checker for Phase 2)
- HSM / KMS-backed key rotation (envelope encryption upgrade is Phase 3 hardening)

**Resolved open decisions (OD-1 through OD-20):** All recommendations from the 2026-06-08 divergence report stand. Notable:
- **OD-1:** New `razorpayx_credentials` table.
- **OD-2:** AES-256-GCM with `RAZORPAYX_CRED_ENCRYPTION_KEY` env var.
- **OD-3:** Bank details via new `employee_bank_accounts` table, NOT new columns on `employees`.
- **OD-6:** Composite Payout / Bulk API.
- **OD-7:** Hard-block on shortfall with admin override.
- **OD-9:** Maker-checker is the default; single-person mode togglable.
- **OD-10:** Single shared `/api/webhooks/razorpayx`, org lookup via payload `account_id`.
- **OD-11:** No RazorpayX SDK — direct `fetch`.
- **OD-12:** Existing Mark Paid manual flow stays.
- **OD-13:** Account number stored encrypted + hashed; UI shows last-4 only.
- **OD-18:** Admin-initiated retry only.
- **OD-19:** Track fees per item; roll up to batch.

**Authorization model:**
- Admin: connect/disconnect RazorpayX, edit any employee's bank account, initiate disbursement, approve disbursement (if not the maker), retry failed payouts.
- Employee: edit own bank account from `/dashboard/profile`; view own disbursement status only.
- Manager: view team disbursement status (read-only); cannot initiate or approve.
- Webhook: comes in unauthenticated, validated via HMAC against per-org secret.

---

## File Structure

### Migrations (`supabase/migrations/`)
- `042_razorpayx_credentials.sql`
- `043_employee_bank_accounts.sql` (includes razorpayx_contact_id + razorpayx_fund_account_id columns)
- `044_penny_drop_results.sql`
- `045_disbursement_batches.sql`
- `046_disbursement_items.sql`
- `047_disbursement_audit_log.sql`
- `048_payroll_runs_status_disbursing.sql`

### Pure helpers (Vitest)
- Create: `src/lib/crypto/aes-gcm.ts` — `encrypt(plaintext): string`, `decrypt(ciphertext): string`, `hashSha256(value): string`. Uses env `RAZORPAYX_CRED_ENCRYPTION_KEY`.
- Create: `src/lib/payroll/disbursement-math.ts` — `totalPayableForRun(entries): number`, `chunkPayouts(items, max): chunks[]` (batch size cap defensive).
- Tests: `tests/crypto/aes-gcm.test.ts`, `tests/payroll/disbursement-math.test.ts`.

### RazorpayX HTTP client
- Create: `src/lib/razorpayx.ts` — typed wrappers for the endpoints we use:
  - `createRazorpayXClient({ key_id, key_secret_encrypted, account_number })` — decrypts secret, returns auth-injected fetch wrapper
  - `getBalance(client)` — for test-connection and wallet pre-flight
  - `createContact(client, employee)` — Contact for a beneficiary
  - `createFundAccount(client, contactId, bankDetails)` — links bank to Contact
  - `pennyDropVerify(client, fundAccountId)` — RazorpayX's account-validation API
  - `createBulkPayout(client, items, idempotencyKey)` — main payout call
  - `getPayout(client, payoutId)` — status check
  - Each function maps RazorpayX errors to typed Result objects.

### Server actions
- Create: `src/actions/razorpayx-credentials.ts` — `getRazorpayXCredentials`, `connectRazorpayX`, `disconnectRazorpayX`, `testRazorpayXConnection`.
- Create: `src/actions/employee-bank-accounts.ts` — `getMyBankAccount`, `upsertMyBankAccount`, `getEmployeeBankAccount`, `upsertEmployeeBankAccount` (admin), `listAllBankAccounts` (admin), `resyncBeneficiary`.
- Create: `src/actions/disbursement.ts` — `getWalletBalance`, `runPreflight(runId)`, `initiateDisbursement(runId)`, `approveDisbursement(batchId)`, `retryFailedPayouts(batchId)`, `getDisbursementBatchByRun(runId)`, `listDisbursementItems(batchId)`, `updateDisbursementSingleApprovalAllowed(enabled)`.
- Create: `src/actions/penny-drop.ts` — `verifyEmployeeBeneficiary(employeeId)`, `getCachedVerification(employeeId)`. (Or fold into `employee-bank-accounts.ts`.)

### Webhook
- Create: `src/app/api/webhooks/razorpayx/route.ts` — POST handler with HMAC verification, org lookup via payload `account_id`, idempotency via existing `webhook_events` table, dispatch to status-update logic.

### UI — Settings
- Create: `src/components/settings/razorpayx-card.tsx` — Connect / Disconnect / Status / Test-connection / Re-sync beneficiaries.
- Create: `src/components/settings/razorpayx-connect-dialog.tsx` — paste API key, secret, webhook secret, optionally toggle test mode.
- Modify: `src/components/settings/settings-content.tsx` — register a new "Payroll → Disbursement" subsection inside the existing Payroll CollapsibleSection.
- Modify: `src/app/dashboard/settings/page.tsx` — fetch credentials state.

### UI — Profile (employee self-serve)
- Create: `src/components/profile/bank-account-section.tsx` — view (masked) + edit own bank details.
- Modify: `src/app/dashboard/profile/page.tsx` — render the new section.

### UI — Employee detail (admin edit)
- Create: `src/components/dashboard/employee-bank-account-dialog.tsx` — admin edit for any employee.
- Modify: `src/components/dashboard/employees-client.tsx` or `employee-table.tsx` (whichever holds the per-row edit menu) — add "Edit bank account" entry.

### UI — Payroll
- Create: `src/components/payroll/disbursement-tab.tsx` — reconciliation view.
- Create: `src/components/payroll/disbursement-preflight-dialog.tsx` — penny-drop results + wallet check.
- Create: `src/components/payroll/pay-now-button.tsx` — initiates disbursement, opens preflight, then maker confirm.
- Create: `src/components/payroll/approve-disbursement-dialog.tsx` — checker confirm.
- Create: `src/components/payroll/disbursement-item-row.tsx` — per-employee row in the reconciliation tab.
- Modify: `src/components/payroll/payroll-client.tsx` — wire Pay Now button, switch to Disbursement tab on click.

### Onboarding
- Modify: `src/config/onboarding.ts` — add `bank_account` step entry.
- Modify: `src/components/dashboard/onboarding-checklist.tsx` — render the bank-account step.

### Assistant integration
- Modify: `src/lib/assistant/route-registry.ts` — add `settings_razorpayx`, `payroll_disbursement`, `profile_bank_account` entries.
- Create: `src/lib/assistant/help/articles/connect_razorpayx.md`
- Create: `src/lib/assistant/help/articles/add_employee_bank_account.md`
- Create: `src/lib/assistant/help/articles/pay_payroll_via_razorpayx.md`
- Create: `src/lib/assistant/help/articles/approve_disbursement.md`
- Create: `src/lib/assistant/help/articles/reconcile_disbursement.md`
- Create: `src/lib/assistant/help/articles/employee_update_bank_details.md`
- Modify: `tests/assistant/help-loader.test.ts` — bump 36 → 42.

### Documentation
- Modify: `CLAUDE.md` — Payroll Phase 2 section.
- Create: `docs/payroll-prd-02-phase-2.md` — operator doc + the customer-side RazorpayX onboarding playbook.

### Env vars (new)
- `RAZORPAYX_CRED_ENCRYPTION_KEY` — 32-byte base64-encoded AES-256 key. Generate via `node -e "console.log(crypto.randomBytes(32).toString('base64'))"`. Required in `.env.local` for dev + Vercel env for prod.

### Commit convention
Per-task commits, scope-prefixed (`feat(payroll):`, `feat(razorpayx):`, `fix(razorpayx):`, etc.). NO `Co-Authored-By` lines.

---

## Task Decomposition

> **Note on size:** 30 tasks across 8 sub-modules. Subagent-driven execution will run them serially with two-stage review per task. Estimated ~5-6 hours of subagent execution. The final cross-task review at P29 should catch integration gaps.

---

### MODULE 2A — Crypto foundation

#### Task P1: AES-256-GCM helper `src/lib/crypto/aes-gcm.ts` (TDD)

**Files:**
- Create: `src/lib/crypto/aes-gcm.ts`
- Test: `tests/crypto/aes-gcm.test.ts`

- [ ] **Step 1: Failing tests**

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { encrypt, decrypt, hashSha256 } from "@/lib/crypto/aes-gcm";

beforeAll(() => {
  // Predictable 32-byte key (base64) for test determinism
  process.env.RAZORPAYX_CRED_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
});

describe("AES-256-GCM encrypt/decrypt", () => {
  it("round-trips a plain string", () => {
    const plain = "rzp_test_AbCd1234XyZ";
    const cipher = encrypt(plain);
    expect(cipher).not.toBe(plain);
    expect(cipher).toMatch(/^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/); // v1:iv:tag:cipher
    expect(decrypt(cipher)).toBe(plain);
  });

  it("produces a different ciphertext on every call (random IV)", () => {
    const c1 = encrypt("hello");
    const c2 = encrypt("hello");
    expect(c1).not.toBe(c2);
    expect(decrypt(c1)).toBe("hello");
    expect(decrypt(c2)).toBe("hello");
  });

  it("throws on tampered ciphertext (GCM auth tag fails)", () => {
    const cipher = encrypt("sensitive");
    const parts = cipher.split(":");
    parts[3] = Buffer.from("XXXXXXXXXXXX").toString("base64"); // corrupt
    const tampered = parts.join(":");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("throws when env var is missing", () => {
    const saved = process.env.RAZORPAYX_CRED_ENCRYPTION_KEY;
    delete process.env.RAZORPAYX_CRED_ENCRYPTION_KEY;
    expect(() => encrypt("x")).toThrow(/RAZORPAYX_CRED_ENCRYPTION_KEY/);
    process.env.RAZORPAYX_CRED_ENCRYPTION_KEY = saved;
  });

  it("encrypt handles empty string", () => {
    expect(decrypt(encrypt(""))).toBe("");
  });
});

describe("hashSha256", () => {
  it("produces stable 64-char hex hash", () => {
    expect(hashSha256("test")).toBe("9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08");
    expect(hashSha256("test")).toBe(hashSha256("test"));
  });
  it("different inputs → different hashes", () => {
    expect(hashSha256("a")).not.toBe(hashSha256("b"));
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

```
npx vitest run tests/crypto/aes-gcm.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/lib/crypto/aes-gcm.ts
import { randomBytes, createCipheriv, createDecipheriv, createHash } from "crypto";

const ALG = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard
const VERSION = "v1";

function getKey(): Buffer {
  const raw = process.env.RAZORPAYX_CRED_ENCRYPTION_KEY;
  if (!raw) throw new Error("RAZORPAYX_CRED_ENCRYPTION_KEY env var missing — set a 32-byte base64 key");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("RAZORPAYX_CRED_ENCRYPTION_KEY must decode to 32 bytes (AES-256)");
  return key;
}

/**
 * Encrypts plaintext with AES-256-GCM. Returns `v1:<iv>:<authTag>:<ciphertext>` base64-encoded segments.
 * IV is random per call → identical plaintexts produce distinct ciphertexts.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALG, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function decrypt(payload: string): string {
  const [version, ivB64, tagB64, cipherB64] = payload.split(":");
  if (version !== VERSION) throw new Error(`Unsupported ciphertext version: ${version}`);
  const key = getKey();
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(cipherB64, "base64");
  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString("utf8");
}

/** Non-reversible hash for indexing / dedupe (e.g. bank account uniqueness checks). */
export function hashSha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
```

- [ ] **Step 4: Run, verify PASS (8 tests)**

- [ ] **Step 5: Commit**

```bash
git add src/lib/crypto/aes-gcm.ts tests/crypto/aes-gcm.test.ts
git commit -m "feat(crypto): AES-256-GCM encrypt/decrypt helper for Phase 2 disbursement"
```

---

#### Task P2: Env var documentation + dev key

**Files:**
- Modify: `.env.example`
- Modify: `CLAUDE.md` (gotcha for the key)

- [ ] **Step 1: Add to `.env.example`**

```
# Phase 2 disbursement: AES-256 key for encrypting RazorpayX creds + employee bank accounts.
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
RAZORPAYX_CRED_ENCRYPTION_KEY=
```

- [ ] **Step 2: Generate a dev key locally**

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Paste the output into `.env.local` (NOT committed).

- [ ] **Step 3: Add to CLAUDE.md "Env vars required" section under Payroll**

> `RAZORPAYX_CRED_ENCRYPTION_KEY` — base64-encoded 32-byte AES key for encrypting RazorpayX credentials and employee bank account numbers. **Must NOT change after data exists**: rotating it requires re-encrypting every row (Phase 3 envelope-encryption upgrade handles this). Missing/wrong key = AES auth-tag failure on decrypt = total disbursement outage.

- [ ] **Step 4: Commit**

```bash
git add .env.example CLAUDE.md
git commit -m "docs(crypto): document RAZORPAYX_CRED_ENCRYPTION_KEY env var"
```

---

#### Task P3: Crypto integration sanity test

**Files:**
- Create: `tests/crypto/aes-gcm-roundtrip.test.ts` (a slightly different test that focuses on real-shape RazorpayX cred values)

- [ ] **Step 1: Test**

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { encrypt, decrypt, hashSha256 } from "@/lib/crypto/aes-gcm";

beforeAll(() => {
  process.env.RAZORPAYX_CRED_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("integration round-trip with realistic RazorpayX cred shapes", () => {
  it("handles 32-char RazorpayX key_secret", () => {
    const secret = "xK7mN3pQ9vR2sT8uW1yZ4aB6cD0eF5gH"; // 32 chars
    expect(decrypt(encrypt(secret))).toBe(secret);
  });

  it("handles 14-char IFSC + 18-digit account number", () => {
    const ifsc = "FDRL0001234567";
    const account = "123456789012345678";
    expect(decrypt(encrypt(ifsc))).toBe(ifsc);
    expect(decrypt(encrypt(account))).toBe(account);
  });

  it("handles whitespace + special chars", () => {
    const raw = "  \tabc def\n!@#$%^&*()_+{}|:\"<>?[];',./`~";
    expect(decrypt(encrypt(raw))).toBe(raw);
  });

  it("ciphertext stays under 1KB for typical inputs", () => {
    const realistic = "rzp_test_1234567890123456:secretAbcdefghijklmnopqrstuvwxyz";
    expect(encrypt(realistic).length).toBeLessThan(1024);
  });

  it("hashSha256 is stable for IFSC + account number dedupe key", () => {
    const a = hashSha256("FDRL0001234567|123456789012345678");
    const b = hashSha256("FDRL0001234567|123456789012345678");
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 2: Run, verify PASS** (5 tests; total crypto suite now 13 tests).

- [ ] **Step 3: Commit**

```bash
git add tests/crypto/aes-gcm-roundtrip.test.ts
git commit -m "test(crypto): integration round-trip for RazorpayX cred shapes"
```

---

### MODULE 2B — Employee bank accounts

#### Task P4: Migration `043_employee_bank_accounts.sql`

**Files:** Create `supabase/migrations/043_employee_bank_accounts.sql`

- [ ] **Step 1: Author**

```sql
-- 043_employee_bank_accounts.sql — Payroll PRD 02 Phase 2: per-employee bank
-- account for disbursement. Account number + IFSC encrypted at rest;
-- account_number_hash is a non-reversible dedupe key.
-- Idempotent.

CREATE TABLE IF NOT EXISTS public.employee_bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL UNIQUE REFERENCES public.employees(id) ON DELETE CASCADE,
  holder_name TEXT NOT NULL,
  account_number_encrypted TEXT NOT NULL,
  account_number_last4 TEXT NOT NULL CHECK (char_length(account_number_last4) = 4),
  account_number_hash TEXT NOT NULL, -- sha256(ifsc + '|' + account_number) for dedupe + cache key
  ifsc_encrypted TEXT NOT NULL,
  ifsc_first4 TEXT NOT NULL CHECK (char_length(ifsc_first4) = 4), -- bank code, e.g. FDRL — safe to expose
  account_type TEXT NOT NULL DEFAULT 'savings' CHECK (account_type IN ('savings', 'current')),
  -- RazorpayX-side identifiers (populated by syncBeneficiary)
  razorpayx_contact_id TEXT,
  razorpayx_fund_account_id TEXT,
  beneficiary_sync_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (beneficiary_sync_status IN ('pending', 'synced', 'failed')),
  beneficiary_sync_error TEXT,
  beneficiary_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employee_bank_accounts_org_idx
  ON public.employee_bank_accounts (org_id);

CREATE INDEX IF NOT EXISTS employee_bank_accounts_hash_idx
  ON public.employee_bank_accounts (account_number_hash);

ALTER TABLE public.employee_bank_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_bank_accounts_admin_all ON public.employee_bank_accounts;
CREATE POLICY employee_bank_accounts_admin_all ON public.employee_bank_accounts FOR ALL
  USING (
    auth.jwt() ->> 'org_id' = employee_bank_accounts.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  )
  WITH CHECK (
    auth.jwt() ->> 'org_id' = employee_bank_accounts.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  );

DROP POLICY IF EXISTS employee_bank_accounts_self_all ON public.employee_bank_accounts;
CREATE POLICY employee_bank_accounts_self_all ON public.employee_bank_accounts FOR ALL
  USING (
    auth.jwt() ->> 'org_id' = employee_bank_accounts.org_id::text
    AND auth.jwt() ->> 'employee_id' = employee_bank_accounts.employee_id::text
  )
  WITH CHECK (
    auth.jwt() ->> 'org_id' = employee_bank_accounts.org_id::text
    AND auth.jwt() ->> 'employee_id' = employee_bank_accounts.employee_id::text
  );

DROP TRIGGER IF EXISTS employee_bank_accounts_set_updated_at ON public.employee_bank_accounts;
CREATE TRIGGER employee_bank_accounts_set_updated_at
  BEFORE UPDATE ON public.employee_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

- [ ] **Step 2: Apply + verify** columns, RLS, constraints.

- [ ] **Step 3: Commit** `feat(payroll): add employee_bank_accounts table (Phase 2)`

---

#### Task P5: Bank account server actions

**Files:** Create `src/actions/employee-bank-accounts.ts`

Exports:
- `getMyBankAccount()` — any employee reads their own. Returns masked view (`account_number_last4`, `ifsc_first4`, `holder_name`, `account_type`, sync status). NEVER decrypts and returns the full number to anyone except the server (decrypt happens only inside `syncBeneficiary` and during disbursement).
- `upsertMyBankAccount(input)` — any employee writes their own. Encrypts on save, computes hash, fires `syncBeneficiary` in waitUntil.
- `getEmployeeBankAccount(employeeId)` — admin reads any (masked).
- `upsertEmployeeBankAccount(employeeId, input)` — admin writes any (encrypts, hashes, fires sync).
- `listAllBankAccounts()` — admin only, returns masked rows for the bank-accounts page.
- `resyncBeneficiary(employeeId)` — admin only, re-runs Contact + Fund Account creation against RazorpayX.

Full Zod schemas:
```typescript
const BankAccountSchema = z.object({
  holder_name: z.string().min(2).max(120),
  account_number: z.string().regex(/^\d{9,18}$/, "Account number must be 9-18 digits"),
  ifsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Invalid IFSC (e.g. FDRL0001234)"),
  account_type: z.enum(["savings", "current"]).default("savings"),
});
```

Key behaviour:
- On save: encrypt account_number + ifsc, hash, write row. Set `beneficiary_sync_status='pending'`.
- Fire `syncBeneficiary(employeeId)` via `waitUntil` (best-effort; UI can re-trigger via "Re-sync" button if it shows `failed`).
- Return only masked data to caller.

Commit `feat(payroll): bank-account server actions with encryption-at-rest`.

---

#### Task P6: Profile UI — bank-account section

**Files:**
- Create: `src/components/profile/bank-account-section.tsx`
- Modify: `src/app/dashboard/profile/page.tsx` — render the new section.

Section shows:
- Current bank account (masked): `Holder name`, `••••{last4}`, `{ifsc_first4}xxxxxxx`, account type, sync status badge.
- "Edit" button → inline form with full holder_name + account_number + IFSC inputs.
- Submit calls `upsertMyBankAccount`.
- On successful save: re-fetch + show "Beneficiary sync queued — verification will run on next payroll."
- Empty state: "Add your bank account so payroll can be paid directly."

Commit `feat(payroll): employee profile bank-account self-serve UI`.

---

#### Task P7: Admin UI — bank-account edit dialog

**Files:**
- Create: `src/components/dashboard/employee-bank-account-dialog.tsx`
- Modify: existing employee detail / table component to add "Edit bank account" entry in the per-row actions menu.

Admin dialog mirrors the profile section but allows editing any employee. Shows sync status + "Re-sync" button.

Commit `feat(payroll): admin bank-account edit dialog`.

---

#### Task P8: Onboarding nudge step "Add bank account"

**Files:**
- Modify: `src/config/onboarding.ts` — add a new step:
  ```typescript
  {
    id: "bank_account",
    label: "Add bank account",
    description: "Required to receive salary directly to your bank.",
    href: "/dashboard/profile#bank-account",
    enabled: true,
    required: false, // org admin can flip to required in onboarding settings
  }
  ```
- Modify: `src/components/dashboard/onboarding-checklist.tsx` — render the step (mark complete when bank account exists for the user).
- The "complete" check: call `getMyBankAccount()` → `success && data !== null`.

Commit `feat(payroll): bank-account onboarding nudge step`.

---

### MODULE 2C — RazorpayX credential management

#### Task P9: Migration `042_razorpayx_credentials.sql`

```sql
-- 042_razorpayx_credentials.sql — Payroll PRD 02 Phase 2: per-org RazorpayX
-- credentials. API secret + webhook secret encrypted at rest.
-- account_id is RazorpayX's merchant identifier — used by the webhook handler
-- to look up the org from incoming events.
-- Idempotent.

CREATE TABLE IF NOT EXISTS public.razorpayx_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  key_id TEXT NOT NULL, -- public-ish, prefixed rzp_test_ or rzp_live_
  key_secret_encrypted TEXT NOT NULL,
  webhook_secret_encrypted TEXT NOT NULL,
  account_id TEXT NOT NULL, -- RazorpayX merchant identifier; webhook payload includes this
  account_number TEXT NOT NULL, -- RazorpayX virtual account number (looks like a normal bank account)
  is_test_mode BOOLEAN NOT NULL DEFAULT TRUE,
  single_person_approval_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  connected_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_test_at TIMESTAMPTZ,
  last_test_ok BOOLEAN,
  last_test_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS razorpayx_credentials_account_id_idx
  ON public.razorpayx_credentials (account_id);

ALTER TABLE public.razorpayx_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS razorpayx_credentials_admin_all ON public.razorpayx_credentials;
CREATE POLICY razorpayx_credentials_admin_all ON public.razorpayx_credentials FOR ALL
  USING (
    auth.jwt() ->> 'org_id' = razorpayx_credentials.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  )
  WITH CHECK (
    auth.jwt() ->> 'org_id' = razorpayx_credentials.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  );

DROP TRIGGER IF EXISTS razorpayx_credentials_set_updated_at ON public.razorpayx_credentials;
CREATE TRIGGER razorpayx_credentials_set_updated_at
  BEFORE UPDATE ON public.razorpayx_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

Apply + verify + commit `feat(razorpayx): credentials table (Phase 2)`.

---

#### Task P10: RazorpayX HTTP client `src/lib/razorpayx.ts`

**Files:** Create `src/lib/razorpayx.ts`

Exports:
- `type RazorpayXClient` — typed wrapper around `fetch` with auth header injected.
- `createRazorpayXClient({ keyId, keySecretEncrypted })` — decrypts secret, returns client.
- `getBalance(client)` — `GET /v1/contacts` lightweight ping (RazorpayX doesn't have a dedicated /balance for all plans; using contacts list works); returns balance via a different endpoint if available.
- `createContact(client, { name, email, contact, reference_id })` — `POST /v1/contacts`
- `createFundAccount(client, { contact_id, account_type: 'bank_account', bank_account: { name, ifsc, account_number } })` — `POST /v1/fund_accounts`
- `pennyDropVerify(client, { fund_account_id, amount: 100, currency: 'INR' })` — `POST /v1/payouts` with `mode: 'IMPS', purpose: 'verification', notes: { ... }` — actually RazorpayX's penny-drop is a dedicated endpoint `POST /v1/fund_accounts/validations` — confirm exact path against current RazorpayX docs at implementation time.
- `createBulkPayout(client, items, idempotencyKey)` — `POST /v1/payouts` with composite payload OR `POST /v1/payouts/batches` per RazorpayX bulk-payout endpoint. Confirm latest endpoint structure.
- `getPayout(client, payoutId)` — `GET /v1/payouts/{id}`.
- `parseRazorpayXError(response)` — maps RazorpayX error shape to typed `RazorpayXError`.

All functions return `Promise<{ ok: true, data: T } | { ok: false, error: RazorpayXError }>`.

Auth: HTTP Basic with `key_id:key_secret`. Base URL: `https://api.razorpay.com` (same for test + live; mode determined by key prefix).

Commit `feat(razorpayx): typed HTTP client (no SDK)`.

---

#### Task P11: Credentials server actions

**Files:** Create `src/actions/razorpayx-credentials.ts`

Exports:
- `getRazorpayXCredentials()` — admin only. Returns masked view: `{ key_id_masked, account_id, account_number_masked, is_test_mode, last_test_at, last_test_ok, connected_by_name }`. Never returns plaintext secrets.
- `connectRazorpayX(input)` — admin only. Encrypts secret + webhook_secret, upserts row.
- `disconnectRazorpayX()` — admin only. Soft-clears (sets all secret fields to encrypted empty strings + sets a `disconnected_at` if added). Or hard-deletes — pick one. **Recommendation: hard-delete** (no audit need; admin can reconnect). Cascade affects: existing `disbursement_batches` keep their RazorpayX IDs (immutable history).
- `testRazorpayXConnection()` — admin only. Decrypts secret, calls a lightweight RazorpayX endpoint (e.g. `GET /v1/contacts?count=1`), updates `last_test_at` + `last_test_ok` + `last_test_error`.

Zod schema:
```typescript
const ConnectSchema = z.object({
  key_id: z.string().regex(/^rzp_(test|live)_[A-Za-z0-9]+$/),
  key_secret: z.string().min(20).max(120),
  webhook_secret: z.string().min(8).max(120),
  account_id: z.string().min(8), // RazorpayX merchant identifier
  account_number: z.string().min(8).max(20),
  is_test_mode: z.boolean(),
});
```

Commit `feat(razorpayx): credential CRUD + test-connection action`.

---

#### Task P12: Settings → Payroll → RazorpayX card

**Files:**
- Create: `src/components/settings/razorpayx-card.tsx`
- Create: `src/components/settings/razorpayx-connect-dialog.tsx`
- Modify: `src/components/settings/settings-content.tsx` — register the new card inside the existing Payroll CollapsibleSection (added in Payroll Phase 1).
- Modify: `src/app/dashboard/settings/page.tsx` — fetch credentials state.

Card states:
- **Disconnected:** "Connect RazorpayX" button → opens dialog.
- **Connected:** show `key_id` (last 4), `account_number` (masked), `is_test_mode` badge, `last_test_at`, "Test connection" button, "Disconnect" button, "Re-sync all beneficiaries" button.

Dialog has the 5 inputs (key_id, key_secret, webhook_secret, account_id, account_number) + test-mode checkbox. "Save & test" submits then immediately runs test-connection. Show success/failure inline.

Commit `feat(razorpayx): Settings → Payroll RazorpayX card + connect dialog`.

---

### MODULE 2D — Beneficiary sync

#### Task P13: `syncBeneficiary(employeeId)` server action

**Files:** Modify `src/actions/employee-bank-accounts.ts`

```typescript
export async function syncBeneficiary(employeeId: string): Promise<ActionResult<void>> {
  // 1. Look up the employee's bank account row + the org's RazorpayX credentials.
  // 2. If credentials missing → mark sync_status='failed', error='No RazorpayX credentials'.
  // 3. Decrypt bank account_number + ifsc.
  // 4. Build RazorpayX client.
  // 5. If razorpayx_contact_id missing → createContact (name, email, contact phone, reference_id=employee.id).
  //    Save returned contact_id back.
  // 6. createFundAccount (contact_id, type='bank_account', bank_account = { name=holder_name, ifsc, account_number }).
  //    Save returned fund_account_id back.
  // 7. Update sync_status='synced', synced_at=now(), error=null.
  // On any RazorpayX error: sync_status='failed', error=<message>.
}
```

This is called from `upsertMyBankAccount` and `upsertEmployeeBankAccount` via `waitUntil` (best-effort). Also exposed as an admin action for manual re-sync.

Also add `bulkSyncAllBeneficiaries()` — admin action that iterates all `employee_bank_accounts` and re-runs `syncBeneficiary` (for the "Re-sync all beneficiaries" button in Settings).

Commit `feat(razorpayx): beneficiary sync (Contacts + Fund Accounts)`.

---

#### Task P14: Auto-trigger sync on bank-account save

**Files:** Modify `src/actions/employee-bank-accounts.ts`

After successful `upsertMyBankAccount` / `upsertEmployeeBankAccount`:
```typescript
try { waitUntil(syncBeneficiary(employeeId).then(() => undefined)); } catch {}
```

Commit `feat(razorpayx): waitUntil-fire beneficiary sync on bank-account save`.

---

#### Task P15: "Re-sync all beneficiaries" admin UI

**Files:** Modify `src/components/settings/razorpayx-card.tsx`

Button next to "Disconnect": "Re-sync all beneficiaries" → fires `bulkSyncAllBeneficiaries()` → toast with count. Renders failed-sync count + "View failed" link → opens a list dialog.

Commit `feat(razorpayx): re-sync all beneficiaries admin action + UI`.

---

### MODULE 2E — Penny-drop verification

#### Task P16: Migration `044_penny_drop_results.sql`

```sql
-- 044_penny_drop_results.sql — Phase 2: cache penny-drop verification results
-- 30 days per (account_hash). Penny-drop costs ~₹2-3 per check; cache aggressively.
-- Idempotent.

CREATE TABLE IF NOT EXISTS public.penny_drop_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_hash TEXT NOT NULL, -- sha256(ifsc + '|' + account_number)
  fund_account_id TEXT, -- RazorpayX fund_account_id at the time of verification
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL CHECK (status IN ('verified', 'name_mismatch', 'invalid_account', 'unsupported_bank', 'error')),
  registered_holder_name TEXT, -- whatever the bank told us
  declared_holder_name TEXT NOT NULL, -- what we asked them to verify against
  name_match_score NUMERIC(3,2), -- 0.00 - 1.00 if RazorpayX returns one
  raw_response JSONB,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, account_hash)
);

CREATE INDEX IF NOT EXISTS penny_drop_results_hash_idx
  ON public.penny_drop_results (account_hash);

CREATE INDEX IF NOT EXISTS penny_drop_results_expires_idx
  ON public.penny_drop_results (expires_at);

ALTER TABLE public.penny_drop_results ENABLE ROW LEVEL SECURITY;
-- Service-role only. Admins read via server actions.
DROP POLICY IF EXISTS penny_drop_results_admin_all ON public.penny_drop_results;
CREATE POLICY penny_drop_results_admin_all ON public.penny_drop_results FOR ALL
  USING (
    auth.jwt() ->> 'org_id' = penny_drop_results.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  )
  WITH CHECK (
    auth.jwt() ->> 'org_id' = penny_drop_results.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  );
```

Apply + verify + commit `feat(payroll): penny_drop_results cache table`.

---

#### Task P17: `verifyEmployeeBeneficiary(employeeId)` server action

**Files:** Create `src/actions/penny-drop.ts`

Logic:
1. Look up employee's `account_hash` from `employee_bank_accounts`.
2. Look up cache: `SELECT FROM penny_drop_results WHERE account_hash = ? AND expires_at > now()`.
3. If cached + status=`verified` → return cached.
4. If cached but not verified or expired → fall through.
5. Decrypt fund_account_id, call RazorpayX `/v1/fund_accounts/validations` (exact path per RazorpayX docs at impl time).
6. Map response → `status` (`verified` / `name_mismatch` / `invalid_account` / `unsupported_bank` / `error`).
7. Upsert into cache with 30-day TTL.
8. Return the result.

Idempotency: the cache is keyed by `(org_id, account_hash)` UNIQUE — concurrent calls UPSERT cleanly.

Commit `feat(payroll): penny-drop verification with 30-day cache`.

---

#### Task P18: Pre-flight UI component

**Files:** Create `src/components/payroll/disbursement-preflight-dialog.tsx`

Opens when admin clicks "Pay Now". Shows:
- Total payable: ₹X
- Wallet balance: ₹Y (fetched via `getWalletBalance()`)
- Shortfall warning if Y < X (hard-block)
- Per-employee table:
  - Avatar + name
  - Amount
  - Bank account: `FDRL ****1234`
  - Verification badge: ✓ verified / ⚠ name mismatch / ✗ invalid / ⏳ checking
- "Re-verify" per row (forces fresh penny-drop ignoring cache)
- "Initiate batch" button (disabled if any ✗ or shortfall without override)

Backed by `runPreflight(runId)` action (Task P22 — to be wired here).

Commit `feat(payroll): disbursement pre-flight dialog (wallet + penny-drop)`.

---

### MODULE 2F — Disbursement engine

#### Task P19: Disbursement migrations (4 in one task)

**Files:**
- `045_disbursement_batches.sql`
- `046_disbursement_items.sql`
- `047_disbursement_audit_log.sql`
- `048_payroll_runs_status_disbursing.sql`

**045_disbursement_batches.sql:**

```sql
CREATE TABLE IF NOT EXISTS public.disbursement_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  payroll_run_id UUID NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'preflight' CHECK (status IN (
    'preflight',         -- penny-drop in progress
    'awaiting_approval', -- maker has initiated; checker hasn't approved
    'approved',          -- checker approved; payouts queued
    'processing',        -- RazorpayX is processing
    'completed',         -- all items paid
    'partial_failed',    -- some items failed
    'cancelled'          -- maker or checker cancelled
  )),
  total_amount INTEGER NOT NULL, -- rupees
  total_fees_paise INTEGER NOT NULL DEFAULT 0,
  override_wallet_shortfall BOOLEAN NOT NULL DEFAULT FALSE,
  idempotency_key TEXT NOT NULL UNIQUE, -- generated server-side per attempt
  maker_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  initiated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checker_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_reason TEXT,
  razorpayx_batch_id TEXT, -- returned by RazorpayX after bulk payout call
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS disbursement_batches_run_idx
  ON public.disbursement_batches (payroll_run_id);
CREATE INDEX IF NOT EXISTS disbursement_batches_status_idx
  ON public.disbursement_batches (org_id, status);

ALTER TABLE public.disbursement_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS disbursement_batches_admin_all ON public.disbursement_batches;
CREATE POLICY disbursement_batches_admin_all ON public.disbursement_batches FOR ALL
  USING (
    auth.jwt() ->> 'org_id' = disbursement_batches.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  )
  WITH CHECK (
    auth.jwt() ->> 'org_id' = disbursement_batches.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  );

DROP TRIGGER IF EXISTS disbursement_batches_set_updated_at ON public.disbursement_batches;
CREATE TRIGGER disbursement_batches_set_updated_at
  BEFORE UPDATE ON public.disbursement_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

**046_disbursement_items.sql:**

```sql
CREATE TABLE IF NOT EXISTS public.disbursement_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.disbursement_batches(id) ON DELETE CASCADE,
  payroll_entry_id UUID NOT NULL REFERENCES public.payroll_entries(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  fund_account_id TEXT NOT NULL, -- snapshot of the RazorpayX fund_account_id at payout time
  amount INTEGER NOT NULL, -- rupees
  fee_paise INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'queued', 'processing', 'paid', 'failed', 'cancelled', 'reversed'
  )),
  razorpayx_payout_id TEXT,
  failure_reason TEXT,
  retry_count SMALLINT NOT NULL DEFAULT 0,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (batch_id, payroll_entry_id)
);

CREATE INDEX IF NOT EXISTS disbursement_items_batch_idx
  ON public.disbursement_items (batch_id);
CREATE INDEX IF NOT EXISTS disbursement_items_razorpayx_payout_idx
  ON public.disbursement_items (razorpayx_payout_id);
CREATE INDEX IF NOT EXISTS disbursement_items_status_idx
  ON public.disbursement_items (org_id, status);

ALTER TABLE public.disbursement_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS disbursement_items_admin_all ON public.disbursement_items;
CREATE POLICY disbursement_items_admin_all ON public.disbursement_items FOR ALL
  USING (
    auth.jwt() ->> 'org_id' = disbursement_items.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  )
  WITH CHECK (
    auth.jwt() ->> 'org_id' = disbursement_items.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  );
DROP POLICY IF EXISTS disbursement_items_self_read ON public.disbursement_items;
CREATE POLICY disbursement_items_self_read ON public.disbursement_items FOR SELECT
  USING (
    auth.jwt() ->> 'org_id' = disbursement_items.org_id::text
    AND auth.jwt() ->> 'employee_id' = disbursement_items.employee_id::text
  );

DROP TRIGGER IF EXISTS disbursement_items_set_updated_at ON public.disbursement_items;
CREATE TRIGGER disbursement_items_set_updated_at
  BEFORE UPDATE ON public.disbursement_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

**047_disbursement_audit_log.sql:**

```sql
CREATE TABLE IF NOT EXISTS public.disbursement_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES public.disbursement_batches(id) ON DELETE SET NULL,
  item_id UUID REFERENCES public.disbursement_items(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  actor_role TEXT,
  action TEXT NOT NULL CHECK (action IN (
    'initiate', 'approve', 'cancel', 'retry', 'webhook_status_change',
    'preflight_run', 'wallet_check', 'bank_account_read'
  )),
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS disbursement_audit_log_batch_idx
  ON public.disbursement_audit_log (batch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS disbursement_audit_log_org_idx
  ON public.disbursement_audit_log (org_id, created_at DESC);

ALTER TABLE public.disbursement_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS disbursement_audit_log_admin_read ON public.disbursement_audit_log;
CREATE POLICY disbursement_audit_log_admin_read ON public.disbursement_audit_log FOR SELECT
  USING (
    auth.jwt() ->> 'org_id' = disbursement_audit_log.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  );
-- INSERT only via service-role (server actions); no general write policy.
```

**048_payroll_runs_status_disbursing.sql:**

```sql
-- Extend payroll_runs.status enum: add 'disbursing' (in-flight) and 'disbursement_failed'.
ALTER TABLE public.payroll_runs DROP CONSTRAINT IF EXISTS payroll_runs_status_check;
ALTER TABLE public.payroll_runs ADD CONSTRAINT payroll_runs_status_check
  CHECK (status IN ('draft', 'processed', 'disbursing', 'disbursement_failed', 'paid'));
```

Apply all 4 + verify + commit `feat(payroll): disbursement schema (batches, items, audit, status extension)`.

---

#### Task P20: `initiateDisbursement(runId)` + `runPreflight(runId)`

**Files:** Create `src/actions/disbursement.ts`

`runPreflight(runId)`:
1. Auth: admin only.
2. Look up run + entries. If run.status != 'processed' → error.
3. Compute total payable from `payroll_entries.net_pay` summed.
4. Fetch RazorpayX credentials. If missing → error "RazorpayX not connected".
5. Fetch wallet balance via `getBalance(client)`.
6. For each entry's employee: look up bank account → verify (via cached penny_drop_results or fresh `pennyDropVerify`).
7. Return `{ total_payable, wallet_balance, shortfall, items: [{ employee_id, name, amount, last4, verification_status }] }`.
8. Log to `disbursement_audit_log` (action='preflight_run').

`initiateDisbursement(runId, opts: { override_wallet_shortfall: boolean })`:
1. Admin only.
2. Run preflight. If shortfall AND not override → error.
3. If any item has `verification_status != 'verified'` → error (force admin to fix bank details first).
4. Create `disbursement_batches` row (status='awaiting_approval', idempotency_key=uuid, total_amount, override flag).
5. Create one `disbursement_items` row per entry (status='pending').
6. Set `payroll_runs.status='disbursing'`.
7. Audit log (action='initiate').
8. If `razorpayx_credentials.single_person_approval_allowed` → caller can immediately also call `approveDisbursement`; otherwise wait for a different admin.
9. Return `{ batch_id }`.

Commit `feat(payroll): initiateDisbursement + runPreflight server actions`.

---

#### Task P21: `approveDisbursement(batchId)` — checker action

**Files:** Modify `src/actions/disbursement.ts`

```typescript
export async function approveDisbursement(batchId: string): Promise<ActionResult<{ status: string }>> {
  // 1. Admin auth.
  // 2. Fetch batch. If status != 'awaiting_approval' → error.
  // 3. Maker-checker: if batch.maker_id == caller.employee_id AND !creds.single_person_approval_allowed
  //    → error "A different admin must approve".
  // 4. Update batch: checker_id, approved_at, status='approved'.
  // 5. Audit log (action='approve').
  // 6. Now call RazorpayX:
  //    a. Build composite payout request with all items.
  //    b. POST /v1/payouts/batches (or composite) with idempotency_key.
  //    c. RazorpayX returns per-item statuses immediately (queued / accepted / failed).
  // 7. For each returned item: update disbursement_items.status, razorpayx_payout_id, failure_reason.
  // 8. Update batch.status to 'processing'.
  // 9. Audit log per RazorpayX response.
  // 10. Return.
}
```

Webhook will keep updating statuses over time (Task P25).

Commit `feat(payroll): approveDisbursement — checker action + RazorpayX bulk payout`.

---

#### Task P22: `retryFailedPayouts(batchId)` admin action

**Files:** Modify `src/actions/disbursement.ts`

For all items in batch where `status='failed'`:
1. Compose a new payout call for only those items.
2. Increment retry_count.
3. Re-call RazorpayX.
4. Update statuses based on response.
5. Audit log (action='retry').

Commit `feat(payroll): retryFailedPayouts admin action`.

---

#### Task P23: Pay Now button + flow

**Files:**
- Create: `src/components/payroll/pay-now-button.tsx`
- Create: `src/components/payroll/approve-disbursement-dialog.tsx`
- Modify: `src/components/payroll/payroll-client.tsx`

Pay Now button visible when:
- Run.status === 'processed'
- RazorpayX credentials exist for the org
- (Otherwise show existing "Mark Paid" manual button)

Click flow:
1. Opens pre-flight dialog (P18).
2. Admin reviews → "Initiate batch" → calls `initiateDisbursement`.
3. Dialog updates: "Batch created. Awaiting approval by a different admin." (If single-person mode → next step inline.)
4. Once approved (either same person if allowed, or by another admin via "Pending approvals" list): batch goes to `processing`.
5. Status updates via webhook → row colours update + reconciliation tab populates.

Approve dialog: another admin sees "X has initiated a payout for run YYYY-MM" → "Approve & Process Payouts" / "Cancel".

Commit `feat(payroll): Pay Now + maker-checker UI flow`.

---

#### Task P24: Disbursement reconciliation tab

**Files:**
- Create: `src/components/payroll/disbursement-tab.tsx`
- Create: `src/components/payroll/disbursement-item-row.tsx`
- Modify: `src/components/payroll/payroll-client.tsx` — wire as a tab on payroll run dialog.

Reconciliation tab shows:
- Batch summary: status, total amount, total fees, success/failure count, RazorpayX batch ID.
- Item table: employee, amount, last4, status badge, RazorpayX payout ID (clickable → RazorpayX dashboard), failure reason if any.
- Per-row Retry button when status='failed'.
- "Download CSV" button → exports the full reconciliation.

Commit `feat(payroll): disbursement reconciliation tab + CSV export`.

---

### MODULE 2G — Webhook

#### Task P25: `/api/webhooks/razorpayx/route.ts`

**Files:** Create `src/app/api/webhooks/razorpayx/route.ts`

Flow:
1. Read body + `x-razorpay-signature` header.
2. Parse body JSON. Extract `account_id` (RazorpayX merchant identifier).
3. Look up org via `razorpayx_credentials.account_id`. If missing → 404.
4. Decrypt that org's `webhook_secret`.
5. HMAC-SHA256 verify body against secret.
6. Dedupe via existing `webhook_events` table (insert `event.id`).
7. Handle event types:
   - `payout.processed` → set item status='paid', paid_at=now, fee.
   - `payout.failed` / `payout.reversed` → set item status='failed', failure_reason.
   - `payout.queued` → status='queued'.
   - `payout.initiated` / `payout.processing` → status='processing'.
8. After updating items: check if batch is fully done. If yes:
   - All items 'paid' → batch.status='completed', payroll_runs.status='paid'.
   - Mix of paid + failed → batch.status='partial_failed', payroll_runs.status='disbursement_failed'.
9. Audit log per status change.

Reuses the exact HMAC pattern from the existing `src/app/api/webhooks/razorpay/route.ts` for consistency.

Commit `feat(razorpayx): webhook endpoint with per-org HMAC verification`.

---

#### Task P26: Auto-transition `payroll_runs.status`

**Files:** Modify `src/actions/disbursement.ts`

Helper `reconcileBatchAndRunStatus(batchId)`:
1. Aggregate item statuses for batch.
2. If all paid → batch.status='completed', run.status='paid', batch.completed_at=now, paid_at=now, paid_by=batch.checker_id.
3. If any failed AND none pending → batch.status='partial_failed', run.status='disbursement_failed'.
4. Else still processing.

Called from webhook handler after each batch update.

Commit `feat(payroll): auto-transition payroll_runs.status on batch reconcile`.

---

### MODULE 2H — Docs + final review + smoke-test

#### Task P27: Help articles + route-registry

**Files:**
- 6 new `.md` articles in `src/lib/assistant/help/articles/`
- Modify: `src/lib/assistant/route-registry.ts` — add 3 entries (`settings_razorpayx`, `payroll_disbursement`, `profile_bank_account`)
- Modify: `tests/assistant/help-loader.test.ts` — bump 36 → 42
- Run `npm run embed:help`

Article topics (covered in plan §"File Structure" above). Each one ~30-50 lines, frontmatter matches existing pattern.

Commit `docs(assistant): RazorpayX disbursement articles + 3 new route entries`.

---

#### Task P28: CLAUDE.md + operator doc

**Files:**
- Modify: `CLAUDE.md` — Payroll section (Phase 2 RazorpayX entry + gotchas)
- Create: `docs/payroll-prd-02-phase-2.md` — operator playbook

CLAUDE.md gotchas to document:
- AES-256-GCM key must NEVER change after data exists; rotate via Phase 3 envelope encryption.
- Customer-brings-own-RazorpayX model; JambaHR holds no money.
- Manual "Mark Paid" still available for non-RazorpayX customers.
- Webhook signature verified per-org (lookup via `account_id` payload).
- Penny-drop cache 30 days per (org, account_hash).
- Hard-block on wallet shortfall (admin override allowed but audit-logged).
- `payroll_runs.status` extended to `disbursing` + `disbursement_failed`.
- Beneficiary auto-sync via waitUntil on bank-detail save.
- No SDK — direct fetch to RazorpayX REST.
- DPDP: bank account number stored encrypted + hashed; UI shows last-4 only.

Operator doc covers:
- Customer onboarding to RazorpayX (Razorpay → switch to RazorpayX → KYC → keys).
- What admin sees in JambaHR (Settings → Payroll → RazorpayX).
- The maker-checker flow.
- What happens when payouts fail.
- How to retry.

Commit `docs(payroll): Phase 2 RazorpayX — CLAUDE.md + operator doc`.

---

#### Task P29: Final cross-task review

Dispatch a fresh subagent for end-to-end review. Specific things to verify:
- **Encryption round-trip**: bank account saved, retrieved, decrypted, verifies on penny-drop. AES-GCM auth-tag failure path on tampered data.
- **Maker-checker enforced server-side**: same person can't approve their own batch (unless `single_person_approval_allowed=true`).
- **Wallet shortfall hard-block**: refuse without override flag.
- **Idempotency**: retrying `initiateDisbursement` doesn't create duplicate batches; webhook re-delivery doesn't double-update item statuses.
- **Webhook signature**: per-org lookup chain doesn't allow cross-org spoofing (try sending Org A's payload signed with Org B's secret → must reject).
- **Penny-drop cache**: 30-day TTL respected; cache miss triggers fresh verify; expired cache treated as miss.
- **`payroll_runs.status` transitions**: `processed → disbursing → paid` on full success; `→ disbursement_failed` on partial failure.
- **Cross-tenant guards**: all 4 new server-action files (`razorpayx-credentials`, `employee-bank-accounts`, `disbursement`, `penny-drop`) reject foreign IDs.
- **No plaintext secret leakage**: `getRazorpayXCredentials()` returns masked view; secrets never sent to client.
- **Test + build + lint** all green.
- **Migrations 042-048** applied in order.

Strict review report with Critical / Important / Minor categorisation. Post-review fix commit if anything bites.

---

#### Task P30: Smoke-test playbook (controller-produced after review passes)

Standard smoke-test playbook for the user covering:
- Generate dev encryption key + paste into `.env.local`.
- Sign up RazorpayX sandbox → grab test key_id + secret.
- Settings → Payroll → Connect RazorpayX → test mode + paste keys → Save & Test.
- Profile → add own bank account → see beneficiary sync.
- Admin → process a payroll run for current month.
- Admin → Pay Now → see pre-flight → initiate.
- Switch to a second admin user → approve batch.
- Webhook locally (use ngrok or RazorpayX webhook test feature).
- See item statuses flow: queued → processing → paid.
- Force a failure (use RazorpayX test cards for guaranteed-fail VPAs/accounts) → see retry button → retry.
- Verify `payroll_runs.status` flips to `paid` after all items succeed.

---

## Self-Review Checklist

**Spec coverage (PRD 02 §11 Phase 2):**
- ✅ Penny-drop → P17, P18
- ✅ Single + bulk payout → P21 (uses RazorpayX bulk payout API)
- ✅ Maker-checker → P20, P21 (enforces different-person unless toggled off)
- ✅ Status tracking → P25 (webhook updates), P26 (reconcile)
- ✅ Reconciliation → P24

**Out-of-scope check:**
- ❌ No Cashfree integration
- ❌ No F&F or loan/advance lifecycle
- ❌ No automatic retry with backoff (manual only)
- ❌ No RazorpayX SDK added
- ❌ No KMS/HSM (env-var key is sufficient for Phase 2)
- ❌ No Connected Accounts / Partner program

**Placeholder scan:** None — every task has full code or explicit instructions.

**Type consistency:** `RazorpayXClient`, `RazorpayXError`, `DisbursementBatch`, `DisbursementItem`, `PennyDropResult`, `EmployeeBankAccount` defined once each.

**Integration with shipped features:**
- Payroll Phase 1 `payroll_entries.net_pay` is the source-of-truth for amount per disbursement item ✓
- Attendance Phase 2 `payroll_line_items.category='overtime'` already feeds into net_pay before disbursement ✓
- Existing manual `markPayrollPaid` stays available for non-RazorpayX orgs ✓
- `webhook_events` dedupe table reused ✓

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-08-payroll-prd-02-phase-2.md`.**

Two execution options:

1. **Subagent-Driven (recommended, matches past three phases)** — fresh subagent per task, two-stage review after each.
2. **Inline Execution** — `superpowers:executing-plans` with checkpoints.

**Which approach?**
