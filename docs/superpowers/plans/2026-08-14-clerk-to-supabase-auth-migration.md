# Clerk → Supabase Auth Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move JambaHR identity (sessions, sign-in, provisioning) from Clerk to Supabase Auth across web and mobile, with zero locked-out users at any point.

**Architecture:** Both auth systems run in parallel behind an identifier-first router. Every request resolves through the existing `getCurrentUser()` choke point, which learns to accept a Supabase session **or** a Clerk session. Users are migrated to Supabase up front (including bcrypt password hashes) but keep their Clerk identity until their org is flipped. Rollback at any stage is a flag change, never a data restore.

**Tech Stack:** Next.js 14.2 App Router · `@supabase/ssr` · `@supabase/supabase-js` · Supabase Auth (GoTrue) · MSG91 Flow API (SMS OTP) · Resend SMTP (email OTP) · Expo SDK 57 (`@supabase/supabase-js` + MMKV storage)

**Spec:** This document. §1 (Decision Record) and §2 (Current-State Inventory) are the spec; §5 onward is the plan. Executors read both.

---

## Global Constraints

Copy these verbatim into every task's working assumptions.

- **Next.js pinned to 14.2.x.** Do NOT upgrade. `@supabase/ssr` must be used in its App-Router-compatible form.
- **Nobody may be locked out mid-shift.** This is an attendance product; 43 of 114 active employees are phone-only and clock in daily. Any change that can fail closed on sign-in must ship behind a flag with an instant rollback.
- **RLS is explicitly OUT OF SCOPE.** Keep `createAdminSupabase()` (service role) and the existing `.eq("org_id", …)` app-layer filtering everywhere. Do not convert any query to a user-scoped client. RLS remains advisory (CLAUDE.md gotcha #5). A separate future project flips it on.
- **Never re-hash an imported password.** Clerk exports bcrypt; Supabase stores bcrypt in `auth.users.encrypted_password`. Pass it through byte-for-byte. Double-hashing breaks the login permanently and silently.
- **Supabase's admin API cannot set a password hash.** `auth.admin.createUser()` accepts plaintext only. Hash import is a direct SQL `UPDATE` on `auth.users`, run in the Supabase SQL Editor (Supabase CLI does not work on Windows — CLAUDE.md gotcha #4).
- **MSG91 returns `type:"success"` even when delivery fails.** Never treat an API 200 as proof of delivery. Verify in MSG91 panel → Reports → SMS, and with a real handset.
- **MSG91 `template_id` is the MSG91 template id, NOT the ~19-digit DLT portal id.** This was the root cause of the original "no OTP received" bug.
- **The deployed mobile app sends Clerk tokens.** The BFF must accept both token types until store adoption is complete. Removing Clerk verification before then locks out every un-updated phone.
- **One human = one Supabase user.** 5 Clerk user ids currently span multiple orgs (multi-org logins). Each maps to exactly one `auth.users` row, referenced by multiple `employees` rows.
- **Secrets never enter tracked files.** No `.env.example` with real values (memory: `feedback_no_env_example_secrets`).
- **No `Co-Authored-By` lines in commit messages** (memory: `feedback_commit_message`).
- **Deploy auth changes after ~10pm IST** (memory: `feedback_attendance_deploy_after_hours`) — live punching happens during the workday.

---

## 1. Decision Record

Decisions made 2026-08-14 by the product owner. Do not revisit these mid-implementation; if one proves wrong, stop and escalate.

| # | Decision | Chosen | Consequence |
|---|---|---|---|
| D1 | Password sign-in | **Migrate bcrypt hashes** from Clerk | Requires a manual Clerk Dashboard CSV export and a SQL import step. Password UI, reset and change flows must exist in the Supabase world. |
| D2 | Cutover shape | **Parallel run, flag-gated** | Both systems live simultaneously. Server accepts either session. Rollback = flip a flag. Most code, least risk. |
| D3 | RLS | **Deferred to a separate project** | Service-role client and app-layer filtering unchanged. This migration changes *who the user is*, never *what a query can see*. |
| D4 | Mobile | **Dual-accept, then force update** | BFF verifies Supabase JWT or Clerk token. Ship the new build, watch adoption, then use `MOBILE_MIN_VERSION` to force stragglers, then drop Clerk verification. |

**Non-goals for this migration:** enabling RLS · changing the org/tenancy model (already decoupled from Clerk in June 2026) · changing the `jambahr_active_org` cookie semantics · touching superadmin auth (`SUPERADMIN_SESSION_TOKEN` cookie — entirely separate, must keep working untouched) · social/OAuth login · MFA.

---

## 2. Current-State Inventory

Measured on `main` at commit `2e1ca97`, 2026-08-14. Re-verify with the commands in Task 0.1 before starting; if these numbers have drifted materially, stop and re-plan.

### 2.1 Users and identifiers

| Metric | Value |
|---|---|
| Active employees (`status != 'terminated'`) | 114 |
| email + phone | 58 |
| email only | 13 |
| **phone only** | **43** |
| neither | 0 |
| linked to Clerk (`clerk_user_id` not null) | 106 |
| **not linked to Clerk** | **8** |
| distinct Clerk user ids | 100 |
| **Clerk ids spanning >1 org** | **5** |

Affected orgs by phone-only headcount: TMP Wagholi 26/27 · TMP Boat Club 16/22 · PlayPause Studios 1/39.

### 2.2 Clerk API surface actually used

Small and well-contained. This is why the migration is tractable.

| Call | Count | Supabase equivalent |
|---|---|---|
| `auth()` | 51 | `getSupabaseUser()` (new, Task 3.1) |
| `clerkClient()` | 10 | `supabaseAdmin.auth.admin.*` |
| `clerkMiddleware()` | 1 | `updateSession()` from `@supabase/ssr` |
| `createRouteMatcher()` | 2 | keep — plain path matching, not Clerk-specific logic |
| `currentUser()` | 1 | `getSupabaseUser()` |

Admin operations in use: `users.getUser` (5), `users.getUserList` (4), `users.createUser` (2), `phoneNumbers.createPhoneNumber` (1), `emailAddresses.createEmailAddress` (1).

### 2.3 Files importing `@clerk/*`

**Web — 46 files.** Grouped by change shape:

- **Core auth (3, hand-written):** `middleware.ts`, `lib/current-user.ts`, `lib/clerk/provision-phone-user.ts`
- **Auth UI (3):** `app/(auth)/sign-in/[[...sign-in]]/page.tsx`, `app/(auth)/sign-up/[[...sign-up]]/page.tsx`, `app/layout.tsx`
- **Mobile BFF routes (25, one repeated pattern):** everything under `app/api/mobile/**`
- **Server actions (11):** `actions/` → `active-org.ts`, `billing.ts`, `documents.ts`, `employees.ts`, `invites.ts`, `leaves.ts`, `notifications.ts`, `organizations.ts`, `ownership.ts`, `profile.ts`, `training.ts`
- **Components/pages (4):** `components/layout/sidebar.tsx` (UserButton), `app/dashboard/training/page.tsx`, `app/onboarding/page.tsx`, `app/api/webhooks/clerk/route.ts`

**Mobile — 11 files:** `app/_layout.tsx` (ClerkProvider + tokenCache), `app/index.tsx`, `app/(auth)/_layout.tsx`, `app/(auth)/sign-in.tsx`, `app/(tabs)/_layout.tsx`, `app/(tabs)/more.tsx`, `components/home-screen.tsx`, `lib/api.ts`, `lib/push.ts`, `lib/query.tsx`, `lib/session.tsx`

**Files referencing `clerk_user_id` (18):** the 11 actions above plus `actions/objectives.ts`, `actions/referrals.ts`, `actions/reviews.ts`, `app/api/cron/ownership-transfer-expiry/route.ts`, `app/api/mobile/me/route.ts`, `app/api/mobile/push/register/route.ts`, `components/dashboard/employees-client.tsx`, `lib/current-user.ts`.

### 2.4 Clerk-specific capabilities needing replacements

| Capability | Where | Replacement |
|---|---|---|
| `lastSignInAt` (has-this-person-ever-signed-in) | `actions/employees.ts:74-88`, `actions/invites.ts:53` | `auth.users.last_sign_in_at` |
| Phone/email identifier attach | `lib/clerk/provision-phone-user.ts` | `auth.admin.createUser` + `auth.admin.updateUserById` |
| `<UserButton>` | `components/layout/sidebar.tsx` | Custom menu (already contains the feedback action — see Task 4.4) |
| `user.updated` avatar/name sync | `app/api/webhooks/clerk/route.ts` | Retire. Avatars are self-uploaded since PR #13/#14; names come from our own UI. |
| Session token for mobile | `lib/api.ts`, `lib/push.ts` | `supabase.auth.getSession()` / `getClerkInstance()` → module-level client |

---

## 3. Target Architecture

### 3.1 Identity model

```
auth.users (Supabase)          employees (app)
  id: uuid            <────┐     auth_user_id  uuid   NEW  (nullable during migration)
  email                    └──── clerk_user_id text   KEPT (nullable, for rollback)
  phone                          org_id
  encrypted_password             role
  last_sign_in_at
```

`employees` remains the tenancy source of truth. **Nothing about org resolution changes** — `resolveActiveOrg()`, the `jambahr_active_org` cookie, and `getMyOrgs()` are untouched.

A Clerk id spanning multiple orgs produces **one** `auth.users` row whose uuid is written to **every** matching `employees` row.

### 3.2 Dual-accept resolution order

`getCurrentUser()` becomes provider-agnostic:

1. Read the Supabase session (cookie on web, Bearer JWT on mobile BFF). If present → resolve `employees` by `auth_user_id`.
2. Else read the Clerk session. If present → resolve `employees` by `clerk_user_id` (existing path, unchanged).
3. Else → `null`.

Everything downstream of `getCurrentUser()` — all 51 call sites, every guard, every action — is unaffected because the returned shape does not change.

### 3.3 Identifier-first sign-in routing

Sign-in happens *before* org is known, so the rollout flag cannot live on the org. Instead the sign-in page asks for the identifier first, then asks the server which provider owns it:

```
[ enter email or phone ]
        ↓
resolveAuthProvider(identifier)   ← server action, unauthenticated, rate-limited
        ↓
  'supabase' → Supabase OTP / password flow
  'clerk'    → existing Clerk <SignIn> flow
```

`resolveAuthProvider` returns `'supabase'` when a matching `employees` row has `auth_user_id` set **and** its org has `settings.auth_provider === 'supabase'`; otherwise `'clerk'`. This makes rollout per-org while keeping sign-in identifier-driven, and makes rollback a single JSONB flag flip per org.

### 3.4 Session transport

| Surface | Mechanism |
|---|---|
| Web | `@supabase/ssr` cookie session, refreshed in `middleware.ts` |
| Mobile | `supabase.auth.getSession()` → `Authorization: Bearer <access_token>` (same header the BFF already reads) |
| Mobile storage | MMKV via the existing feature-detected `storage.ts` wrapper — never a static import (CLAUDE.md mobile gotcha) |

### 3.5 OTP delivery

| Channel | Path |
|---|---|
| SMS | Supabase **Send SMS Hook** → `POST /api/webhooks/supabase-sms` → MSG91 Flow API (reuses the existing MSG91 call from `api/webhooks/clerk-sms/route.ts`) |
| Email | Supabase Auth **custom SMTP** → Resend |

Supabase's built-in email sender is rate-limited and unsuitable for production; custom SMTP is mandatory, not optional.

---

## 4. File Structure

**Create:**

| Path | Responsibility |
|---|---|
| `supabase/migrations/109_auth_user_id.sql` | `employees.auth_user_id` + index + org `auth_provider` default |
| `apps/web/src/lib/supabase/auth-server.ts` | `getSupabaseUser()`, `createServerSupabase()` (cookie-bound, SSR) |
| `apps/web/src/lib/supabase/auth-middleware.ts` | `updateSession(request)` — cookie refresh for middleware |
| `apps/web/src/lib/auth/provider.ts` | Pure: `AuthProvider` type, `pickProvider()` resolution rules |
| `apps/web/src/actions/auth.ts` | `resolveAuthProvider()`, `startEmailOtp()`, `startPhoneOtp()`, `verifyOtp()`, `signInWithPassword()` |
| `apps/web/src/lib/supabase/provision-user.ts` | `syncEmployeeAuthIdentifiersSupabase()` — the Supabase twin of the Clerk provisioner |
| `apps/web/src/app/api/webhooks/supabase-sms/route.ts` | Supabase Send-SMS hook → MSG91 |
| `apps/web/src/components/auth/sign-in-form.tsx` | Identifier-first sign-in UI |
| `apps/web/scripts/migrate-users-to-supabase.ts` | Dry-run-first user migration |
| `apps/web/scripts/import-password-hashes.sql` | Generated SQL for the bcrypt import |
| `apps/mobile/src/lib/supabase.ts` | Mobile Supabase client (MMKV storage, auto-refresh) |
| `apps/web/tests/auth/*.test.ts` | Unit tests per task |

**Modify (high-touch):** `apps/web/src/middleware.ts` · `apps/web/src/lib/current-user.ts` · `apps/web/src/app/layout.tsx` · the 25 `app/api/mobile/**` routes · `apps/mobile/src/lib/{api,session,query,push}.ts` · `apps/mobile/src/app/(auth)/sign-in.tsx`

---

## 5. Phases

Each phase ends in a deployable, reversible state. **Do not start a phase before the previous one's gate passes.**

| Phase | Outcome | Gate |
|---|---|---|
| **0. Safety nets** | Inventory re-verified, rollback rehearsed | Numbers match §2.1; DB snapshot taken |
| **1. Foundation** | Supabase Auth configured, SMS+email OTP delivering | Real handset receives an OTP; real inbox receives a code |
| **2. User migration** | All 114 employees have `auth_user_id`; passwords imported | Dry-run diff clean; spot-check 3 logins in a scratch harness |
| **3. Server dual-accept** | `getCurrentUser()` accepts either session | Full suite green; existing Clerk logins still work in prod |
| **4. Web sign-in UI** | Identifier-first router live, all orgs still on `clerk` | Sign-in unchanged for every real user |
| **5. Mobile** | New build dual-accepts; BFF verifies both | Device pass on Android + iOS |
| **6. Staged rollout** | TestOrg → TMP → rest flipped to `supabase` | Each org verified before the next |
| **7. Decommission** | Clerk removed, subscription cancelled | 30 days clean, no Clerk sessions observed |

---

## Phase 0 — Safety nets

### Task 0.1: Re-verify the inventory

**Files:** Create `apps/web/scripts/auth-inventory.ts`

**Interfaces:** Produces — a console report. Nothing consumed by later tasks.

- [ ] **Step 1: Write the inventory script**

```ts
// apps/web/scripts/auth-inventory.ts
// Run: cd apps/web && node --env-file=.env.local --experimental-strip-types scripts/auth-inventory.ts
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const { data, error } = await sb
  .from("employees")
  .select("id, org_id, email, phone, clerk_user_id, status");
if (error) throw error;

const active = data!.filter((e) => e.status !== "terminated");
const n = (p: (e: (typeof active)[number]) => boolean) => active.filter(p).length;

const byClerkId = new Map<string, Set<string>>();
for (const e of active) {
  if (!e.clerk_user_id) continue;
  if (!byClerkId.has(e.clerk_user_id)) byClerkId.set(e.clerk_user_id, new Set());
  byClerkId.get(e.clerk_user_id)!.add(e.org_id);
}

console.log("active                ", active.length, "(expected 114)");
console.log("email+phone           ", n((e) => !!e.email && !!e.phone), "(expected 58)");
console.log("email only            ", n((e) => !!e.email && !e.phone), "(expected 13)");
console.log("phone only            ", n((e) => !e.email && !!e.phone), "(expected 43)");
console.log("linked to clerk       ", n((e) => !!e.clerk_user_id), "(expected 106)");
console.log("distinct clerk ids    ", byClerkId.size, "(expected 100)");
console.log("clerk ids in >1 org   ", [...byClerkId.values()].filter((s) => s.size > 1).length, "(expected 5)");
console.log("NO identifier (BLOCKER if > 0):", n((e) => !e.email && !e.phone));
```

- [ ] **Step 2: Run it**

```bash
cd apps/web && node --env-file=.env.local --experimental-strip-types scripts/auth-inventory.ts
```

Expected: each line within ±3 of its `(expected N)`. **If "NO identifier" > 0, STOP** — those people cannot be migrated to any auth system and need an identifier assigned first.

- [ ] **Step 3: Commit**

```bash
git add apps/web/scripts/auth-inventory.ts
git commit -m "chore(auth): add pre-migration inventory script"
```

---

### Task 0.2: Rehearse rollback before changing anything

**Files:** Create `docs/auth-migration-runbook.md`

- [ ] **Step 1: Take a database snapshot**

Supabase Dashboard → Database → Backups → take a manual backup. Record the timestamp in the runbook. This is the only recovery path if a migration script corrupts `employees`.

- [ ] **Step 2: Write the runbook**

````markdown
# Auth migration runbook

## DB snapshot taken: <timestamp>

## Rollback by phase
| Broken at | Symptom | Rollback | Time |
|---|---|---|---|
| Phase 2 (migration) | Nothing user-visible; auth_user_id wrong | set auth_user_id = NULL, re-run script | minutes |
| Phase 3 (dual-accept) | Existing Clerk logins fail | revert deploy | ~3 min |
| Phase 4 (sign-in UI) | Sign-in page broken | revert deploy | ~3 min |
| Phase 6 (org flipped) | That org cannot sign in | flip settings.auth_provider back to clerk | seconds |

## Per-org flag flip
```sql
-- forward
UPDATE organizations SET settings = settings || '{"auth_provider":"supabase"}'::jsonb WHERE id = '<org-uuid>';
-- rollback
UPDATE organizations SET settings = settings || '{"auth_provider":"clerk"}'::jsonb WHERE id = '<org-uuid>';
```

## Reset the identity link (phase 2 rollback)
```sql
UPDATE employees SET auth_user_id = NULL WHERE org_id = '<org-uuid>';
```

## Blast radius
TMP Wagholi (26/27) and TMP Boat Club (16/22) are overwhelmingly phone-only.
If phone OTP breaks for them, 42 people cannot clock in.
Roll the flag back FIRST, diagnose SECOND.
````

- [ ] **Step 3: Commit**

```bash
git add docs/auth-migration-runbook.md
git commit -m "docs(auth): migration runbook with per-phase rollback matrix"
```

---

### Task 0.3: Extract the MSG91 sender (no behaviour change)

The Supabase SMS hook must deliver through the **exact** code path already proven against Indian DLT. Extract it first, with tests, so Phase 1 reuses rather than reimplements.

**Files:**
- Create: `apps/web/src/lib/sms/msg91.ts`
- Modify: `apps/web/src/app/api/webhooks/clerk-sms/route.ts` (lines ~103–150 move out)
- Test: `apps/web/tests/sms/msg91.test.ts`

**Interfaces:** Produces — `sendOtpViaMsg91(e164Phone: string, otp: string): Promise<void>` (throws on failure); `maskPhone(phone?: string): string`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/tests/sms/msg91.test.ts
import { it, expect, vi, beforeEach } from "vitest";
import { sendOtpViaMsg91 } from "@/lib/sms/msg91";

beforeEach(() => {
  process.env.MSG91_AUTHKEY = "test-key";
  process.env.MSG91_TEMPLATE_ID = "msg91-template-id";
  process.env.MSG91_OTP_VAR_NAME = "otp";
  vi.restoreAllMocks();
});

it("posts to MSG91 Flow with the phone stripped of +", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ type: "success" }), { status: 200 })
  );
  vi.stubGlobal("fetch", fetchMock);

  await sendOtpViaMsg91("+919876543210", "123456");

  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe("https://control.msg91.com/api/v5/flow/");
  const body = JSON.parse(init.body as string);
  expect(body.template_id).toBe("msg91-template-id");
  expect(body.recipients[0].mobiles).toBe("919876543210");
  expect(body.recipients[0].otp).toBe("123456");
});

