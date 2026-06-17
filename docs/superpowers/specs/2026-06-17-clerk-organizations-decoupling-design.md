# Decouple from Clerk Organizations (Option 0) — Design Spec

**Date:** 2026-06-17
**Status:** Approved (brainstorm) — pending spec review
**Driver:** Clerk Organizations pricing trajectory — per-org membership is capped at 20 and the next tier is an ~$85/100-member add-on that scales worse beyond. For an HR SaaS where every customer is an org with many members, this pricing is structurally misaligned. The block surfaced as `organization membership quota exceeded` (2 members / 20 cap) when provisioning a phone-only employee.

---

## 1. Goal

Stop using **Clerk Organizations** while **keeping Clerk as the user identity provider** (sign-in, sessions, email auth, phone+OTP). Multi-tenancy moves entirely to the existing `organizations` + `employees` tables — which already are the real source of truth — so org membership has **no external quota, ever**. Architecture is **multi-org-ready**: one login can belong to several orgs and switch between them via a top-left dropdown; an existing user can create additional orgs from the UI.

## 2. Why this is the right cut (context)

- Clerk is wired across **25 files / ~97 auth call sites**, but almost everything funnels through `getCurrentUser()` / `getOrgIds()` in `src/lib/current-user.ts` — the single chokepoint we change.
- The app does **not** use Clerk→Supabase RLS (service-role bypass, CLAUDE.md gotcha #5), so there's no JWT/RLS coupling to redo.
- The pain is specifically **Clerk Organizations**, not Clerk auth. Removing the Organizations layer kills the quota at ~10% of the cost/risk of a full auth-provider migration, and requires **no user re-authentication**.

## 3. Locked decisions (from brainstorm)

| Decision | Choice |
|----------|--------|
| Keep Clerk for | user identity, sessions, sign-in/up UI, `<UserButton>`, email auth, **phone+OTP** |
| Drop from Clerk | Organizations: orgs, memberships, org roles, org invitations, org webhooks |
| Org membership source of truth | the `employees` table (a row linking `clerk_user_id` → `org_id` + `role`) |
| Multi-org per user | **Yes** — one login → many `employees` rows across orgs |
| Active-org store | **Signed cookie `active_org_id`** (default to first membership; cookie is a hint, `employees` is authority) |
| Switcher scope | **Full** — top-left dropdown to switch + "Create organization" flow |
| Invitations | our own Resend email + the existing email/phone auto-link in `getCurrentUser`; drop Clerk invitations |
| Schema migration | **none** — reuse `organizations` + `employees`; `clerk_org_id` becomes vestigial |

## 4. Design

### 4.1 Org resolution model (the core change)

`getCurrentUser()` is rewritten to resolve the org from the `employees` table instead of Clerk's session `orgId`:

1. List **all** `employees` rows for the caller's `clerk_user_id`, joined to `organizations` (id, name, plan, settings, custom_features).
2. **Active org** = the org named by the `active_org_id` cookie **iff** the caller has a membership in it; otherwise the **first** membership ordered by `employees.created_at ASC` (deterministic), and set the cookie to it.
3. Return the same `UserContext` shape as today (`orgId, orgName, role, employeeId, plan, *Enabled flags, ...`) so the ~97 downstream consumers are unchanged.
4. New: `getMyOrgs()` → the caller's full membership list (`{ orgId, name, role }[]`) for the switcher. `switchActiveOrg(orgId)` → validates membership, sets the cookie, returns success.

`auth().orgId` is no longer read anywhere. `organizations.clerk_org_id` is kept but unused. Clerk still supplies `userId` + sessions.

The email/phone auto-link already in `getCurrentUser` (backfills `clerk_user_id` onto an `employees` row matched by email or phone) is **retained** — it is now the mechanism by which an invited user "joins" an org on first sign-in.

### 4.2 Org creation (onboarding + create-additional-org)

A single server action `createOrganization({ name })`:
1. Insert `organizations` row (`plan='starter'`, `max_employees=10`, `settings` with `onboarding_steps`).
2. Insert the caller's `employees` row as `role='owner'`, linked to `clerk_user_id` + email/phone (from the Clerk user).
3. Seed default leave policies + holidays (logic moved out of the deleted `organization.created` webhook).
4. Set `active_org_id` cookie to the new org.

- **Onboarding** (`/onboarding`): a signed-in user with **zero** memberships enters a company name → `createOrganization` → dashboard. Replaces the client-side Clerk `createOrganization()`.
- **Create new org**: existing user uses "Create organization" in the switcher → same action → new membership, switches to it.

### 4.3 Invitations

- Admin adds an employee (row with email/phone, no `clerk_user_id`) — unchanged.
- We send our **own Resend email** ("set up your account at jambahr.com" + sign-in link). Phone-only employees are provisioned directly (see 4.5) and sign in by OTP.
- On the invitee's first Clerk sign-in with the matching email/phone, `getCurrentUser`'s auto-link fills `clerk_user_id` → they're a member. Inviting an existing user to a 2nd org makes that org appear in their switcher on next load.
- `employee_invites` table retained for sent/accepted tracking (accepted = `clerk_user_id` linked). All `createOrganizationInvitation` / revocation calls removed.
- The "Send invite" button triggers the Resend email, not Clerk.

### 4.4 Switcher dropdown

A client component (top-left of the dashboard chrome) showing the active org name + a dropdown of `getMyOrgs()` + a "Create organization" entry. Selecting an org → `switchActiveOrg(orgId)` → sets cookie → `router.refresh()` (or full reload) so server components re-resolve under the new active org.

### 4.5 Phone provisioning (fixes the Sakshi blocker)

`provisionPhoneOnlyUser` becomes **`createUser({ phoneNumber, skipPasswordRequirement })` only** — the `createOrganizationMembership` step (and the membership-cap auto-heal) are removed. Membership is the `employees` row. The phone user's `clerk_user_id` is linked to the employee row synchronously (as today). With no membership call, the `organization membership quota exceeded` error cannot occur.

### 4.6 Clerk integration teardown

- **Remove:** client `createOrganization` (onboarding), `createOrganizationMembership`, all `createOrganizationInvitation` (invites.ts, employees.ts, hire.ts) + revocation, `organization.created` + `organizationMembership.created` webhook cases, the `ORG_MEMBERSHIP_CAP` heal.
- **Keep:** `clerkMiddleware` (sessions/route protection), `<SignIn>`/`<SignUp>`/`<UserButton>`, `auth()` for `userId`, `clerkClient.users.*` (createUser / getUser / updateUser), phone OTP. Keep `user.updated` webhook (name/avatar sync); `user.created` becomes a harmless log.
- **Onboarding redirect:** the dashboard layout (server component, already calls `getCurrentUser`) routes a signed-in user with zero memberships to `/onboarding`. (Middleware stays auth-only — it doesn't query the DB.)

### 4.7 Security

`switchActiveOrg` and `getCurrentUser` **always** re-validate the cookie's org against actual `employees` membership before honoring it. The cookie is only a hint; the `employees` table is the authority — so a tampered cookie cannot reach an org the user isn't a member of. The cookie is `httpOnly`, `secure`, `sameSite=lax`.

## 5. Cutover & existing data

No schema migration. At cutover:
- **2 active users** → keep working with no disruption (`clerk_user_id → employees` resolves; cookie defaults to their single org). No re-auth.
- **~25–30 pending** → their `employees` rows already exist; orphaned Clerk org-invitations stop mattering. Re-send our own Resend invites (one-time backfill action); each auto-links on first sign-in.
- **Sakshi** → re-run "Activate phone login"; links immediately (no membership step).

Rollout: ship, smoke-test that the 2 active users resolve correctly, then announce. Clerk stays the identity provider throughout — no big-bang identity cutover; the risk surface is the org-resolution swap, covered by unit tests + the 2-user smoke test.

## 6. Testing

- **Unit:** active-org resolution (valid cookie → that org; missing cookie → first membership; non-member cookie → ignored→fallback); `switchActiveOrg` rejects non-member orgs; `createOrganization` creates org + owner employee + seeds policies/holidays + sets cookie; `provisionPhoneOnlyUser` makes **no** membership call.
- **Manual e2e:** new signup → onboarding → create org → dashboard; invite email employee → they sign up → auto-linked into the org; multi-org user switches orgs; "Create organization" spins up a 2nd org; Sakshi activates by phone.

## 7. Out of scope

- Cross-device persistent active-org (cookie is per-device; a DB preference is a later option).
- Full migration off Clerk auth (Supabase Auth / Better Auth) — a separate future decision; this spec deliberately keeps Clerk for identity.
- Removing the vestigial `clerk_org_id` column (left in place; drop later if desired).
- Org-level roles in Clerk (RBAC stays on `employees.role`).
