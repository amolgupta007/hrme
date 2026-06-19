# Transfer Ownership — Design Spec

**Date:** 2026-06-19
**Module:** Auth / multi-tenancy (Settings, org membership)
**Status:** Approved design, pending implementation plan

---

## 1. Goal

Let a self-serve signup set up an org and **onboard the real owner later**. Today the
person who creates an org is permanently its owner (`createOrganization` hardcodes
`role: "owner"`; `employeeSchema` excludes `owner`; no transfer path exists). This adds a
**"Transfer ownership"** capability in Settings: the current owner invites a new owner by
email/phone; the invitee accepts (with legal acceptance) and becomes owner while the
initiator is demoted to `admin`.

## 2. Locked decisions

| Decision | Choice |
|----------|--------|
| Who uses it | **Self-serve** — any org owner, from Settings. Not a separate reseller/internal role. |
| Transfer target | **Invite a new person** by email/phone (also works if they're already a member). |
| Outgoing owner | **Demote to admin** on successful handoff (stays in org; new owner can remove later). |
| Handoff model | **Pending transfer + explicit claim with legal acceptance** (Approach A). Initiator keeps ownership until the invitee accepts. |
| Initiator | **Owner only** (new `isOwner` helper). |

**Out of scope (YAGNI):** co-owners / multiple owners, "billing owner" partial role, bulk
transfers, reseller/partner account tier, internal/superadmin concierge provisioning.

## 3. Data model

New table `ownership_transfers` (migration `069_ownership_transfers.sql`):

| Column | Type / notes |
|--------|--------------|
| `id` | uuid pk default gen_random_uuid() |
| `org_id` | uuid FK → organizations, not null |
| `from_employee_id` | uuid FK → employees (initiating owner), not null |
| `to_employee_id` | uuid FK → employees (placeholder/existing row for invitee), not null |
| `to_email` | text, nullable |
| `to_phone` | text, nullable (CHECK: at least one of email/phone present) |
| `token` | text UNIQUE not null (32-byte base64url) |
| `status` | text CHECK in (`pending`,`accepted`,`cancelled`,`expired`), default `pending` |
| `expires_at` | timestamptz, default now() + interval '14 days' |
| `created_at` | timestamptz default now() |
| `responded_at` | timestamptz nullable |

- **Partial unique index** `UNIQUE (org_id) WHERE status='pending'` — at most one pending
  transfer per org.
- Index on `token`.
- RLS enabled (advisory; service-role bypasses — repo gotcha #5), Clerk-JWT policy pattern
  matching `018_payroll_schema_capture.sql`.
- **No changes to `employees` / `organizations` schema.** The new owner is a normal
  `employees` row (role `admin` until acceptance flips it to `owner`); legal acceptance
  reuses `organizations.terms_accepted_at` + `policy_version_accepted`.

## 4. Components

```
src/actions/ownership.ts          # "use server": initiate / cancel / resend / get / accept / decline
src/lib/ownership/transitions.ts  # pure guards: canAccept, canCancel, identityMatches, isExpired
src/components/settings/transfer-ownership-section.tsx   # Settings UI (owner-only)
src/components/emails/ownership-transfer.tsx             # claim email (OwnershipTransferEmail)
src/components/emails/ownership-transferred.tsx          # notify outgoing owner on accept
src/app/transfer/[token]/page.tsx + claim client         # authed claim/accept page
src/app/api/cron/ownership-transfer-expiry/route.ts      # daily expiry sweep
supabase/migrations/069_ownership_transfers.sql
src/types/index.ts                # add isOwner(role)
```

Pure transition/identity logic lives in `src/lib/ownership/transitions.ts` (no I/O) so it's
unit-testable; the `"use server"` actions orchestrate DB + email.

## 5. Flows

### 5.1 Initiate (Settings)
- New `CollapsibleSection` "Transfer ownership" in `settings-content.tsx`, rendered only when
  `isOwner(user.role)`.
- Form: new owner **email or phone** (one required) + optional name → `initiateOwnershipTransfer({ email?, phone?, name? })`.
- Action (owner-guarded):
  1. Reject if a `pending` transfer already exists for the org.
  2. Reject **self-transfer** (target email/phone == caller's).
  3. If email/phone already belongs to an **active member**, reuse that `employees` row as
     `to_employee_id`; else create a placeholder `employees` row (role `admin`,
     `status active`, `clerk_user_id null`).
  4. Insert `ownership_transfers` (fresh token, `expires_at = now()+14d`).
  5. Send `OwnershipTransferEmail` (from `NOREPLY_EMAIL`, reply-to `FROM_EMAIL`) linking to
     `/transfer/[token]`. Best-effort (failure doesn't roll back; resend available).
- **Initiator's role is unchanged** at this step.

### 5.2 Pending state + cancel/resend
- Section shows: "Ownership transfer to *<email>* — awaiting acceptance (expires in N days)"
  with **Resend** and **Cancel**.
- `cancelOwnershipTransfer()` (owner-only): `status='cancelled'`, `responded_at=now`. If the
  placeholder row was created *for this transfer* and is still unlinked
  (`clerk_user_id null`, role `admin`, no other dependents), delete it; if it was a
  pre-existing member, leave it.
- `resendInviteForTransfer()` re-sends the claim email (does not regenerate token).
- Cron `/api/cron/ownership-transfer-expiry` (daily, `Bearer CRON_SECRET`): flip `pending`
  rows past `expires_at` → `expired`, same placeholder cleanup as cancel. Registered in
  `vercel.json`.

### 5.3 Claim & accept
- Email link → `/transfer/[token]`. Authed page (middleware redirects unauth → sign-in/up
  with the invited email/phone → `getCurrentUser` auto-links `clerk_user_id` onto the
  placeholder row → invitee becomes an `admin` member).
- `getOwnershipTransfer(token)` validates: token exists, `status='pending'`, not expired,
  **caller's email/phone matches `to_email`/`to_phone`**. Renders org name, initiator, and a
  **T&C + Privacy acceptance checkbox** (`LATEST_POLICY_VERSION`) with **Accept** / **Decline**.
- `acceptOwnershipTransfer(token, { acceptedAt })` — atomic:
  1. invitee `employees.role` → `owner`.
  2. The org's **current** owner `employees.role` → `admin` (re-read current owner by
     `org_id + role='owner'`, not just `from_employee_id`, to stay correct if it changed).
  3. `organizations.terms_accepted_at = now`, `policy_version_accepted = LATEST_POLICY_VERSION`.
  4. `ownership_transfers.status='accepted'`, `responded_at=now`.
  5. Email outgoing owner (`OwnershipTransferredEmail`). Redirect → dashboard.
- `declineOwnershipTransfer(token)` → `status='cancelled'` + placeholder cleanup + notify
  outgoing owner.

## 6. Permissions & guards

| Action | Who |
|--------|-----|
| initiate / cancel / resend | **owner** of the org (`isOwner`) |
| accept / decline | **only the matched invitee** (email/phone == `to_*`) |

- `isOwner(role)` added to `src/types/index.ts` (`role === "owner"`).
- **Initiate / cancel / resend** use `getCurrentUser()` (active-org aware) + `isOwner`.
- **Claim actions** (`getOwnershipTransfer` / `acceptOwnershipTransfer` / `declineOwnershipTransfer`)
  resolve the caller from **Clerk identity** (`auth().userId` → email/phone) and the org from the
  **transfer token** — they deliberately do NOT use the active-org cookie / `getCurrentUser().orgId`,
  so the invitee's other org memberships can't interfere or mis-scope the accept.
- All actions use `createAdminSupabase()`.
- Self-transfer blocked. Token reuse / accepted / expired → claim page shows "no longer valid".
- If the initiating owner is terminated before acceptance, accept re-reads the org's current
  owner (step 5.3.2) and demotes whoever currently holds `owner`; if none, the invitee simply
  becomes owner.

## 7. Edge cases

- **Already a member:** transfer target reuses their row; on accept they go `admin`/`manager`/`employee` → `owner`.
- **Invitee owns other orgs:** fine — role is per-org (one login, many memberships).
- **Two pending transfers:** prevented by the partial unique index + the action's pre-check.
- **Exactly one owner invariant:** acceptance demotes the current owner in the same batch, so
  the org always ends with one owner.

## 8. Testing

- **Pure (`src/lib/ownership/transitions.ts`)** — vitest: `canAccept`/`canCancel` status
  guards, `identityMatches(callerEmail/phone, transfer)`, `isExpired(transfer, now)`.
- **Action-level** — initiate rejects double-pending + self-transfer; accept flips both roles
  + stamps legal version; cancel/decline cleans up a placeholder but not an existing member.

## 9. Reuse / integration

Reuses: `employee_invites` auto-link-on-sign-in pattern (`getCurrentUser`), `AccountSetupEmail`
sender conventions (`NOREPLY_EMAIL`/`FROM_EMAIL`), `CollapsibleSection` settings pattern,
`LATEST_POLICY_VERSION` (`src/config/legal.ts`), the `loi-expiry` cron pattern, and the
service-role action pattern. New surface is deliberately small and isolated under
`src/*/ownership*`.

## 10. References

- `src/actions/organizations.ts` (`createOrganization` — owner seeding + legal columns)
- `src/actions/invites.ts` (`sendInvite` — `employee_invites` token + `AccountSetupEmail`)
- `src/lib/employees/employee-schema.ts` (role enum, currently excludes `owner`)
- `src/types/index.ts` (`UserRole`, `ROLE_HIERARCHY`, `isAdmin` — add `isOwner`)
- `src/lib/current-user.ts` (`getCurrentUser`, active-org + auto-link)
- `src/app/loi/[token]/page.tsx` + `src/app/api/cron/loi-expiry/route.ts` (claim-page + expiry-cron precedents)