it("throws when MSG91 replies type:error on HTTP 200", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ type: "error", message: "bad template" }), { status: 200 })
  ));
  await expect(sendOtpViaMsg91("+919876543210", "123456")).rejects.toThrow(/MSG91 send failed/);
});

it("throws when the template id is missing", async () => {
  delete process.env.MSG91_TEMPLATE_ID;
  await expect(sendOtpViaMsg91("+919876543210", "1234")).rejects.toThrow(/not configured/);
});
```

- [ ] **Step 2: Run it, confirm it fails**

```bash
cd apps/web && npx vitest run tests/sms/msg91.test.ts
```

Expected: FAIL — cannot resolve `@/lib/sms/msg91`.

- [ ] **Step 3: Create the module by MOVING the existing code verbatim**

Move `sendViaMsg91` and `maskPhone` out of `src/app/api/webhooks/clerk-sms/route.ts` into `src/lib/sms/msg91.ts`. Rename `sendViaMsg91` → `sendOtpViaMsg91`, export both, change the log prefix `[clerk-sms]` → `[msg91]`.

**Do not otherwise alter the body.** The `type !== "success"` check and the `+`-stripping are load-bearing — they were the fix for a live delivery outage. The full current implementation:

```ts
// apps/web/src/lib/sms/msg91.ts
/** Mask a phone down to last-4 for logs. */
export function maskPhone(phone?: string): string {
  if (!phone) return "unknown";
  return `***${phone.replace(/\D/g, "").slice(-4)}`;
}

