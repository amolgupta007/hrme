# Phone + OTP Authentication for Email-less Employees — Design Spec

**Date:** 2026-06-16
**Status:** Approved (brainstorm) — pending spec review
**Scope:** Phase 1 (auth + provisioning + login + linking). WhatsApp notification parity is a separate Phase 2 spec.

---

## 1. Problem

JambaHR authentication is built entirely around email. Field / frontline / blue-collar
staff often have **no email address**, so they cannot be onboarded or sign in today.
We need these employees to be created, joined to their org, and able to log in using
**phone number + SMS OTP**, while the existing email-based flows stay completely intact.

## 2. Locked decisions (from brainstorm)

| Decision | Choice |
|----------|--------|
| Who needs phone auth | Employees **without email** (field/frontline cohort) |
| App notifications for phone-only staff | Reuse the WhatsApp pipeline — **deferred to Phase 2** |
| Login OTP channel | **Clerk built-in SMS OTP** (org completes India TRAI/DLT registration, absorbs per-SMS cost) |
| Provisioning model | **Approach A** (admin-provisioned Clerk users via Backend API), packaged as **Hybrid C** (existing email path untouched) |
| Phone edits for phone-only staff | **Admin-only** (phone is the login credential) |
| Phasing | This spec = Phase 1 only. Email notifications are **skipped** for phone-only employees in Phase 1; in-app works. |

## 3. Why email is load-bearing today (context)

- `employees.email` is `NOT NULL` with `UNIQUE(org_id, email)` — it is the natural identity key.
- Account linking is 100% email-based:
  - Clerk webhook `organizationMembership.created` links `clerk_user_id` to an employee by **matching email**.
  - `getCurrentUser()` fallback matches by **email** and back-fills `clerk_user_id`; otherwise it defaults the user to `admin`.
- Onboarding uses **Clerk Organization Invitations**, which Clerk supports **by email only** — there is no phone-invite primitive.
- All transactional notifications go through Resend (email): leave approvals, payslips, doc reminders, onboarding nudges.

## 4. Approach (selected)

**Approach A — admin-provisioned Clerk users via Backend API**, packaged as the **Hybrid (C)**:
the existing email invitation flow is untouched; phone-only is a clean, additive path.

Approach B (self-signup + phone-match webhook linking) was rejected: Clerk org-join requires
an email-only invitation, so a self-signed-up phone user belongs to no org and would still need
Backend-API membership creation — strictly worse, with added race conditions.

## 5. Design

### 5.1 Data model

`employees` table changes (new idempotent migration via Supabase SQL Editor / MCP):
- Drop `NOT NULL` on `email`. Existing `UNIQUE(org_id, email)` stays valid — Postgres treats
  multiple `NULL`s as distinct, so many phone-only rows coexist.
- Add partial unique index: `CREATE UNIQUE INDEX ... ON employees (org_id, phone) WHERE phone IS NOT NULL`.
- Add `CHECK (email IS NOT NULL OR phone IS NOT NULL)` — every row must have at least one identity.
- Phone stored normalized to **E.164** (`+91XXXXXXXXXX`).

New helper `src/lib/phone.ts`:
- `normalizePhone(raw): string | null` — to E.164, India default country code, returns null on invalid.
- `isValidPhone(raw): boolean`.
- Used by `addEmployee`, CSV import, profile, webhook match, and `getCurrentUser`.

**Identity rule:** email employees link to Clerk by email (unchanged); phone-only employees link
by phone. `clerk_user_id` is the post-link source of truth for both.

### 5.2 Provisioning flow

`addEmployee` forks on "has email?":
- **Has email** → existing flow, untouched (Clerk org invitation by email; `sendInvite`).
- **Phone only** → server-side provisioning against Clerk Backend API:
  1. `users.getUserList({ phoneNumber: [e164] })` — reuse if the user already exists (multi-org case);
     else `users.createUser({ phoneNumber: [e164], skipPasswordRequirement: true })`.
  2. `organizations.createOrganizationMembership({ organizationId, userId, role })`
     (role mapping mirrors `sendInvite`: admin/owner → `org:admin`, else `org:member`).
  3. Write `clerk_user_id` onto the employee row **synchronously** — deterministic link, no webhook race.

Zod schema: `email` becomes optional; refine to require `email` **or** a valid phone.

