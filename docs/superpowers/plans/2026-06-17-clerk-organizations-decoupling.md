# Decouple from Clerk Organizations (Option 0) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop using Clerk Organizations (the source of the membership quota / pricing problem) while keeping Clerk for user identity, sessions, and phone+OTP — moving multi-tenancy entirely onto the existing `organizations` + `employees` tables, with a cookie-based active-org and a top-left org switcher.

**Architecture:** `getCurrentUser()` resolves the active org from the caller's `employees` rows (not Clerk's session `orgId`), using a signed `active_org_id` cookie as a hint (validated against real membership). New `createOrganization` / `getMyOrgs` / `switchActiveOrg` server actions power onboarding, the switcher, and create-additional-org. Phone provisioning drops the org-membership call (kills the quota error). All Clerk Organization APIs + org webhooks are removed.

**Tech Stack:** Next.js 14 App Router, TypeScript, Clerk (`@clerk/nextjs/server` — users only), Supabase (Postgres), Resend, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-17-clerk-organizations-decoupling-design.md`

---

## File Structure

**Create:**
- `src/lib/auth/active-org.ts` — pure `resolveActiveOrg(memberships, cookieOrgId)` + cookie name constant.
- `tests/auth/active-org.test.ts` — unit tests for the resolver.
- `src/actions/active-org.ts` — `getMyOrgs()`, `switchActiveOrg(orgId)` server actions (cookie read/write).
- `src/components/layout/org-switcher.tsx` — top-left dropdown (switch + create).
- `src/components/layout/create-org-dialog.tsx` — "Create organization" dialog.

**Modify:**
- `src/lib/current-user.ts` — rewrite org resolution (membership list + active-org cookie); keep email/phone auto-link.
- `src/actions/organizations.ts` — add `createOrganization({...})` (org + owner + seed policies/holidays + legal + cookie); keep `syncOrgToSupabase` only if still referenced, else remove.
- `src/actions/employees.ts` — `getOrgIds()` delegates to the new resolver; `reprovisionPhoneEmployee` + `addEmployee` unaffected except via provisioning helper.
- `src/lib/clerk/provision-phone-user.ts` — drop the `createOrganizationMembership` call + `ORG_MEMBERSHIP_CAP` heal.
- `src/actions/invites.ts` — replace `createOrganizationInvitation` with a Resend email.
- `src/actions/hire.ts` — replace the `createOrganizationInvitation` call (candidate→employee convert path) similarly.
- `src/app/onboarding/page.tsx` — use `createOrganization` server action; drop Clerk `createOrganization`/`setActive`.
- `src/app/api/webhooks/clerk/route.ts` — remove `organization.created` + `organizationMembership.created` cases + the membership-cap code; keep `user.updated`.
- `src/app/dashboard/layout.tsx` — redirect to `/onboarding` when the user has zero memberships; mount `<OrgSwitcher>`.
- `src/components/emails/` — add `account-setup.tsx` (invite email) if no suitable template exists.

---

## Task 1: Active-org resolver (pure logic + tests)

**Files:**
- Create: `src/lib/auth/active-org.ts`
- Test: `tests/auth/active-org.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/auth/active-org.test.ts
import { describe, it, expect } from "vitest";
import { resolveActiveOrg, ACTIVE_ORG_COOKIE } from "@/lib/auth/active-org";

type M = { orgId: string };
const members: M[] = [{ orgId: "a" }, { orgId: "b" }, { orgId: "c" }];