/**
 * Deliver an OTP through MSG91's Flow API using the DLT-registered template.
 * Throws on failure so the caller can return 500 and let the auth provider retry.
 *
 * Env: MSG91_AUTHKEY, MSG91_TEMPLATE_ID (the MSG91 template id — NOT the
 * ~19-digit DLT portal id), MSG91_OTP_VAR_NAME (must match the template's
 * placeholder, case-sensitive; default "otp").
 */
export async function sendOtpViaMsg91(e164Phone: string, otp: string): Promise<void> {
  const authkey = process.env.MSG91_AUTHKEY;
  const templateId = process.env.MSG91_TEMPLATE_ID;
  const varName = process.env.MSG91_OTP_VAR_NAME || "otp";

  if (!authkey || !templateId) {
    throw new Error("MSG91_AUTHKEY / MSG91_TEMPLATE_ID not configured");
  }

  // MSG91 wants the number WITHOUT a leading "+" (country code retained).
  const mobiles = e164Phone.replace(/^\+/, "").replace(/\D/g, "");

  const res = await fetch("https://control.msg91.com/api/v5/flow/", {
    method: "POST",
    headers: { authkey, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      template_id: templateId,
      short_url: "0",
      recipients: [{ mobiles, [varName]: otp }],
    }),
  });

  const text = await res.text();
  console.warn(`[msg91] response ${res.status} for ${maskPhone(mobiles)}: ${text}`);

  let parsed: { type?: string } | null = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    // non-JSON body — fall through to the HTTP-status check
  }

  // MSG91 Flow returns HTTP 200 with { type: "success" | "error" }.
  if (!res.ok || (parsed && parsed.type && parsed.type !== "success")) {
    throw new Error(`MSG91 send failed (HTTP ${res.status}): ${text}`);
  }
}
```

- [ ] **Step 4: Update the Clerk route to import it**

Delete the local copies and add `import { sendOtpViaMsg91, maskPhone } from "@/lib/sms/msg91";`. Rename the call site `sendViaMsg91(...)` → `sendOtpViaMsg91(...)`.

- [ ] **Step 5: Run tests**

```bash
cd apps/web && npx vitest run tests/sms/
```

Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/sms/msg91.ts apps/web/src/app/api/webhooks/clerk-sms/route.ts apps/web/tests/sms/msg91.test.ts
git commit -m "refactor(sms): extract MSG91 OTP sender for reuse by the Supabase hook"
```

**Phase 0 gate:** inventory matches §2.1 · runbook committed · DB snapshot taken · `npm run test` green · zero user-visible change.

---

## Phase 1 — Foundation

### Task 1.1: Schema — `auth_user_id` and the per-org provider flag

**Files:** Create `supabase/migrations/109_auth_user_id.sql`

**Interfaces:** Produces — `employees.auth_user_id uuid null`; index `idx_employees_auth_user_id`; unique `uq_employees_org_auth_user`; the convention `organizations.settings->>'auth_provider' ∈ {clerk, supabase}`, absent meaning `clerk`.

- [ ] **Step 1: Write the migration**

```sql
-- 109_auth_user_id.sql — Clerk to Supabase auth migration, phase 1.
-- Idempotent. Adds the Supabase identity link ALONGSIDE clerk_user_id.
-- clerk_user_id is deliberately NOT dropped here: it is the rollback path.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS auth_user_id uuid;

-- Deliberately NOT a foreign key to auth.users: employees rows are created by
-- admins before the person has ever signed in, so a FK would make provisioning
-- order-dependent and break bulk import.
CREATE INDEX IF NOT EXISTS idx_employees_auth_user_id
  ON employees (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- One human = one Supabase user, but that user may hold several employees rows
-- (multi-org logins: 5 exist today). So the uniqueness is per-org, NOT global.
CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_org_auth_user
  ON employees (org_id, auth_user_id)
  WHERE auth_user_id IS NOT NULL;

COMMENT ON COLUMN employees.auth_user_id IS
  'Supabase auth.users.id. Coexists with clerk_user_id during the 2026-08 parallel-run migration.';
```

- [ ] **Step 2: Apply via the Supabase SQL Editor**

Supabase CLI does not work on Windows (gotcha #4). Paste into Dashboard → SQL Editor → Run.

- [ ] **Step 3: Verify**

```sql
SELECT column_name, is_nullable FROM information_schema.columns
WHERE table_name = 'employees' AND column_name IN ('auth_user_id', 'clerk_user_id');
```

Expected: two rows, both `is_nullable = YES`.

- [ ] **Step 4: Regenerate types and commit**

```bash
cd apps/web && npm run db:generate
git add supabase/migrations/109_auth_user_id.sql packages/supabase/src/database.types.ts
git commit -m "feat(auth): add employees.auth_user_id for the Supabase identity link"
```

---

### Task 1.2: Configure Supabase Auth (manual, dashboard)

No code. Do each step exactly, then record what was applied.

- [ ] **Step 1: Providers** — Authentication → Providers:
  - **Email**: enabled · **Confirm email: OFF** (admins provision staff; there is no self-serve signup) · Secure email change: ON
  - **Phone**: enabled · provider **Custom / Send SMS hook** (wired in Step 4) · OTP length 6 · expiry 600s
  - Every other provider: **disabled**

- [ ] **Step 2: Disable self-serve signup** — Authentication → Settings → **"Allow new users to sign up": OFF**.

  This is a hard security requirement, not a preference. With it on, anyone on the internet can create an `auth.users` row. JambaHR users are created by admins only.

- [ ] **Step 3: Custom SMTP via Resend** — Authentication → Settings → SMTP Settings:
  - Host `smtp.resend.com` · Port `465` · Username `resend` · Password = existing `RESEND_API_KEY`
  - Sender address = the value of `FROM_EMAIL` from `src/lib/resend.ts` (`support@jambahr.com`). Never hardcode a sender — CLAUDE.md requires importing the constant.
  - Raise Authentication → Rate Limits → email above the default; the built-in sender's limit is far too low for 114 users.

- [ ] **Step 4: Send SMS Hook** — Authentication → Hooks → Send SMS:
  - Type: HTTPS · URI `https://jambahr.com/api/webhooks/supabase-sms`
  - Copy the generated secret to Vercel as `SUPABASE_SMS_HOOK_SECRET` (all environments)
  - **Redeploy** — Vercel env changes do not take effect until a redeploy.

- [ ] **Step 5: Record it**

Append a "Supabase Auth configuration as applied" section to `docs/auth-migration-runbook.md` listing every setting above, then commit.

---

### Task 1.3: Supabase Send-SMS hook → MSG91

**Files:**
- Create: `apps/web/src/app/api/webhooks/supabase-sms/route.ts`
- Test: `apps/web/tests/auth/supabase-sms-hook.test.ts`
- Verify only (no edit): `apps/web/src/middleware.ts` — the existing `/api/webhooks(.*)` public matcher already covers this route. Do **not** add a new matcher entry.

**Interfaces:** Consumes — `sendOtpViaMsg91`, `maskPhone` (Task 0.3). Produces — the HTTP endpoint only.

Supabase signs hook payloads with the standard-webhooks scheme (`webhook-id` / `webhook-timestamp` / `webhook-signature`) — the same format `svix` verifies, and `svix` is already a dependency.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/tests/auth/supabase-sms-hook.test.ts
import { it, expect, vi, beforeEach } from "vitest";

const sendMock = vi.fn();
vi.mock("@/lib/sms/msg91", () => ({
  sendOtpViaMsg91: (...a: unknown[]) => sendMock(...a),
  maskPhone: () => "***0000",
}));
vi.mock("svix", () => ({
  Webhook: class {
    verify(body: string) { return JSON.parse(body); }
  },
}));
vi.mock("next/headers", () => ({
  headers: () => new Map([
    ["webhook-id", "1"],
    ["webhook-timestamp", "1"],
    ["webhook-signature", "v1,sig"],
  ]),
}));

import { POST } from "@/app/api/webhooks/supabase-sms/route";

const req = (payload: unknown) =>
  new Request("https://x/api/webhooks/supabase-sms", {
    method: "POST",
    body: JSON.stringify(payload),
  });

beforeEach(() => {
  process.env.SUPABASE_SMS_HOOK_SECRET = "v1,whsec_test";
  sendMock.mockReset();
});

it("forwards the OTP to MSG91 and returns 200", async () => {
  const res = await POST(req({ user: { phone: "919876543210" }, sms: { otp: "123456" } }));
  expect(res.status).toBe(200);
  expect(sendMock).toHaveBeenCalledWith("+919876543210", "123456");
});

it("returns 500 when MSG91 fails so Supabase retries", async () => {
  sendMock.mockRejectedValueOnce(new Error("MSG91 send failed"));
  const res = await POST(req({ user: { phone: "919876543210" }, sms: { otp: "123456" } }));
  expect(res.status).toBe(500);
});

it("acks without sending when the payload has no otp", async () => {
  const res = await POST(req({ user: { phone: "919876543210" }, sms: {} }));
  expect(res.status).toBe(200);
  expect(sendMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run it, confirm it fails**

```bash
cd apps/web && npx vitest run tests/auth/supabase-sms-hook.test.ts
```

- [ ] **Step 3: Implement the route**

```ts
// apps/web/src/app/api/webhooks/supabase-sms/route.ts
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { Webhook } from "svix";
import { sendOtpViaMsg91, maskPhone } from "@/lib/sms/msg91";

export const dynamic = "force-dynamic";

/**
 * Supabase Auth "Send SMS" hook → MSG91 (Airtel DLT).
 *
 * Mirrors api/webhooks/clerk-sms: Supabase generates and verifies the OTP; we
 * only deliver it. Returns 500 on delivery failure so Supabase retries.
 *
 * Env: SUPABASE_SMS_HOOK_SECRET (Dashboard → Auth → Hooks → Send SMS),
 *      plus the MSG91_* vars consumed by sendOtpViaMsg91.
 */
export async function POST(req: Request) {
  const secret = process.env.SUPABASE_SMS_HOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "hook secret not configured" }, { status: 500 });
  }

  const h = headers();
  const id = h.get("webhook-id");
  const timestamp = h.get("webhook-timestamp");
  const signature = h.get("webhook-signature");
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: "missing signature headers" }, { status: 400 });
  }

  const body = await req.text();

  let event: { user?: { phone?: string }; sms?: { otp?: string } };
  try {
    // Supabase presents the secret as "v1,whsec_..."; svix wants the raw part.
    const wh = new Webhook(secret.replace(/^v1,/, ""));
    event = wh.verify(body, {
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": signature,
    }) as typeof event;
  } catch (err) {
    console.error("[supabase-sms] signature verification failed:", err);
    return NextResponse.json({ error: "verification failed" }, { status: 400 });
  }

  const rawPhone = event.user?.phone;
  const otp = event.sms?.otp;
  if (!rawPhone || !otp) {
    // Nothing to deliver — ack so Supabase does not retry forever.
    return NextResponse.json({ received: true, delivered: false });
  }

  // Supabase stores phones without a leading '+'; the MSG91 helper wants E.164.
  const e164 = rawPhone.startsWith("+") ? rawPhone : `+${rawPhone}`;

  try {
    await sendOtpViaMsg91(e164, otp);
  } catch (err) {
    console.error(`[supabase-sms] delivery failed for ${maskPhone(rawPhone)}:`, err);
    return NextResponse.json({ error: "delivery failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true, delivered: true });
}
```

- [ ] **Step 4: Run tests**

```bash
cd apps/web && npx vitest run tests/auth/
```

Expected: 3 passed.

- [ ] **Step 5: Deploy, then verify with a REAL handset**

Deploy to production (after 10pm IST per the global constraints). Trigger an OTP to your own number.

**Hard gate — confirm all three:**
1. The handset receives the SMS.
2. MSG91 panel → Reports → SMS shows **Delivered**, not merely queued. MSG91 reports success even when delivery fails.
3. The message text matches the DLT-approved template.

If the SMS never arrives, check `MSG91_TEMPLATE_ID` first — it must be the MSG91 template id, not the ~19-digit DLT portal id. That single mistake caused the original outage.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/webhooks/supabase-sms/route.ts apps/web/tests/auth/supabase-sms-hook.test.ts
git commit -m "feat(auth): Supabase send-SMS hook delivering OTPs via MSG91"
```

---

### Task 1.4: Server-side Supabase session helpers

**Files:**
- Create: `apps/web/src/lib/supabase/auth-server.ts`
- Create: `apps/web/src/lib/supabase/auth-middleware.ts`
- Test: `apps/web/tests/auth/auth-server.test.ts`

**Interfaces:** Produces —
- `type AuthUser = { id: string; email: string | null; phone: string | null }`
- `createServerSupabase(): SupabaseClient` — cookie-bound, Server Components / actions
- `getSupabaseUser(): Promise<AuthUser | null>` — the `auth()` replacement
- `getSupabaseUserFromBearer(token: string): Promise<AuthUser | null>` — mobile BFF
- `updateSession(request: NextRequest): Promise<{ response: NextResponse; userId: string | null }>` — middleware cookie refresh

These exact names are used by Tasks 3.1, 3.2, 3.3 and 5.2.

- [ ] **Step 1: Install the SSR package**

```bash
cd apps/web && npm install @supabase/ssr
```

- [ ] **Step 2: Write the failing test**

```ts
// apps/web/tests/auth/auth-server.test.ts
import { it, expect, vi } from "vitest";

const getUserMock = vi.fn();
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getUser: getUserMock } }) }));
vi.mock("next/headers", () => ({ cookies: () => ({ getAll: () => [], set: () => {} }) }));