CSV importer (`bulkImportEmployees`) gets the same fork: a row is valid with email **or** a valid
phone; phone-only rows run the provisioning path.

### 5.3 Login & Clerk config

- Clerk Dashboard: enable **Phone number** as an identifier and **SMS OTP**; keep email enabled.
  Complete TRAI/DLT registration on Clerk's SMS sender (operational task, not code).
- `<SignIn>` / `<SignUp>` components need **no code change** — the phone field and OTP step render
  automatically. Optional: helper copy ("No email? Sign in with your phone number.").

### 5.4 Linking safety nets

- **Clerk webhook** `organizationMembership.created`: add a phone-match fallback alongside the
  email match (`employees.phone = public_user_data.phone_number`, normalized). Redundant after
  synchronous provisioning, but defensive.
- **`getCurrentUser()` fallback**: add a phone-match branch mirroring the email-match branch — match
  the Clerk user's phone to `employees.phone`, back-fill `clerk_user_id`. Guarantees a phone-only
  user never falls through to the `admin` default.

### 5.5 Impact surface (Phase 1 changes)

**Hard forks (email-or-phone):**
- `addEmployee` Zod + insert + provisioning branch.
- CSV importer validation + provisioning branch.
- Employees-list "Send invite" UI: phone-only rows are provisioned-active at creation → show
  **"Active" / "Phone login"**, not "Send invite". `sendInvite` / `resendInvite` early-return for
  phone-only employees.

**Guard-and-skip (null-email safety):**
- Every Resend sender that reads `employee.email` — leave request/status, payslip email,
  doc-reminder cron, onboarding-nudge cron — guarded with `if (!email) → skip` (Phase 2: WhatsApp).
  No crashes on null email.

**Display / edit:**
- Directory + profile show phone when email is absent.
- Phone edits for phone-only staff are **admin-only** (re-syncs the Clerk identity). Employees may
  optionally *add* an email later but cannot change their own login phone.
- Terminate flow revokes Clerk org membership for phone-only employees the same way the email path does.

**TS/runtime sweep:** `employees.email` is typed non-null in many reads; implementation includes a
pass to make those null-safe.

### 5.6 Notifications (phasing)

The current WhatsApp pipeline is late-policy-specific (3 approved templates + a module-bound
dispatcher). Generalising it requires new Meta-approved Utility templates per event + a generalised
dispatcher — gated on Meta-approval lead time.

- **Phase 1 (this spec):** phone-only employees fully log in and use the portal; email notifications
  are skipped for them. No login work blocked on template approvals.
- **Phase 2 (separate spec):** generalise the WhatsApp dispatcher beyond late-policy; add approved
  templates for critical events (leave status, payslip ready); wire opt-in. Honors the
  "reuse WhatsApp pipeline" decision, decoupled from auth.

### 5.7 Edge cases

- **Phone already a Clerk user** (employed at 2 orgs) → reuse the user, add a second org membership;
  one Clerk login spans both orgs via the org switcher.
- **Phone-only employee later gets an email** → admin adds it to the row; phone stays the login.
- **Duplicate phone in org** → blocked by the partial unique index.
- **Owner/admin self-signup phone-only** → out of scope; org creators keep email.

## 6. Testing

- Unit: `normalizePhone`/`isValidPhone`; email-or-phone Zod refinement; CHECK constraint behavior.
- Provisioning: mocked Clerk Backend API (`getUserList`, `createUser`, `createOrganizationMembership`)
  asserting synchronous `clerk_user_id` link and the reuse-existing-user path.
- `getCurrentUser()` phone-match fallback; webhook phone-match fallback.
- Migration idempotency.
- Manual e2e against a Clerk dev instance with a real test phone (provision → SMS OTP → dashboard,
  correct role + org).

## 7. Out of scope (Phase 1)

- WhatsApp/SMS app-notification delivery for phone-only employees (Phase 2).
- Phone-only org creation / owner signup.
- Employee self-service login-phone changes.
- Cross-identity dedup (same person as both an email row and a phone row).

## 8. Operational prerequisites (org / founder tasks, not code)

- Enable Phone identifier + SMS OTP in the Clerk Dashboard.
- Complete TRAI/DLT registration for Clerk's SMS sender; accept Clerk SMS cost.