describe("resolveActiveOrg", () => {
  it("returns the cookie org when the user is a member of it", () => {
    expect(resolveActiveOrg(members, "b")).toBe("b");
  });
  it("falls back to the first membership when the cookie is absent", () => {
    expect(resolveActiveOrg(members, null)).toBe("a");
    expect(resolveActiveOrg(members, undefined)).toBe("a");
  });
  it("ignores a cookie org the user is NOT a member of (anti-tamper)", () => {
    expect(resolveActiveOrg(members, "zzz")).toBe("a");
  });
  it("returns null when the user has no memberships", () => {
    expect(resolveActiveOrg([], "a")).toBeNull();
  });
  it("exposes a stable cookie name", () => {
    expect(ACTIVE_ORG_COOKIE).toBe("jambahr_active_org");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/auth/active-org.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/auth/active-org.ts

export const ACTIVE_ORG_COOKIE = "jambahr_active_org";

/**
 * Pick the active org id from a caller's memberships and the active-org cookie.
 * The cookie is only honored when the caller is actually a member of that org
 * (the membership list is the authority — a tampered cookie can't select a
 * non-member org). Falls back to the first membership; null if none.
 */
export function resolveActiveOrg(
  memberships: { orgId: string }[],
  cookieOrgId: string | null | undefined
): string | null {
  if (memberships.length === 0) return null;
  if (cookieOrgId && memberships.some((m) => m.orgId === cookieOrgId)) {
    return cookieOrgId;
  }
  return memberships[0].orgId;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/auth/active-org.test.ts`
Expected: PASS (5 cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/active-org.ts tests/auth/active-org.test.ts
git commit -m "feat(auth): active-org resolver (cookie hint validated against membership)"
```

---

## Task 2: Rewrite `getCurrentUser` org resolution

**Files:**
- Modify: `src/lib/current-user.ts`

> READ the current `src/lib/current-user.ts` first. Today `getCurrentUser` calls `resolveClerkOrg(userId, auth().orgId)` to find ONE org by `clerk_org_id`, then looks up the employee. You are replacing the "which org" logic with: list ALL `employees` rows for `clerk_user_id`, resolve the active one via the cookie. The email/phone auto-link block (which backfills `clerk_user_id`) MUST be preserved — it now runs against the active org's expected membership.

- [ ] **Step 1: Add imports**

At the top of `src/lib/current-user.ts`:
```typescript
import { cookies } from "next/headers";
import { resolveActiveOrg, ACTIVE_ORG_COOKIE } from "@/lib/auth/active-org";
```

- [ ] **Step 2: Replace the resolution core of `getCurrentUser`**

Rewrite the body so it:
1. Gets `userId` from `auth()` (drop `sessionOrgId`).
2. Loads memberships:
```typescript
  const supabase = createAdminSupabase();
  const { data: rows } = await supabase
    .from("employees")
    .select("id, role, first_name, org_id, organizations!inner(id, name, plan, settings, custom_features)")
    .eq("clerk_user_id", userId)
    .neq("status", "terminated")
    .order("created_at", { ascending: true });

  let memberships = (rows ?? []) as any[];
```
3. If `memberships` is empty, run the EXISTING email/phone auto-link fallback (fetch the Clerk user, match an `employees` row by email then phone, backfill `clerk_user_id`), then re-query memberships once. Keep that fallback logic intact — only change it to NOT be org-scoped to a single Clerk org (match by email/phone within ANY org for this user; the matched row defines the org).
4. If still empty → return `null` (a signed-in user with no memberships; the dashboard layout will route them to `/onboarding`).
5. Resolve the active org:
```typescript
  const cookieOrg = cookies().get(ACTIVE_ORG_COOKIE)?.value ?? null;
  const activeOrgId = resolveActiveOrg(
    memberships.map((m) => ({ orgId: m.org_id as string })),
    cookieOrg
  );
  const active = memberships.find((m) => m.org_id === activeOrgId)!;
  const org = active.organizations;
```
6. Build the returned `UserContext` from `org` (id, name, plan, settings flags, custom_features) and `active` (role, employee id, first_name) — same shape/fields as today (`jambaHireEnabled`, `assistantEnabled`, `attendanceEnabled`, etc. all read from `org.settings`). Reuse the existing settings-flag extraction code.

> Keep the `UserContext` type unchanged. Keep `isAdmin` / `isManagerOrAbove`. `getOrgContext()` (lightweight) should now also resolve via the active-org path — update it to return `{ orgId, clerkUserId }` using the same membership+cookie resolution (or simply call a shared internal resolver). Do NOT read `auth().orgId` anywhere.

- [ ] **Step 3: Verify build + existing tests**

Run: `npx vitest run` (full suite must still pass) and `npm run build` (controller will also verify).

- [ ] **Step 4: Commit**

```bash
git add src/lib/current-user.ts
git commit -m "feat(auth): resolve org from employees table + active-org cookie (no Clerk org)"
```

---

## Task 3: `getMyOrgs` + `switchActiveOrg` server actions

**Files:**
- Create: `src/actions/active-org.ts`

- [ ] **Step 1: Implement the actions**

```typescript
// src/actions/active-org.ts
"use server";

import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { createAdminSupabase } from "@/lib/supabase/server";
import { ACTIVE_ORG_COOKIE } from "@/lib/auth/active-org";
import type { ActionResult } from "@/types";

export type OrgMembership = { orgId: string; name: string; role: string };

export async function getMyOrgs(): Promise<OrgMembership[]> {
  const { userId } = auth();
  if (!userId) return [];
  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from("employees")
    .select("role, org_id, organizations!inner(id, name)")
    .eq("clerk_user_id", userId)
    .neq("status", "terminated")
    .order("created_at", { ascending: true });
  return ((data ?? []) as any[]).map((r) => ({
    orgId: r.org_id as string,
    name: r.organizations?.name as string,
    role: r.role as string,
  }));
}

export async function switchActiveOrg(orgId: string): Promise<ActionResult<void>> {
  const { userId } = auth();
  if (!userId) return { success: false, error: "Not authenticated" };
  const supabase = createAdminSupabase();
  // Authority check: the caller MUST have a (non-terminated) membership in orgId.
  const { data: member } = await supabase
    .from("employees")
    .select("id")
    .eq("clerk_user_id", userId)
    .eq("org_id", orgId)
    .neq("status", "terminated")
    .maybeSingle();
  if (!member) return { success: false, error: "You are not a member of that organization" };

  cookies().set(ACTIVE_ORG_COOKIE, orgId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return { success: true, data: undefined };
}
```

- [ ] **Step 2: Verify build + suite**

Run: `npx vitest run` (full suite passes). `npm run build` (controller verifies).

- [ ] **Step 3: Commit**

```bash
git add src/actions/active-org.ts
git commit -m "feat(auth): getMyOrgs + switchActiveOrg actions (membership-validated cookie)"
```

---

## Task 4: `createOrganization` server action

**Files:**
- Modify: `src/actions/organizations.ts`

> READ the current `organizations.ts` (`syncOrgToSupabase`) and the webhook constants `DEFAULT_LEAVE_POLICIES`, `DEFAULT_HOLIDAYS_2026`, `DEFAULT_ONBOARDING_STEPS` (imported in `src/app/api/webhooks/clerk/route.ts`). The new action consolidates: create org row (NO `clerk_org_id`), seed owner employee, seed leave policies + holidays + onboarding_steps, record legal acceptance, set the active-org cookie.

- [ ] **Step 1: Implement `createOrganization`**

Add to `src/actions/organizations.ts` (keep `slugify`, `createAdminSupabase`, `auth`, `clerkClient` imports; add cookie + constants imports):
```typescript
import { cookies } from "next/headers";
import { ACTIVE_ORG_COOKIE } from "@/lib/auth/active-org";
import { DEFAULT_LEAVE_POLICIES, DEFAULT_HOLIDAYS_2026 } from "@/config/onboarding-seed"; // see note

export async function createOrganization(data: {
  name: string;
  privacyAcceptedAt: string;
  termsAcceptedAt: string;
  policyVersionAccepted: string;
}): Promise<ActionResult<{ orgId: string }>> {
  const { userId } = auth();
  if (!userId) return { success: false, error: "Not authenticated" };
  if (!data.name?.trim()) return { success: false, error: "Company name is required" };

  const supabase = createAdminSupabase();

  // 1. Create the org (no clerk_org_id — multi-tenancy is our own now)
  const { data: org, error } = await supabase
    .from("organizations")
    .insert({
      name: data.name.trim(),
      slug: slugify(data.name) + "-" + Math.random().toString(36).slice(2, 8),
      plan: "starter",
      max_employees: 10,
      settings: { onboarding_steps: DEFAULT_ONBOARDING_STEPS },
      privacy_policy_accepted_at: data.privacyAcceptedAt,
      terms_accepted_at: data.termsAcceptedAt,
      policy_version_accepted: data.policyVersionAccepted,
    })
    .select("id")
    .single();
  if (error || !org) return { success: false, error: error?.message ?? "Failed to create organization" };
  const orgId = (org as { id: string }).id;

  // 2. Owner employee row from Clerk user identity
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const email =
      user.primaryEmailAddress?.emailAddress ?? user.emailAddresses?.[0]?.emailAddress ?? null;
    const phone =
      user.primaryPhoneNumber?.phoneNumber ?? user.phoneNumbers?.[0]?.phoneNumber ?? null;
    await supabase.from("employees").insert({
      org_id: orgId,
      clerk_user_id: userId,
      first_name: user.firstName ?? "",
      last_name: user.lastName ?? "",
      email,
      phone,
      avatar_url: user.imageUrl ?? null,
      role: "owner",
      status: "active",
    });
  } catch (err) {
    console.error("Failed to seed owner employee row:", err);
  }

  // 3. Seed default leave policies + holidays (moved from the deleted org.created webhook)
  await supabase.from("leave_policies").insert(DEFAULT_LEAVE_POLICIES.map((p) => ({ ...p, org_id: orgId })));
  await supabase.from("holidays").insert(DEFAULT_HOLIDAYS_2026.map((h) => ({ ...h, org_id: orgId })));

  // 4. Make the new org active
  cookies().set(ACTIVE_ORG_COOKIE, orgId, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365,
  });

  return { success: true, data: { orgId } };
}
```

> The webhook currently defines `DEFAULT_LEAVE_POLICIES`, `DEFAULT_HOLIDAYS_2026`, `DEFAULT_ONBOARDING_STEPS`. `DEFAULT_ONBOARDING_STEPS` is already in `@/config/onboarding`. Move `DEFAULT_LEAVE_POLICIES` + `DEFAULT_HOLIDAYS_2026` into a shared module `src/config/onboarding-seed.ts` (export both) and import them in BOTH this action and (until Task 8 deletes that case) the webhook. Import `DEFAULT_ONBOARDING_STEPS` from `@/config/onboarding`.

- [ ] **Step 2: Verify build + suite**

Run: `npx vitest run`. `npm run build` (controller verifies).

- [ ] **Step 3: Commit**

```bash
git add src/actions/organizations.ts src/config/onboarding-seed.ts
git commit -m "feat(auth): createOrganization action (org + owner + seed + legal + active cookie)"
```

---

## Task 5: Phone provisioning drops the org-membership step

**Files:**
- Modify: `src/lib/clerk/provision-phone-user.ts`
- Modify: `tests/employees/provision-phone-user.test.ts`

> The org-membership call is what raised `organization membership quota exceeded`. Membership is now the `employees` row, so provisioning only needs to create/find the Clerk user.

- [ ] **Step 1: Update the tests first (TDD)**

In `tests/employees/provision-phone-user.test.ts`: remove the membership/quota/already-a-member tests (they no longer apply) and assert the new contract — `provisionPhoneOnlyUser(client, { phoneE164, role })` returns `{ clerkUserId }` and NEVER calls `organizations.*`. Replace the file's `describe` body with:
```typescript
import { describe, it, expect, vi } from "vitest";
import { provisionPhoneOnlyUser } from "@/lib/clerk/provision-phone-user";

function makeClient(overrides: any = {}) {
  return {
    users: {
      getUserList: vi.fn().mockResolvedValue({ data: [], totalCount: 0 }),
      createUser: vi.fn().mockResolvedValue({ id: "user_new" }),
      ...overrides.users,
    },
    organizations: { createOrganizationMembership: vi.fn(), updateOrganization: vi.fn() },
  };
}

describe("provisionPhoneOnlyUser", () => {
  it("creates a new Clerk user by phone and adds NO org membership", async () => {
    const client = makeClient();
    const res = await provisionPhoneOnlyUser(client as any, { phoneE164: "+919876543210", role: "employee" });
    expect(client.users.createUser).toHaveBeenCalledWith({ phoneNumber: ["+919876543210"], skipPasswordRequirement: true });
    expect(client.organizations.createOrganizationMembership).not.toHaveBeenCalled();
    expect(res).toEqual({ clerkUserId: "user_new" });
  });
  it("reuses an existing Clerk user with that phone", async () => {
    const client = makeClient({ users: { getUserList: vi.fn().mockResolvedValue({ data: [{ id: "user_existing" }], totalCount: 1 }) } });
    const res = await provisionPhoneOnlyUser(client as any, { phoneE164: "+919876543210", role: "admin" });
    expect(client.users.createUser).not.toHaveBeenCalled();
    expect(res).toEqual({ clerkUserId: "user_existing" });
  });
  it("warns but proceeds when multiple users match the phone", async () => {
    const client = makeClient({ users: { getUserList: vi.fn().mockResolvedValue({ data: [{ id: "u1" }, { id: "u2" }], totalCount: 2 }) } });
    const res = await provisionPhoneOnlyUser(client as any, { phoneE164: "+919876543210", role: "employee" });
    expect(res).toEqual({ clerkUserId: "u1" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/employees/provision-phone-user.test.ts`
Expected: FAIL (signature now omits `clerkOrgId`; membership still present).

- [ ] **Step 3: Simplify the implementation**

Rewrite `src/lib/clerk/provision-phone-user.ts` to:
```typescript
import type { clerkClient } from "@clerk/nextjs/server";
import type { UserRole } from "@/types";

type ClerkClient = Awaited<ReturnType<typeof clerkClient>>;

export type ProvisionOpts = { phoneE164: string; role: UserRole };

/**
 * Find-or-create a Clerk user by phone number. Membership is the employees row,
 * so we no longer add a Clerk org membership (that was the quota-limited call).
 */
export async function provisionPhoneOnlyUser(
  client: ClerkClient,
  opts: ProvisionOpts
): Promise<{ clerkUserId: string }> {
  const { phoneE164 } = opts;
  const existing = await client.users.getUserList({ phoneNumber: [phoneE164] });
  if (existing.data.length > 0) {
    if (existing.data.length > 1) {
      console.warn(`provisionPhoneOnlyUser: ${existing.data.length} Clerk users match ${phoneE164}; using the first.`);
    }
    return { clerkUserId: existing.data[0].id };
  }
  const created = await client.users.createUser({ phoneNumber: [phoneE164], skipPasswordRequirement: true });
  return { clerkUserId: created.id };
}
```
(`ORG_MEMBERSHIP_CAP`, `clerkOrgRole`, and `addMembershipWithCapacityHeal` are deleted. `role` is kept in the signature for callers but no longer used for a Clerk org role — keep it so call sites don't break; it documents intent.)

- [ ] **Step 4: Update the two call sites**

`addEmployee` and `reprovisionPhoneEmployee` in `src/actions/employees.ts` call `provisionPhoneOnlyUser(client, { phoneE164, clerkOrgId, role })`. Remove the `clerkOrgId` property from BOTH calls (the option no longer exists). Also remove the now-unused `ORG_MEMBERSHIP_CAP` import from the webhook (handled in Task 8) and anywhere else.

- [ ] **Step 5: Run tests + build**

Run: `npx vitest run`. `npm run build` (controller verifies). Expected: provisioning tests pass; full suite green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/clerk/provision-phone-user.ts tests/employees/provision-phone-user.test.ts src/actions/employees.ts
git commit -m "fix(auth): phone provisioning no longer adds Clerk org membership (kills quota error)"
```

---

## Task 6: Invitations via Resend (drop Clerk org invitations)

**Files:**
- Modify: `src/actions/invites.ts`
- Modify: `src/actions/hire.ts` (the convert-to-employee invitation call)
- Create: `src/components/emails/account-setup.tsx` (if no suitable template exists)

> READ `src/actions/invites.ts` (`sendInvite`/`resendInvite`/`sendBulkInvites`) and the `createOrganizationInvitation` call in `src/actions/hire.ts`. Replace the Clerk org-invitation send with our own Resend email containing a sign-in link. Linking happens automatically via `getCurrentUser`'s email/phone auto-link when the invitee signs in — there is no Clerk org to join.

- [ ] **Step 1: Add the email template**

Create `src/components/emails/account-setup.tsx` — a React Email template `AccountSetupEmail({ orgName, firstName, signInUrl })` modeled on the existing `welcome.tsx` template (read it for the house style / imports). Body: "You've been added to {orgName} on JambaHR. Set up your account to sign in." CTA button → `signInUrl`.

- [ ] **Step 2: Rewrite `sendInvite`**

In `src/actions/invites.ts`, replace the `client.organizations.createOrganizationInvitation({...})` block with a Resend send. Keep the existing guards (employee exists, has no `clerk_user_id`, has an email — the phone-only guard added earlier stays). Replace the Clerk call with:
```typescript
  const signInUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://jambahr.com"}/sign-in`;
  try {
    const html = await render(
      AccountSetupEmail({ orgName: ctx.orgName ?? "your team", firstName: (emp as any).first_name ?? "there", signInUrl })
    );
    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: "Set up your JambaHR account",
      html,
    });
  } catch (err: any) {
    return { success: false, error: err?.message ?? "Failed to send invite email" };
  }
```
Add the needed imports (`render` from `@react-email/render`, `AccountSetupEmail`, `resend`, `FROM_EMAIL` from `@/lib/resend`). Update the `employee_invites` upsert to drop `clerk_invitation_id` (or set it null) — keep `sent_at`/`expires_at`/`accepted_at` tracking. The `ctx` from `getOrgContext()` must expose the org name; if it doesn't, fetch the org name from Supabase by `ctx.internalOrgId`.

- [ ] **Step 3: `resendInvite` + `terminateEmployee` revocation**

`resendInvite` currently revokes the old Clerk invitation then calls `sendInvite`. Remove the `revokeOrganizationInvitation` call (no Clerk invitations exist) — `resendInvite` just calls `sendInvite`. In `src/actions/employees.ts` `terminateEmployee`, remove the `revokeOrganizationInvitation` block (keep the `employee_invites` delete + status update).

- [ ] **Step 4: `hire.ts` convert path**

In `src/actions/hire.ts`, the candidate→employee convert flow calls `createOrganizationInvitation`. Replace it with the same Resend `AccountSetupEmail` send (the new hire is an `employees` row with an email; they sign in and auto-link). If the convert path already sends a welcome/handoff email, fold the sign-in CTA into that and drop the Clerk invitation entirely.

- [ ] **Step 5: Verify build + suite**

Run: `npx vitest run`. `npm run build` (controller verifies). Grep to confirm zero `createOrganizationInvitation` / `revokeOrganizationInvitation` remain: use Grep for `OrganizationInvitation`.

- [ ] **Step 6: Commit**

```bash
git add src/actions/invites.ts src/actions/hire.ts src/actions/employees.ts src/components/emails/account-setup.tsx
git commit -m "feat(auth): invitations via Resend email + auto-link (drop Clerk org invitations)"
```

---

## Task 7: Onboarding page uses `createOrganization`

**Files:**
- Modify: `src/app/onboarding/page.tsx`

> READ the current page. It uses `useOrganizationList().createOrganization` + `setActive`, then `syncOrgToSupabase`. Preserve the legal-consent gate (`accepted`), the multi-step create flow, and the "choose" mode. ONLY change the submit handler to call the new server action.

- [ ] **Step 1: Replace the Clerk org creation in `handleSubmit`**

Remove `const { createOrganization, setActive } = useOrganizationList();` and the `!createOrganization || !setActive` guard. Replace the create+sync block (the `createOrganization({ name })` → `setActive` → `syncOrgToSupabase` sequence) with:
```typescript
    setLoading(true);
    try {
      const now = new Date().toISOString();
      const result = await createOrganization({
        name: form.companyName,
        privacyAcceptedAt: now,
        termsAcceptedAt: now,
        policyVersionAccepted: LATEST_POLICY_VERSION,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      window.location.href = "/dashboard";
    } catch (error: any) {
      toast.error(error?.message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
```
Update the import: `import { createOrganization } from "@/actions/organizations";` (drop `syncOrgToSupabase` if no longer used; drop `useOrganizationList`). Keep `useClerk` for `signOut`.

> The "join" mode (`Mode = "joining"`) — read what it does today. Under the new model a user joins by being invited (an admin adds them; they auto-link on sign-in). If the "join" mode tried to join a Clerk org by slug/code, it's now dead — replace its body with copy explaining "Ask your admin to add you; you'll get a setup email," OR leave the mode but make its CTA link to support. Do NOT leave a broken Clerk-join call.

- [ ] **Step 2: Verify build**

Run: `npm run build` (controller verifies). The page must compile with no Clerk-org imports.

- [ ] **Step 3: Commit**

```bash
git add src/app/onboarding/page.tsx
git commit -m "feat(auth): onboarding creates org via server action (no Clerk org)"
```

---

## Task 8: Webhook teardown

**Files:**
- Modify: `src/app/api/webhooks/clerk/route.ts`

- [ ] **Step 1: Remove the org webhook cases**

Delete the `case "organization.created":` and `case "organizationMembership.created":` blocks entirely, plus the org-membership-cap `updateOrganization` code and the `ORG_MEMBERSHIP_CAP` import. Keep `case "user.updated":` (syncs name/avatar onto the employees row by `clerk_user_id`). Keep `case "user.created":` as a no-op log (or delete it). Remove now-unused imports (`DEFAULT_LEAVE_POLICIES`, `DEFAULT_HOLIDAYS_2026`, `DEFAULT_ONBOARDING_STEPS`, `FounderAlertEmail`, `WelcomeEmail` IF they were only used by the deleted org.created case — verify before removing; the founder-alert/welcome emails on new-org may need to move into `createOrganization` if you want to keep them).

> DECISION: the founder-alert + welcome emails currently fire from `organization.created`. Move those two `resend.emails.send` calls into `createOrganization` (Task 4) so new-signup notifications still fire, OR explicitly drop them. Pick moving them — add them to `createOrganization` after the org row is created (best-effort, non-fatal). Update Task 4's action accordingly if not already done.

- [ ] **Step 2: Verify build + suite**

Run: `npm run build` (controller verifies). `npx vitest run`. Grep for `organizationMembership` and `organization.created` to confirm removal.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/webhooks/clerk/route.ts src/actions/organizations.ts
git commit -m "feat(auth): remove Clerk organization webhooks; move signup emails into createOrganization"
```

---

## Task 9: Org switcher dropdown + create-org dialog

**Files:**
- Create: `src/components/layout/org-switcher.tsx`
- Create: `src/components/layout/create-org-dialog.tsx`
- Modify: `src/app/dashboard/layout.tsx` (mount the switcher top-left; onboarding redirect)

> READ `src/components/layout/sidebar.tsx` and `src/app/dashboard/layout.tsx` for the chrome layout + where the top-left area is. The switcher is a client component fed by server data.

- [ ] **Step 1: Onboarding redirect + data in the layout**

In `src/app/dashboard/layout.tsx` (server component): it already calls `getCurrentUser()`. If it returns `null` (signed-in, no memberships), `redirect("/onboarding")`. Fetch `getMyOrgs()` and pass the list + the active org id (`user.orgId`) into the chrome so `<OrgSwitcher>` can render. (If the layout doesn't currently render the sidebar/header directly, thread the props through the existing chrome component.)

- [ ] **Step 2: Build `<CreateOrgDialog>`**

`src/components/layout/create-org-dialog.tsx` — a Radix dialog (model on `src/components/dashboard/employee-form.tsx` for dialog + input patterns) with a company-name input + a required legal-consent checkbox (reuse the onboarding consent copy + `LATEST_POLICY_VERSION`). On submit → `createOrganization({ name, privacyAcceptedAt, termsAcceptedAt, policyVersionAccepted })` → on success `window.location.href = "/dashboard"` (full reload so the new active org resolves everywhere).

- [ ] **Step 3: Build `<OrgSwitcher>`**

`src/components/layout/org-switcher.tsx` — a client component receiving `orgs: OrgMembership[]` and `activeOrgId: string`. Renders the active org name + a Radix `DropdownMenu`:
- one item per org (calls `switchActiveOrg(org.orgId)` → on success `window.location.href = "/dashboard"`).
- a separator + "Create organization" item that opens `<CreateOrgDialog>`.
If `orgs.length <= 1`, still render the org name; show "Create organization" as the only dropdown action.

```typescript
"use client";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronsUpDown, Plus, Check } from "lucide-react";
import * as React from "react";
import { switchActiveOrg } from "@/actions/active-org";
import { CreateOrgDialog } from "./create-org-dialog";
import type { OrgMembership } from "@/actions/active-org";

export function OrgSwitcher({ orgs, activeOrgId }: { orgs: OrgMembership[]; activeOrgId: string }) {
  const [createOpen, setCreateOpen] = React.useState(false);
  const active = orgs.find((o) => o.orgId === activeOrgId);
  async function select(orgId: string) {
    if (orgId === activeOrgId) return;
    const r = await switchActiveOrg(orgId);
    if (r.success) window.location.href = "/dashboard";
  }
  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium hover:bg-accent">
          <span className="truncate max-w-[160px]">{active?.name ?? "Organization"}</span>
          <ChevronsUpDown className="h-4 w-4 opacity-60" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="start" className="z-50 min-w-[220px] rounded-lg border bg-popover p-1 shadow-md">
            {orgs.map((o) => (
              <DropdownMenu.Item key={o.orgId} onSelect={() => select(o.orgId)}
                className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                <span className="truncate">{o.name}</span>
                {o.orgId === activeOrgId && <Check className="h-4 w-4" />}
              </DropdownMenu.Item>
            ))}
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
            <DropdownMenu.Item onSelect={(e) => { e.preventDefault(); setCreateOpen(true); }}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
              <Plus className="h-4 w-4" /> Create organization
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <CreateOrgDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build` (controller verifies). Manually confirm the switcher renders in the dashboard chrome.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/org-switcher.tsx src/components/layout/create-org-dialog.tsx src/app/dashboard/layout.tsx
git commit -m "feat(auth): top-left org switcher + create-organization dialog"
```

---

## Task 10: Sweep for residual Clerk-org usage + cutover backfill

**Files:**
- Various (audit), Create: `src/actions/backfill-invites.ts` (optional one-time)

- [ ] **Step 1: Grep sweep**

Use Grep for each of: `auth().orgId`, `sessionOrgId`, `useOrganization`, `OrganizationSwitcher`, `createOrganizationMembership`, `OrganizationInvitation`, `getOrganizationMembershipList`, `resolveClerkOrg`, `ORG_MEMBERSHIP_CAP`, `syncOrgToSupabase`. For each hit, confirm it's removed or intentionally retained. `getOrgIds` in `employees.ts` and `getOrgContext` must no longer read `auth().orgId` — make them resolve via the active-org path (delegate to a shared resolver or to `getCurrentUser`). Fix any stragglers.

- [ ] **Step 2: Verify the whole app builds + full suite passes**

Run: `npm run build` (controller verifies) and `npx vitest run` (all green).

- [ ] **Step 3: (Optional) Pending-invite backfill action**

If you want to proactively re-invite the ~25–30 pending users, add `resendAllPendingInvites()` to `src/actions/backfill-invites.ts` (admin-only): selects active-org `employees` with `clerk_user_id IS NULL` and a non-null email, calls the Task-6 Resend send for each. Skip if you'd rather rely on natural auto-link at sign-in.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(auth): sweep residual Clerk-org usage; optional pending-invite backfill"
```

---

## Task 11: Manual end-to-end verification

**Files:** none (operational)

- [ ] **Step 1: Existing-user smoke test** — sign in as one of the 2 active users; confirm the dashboard resolves the correct org, role, and data (no regression).
- [ ] **Step 2: Sakshi** — on `/dashboard/employees`, click "Activate phone login" for the phone-only employee; confirm success (no quota error) and `clerk_user_id` populated.
- [ ] **Step 3: New signup → onboarding** — sign up a fresh account; confirm routed to `/onboarding`; create a company; confirm landing in the dashboard as owner with seeded leave policies + holidays.
- [ ] **Step 4: Invite → auto-link** — as an admin, add an email employee; confirm the Resend setup email; sign in as that email in a fresh browser; confirm auto-linked into the org.
- [ ] **Step 5: Multi-org switch** — with one login that has 2 memberships, confirm both appear in the top-left switcher and switching changes the active org across the dashboard. Use "Create organization" to spin up a second org and confirm the switch.

---

## Notes for the implementer

- **No DB migration.** Everything reuses `organizations` + `employees`. `clerk_org_id` stays as a vestigial column.
- **Clerk stays the identity provider** — `clerkMiddleware`, `<SignIn>`/`<SignUp>`/`<UserButton>`, `auth().userId`, and phone OTP are all unchanged. Only the *Organizations* layer is removed.
- **The cookie is a hint, not authority.** Every resolution re-checks membership against `employees`. Never trust the cookie's org without the membership check.
- **Preserve the email/phone auto-link** in `getCurrentUser` — it is now how invited users join.
- Run `npx vitest run` (not the full `npm run build`) inside subagents for fast feedback; the controller verifies the production build separately (it intermittently OOM-crashes mid-build on this Windows box — retry once if so).
- After merge: update `CLAUDE.md` (Authentication section — Clerk Organizations removed, org resolved from `employees` + active-org cookie) and add a memory entry.