import { getSupabaseUser } from "@/lib/supabase/auth-server";

it("returns null when there is no session", async () => {
  getUserMock.mockResolvedValueOnce({ data: { user: null }, error: null });
  expect(await getSupabaseUser()).toBeNull();
});

it("projects id/email/phone and normalises the phone to E.164", async () => {
  getUserMock.mockResolvedValueOnce({
    data: { user: { id: "uuid-1", email: "a@b.com", phone: "919876543210" } },
    error: null,
  });
  expect(await getSupabaseUser()).toEqual({
    id: "uuid-1",
    email: "a@b.com",
    phone: "+919876543210",
  });
});

it("returns null rather than throwing when Supabase errors", async () => {
  getUserMock.mockResolvedValueOnce({ data: { user: null }, error: new Error("boom") });
  expect(await getSupabaseUser()).toBeNull();
});
```

- [ ] **Step 3: Run it, confirm it fails**

```bash
cd apps/web && npx vitest run tests/auth/auth-server.test.ts
```

- [ ] **Step 4: Implement `auth-server.ts`**

```ts
// apps/web/src/lib/supabase/auth-server.ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export type AuthUser = { id: string; email: string | null; phone: string | null };

/** Cookie-bound client for Server Components and Server Actions. */
export function createServerSupabase() {
  const store = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            // Called from a Server Component, where the cookie store is
            // read-only. Middleware refreshes the session, so this is safe.
          }
        },
      },
    }
  );
}

/** Supabase stores phones without '+'; the app uses E.164 everywhere. */
function toE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  return phone.startsWith("+") ? phone : `+${phone}`;
}

/**
 * The `auth()` replacement. Returns null rather than throwing: callers treat
 * "no user" and "auth backend unavailable" identically (redirect to sign-in).
 */
export async function getSupabaseUser(): Promise<AuthUser | null> {
  try {
    const { data, error } = await createServerSupabase().auth.getUser();
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? null, phone: toE164(data.user.phone) };
  } catch {
    return null;
  }
}

/** Mobile BFF: verify a Bearer access token with no cookie context. */
export async function getSupabaseUserFromBearer(token: string): Promise<AuthUser | null> {
  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? null, phone: toE164(data.user.phone) };
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Implement `auth-middleware.ts`**

```ts
// apps/web/src/lib/supabase/auth-middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Refreshes the Supabase session cookie. Must run before any auth decision in
 * middleware — otherwise a user holding a valid refresh token but an expired
 * access token appears signed out.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data } = await supabase.auth.getUser();
  return { response, userId: data.user?.id ?? null };
}
```

- [ ] **Step 6: Run tests and typecheck**

```bash
cd apps/web && npx vitest run tests/auth/ && npx turbo typecheck --filter=web
```

Expected: tests pass. Web typecheck is advisory (~454 pre-existing Supabase `never` errors, gotcha #3) — confirm only that you added none in the new files.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/supabase/auth-server.ts apps/web/src/lib/supabase/auth-middleware.ts apps/web/tests/auth/auth-server.test.ts apps/web/package.json apps/web/package-lock.json
git commit -m "feat(auth): Supabase server session helpers (cookie + bearer)"
```

**Phase 1 gate:** a real handset receives an OTP with MSG91 reporting **Delivered** · a real inbox receives an emailed code · `npm run test` green · still zero user-visible change.

---

## Phase 2 — User migration

The riskiest data step. It is **write-only to `auth.users` and `employees.auth_user_id`** — it never touches `clerk_user_id`, so Clerk keeps working throughout.

### Task 2.1: Migration script with a mandatory dry-run

**Files:**
- Create: `apps/web/scripts/migrate-users-to-supabase.ts`
- Test: `apps/web/tests/auth/migrate-users.test.ts`

**Interfaces:** Produces — `planMigration(employees): MigrationPlan` (pure, exported for tests) where

```ts
type MigrationRow = {
  identityKey: string;        // clerk_user_id, else `email:<addr>`, else `phone:<e164>`
  email: string | null;
  phone: string | null;       // E.164
  employeeIds: string[];      // all employees rows that map to this one auth user
};
type MigrationPlan = { rows: MigrationRow[]; skipped: { employeeId: string; reason: string }[] };
```

- [ ] **Step 1: Write the failing test for the pure planner**

```ts
// apps/web/tests/auth/migrate-users.test.ts
import { it, expect } from "vitest";
import { planMigration } from "../../scripts/migrate-users-to-supabase";

const emp = (o: Partial<Record<string, unknown>>) => ({
  id: "e1", org_id: "o1", email: null, phone: null, clerk_user_id: null, status: "active", ...o,
});

it("collapses one clerk id spanning two orgs into ONE auth user", () => {
  const plan = planMigration([
    emp({ id: "e1", org_id: "o1", clerk_user_id: "user_x", email: "a@b.com" }),
    emp({ id: "e2", org_id: "o2", clerk_user_id: "user_x", email: "a@b.com" }),
  ]);
  expect(plan.rows).toHaveLength(1);
  expect(plan.rows[0].employeeIds.sort()).toEqual(["e1", "e2"]);
});

it("keys unlinked employees by email, then phone", () => {
  const plan = planMigration([
    emp({ id: "e1", email: "a@b.com" }),
    emp({ id: "e2", phone: "+919876543210" }),
  ]);
  expect(plan.rows.map((r) => r.identityKey).sort()).toEqual(["email:a@b.com", "phone:+919876543210"]);
});

it("treats email case-insensitively so one human is not split in two", () => {
  const plan = planMigration([
    emp({ id: "e1", email: "A@B.com" }),
    emp({ id: "e2", email: "a@b.COM" }),
  ]);
  expect(plan.rows).toHaveLength(1);
});

it("skips terminated employees and those with no identifier", () => {
  const plan = planMigration([
    emp({ id: "e1", status: "terminated", email: "a@b.com" }),
    emp({ id: "e2" }),
  ]);
  expect(plan.rows).toHaveLength(0);
  expect(plan.skipped.map((s) => s.employeeId).sort()).toEqual(["e1", "e2"]);
});

it("carries phone AND email onto the same auth user when both exist", () => {
  const plan = planMigration([
    emp({ id: "e1", clerk_user_id: "user_x", email: "a@b.com", phone: "+919876543210" }),
  ]);
  expect(plan.rows[0]).toMatchObject({ email: "a@b.com", phone: "+919876543210" });
});
```

- [ ] **Step 2: Run it, confirm it fails**

```bash
cd apps/web && npx vitest run tests/auth/migrate-users.test.ts
```

- [ ] **Step 3: Implement the script**

```ts
// apps/web/scripts/migrate-users-to-supabase.ts
// DRY RUN:  cd apps/web && node --env-file=.env.local --experimental-strip-types scripts/migrate-users-to-supabase.ts
// EXECUTE:  ... scripts/migrate-users-to-supabase.ts --execute
import { createClient } from "@supabase/supabase-js";

export type EmployeeRow = {
  id: string; org_id: string; email: string | null; phone: string | null;
  clerk_user_id: string | null; status: string;
};
export type MigrationRow = {
  identityKey: string; email: string | null; phone: string | null; employeeIds: string[];
};
export type MigrationPlan = {
  rows: MigrationRow[]; skipped: { employeeId: string; reason: string }[];
};

/** Pure. One human = one auth user, even across orgs. */
export function planMigration(employees: EmployeeRow[]): MigrationPlan {
  const byKey = new Map<string, MigrationRow>();
  const skipped: MigrationPlan["skipped"] = [];

  for (const e of employees) {
    if (e.status === "terminated") { skipped.push({ employeeId: e.id, reason: "terminated" }); continue; }
    const email = e.email?.trim().toLowerCase() || null;
    const phone = e.phone?.trim() || null;
    if (!email && !phone) { skipped.push({ employeeId: e.id, reason: "no identifier" }); continue; }

    // Prefer the Clerk id so multi-org logins collapse to one user; fall back
    // to email then phone for the 8 employees never linked to Clerk.
    const identityKey = e.clerk_user_id ?? (email ? `email:${email}` : `phone:${phone}`);

    const existing = byKey.get(identityKey);
    if (existing) {
      existing.employeeIds.push(e.id);
      existing.email ??= email;
      existing.phone ??= phone;
    } else {
      byKey.set(identityKey, { identityKey, email, phone, employeeIds: [e.id] });
    }
  }
  return { rows: [...byKey.values()], skipped };
}

async function main() {
  const execute = process.argv.includes("--execute");
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await sb
    .from("employees")
    .select("id, org_id, email, phone, clerk_user_id, status");
  if (error) throw error;

  const plan = planMigration(data as EmployeeRow[]);
  console.log(`${execute ? "EXECUTE" : "DRY RUN"} — ${plan.rows.length} auth users, ${plan.skipped.length} skipped`);
  console.log("  with email:", plan.rows.filter((r) => r.email).length);
  console.log("  with phone:", plan.rows.filter((r) => r.phone).length);
  console.log("  multi-org :", plan.rows.filter((r) => r.employeeIds.length > 1).length);

  if (!execute) {
    console.log("\nfirst 5 rows:", plan.rows.slice(0, 5));
    console.log("\nskipped:", plan.skipped);
    console.log("\nRe-run with --execute to apply.");
    return;
  }

  let created = 0, reused = 0, failed = 0;
  for (const row of plan.rows) {
    try {
      // createUser is idempotent-by-hand: on duplicate identifier we look the
      // user up instead, so the script is safe to re-run after a partial run.
      let userId: string | null = null;
      const { data: made, error: createErr } = await sb.auth.admin.createUser({
        ...(row.email ? { email: row.email, email_confirm: true } : {}),
        ...(row.phone ? { phone: row.phone.replace(/^\+/, ""), phone_confirm: true } : {}),
        user_metadata: { migrated_from: "clerk", identity_key: row.identityKey },
      });

      if (made?.user) { userId = made.user.id; created++; }
      else if (createErr) {
        // Already exists — find them by listing (admin API has no getByEmail).
        const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const found = list?.users.find(
          (u) =>
            (row.email && u.email?.toLowerCase() === row.email) ||
            (row.phone && `+${u.phone}` === row.phone)
        );
        if (!found) throw createErr;
        userId = found.id; reused++;
      }

      if (!userId) throw new Error("no user id resolved");

      const { error: linkErr } = await sb
        .from("employees")
        .update({ auth_user_id: userId })
        .in("id", row.employeeIds);
      if (linkErr) throw linkErr;
    } catch (err) {
      failed++;
      console.error(`FAILED ${row.identityKey}:`, err);
    }
  }
  console.log(`\ncreated ${created} · reused ${reused} · failed ${failed}`);
  if (failed > 0) process.exitCode = 1;
}

if (process.argv[1]?.includes("migrate-users-to-supabase")) void main();
```

- [ ] **Step 4: Run tests**

```bash
cd apps/web && npx vitest run tests/auth/migrate-users.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: DRY RUN against production data**

```bash
cd apps/web && node --env-file=.env.local --experimental-strip-types scripts/migrate-users-to-supabase.ts
```

**Verify before proceeding:** ~109 auth users planned (100 Clerk ids + 8 unlinked, minus any that collapse) · `multi-org` reports 5 · `skipped` contains only terminated employees · no row has both `email: null` and `phone: null`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/scripts/migrate-users-to-supabase.ts apps/web/tests/auth/migrate-users.test.ts
git commit -m "feat(auth): user migration planner + script (dry-run verified)"
```

---

### Task 2.2: Execute the user migration

- [ ] **Step 1: Confirm the DB snapshot from Task 0.2 exists.** If not, take one now.

- [ ] **Step 2: Execute**

```bash
cd apps/web && node --env-file=.env.local --experimental-strip-types scripts/migrate-users-to-supabase.ts --execute
```

Expected: `failed 0`. **If any row failed, stop** and resolve before continuing — a partially-migrated org will behave inconsistently when flipped.

- [ ] **Step 3: Verify linkage in SQL**

```sql
SELECT
  count(*) FILTER (WHERE auth_user_id IS NOT NULL) AS linked,
  count(*) FILTER (WHERE auth_user_id IS NULL)     AS unlinked,
  count(DISTINCT auth_user_id)                     AS distinct_auth_users
FROM employees WHERE status <> 'terminated';
```

Expected: `linked = 114`, `unlinked = 0`, `distinct_auth_users ≈ 109`.

- [ ] **Step 4: Verify no human was split across two auth users**

```sql
SELECT clerk_user_id, count(DISTINCT auth_user_id) AS n
FROM employees
WHERE clerk_user_id IS NOT NULL AND status <> 'terminated'
GROUP BY clerk_user_id HAVING count(DISTINCT auth_user_id) > 1;
```

Expected: **zero rows.** Any row here is a split identity and must be fixed before Phase 6.

---

### Task 2.3: Import password hashes (D1)

Supabase's admin API cannot set a password hash — it accepts plaintext only. Hashes must go in by direct SQL.

- [ ] **Step 1: Export from Clerk**

Clerk Dashboard → **Users → User Exports → Export all users**. Download the CSV; it contains `id`, `primary_email_address`, and `password_digest` (bcrypt) plus `password_hasher`.

Save it **outside the repo** — it is credential material and must never be committed. Suggested: `%TEMP%/clerk-users-export.csv`.

- [ ] **Step 2: Confirm the hasher is bcrypt**

Inspect the `password_hasher` column. Supabase accepts **bcrypt** (and Argon2) directly.

- If it says `bcrypt` → proceed.
- If it says anything else (`scrypt_firebase`, `pbkdf2_sha256`, …) → **STOP.** Supabase cannot verify those. Fall back to OTP-only for affected users and have them set a new password after signing in. Record the decision in the runbook.

Also confirm the digest starts with `$2a$`, `$2b$` or `$2y$`.

- [ ] **Step 3: Generate the import SQL**

```ts
// apps/web/scripts/build-password-import.ts  (run locally, output NOT committed)
// node --env-file=.env.local --experimental-strip-types scripts/build-password-import.ts <csv-path> > %TEMP%/import-hashes.sql
import { readFileSync } from "node:fs";

const csv = readFileSync(process.argv[2], "utf8").trim().split("\n");
const header = csv[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
const emailIdx = header.indexOf("primary_email_address");
const hashIdx = header.indexOf("password_digest");

console.log("-- Generated password-hash import. Run in the Supabase SQL Editor.");
console.log("-- NEVER re-hash: these bcrypt digests are passed through byte-for-byte.");
for (const line of csv.slice(1)) {
  const cells = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  const email = cells[emailIdx]?.toLowerCase();
  const hash = cells[hashIdx];
  if (!email || !hash || !/^\$2[aby]\$/.test(hash)) continue;
  console.log(
    `UPDATE auth.users SET encrypted_password = '${hash.replace(/'/g, "''")}' ` +
    `WHERE lower(email) = '${email.replace(/'/g, "''")}' AND encrypted_password IS NULL;`
  );
}
```

- [ ] **Step 4: Apply in the Supabase SQL Editor**

Paste the generated SQL. The `AND encrypted_password IS NULL` guard makes it re-runnable and prevents clobbering a password someone set after migrating.

- [ ] **Step 5: Verify**

```sql
SELECT count(*) FILTER (WHERE encrypted_password IS NOT NULL) AS with_password,
       count(*)                                               AS total
FROM auth.users;
```

Compare `with_password` against the number of Clerk users who actually had a password. It will be well below 109 — most staff use OTP.

- [ ] **Step 6: Delete the export**

Delete the CSV and the generated SQL from disk. They contain password hashes.

- [ ] **Step 7: Commit the generator only**

```bash
git add apps/web/scripts/build-password-import.ts
git commit -m "feat(auth): password-hash import generator for the Clerk export"
```

---

### Task 2.4: Prove a migrated user can actually sign in

Do this **before** any application code changes. It isolates "did the migration work" from "did the app wiring work".

- [ ] **Step 1: Create a scratch harness**

```ts
// apps/web/scripts/verify-supabase-login.ts   (delete after use)
// node --env-file=.env.local --experimental-strip-types scripts/verify-supabase-login.ts +919876543210
import { createClient } from "@supabase/supabase-js";
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
const target = process.argv[2];
const { error } = target.startsWith("+")
  ? await sb.auth.signInWithOtp({ phone: target })
  : await sb.auth.signInWithOtp({ email: target });
console.log(error ? `FAILED: ${error.message}` : "OTP sent — check the handset/inbox");
```

- [ ] **Step 2: Test all three identity shapes**

Run it against one migrated user of each kind and confirm the code arrives:
1. an email+phone employee (by email)
2. an email+phone employee (by phone)
3. a **phone-only** employee (by phone) — this is the 43-person cohort, the one that must not fail

- [ ] **Step 3: Verify the code actually completes the login**

```ts
const { data, error } = await sb.auth.verifyOtp({ phone: target, token: "<code>", type: "sms" });
console.log(error ?? data.session?.user.id);
```

Expected: a session with a user id that matches `employees.auth_user_id` for that person.

- [ ] **Step 4: Delete the harness**

```bash
rm apps/web/scripts/verify-supabase-login.ts
```

**Phase 2 gate:** 114 employees linked · zero split identities · a phone-only employee completes a full OTP round-trip · Clerk sign-in still works for everyone (nothing has been switched yet).

---

## Phase 3 — Server-side dual-accept

After this phase the server accepts **either** session. No user-visible change: nobody has a Supabase session yet because the sign-in UI still uses Clerk.

### Task 3.1: Teach `getCurrentUser()` both providers

**Files:**
- Modify: `apps/web/src/lib/current-user.ts` (215 lines; `auth()` at lines 36 and 193)
- Test: `apps/web/tests/auth/current-user-dual.test.ts`

**Interfaces:** Consumes — `getSupabaseUser` (Task 1.4). Produces — no signature change. `getCurrentUser()` still returns `{ orgId, clerkUserId, role, employeeId, plan, jambaHireEnabled, attendanceEnabled, grievancesEnabled }`.

**Critical:** the returned field stays named `clerkUserId`. Renaming it would touch all 51 call sites and is pure churn — it is now "the id of whichever provider authenticated you". Add a comment saying so. Rename in Phase 7 if desired.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/tests/auth/current-user-dual.test.ts
import { it, expect, vi, beforeEach } from "vitest";

const clerkAuth = vi.fn();
const supabaseUser = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({ auth: () => clerkAuth(), clerkClient: vi.fn() }));
vi.mock("@/lib/supabase/auth-server", () => ({ getSupabaseUser: () => supabaseUser() }));

// Supabase data client is mocked per-test to return a single employees row.
const rows: unknown[] = [];
vi.mock("@/lib/supabase/server", () => ({
  createAdminSupabase: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ neq: () => ({ data: rows, error: null }) }) }),
    }),
  }),
}));

beforeEach(() => { clerkAuth.mockReset(); supabaseUser.mockReset(); rows.length = 0; });

it("prefers the Supabase session when both exist", async () => {
  supabaseUser.mockResolvedValue({ id: "uuid-1", email: "a@b.com", phone: null });
  clerkAuth.mockReturnValue({ userId: "user_clerk" });
  const { resolveAuthIdentity } = await import("@/lib/current-user");
  expect(await resolveAuthIdentity()).toEqual({ provider: "supabase", column: "auth_user_id", id: "uuid-1" });
});

it("falls back to Clerk when there is no Supabase session", async () => {
  supabaseUser.mockResolvedValue(null);
  clerkAuth.mockReturnValue({ userId: "user_clerk" });
  const { resolveAuthIdentity } = await import("@/lib/current-user");
  expect(await resolveAuthIdentity()).toEqual({ provider: "clerk", column: "clerk_user_id", id: "user_clerk" });
});

it("returns null when neither session exists", async () => {
  supabaseUser.mockResolvedValue(null);
  clerkAuth.mockReturnValue({ userId: null });
  const { resolveAuthIdentity } = await import("@/lib/current-user");
  expect(await resolveAuthIdentity()).toBeNull();
});
```

- [ ] **Step 2: Run it, confirm it fails**

```bash
cd apps/web && npx vitest run tests/auth/current-user-dual.test.ts
```

- [ ] **Step 3: Add the resolver to `current-user.ts`**

```ts
// near the top of apps/web/src/lib/current-user.ts
import { getSupabaseUser } from "@/lib/supabase/auth-server";

export type AuthIdentity = {
  provider: "supabase" | "clerk";
  /** The employees column this id joins on. */
  column: "auth_user_id" | "clerk_user_id";
  id: string;
};

/**
 * Resolve the caller's identity from whichever auth provider issued a session.
 *
 * Supabase wins when both are present: during the parallel run a user who has
 * signed in with Supabase may still hold a stale Clerk cookie, and the newer
 * session is the intended one.
 */
export async function resolveAuthIdentity(): Promise<AuthIdentity | null> {
  const supa = await getSupabaseUser();
  if (supa) return { provider: "supabase", column: "auth_user_id", id: supa.id };

  const { userId } = auth();
  if (userId) return { provider: "clerk", column: "clerk_user_id", id: userId };

  return null;
}
```

- [ ] **Step 4: Rewrite the lookup in `getCurrentUser()`**

Replace the `const { userId } = auth();` at line 36 and the `.eq("clerk_user_id", userId)` at line 47 with:

```ts
  const identity = await resolveAuthIdentity();
  if (!identity) return null;
  // ...
    .eq(identity.column, identity.id)
```

Do the same in `getOrgContext()` (lines 193 and 200).

The email/phone auto-link fallback (lines 57–118) currently calls `clerkClient().users.getUser(userId)`. Make it provider-aware:

```ts
  // Back-fill the identity link for a user who exists in the auth provider but
  // whose employees row was created later (invite flow). Same behaviour for
  // both providers; only the identifier source differs.
  const identifiers =
    identity.provider === "supabase"
      ? await getSupabaseUser()                       // already has email + phone
      : await loadClerkIdentifiers(identity.id);      // existing clerkClient path, extracted

  if (identifiers?.email) { /* existing email match, but .update({ [identity.column]: identity.id }) */ }
  if (identifiers?.phone) { /* existing phone match, same update */ }
```

**Every `update({ clerk_user_id: userId })` in this file becomes `update({ [identity.column]: identity.id })`.** There are two (lines 83 and 109).

- [ ] **Step 5: Run the full suite**

```bash
cd apps/web && npm run test
```

Expected: 940+ passed, including the 3 new ones. **Any pre-existing test that breaks here is a real regression** — `getCurrentUser` is the choke point for every guard in the app.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/current-user.ts apps/web/tests/auth/current-user-dual.test.ts
git commit -m "feat(auth): getCurrentUser accepts a Supabase or Clerk session"
```

---

### Task 3.2: Middleware — refresh Supabase cookies, keep Clerk protection

**Files:** Modify `apps/web/src/middleware.ts`

- [ ] **Step 1: Wrap the existing handler**

Keep the superadmin bypass and the public matcher **exactly as they are**. Add the Supabase refresh before the Clerk decision, and treat a Supabase session as authenticated:

```ts
import { updateSession } from "@/lib/supabase/auth-middleware";

export default clerkMiddleware(async (auth, request) => {
  const { pathname } = request.nextUrl;

  // Superadmin routes bypass BOTH providers — unchanged.
  if (pathname.startsWith("/superadmin") || pathname.startsWith("/api/superadmin")) {
    /* ...existing block, untouched... */
  }

  // Refresh the Supabase session cookie on every request, before any auth
  // decision — an expired access token with a valid refresh token would
  // otherwise look signed out.
  const { response, userId: supabaseUserId } = await updateSession(request);

  const clerkUserId = auth().userId;
  const signedIn = Boolean(supabaseUserId || clerkUserId);

  if (signedIn && (pathname === "/" || pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up"))) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Only fall back to Clerk's redirect when there is no Supabase session.
  if (!isPublicRoute(request) && !supabaseUserId) {
    auth().protect();
  }

  return response;
});
```

- [ ] **Step 2: Verify the public matcher is unchanged**

`git diff apps/web/src/middleware.ts` must show **no change** to `isPublicRoute`. `/api/cron(.*)`, `/iclock(.*)` and `/api/webhooks(.*)` are load-bearing — cron silently 404'd for weeks once before this exemption existed.

- [ ] **Step 3: Manual verification on a preview deploy**

1. Signed out → `/dashboard` redirects to `/sign-in` ✅
2. Signed in with Clerk → `/dashboard` loads ✅
3. `/api/cron/doc-reminders` with the wrong bearer → 401 from the handler, **not** a sign-in redirect ✅
4. `/iclock/cdata?SN=...` reachable without auth ✅
5. `/superadmin` still gated by its own cookie ✅

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/middleware.ts
git commit -m "feat(auth): refresh Supabase session in middleware, keep Clerk protection"
```

---

### Task 3.3: Mobile BFF — accept either Bearer token (25 routes)

**Files:**
- Create: `apps/web/src/lib/mobile/require-mobile-user.ts`
- Modify: all 25 routes under `apps/web/src/app/api/mobile/**`
- Test: `apps/web/tests/auth/require-mobile-user.test.ts`

**Interfaces:** Produces — `requireMobileUserId(request: NextRequest): Promise<string | null>`.

Every one of the 25 routes currently opens with the identical four lines:

```ts
const { userId } = auth();
if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
```

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/tests/auth/require-mobile-user.test.ts
import { it, expect, vi, beforeEach } from "vitest";
const clerkAuth = vi.fn();
const bearerUser = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({ auth: () => clerkAuth() }));
vi.mock("@/lib/supabase/auth-server", () => ({ getSupabaseUserFromBearer: (t: string) => bearerUser(t) }));

import { requireMobileUserId } from "@/lib/mobile/require-mobile-user";

const req = (authz?: string) =>
  ({ headers: new Headers(authz ? { authorization: authz } : {}) }) as never;

beforeEach(() => { clerkAuth.mockReset(); bearerUser.mockReset(); });

it("accepts a Supabase access token", async () => {
  bearerUser.mockResolvedValue({ id: "uuid-1", email: null, phone: null });
  clerkAuth.mockReturnValue({ userId: null });
  expect(await requireMobileUserId(req("Bearer supa-token"))).toBe("uuid-1");
});

it("falls back to the Clerk session when the token is not a Supabase one", async () => {
  bearerUser.mockResolvedValue(null);
  clerkAuth.mockReturnValue({ userId: "user_clerk" });
  expect(await requireMobileUserId(req("Bearer clerk-token"))).toBe("user_clerk");
});

it("returns null when neither verifies", async () => {
  bearerUser.mockResolvedValue(null);
  clerkAuth.mockReturnValue({ userId: null });
  expect(await requireMobileUserId(req("Bearer nonsense"))).toBeNull();
});

it("returns null when there is no Authorization header at all", async () => {
  clerkAuth.mockReturnValue({ userId: null });
  expect(await requireMobileUserId(req())).toBeNull();
});
```

- [ ] **Step 2: Run it, confirm it fails**

```bash
cd apps/web && npx vitest run tests/auth/require-mobile-user.test.ts
```

- [ ] **Step 3: Implement the helper**

```ts
// apps/web/src/lib/mobile/require-mobile-user.ts
import type { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseUserFromBearer } from "@/lib/supabase/auth-server";

/**
 * Mobile BFF auth during the Clerk→Supabase parallel run.
 *
 * Tries the Supabase access token first, then falls back to the Clerk session
 * that clerkMiddleware populated from the same Authorization header. Both must
 * be accepted until every shipped app build has updated — dropping the Clerk
 * branch early locks out every un-updated phone mid-shift.
 *
 * Returns the provider-native user id, or null. Callers pass nothing further
 * down: getCurrentUser() does its own provider resolution.
 */
export async function requireMobileUserId(request: NextRequest): Promise<string | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;

  if (token) {
    const supa = await getSupabaseUserFromBearer(token);
    if (supa) return supa.id;
  }

  const { userId } = auth();
  return userId ?? null;
}
```

- [ ] **Step 4: Apply the same edit to all 25 routes**

In each file under `apps/web/src/app/api/mobile/**`:

```diff
-import { auth } from "@clerk/nextjs/server";
+import { requireMobileUserId } from "@/lib/mobile/require-mobile-user";
...
-  const { userId } = auth();
-  if (!userId) {
+  const userId = await requireMobileUserId(request);
+  if (!userId) {
     return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
   }
```

Routes whose handler signature is `(request: NextRequest, { params })` already have `request`. **Two routes take no `request` parameter** — add it before editing. Find them with:

```bash
grep -rLn "request: NextRequest\|req: NextRequest" apps/web/src/app/api/mobile --include=route.ts
```

- [ ] **Step 5: Verify none were missed**

```bash
grep -rn "@clerk/nextjs/server" apps/web/src/app/api/mobile | wc -l
```

Expected: **0**.

- [ ] **Step 6: Run the suite**

```bash
cd apps/web && npm run test
```

Expected: all green, including the existing mobile BFF route tests.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/mobile/require-mobile-user.ts apps/web/src/app/api/mobile apps/web/tests/auth/require-mobile-user.test.ts
git commit -m "feat(auth): mobile BFF accepts Supabase or Clerk bearer tokens"
```

---

### Task 3.4: Supabase twin of the phone/email provisioner

**Files:**
- Create: `apps/web/src/lib/supabase/provision-user.ts`
- Modify: `apps/web/src/actions/employees.ts`, `apps/web/src/actions/invites.ts`
- Test: `apps/web/tests/auth/provision-user.test.ts`

**Interfaces:** Produces —

```ts
syncEmployeeAuthIdentifiersSupabase(opts: {
  email?: string | null;
  phoneE164?: string | null;
  existingAuthUserId?: string | null;
}): Promise<{ authUserId: string | null; addedPhone: boolean; addedEmail: boolean; created: boolean }>
```

Mirrors the contract of the existing Clerk `syncEmployeeAuthIdentifiers` in `src/lib/clerk/provision-phone-user.ts` — read that file first and match its resolution order (existing link → phone → email → create) and its best-effort throw contract.

- [ ] **Step 1: Write the failing test** covering: creates a user when none exists · reuses an existing user found by phone · attaches a missing email to an existing user · is a no-op when neither identifier is supplied · marks identifiers confirmed so **no OTP is sent by the sync itself** (this last one is essential — a sync that texts every employee would be a live incident).

- [ ] **Step 2: Run it, confirm it fails.**

- [ ] **Step 3: Implement** using `supabaseAdmin.auth.admin.createUser({ email, email_confirm: true, phone, phone_confirm: true })` and `updateUserById` for attaching a missing identifier. Never pass a password.

- [ ] **Step 4: Call it alongside the Clerk sync** in `addEmployee`, `updateEmployee` and `bulkImportEmployees`. During the parallel run **both** run: a new employee must exist in both providers, because their org may be flipped either way. Wrap each in its own try/catch — one provider failing must not block the other, and neither may block the employees-row write (the row is the source of truth).

- [ ] **Step 5: Run the suite and commit.**

```bash
git add apps/web/src/lib/supabase/provision-user.ts apps/web/src/actions/employees.ts apps/web/src/actions/invites.ts apps/web/tests/auth/provision-user.test.ts
git commit -m "feat(auth): provision Supabase identities alongside Clerk during the parallel run"
```

---

### Task 3.5: Replace the `lastSignInAt` capability

**Files:** Modify `apps/web/src/actions/employees.ts` (lines ~74–88), `apps/web/src/actions/invites.ts` (line ~53)

This drives the "invite pending vs signed in" badge. Getting it wrong re-sends invites to active users or hides genuinely pending ones.

- [ ] **Step 1: Write a failing test** asserting that an employee with `auth.users.last_sign_in_at` set is reported as signed-in, and one with null is reported as pending — for both providers.

- [ ] **Step 2: Implement a provider-agnostic reader**

```ts
/**
 * Has this person ever signed in? Checks both providers during the parallel
 * run: a user may have signed in under Clerk before their org was flipped.
 */
async function hasEverSignedIn(employee: { auth_user_id: string | null; clerk_user_id: string | null }) {
  if (employee.auth_user_id) {
    const { data } = await supabaseAdmin.auth.admin.getUserById(employee.auth_user_id);
    if (data.user?.last_sign_in_at) return true;
  }
  // existing Clerk lastSignInAt path, unchanged
  return clerkLastSignInAt(employee.clerk_user_id);
}
```

- [ ] **Step 3: Run tests, commit.**

**Phase 3 gate:** full suite green · deployed to production · **every existing Clerk user still signs in normally** · no user has a Supabase session yet · mobile app unaffected.

---

## Phase 4 — Web sign-in UI

### Task 4.1: `resolveAuthProvider` server action

**Files:**
- Create: `apps/web/src/lib/auth/provider.ts` (pure)
- Create: `apps/web/src/actions/auth.ts`
- Test: `apps/web/tests/auth/provider.test.ts`

**Interfaces:** Produces —

```ts
// lib/auth/provider.ts  (pure, no "use server")
export type AuthProvider = "clerk" | "supabase";
export function pickProvider(input: {
  hasAuthUserId: boolean;
  orgAuthProvider: string | null | undefined;
}): AuthProvider;

// actions/auth.ts  ("use server")
export async function resolveAuthProvider(identifier: string): Promise<{ provider: AuthProvider }>;
```

**Security:** `resolveAuthProvider` is unauthenticated and takes an arbitrary identifier — it is a user-enumeration surface. It must return `"clerk"` (the default) for unknown identifiers rather than erroring, so a caller cannot distinguish "no such user" from "user on Clerk". Rate-limit to 10 calls/minute per IP.

- [ ] **Step 1: Write the failing test for `pickProvider`**

```ts
import { it, expect } from "vitest";
import { pickProvider } from "@/lib/auth/provider";

it("uses supabase only when the user is migrated AND the org is flipped", () => {
  expect(pickProvider({ hasAuthUserId: true, orgAuthProvider: "supabase" })).toBe("supabase");
});
it("stays on clerk when the org has not been flipped", () => {
  expect(pickProvider({ hasAuthUserId: true, orgAuthProvider: "clerk" })).toBe("clerk");
});
it("stays on clerk when the org flag is absent (default)", () => {
  expect(pickProvider({ hasAuthUserId: true, orgAuthProvider: null })).toBe("clerk");
});
it("stays on clerk when the user was never migrated, even if the org is flipped", () => {
  expect(pickProvider({ hasAuthUserId: false, orgAuthProvider: "supabase" })).toBe("clerk");
});
it("defaults unknown identifiers to clerk (no user enumeration)", () => {
  expect(pickProvider({ hasAuthUserId: false, orgAuthProvider: undefined })).toBe("clerk");
});
```

- [ ] **Step 2: Run it, confirm it fails.**

- [ ] **Step 3: Implement**

```ts
// apps/web/src/lib/auth/provider.ts
export type AuthProvider = "clerk" | "supabase";

/**
 * Both conditions must hold to route someone to Supabase:
 *   1. they have been migrated (auth_user_id exists), and
 *   2. their org has been flipped.
 * Anything else — including an unknown identifier — falls back to Clerk, which
 * is both the safe default and prevents user enumeration.
 */
export function pickProvider(input: {
  hasAuthUserId: boolean;
  orgAuthProvider: string | null | undefined;
}): AuthProvider {
  return input.hasAuthUserId && input.orgAuthProvider === "supabase" ? "supabase" : "clerk";
}
```

- [ ] **Step 4: Implement the action** — normalise the identifier (email lowercased, phone via `normalizePhone` from `@/lib/phone`), look up the matching non-terminated `employees` row joined to its organization's `settings`, call `pickProvider`. Return only `{ provider }` — never leak whether the user exists.

- [ ] **Step 5: Run tests and commit.**

---

### Task 4.2: Identifier-first sign-in form

**Files:**
- Create: `apps/web/src/components/auth/sign-in-form.tsx`
- Modify: `apps/web/src/app/(auth)/sign-in/[[...sign-in]]/page.tsx`

The page currently renders a bare `<SignIn afterSignInUrl="/dashboard" />`.

- [ ] **Step 1: Build the three-step client component**

1. **Identify** — one input accepting email or phone → `resolveAuthProvider`
2. **Clerk branch** → render the existing `<SignIn>` unchanged
3. **Supabase branch** → OTP entry (`signInWithOtp` → `verifyOtp`), plus a "use password instead" link when the identifier is an email (D1: passwords were migrated)

Requirements:
- Copy must not say "Clerk" or "Supabase" anywhere. Users see one product.
- The phone path must accept both `9876543210` and `+919876543210` — run it through `normalizePhone`.
- On OTP failure show the provider's message, never a raw error object.
- Preserve `afterSignInUrl="/dashboard"` behaviour: on success, `router.replace("/dashboard")`.

- [ ] **Step 2: Manual verification on a preview deploy**

With **all orgs still on `clerk`**, every real identifier must route to the Clerk branch and sign in exactly as before. This is the whole point of the phase — shipping the router without changing anyone's experience.

- [ ] **Step 3: Commit.**

---

### Task 4.3: Conditional `ClerkProvider` and the sign-out path

**Files:** Modify `apps/web/src/app/layout.tsx`, `apps/web/src/components/layout/sidebar.tsx`

- [ ] **Step 1:** Keep `<ClerkProvider>` mounted for the whole parallel run — removing it breaks every Clerk-authenticated user. Remove it only in Phase 7.

- [ ] **Step 2:** Replace `<UserButton>` in `sidebar.tsx` with a custom menu that works for both providers. It currently hosts the **feedback action** (`<UserButton.Action>`) — that must survive, along with the `Cmd/Ctrl+/` shortcut wired in `report-feedback-trigger.tsx`.

  Sign-out must call **both** `supabase.auth.signOut()` and Clerk's `signOut()`, so a user holding a stale cookie from either provider is fully signed out.

- [ ] **Step 3:** Manually verify the avatar menu, the feedback dialog and sign-out for a Clerk user. Commit.

**Phase 4 gate:** sign-in works identically for every real user (all orgs still `clerk`) · the Supabase branch is reachable only by manually flipping a test org · feedback dialog and sign-out unaffected.

---

## Phase 5 — Mobile

### Task 5.1: Mobile Supabase client

**Files:** Create `apps/mobile/src/lib/supabase.ts`

- [ ] **Step 1: Install** — `cd apps/mobile && npx expo install @supabase/supabase-js react-native-url-polyfill`

  Both are new. `react-native-url-polyfill` is **not** currently a dependency and supabase-js needs it in React Native.

- [ ] **Step 2: Implement.**

  `src/lib/storage.ts` already exists and is feature-detected (it `require()`s MMKV inside a try/catch and degrades). Its actual exports are `createAppStorage(namespace): AppStorage`, `offlineQueueNamespace()` and `wipeNamespaceStorage()` — there is **no** `createMMKVStorageAdapter`. Write a thin adapter over `createAppStorage` to match the shape supabase-js expects (`getItem` / `setItem` / `removeItem`, all async).

  **Never** statically import `react-native-mmkv` here — a dev build made before the install lacks the module and a static import crashes the bundle at eval time (CLAUDE.md mobile gotcha). Going through `createAppStorage` gets that protection for free.

```ts
// apps/mobile/src/lib/supabase.ts
import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import { createAppStorage } from "@/lib/storage";

// createAppStorage is feature-detected and degrades to in-memory when MMKV is
// absent (Expo Go, or a dev build predating the install). Supabase wants an
// async KV interface; AppStorage is sync, so wrap it.
const store = createAppStorage("supabase-auth");

const storage = {
  getItem: async (key: string) => store.getString(key) ?? null,
  setItem: async (key: string, value: string) => { store.set(key, value); },
  removeItem: async (key: string) => { store.delete(key); },
};

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // no URL-based sessions in a native app
    },
  }
);
```

  **Before writing this, open `src/lib/storage.ts` and confirm the `AppStorage` method names** (`getString` / `set` / `delete` above are the MMKV-style names — match whatever the type actually declares). If they differ, adapt the wrapper, not the storage module.

  **A degraded session store means sign-in does not persist across app restarts.** That is acceptable in Expo Go but not in a release build — verify MMKV is present in the build used for the Task 5.3 device pass.

- [ ] **Step 3:** Add `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` to `apps/mobile/.env` **and to the EAS environment store** — standalone builds do not read the local `.env` (known EAS gotcha). Document the var **names** in `apps/mobile/README.md`; never commit values.

- [ ] **Step 4:** Run `npx expo start --clear` (required after any config change — Metro's transform cache serves stale resolutions). Commit.

---

### Task 5.2: Swap the mobile auth surface

**Files:** Modify `apps/mobile/src/lib/{api,session,query,push}.ts`, `src/app/_layout.tsx`, `src/app/index.tsx`, `src/app/(tabs)/more.tsx`, `src/app/(auth)/sign-in.tsx`, `src/app/(auth)/_layout.tsx`, `src/app/(tabs)/_layout.tsx`, `src/components/home-screen.tsx`

Mapping:

| Clerk | Supabase |
|---|---|
| `useAuth().getToken()` | `(await supabase.auth.getSession()).data.session?.access_token` |
| `useAuth().isSignedIn` | session presence from `onAuthStateChange` |
| `useAuth().userId` | `session.user.id` |
| `useAuth().signOut()` | `supabase.auth.signOut()` |
| `getClerkInstance().session?.getToken()` (outside React, `push.ts`) | `supabase.auth.getSession()` — already usable outside React |
| `useSignIn()` (`sign-in.tsx`) | `signInWithOtp` + `verifyOtp` |

- [ ] **Step 1: Add a `useAuthSession()` hook** wrapping `supabase.auth.onAuthStateChange`, exposing `{ isLoaded, isSignedIn, userId, accessToken }` — the same shape the screens already consume, so the diffs stay small.

- [ ] **Step 2: `lib/query.tsx`** — the on-disk cache namespace is keyed by user id. Keep that invariant: swap the Clerk `userId` for the Supabase one.

  **Verify the cache is wiped on sign-out** — `src/lib/storage.ts` already exports `wipeNamespaceStorage(identityNamespace)` for exactly this, and `offlineQueueNamespace()` derives the queue's namespace from the identity one. Both must be wiped, or the next user on a shared device sees the previous user's cached payslips **and** inherits their unsent punch queue.

  This is a data-leak risk on shared factory/site phones, not a cosmetic one. Write a test asserting that a sign-out followed by a different user's sign-in yields an empty cache.

- [ ] **Step 3: `lib/session.tsx`** — the `isSignedIn === false` effect calls `unregisterPush()`. Preserve that ordering exactly; it runs after teardown by design.

- [ ] **Step 4: `sign-in.tsx`** — rebuild for `signInWithOtp` (email code and phone OTP). Keep the existing error-message mapping behaviour; rename `clerkMessage()` → `authMessage()`.

- [ ] **Step 5:** `npx expo start --clear`, verify in Expo Go / dev build, commit.

---

### Task 5.3: Build and device pass

- [ ] **Step 1:** `eas build --platform android --profile preview`

- [ ] **Step 2:** After the build, run `git diff apps/mobile/app.json` — **EAS rewrites `app.json` whenever a build profile declares a channel**, duplicating privacy entries and hardcoding absolute paths. This has already caused one incident (PR #34). Revert any auto-configuration damage before committing.

- [ ] **Step 3: Device pass on a real Android phone**, both providers:
  1. Sign in with a **Clerk** account (org not flipped) → clock in → payslips → approvals
  2. Sign in with a **Supabase** account (test org flipped) → same flows
  3. Sign out, sign in as a different user → confirm no cached data from the first user
  4. Push notification arrives on the correct channel ("Approvals" / "Updates", not "Miscellaneous")

- [ ] **Step 4:** Repeat on iOS once the build lands.

- [ ] **Step 5:** Commit and record the pass in the runbook.

**Phase 5 gate:** one build authenticates against **both** providers · no cross-user cache leakage · push works · `app.json` unmodified by EAS.

---

## Phase 6 — Staged rollout

Flip one org at a time. **Each step is a separate day.** Nothing here is a code change; every action is a SQL flag flip plus observation.

- [ ] **Step 1: TestOrg** (3 employees) — flip, sign in as each, exercise attendance/leave/payslips. Leave it for 24h.

- [ ] **Step 2: PlayPause Studios** (39 active, 1 phone-only) — mostly email users, so it exercises the email path at scale with a low phone-only blast radius.

- [ ] **Step 3: Medialoop Communications** (20 active, 0 phone-only) — pure email cohort.

- [ ] **Step 4: TMP Boat Club** (22 active, **16 phone-only**) — the first real phone-OTP load. Flip **the evening before a working day**, not mid-shift. Watch the MSG91 delivery report during the morning punch window.

- [ ] **Step 5: TMP Wagholi** (27 active, **26 phone-only**) — the largest phone-only cohort. Only after Boat Club has run clean for a full working day.

- [ ] **Step 6: Remaining single-employee orgs** (Sakura Inc, JambaOne, The Man Project).

**For each org, before flipping:**

```sql
-- every active employee must be migrated first
SELECT count(*) FILTER (WHERE auth_user_id IS NULL) AS unmigrated
FROM employees WHERE org_id = '<org>' AND status <> 'terminated';
-- must be 0
```

**For each org, after flipping:** confirm at least one real sign-in of each identity shape present in that org before moving on. **If anything fails, flip back immediately** — diagnosis comes after the rollback, never before.

---

## Phase 7 — Decommission Clerk

Do not start until **30 days** after the last org flip, with no Clerk sign-ins observed.

- [ ] **Step 1:** Confirm zero Clerk activity — Clerk Dashboard → Users → sort by last sign-in.
- [ ] **Step 2:** Set `MOBILE_MIN_VERSION` to the Supabase build, forcing any remaining old clients to update. Wait a week.
- [ ] **Step 3:** Remove the Clerk branch from `requireMobileUserId`, `resolveAuthIdentity` and `middleware.ts`.
- [ ] **Step 4:** Delete `lib/clerk/`, `app/api/webhooks/clerk/`, `app/api/webhooks/clerk-sms/`, the `(auth)` Clerk pages, and `@clerk/*` from both `package.json` files.
- [ ] **Step 5:** Migration `110`: drop `employees.clerk_user_id` and the vestigial `organizations.clerk_org_id`. **Take a snapshot first** — this is the point of no return.
- [ ] **Step 6:** Optionally rename `getCurrentUser().clerkUserId` → `authUserId` across the 51 call sites, as a single mechanical commit.
- [ ] **Step 7:** Remove `CLERK_*` env vars from Vercel. **Cancel the Clerk subscription.**
- [ ] **Step 8:** Update `CLAUDE.md` — the Authentication section, the mobile BFF section, and gotchas referencing Clerk.

---

## Self-Review

Run through this before starting implementation.

**Spec coverage** — every decision in §1 maps to tasks: D1 passwords → 2.3 + 4.2 · D2 parallel run → 3.1, 4.1, Phase 6 · D3 RLS deferred → stated in Global Constraints, no task touches the service-role client · D4 mobile dual-accept → 3.3, 5.2, 7.2.

**Inventory coverage** — every item in §2.3 has a task: core auth (3.1, 3.2) · auth UI (4.2, 4.3) · 25 BFF routes (3.3) · 11 actions (3.4, 3.5, and the rest need no change because they consume `getCurrentUser()`) · `clerk_user_id` references (unchanged during parallel run; removed in 7.5).

**Known gaps, deliberately deferred:**
- `app/api/webhooks/clerk/route.ts` (`user.updated` name/avatar sync) has no Supabase equivalent — avatars are self-uploaded since PR #13/#14 and names come from our own UI, so it is retired in 7.4 rather than replaced.
- Ownership-transfer claim actions (`actions/ownership.ts`) identify by `auth()` email/phone. They work unchanged under dual-accept because `getCurrentUser()` resolves either provider, but **re-verify the claim flow manually during Phase 6** — it is the one path that matches on identifiers rather than user id.
- `actions/objectives.ts`, `referrals.ts`, `reviews.ts` reference `clerk_user_id` but only as a passthrough from `getCurrentUser()`. No task needed; verify with a grep in 7.5.

**Type consistency** — `AuthUser` (1.4) is consumed by 3.1 and 3.3 · `AuthIdentity.column` (3.1) is used in the `.eq()` and both `.update()` calls · `requireMobileUserId` (3.3) returns `string | null`, matching the `if (!userId)` guard the 25 routes already have · `pickProvider` (4.1) is called only by `resolveAuthProvider`.

---

## Execution Handoff

**Plan complete.** Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task with review between tasks. Best fit here: tasks are well-isolated and several are mechanical.
2. **Inline Execution** — batch execution with checkpoints via `superpowers:executing-plans`.

Whichever is chosen, **Phase gates are mandatory stopping points.** Do not carry a failing gate into the next phase.
