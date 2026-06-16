# Phone + OTP Authentication for Email-less Employees — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let employees without an email be provisioned and sign in with phone number + SMS OTP, without touching the existing email-based onboarding.

**Architecture:** Phone-only employees are provisioned directly against the Clerk Backend API (find-or-create Clerk user by phone → add org membership → write `clerk_user_id` synchronously). Email stays the identity key for everyone who has one; phone becomes a parallel identity key (E.164, partial-unique per org). All Clerk config (phone identifier, SMS OTP, DLT) is operational, not code. Email notifications are guard-and-skipped for phone-only staff (WhatsApp parity is a separate Phase 2).

**Tech Stack:** Next.js 14 App Router, TypeScript, Clerk (`@clerk/nextjs/server` Backend API), Supabase (Postgres), Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-16-phone-otp-authentication-design.md`

---

## File Structure

**Create:**
- `src/lib/phone.ts` — `normalizePhone()`, `isValidPhone()` (E.164, India default).
- `src/lib/clerk/provision-phone-user.ts` — `provisionPhoneOnlyUser(client, opts)` Backend-API find-or-create + membership.
- `tests/employees/phone.test.ts` — unit tests for the phone helper.
- `tests/employees/provision-phone-user.test.ts` — unit tests with a fake Clerk client.
- `tests/employees/employee-schema.test.ts` — unit tests for the email-or-phone Zod refinement.
- `supabase/migrations/066_employees_phone_identity.sql` — email nullable + phone partial-unique + CHECK (applied via Supabase SQL Editor / MCP).

**Modify:**
- `src/actions/employees.ts` — `employeeSchema` (export + refine), `addEmployee` (provision fork), `updateEmployee` (null-safe email), `listEmployees` (no change to invite_status logic; verify), `ImportRow` + `bulkImportEmployees` (fork), CSV row validation.
- `src/actions/invites.ts` — `sendInvite` early-return for email-less employees.
- `src/app/api/webhooks/clerk/route.ts` — `organizationMembership.created` phone-match fallback.
- `src/lib/current-user.ts` — phone-match fallback branch.
- `src/components/dashboard/employee-table.tsx` — render phone when email absent.
- Notification senders (leave / payslip / doc-reminder cron / onboarding-nudge cron) — guard `if (!email) skip`.

---

## Task 1: Phone normalization helper

**Files:**
- Create: `src/lib/phone.ts`
- Test: `tests/employees/phone.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/employees/phone.test.ts
import { describe, it, expect } from "vitest";
import { normalizePhone, isValidPhone } from "@/lib/phone";

describe("normalizePhone", () => {
  it("normalizes a bare 10-digit Indian mobile to E.164", () => {
    expect(normalizePhone("9876543210")).toBe("+919876543210");
  });
  it("strips spaces, dashes and parens", () => {
    expect(normalizePhone("98765 43210")).toBe("+919876543210");
    expect(normalizePhone("987-654-3210")).toBe("+919876543210");
  });
  it("handles a leading 0", () => {
    expect(normalizePhone("09876543210")).toBe("+919876543210");
  });
  it("handles a 91 country prefix without +", () => {
    expect(normalizePhone("919876543210")).toBe("+919876543210");
  });
  it("keeps an already-E.164 number", () => {
    expect(normalizePhone("+919876543210")).toBe("+919876543210");
  });
  it("passes through a valid non-India E.164 number", () => {
    expect(normalizePhone("+14155552671")).toBe("+14155552671");
  });
  it("rejects Indian numbers not starting 6-9", () => {
    expect(normalizePhone("1234567890")).toBeNull();
  });
  it("rejects too-short input", () => {
    expect(normalizePhone("12345")).toBeNull();
  });
  it("returns null for empty / nullish", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });
});

describe("isValidPhone", () => {
  it("is true for normalizable input", () => {
    expect(isValidPhone("9876543210")).toBe(true);
  });
  it("is false for junk", () => {
    expect(isValidPhone("abc")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/employees/phone.test.ts`
Expected: FAIL — cannot resolve `@/lib/phone`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/phone.ts

/**
 * Normalize a raw phone string to E.164.
 * India-first: bare 10-digit / 0-prefixed / 91-prefixed inputs become +91XXXXXXXXXX.
 * Already-E.164 numbers for any country are accepted as-is (8–15 digits after +).
 * Returns null when the input cannot be normalized to a valid number.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Already E.164 (any country): "+" then 8–15 digits.
  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    if (digits.length >= 8 && digits.length <= 15) return "+" + digits;
    return null;
  }

  // India local formats → strip non-digits, reduce to the 10-digit subscriber number.
  let local = trimmed.replace(/\D/g, "");
  if (local.length === 12 && local.startsWith("91")) local = local.slice(2);
  else if (local.length === 11 && local.startsWith("0")) local = local.slice(1);

  if (local.length === 10 && /^[6-9]/.test(local)) return "+91" + local;
  return null;
}

export function isValidPhone(raw: string | null | undefined): boolean {
  return normalizePhone(raw) !== null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/employees/phone.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/phone.ts tests/employees/phone.test.ts
git commit -m "feat(auth): add E.164 phone normalization helper"
```

---

## Task 2: Database migration — phone as a parallel identity

**Files:**
- Create: `supabase/migrations/066_employees_phone_identity.sql`

> Migrations on this project are applied via the Supabase SQL Editor / MCP (Windows — CLI unsupported; CLAUDE.md gotcha #4). The `.sql` file is the checked-in record.

- [ ] **Step 1: Write the migration file**

```sql
-- 066_employees_phone_identity.sql
-- Phone + OTP auth: make email optional, add phone as a parallel per-org identity.
-- Idempotent.

-- 1. Email is no longer mandatory (phone-only employees have no email).
ALTER TABLE employees ALTER COLUMN email DROP NOT NULL;

-- 2. Every employee must still have at least one identity.
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_identity_present;
ALTER TABLE employees
  ADD CONSTRAINT employees_identity_present
  CHECK (email IS NOT NULL OR phone IS NOT NULL);

-- 3. Phone is unique within an org when present (the phone-login match key).
DROP INDEX IF EXISTS employees_org_phone_unique;
CREATE UNIQUE INDEX employees_org_phone_unique
  ON employees (org_id, phone)
  WHERE phone IS NOT NULL;
```

- [ ] **Step 2: Apply the migration**

Apply via the Supabase MCP `apply_migration` tool (name: `066_employees_phone_identity`) against the live project, OR paste into the Supabase Dashboard SQL Editor and run.

- [ ] **Step 3: Verify**

Run this in the SQL Editor / MCP `execute_sql` and confirm:
```sql
SELECT is_nullable FROM information_schema.columns
WHERE table_name = 'employees' AND column_name = 'email';
-- Expected: YES

SELECT indexname FROM pg_indexes
WHERE tablename = 'employees' AND indexname = 'employees_org_phone_unique';
-- Expected: 1 row
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/066_employees_phone_identity.sql
git commit -m "feat(auth): migration 066 — email nullable, phone parallel identity"
```

---

## Task 3: Clerk phone-provisioning helper

**Files:**
- Create: `src/lib/clerk/provision-phone-user.ts`
- Test: `tests/employees/provision-phone-user.test.ts`

> The helper takes an already-resolved Clerk client as its first argument (dependency injection) so it is unit-testable with a fake client and reusable from any action.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/employees/provision-phone-user.test.ts
import { describe, it, expect, vi } from "vitest";
import { provisionPhoneOnlyUser } from "@/lib/clerk/provision-phone-user";

function makeClient(overrides: any = {}) {
  return {
    users: {
      getUserList: vi.fn().mockResolvedValue({ data: [], totalCount: 0 }),
      createUser: vi.fn().mockResolvedValue({ id: "user_new" }),
      ...overrides.users,
    },
    organizations: {
      createOrganizationMembership: vi.fn().mockResolvedValue({ id: "mem_1" }),
      ...overrides.organizations,
    },
  };
}

describe("provisionPhoneOnlyUser", () => {
  it("creates a new Clerk user when none exists and adds org membership", async () => {
    const client = makeClient();
    const res = await provisionPhoneOnlyUser(client as any, {
      phoneE164: "+919876543210",
      clerkOrgId: "org_1",
      role: "employee",
    });
    expect(client.users.createUser).toHaveBeenCalledWith({
      phoneNumber: ["+919876543210"],
      skipPasswordRequirement: true,
    });
    expect(client.organizations.createOrganizationMembership).toHaveBeenCalledWith({
      organizationId: "org_1",
      userId: "user_new",
      role: "org:member",
    });
    expect(res).toEqual({ clerkUserId: "user_new" });
  });

  it("reuses an existing Clerk user with that phone (multi-org case)", async () => {
    const client = makeClient({
      users: { getUserList: vi.fn().mockResolvedValue({ data: [{ id: "user_existing" }], totalCount: 1 }) },
    });
    const res = await provisionPhoneOnlyUser(client as any, {
      phoneE164: "+919876543210",
      clerkOrgId: "org_1",
      role: "admin",
    });
    expect(client.users.createUser).not.toHaveBeenCalled();
    expect(client.organizations.createOrganizationMembership).toHaveBeenCalledWith({
      organizationId: "org_1",
      userId: "user_existing",
      role: "org:admin",
    });
    expect(res).toEqual({ clerkUserId: "user_existing" });
  });

  it("maps owner/admin roles to org:admin, others to org:member", async () => {
    const client = makeClient();
    await provisionPhoneOnlyUser(client as any, { phoneE164: "+919876543210", clerkOrgId: "o", role: "owner" });
    expect(client.organizations.createOrganizationMembership).toHaveBeenCalledWith(
      expect.objectContaining({ role: "org:admin" })
    );
  });

  it("treats an already-a-member error as success", async () => {
    const client = makeClient({
      organizations: {
        createOrganizationMembership: vi
          .fn()
          .mockRejectedValue({ errors: [{ code: "already_a_member_of_organization" }] }),
      },
    });
    const res = await provisionPhoneOnlyUser(client as any, {
      phoneE164: "+919876543210",
      clerkOrgId: "org_1",
      role: "employee",
    });
    expect(res).toEqual({ clerkUserId: "user_new" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/employees/provision-phone-user.test.ts`
Expected: FAIL — cannot resolve `@/lib/clerk/provision-phone-user`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/clerk/provision-phone-user.ts
import type { clerkClient } from "@clerk/nextjs/server";

type ClerkClient = Awaited<ReturnType<typeof clerkClient>>;

export type ProvisionOpts = {
  phoneE164: string;
  clerkOrgId: string;
  role: string; // employee | manager | admin | owner
};

function clerkOrgRole(role: string): "org:admin" | "org:member" {
  return role === "admin" || role === "owner" ? "org:admin" : "org:member";
}

/**
 * Find-or-create a Clerk user by phone number and add them to the org.
 * Returns the Clerk user id. Idempotent on membership (already-a-member is success).
 * Throws on any other Clerk failure so the caller can surface it.
 */
export async function provisionPhoneOnlyUser(
  client: ClerkClient,
  opts: ProvisionOpts
): Promise<{ clerkUserId: string }> {
  const { phoneE164, clerkOrgId, role } = opts;

  const existing = await client.users.getUserList({ phoneNumber: [phoneE164] });
  let clerkUserId: string;
  if (existing.data.length > 0) {
    clerkUserId = existing.data[0].id;
  } else {
    const created = await client.users.createUser({
      phoneNumber: [phoneE164],
      skipPasswordRequirement: true,
    });
    clerkUserId = created.id;
  }

  try {
    await client.organizations.createOrganizationMembership({
      organizationId: clerkOrgId,
      userId: clerkUserId,
      role: clerkOrgRole(role),
    });
  } catch (err: any) {
    const code = err?.errors?.[0]?.code;
    if (code !== "already_a_member_of_organization") throw err;
  }

  return { clerkUserId };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/employees/provision-phone-user.test.ts`
Expected: PASS (4 cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/clerk/provision-phone-user.ts tests/employees/provision-phone-user.test.ts
git commit -m "feat(auth): Clerk phone-only user provisioning helper"
```

---

## Task 4: Employee schema — require email OR phone

**Files:**
- Modify: `src/actions/employees.ts` (schema block, lines ~47-57)
- Test: `tests/employees/employee-schema.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/employees/employee-schema.test.ts
import { describe, it, expect } from "vitest";
import { employeeSchema } from "@/actions/employees";

const base = {
  firstName: "Asha",
  lastName: "Rao",
  dateOfJoining: "2026-06-01",
  employmentType: "full_time",
  role: "employee",
};

describe("employeeSchema identity refinement", () => {
  it("accepts an email with no phone", () => {
    const r = employeeSchema.safeParse({ ...base, email: "asha@x.com" });
    expect(r.success).toBe(true);
  });
  it("accepts a phone with no email", () => {
    const r = employeeSchema.safeParse({ ...base, phone: "9876543210" });
    expect(r.success).toBe(true);
  });
  it("rejects when both email and phone are missing", () => {
    const r = employeeSchema.safeParse({ ...base });
    expect(r.success).toBe(false);
  });
  it("rejects an invalid email when no phone given", () => {
    const r = employeeSchema.safeParse({ ...base, email: "not-an-email" });
    expect(r.success).toBe(false);
  });
  it("rejects an invalid phone when no email given", () => {
    const r = employeeSchema.safeParse({ ...base, phone: "123" });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/employees/employee-schema.test.ts`
Expected: FAIL — `employeeSchema` is not exported / refinement absent.

- [ ] **Step 3: Edit the schema in `src/actions/employees.ts`**

Add `import { isValidPhone } from "@/lib/phone";` near the top imports.

Replace the current schema definition (the `const employeeSchema = z.object({ ... })` block, lines ~47-58) with an exported, refined version. The email field becomes optional; phone is validated:

```typescript
export const employeeSchema = z
  .object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    email: z
      .union([z.string().email("Invalid email address"), z.literal("")])
      .optional(),
    phone: z
      .string()
      .optional()
      .refine((v) => !v || v.trim() === "" || isValidPhone(v), "Invalid phone number"),
    departmentId: z.string().uuid().optional().or(z.literal("")),
    designation: z.string().optional(),
    dateOfJoining: z.string().min(1, "Date of joining is required"),
    dateOfBirth: z.string().optional().or(z.literal("")),
    employmentType: z.enum(["full_time", "part_time", "contract", "intern"]),
    role: z.enum(["owner", "admin", "manager", "employee"]),
    reportingManagerId: z.string().uuid().optional().or(z.literal("")),
  })
  .refine(
    (d) => (d.email && d.email.trim() !== "") || (d.phone && d.phone.trim() !== ""),
    { message: "Provide an email or a phone number", path: ["email"] }
  );
```

> Match the existing fields exactly — if the live schema has fields not shown above (e.g. `dateOfBirth`), preserve them. Only `email`, `phone`, and the `.refine()` are changing.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/employees/employee-schema.test.ts`
Expected: PASS (5 cases).

- [ ] **Step 5: Commit**

```bash
git add src/actions/employees.ts tests/employees/employee-schema.test.ts
git commit -m "feat(auth): employeeSchema requires email or phone"
```

---

## Task 5: `addEmployee` — provision phone-only employees

**Files:**
- Modify: `src/actions/employees.ts` (`addEmployee`, lines ~138-220)

- [ ] **Step 1: Add the import**

At the top of `src/actions/employees.ts`, add:
```typescript
import { normalizePhone } from "@/lib/phone";
import { provisionPhoneOnlyUser } from "@/lib/clerk/provision-phone-user";
```

- [ ] **Step 2: Normalize identity before insert**

In `addEmployee`, immediately after the `const validated = employeeSchema.safeParse(...)` success guard, derive normalized values:
```typescript
  const email = validated.data.email && validated.data.email.trim() !== ""
    ? validated.data.email.trim()
    : null;
  const phone = normalizePhone(validated.data.phone);
  const isPhoneOnly = !email && !!phone;
```

- [ ] **Step 3: Use them in the insert**

In the `.insert({ ... })` object (lines ~179-193) change the `email` and `phone` lines to:
```typescript
      email: email,
      phone: phone,
```

- [ ] **Step 4: Fork the post-insert onboarding**

Replace the existing "Send Clerk org invitation" block (lines ~204-216) with a fork:
```typescript
  if (isPhoneOnly) {
    // Phone-only: provision the Clerk user + org membership directly and link synchronously.
    try {
      const client = await clerkClient();
      const { clerkUserId } = await provisionPhoneOnlyUser(client, {
        phoneE164: phone!,
        clerkOrgId: ids.clerkOrgId,
        role: validated.data.role,
      });
      await supabase
        .from("employees")
        .update({ clerk_user_id: clerkUserId })
        .eq("id", (data as { id: string }).id);
    } catch (provErr: any) {
      // Non-fatal: employee row exists; admin can retry from the directory.
      console.warn("Phone provisioning failed (non-fatal):", provErr?.message ?? provErr);
    }
  } else if (email) {
    // Has email: existing behaviour — Clerk org invitation.
    try {
      const client = await clerkClient();
      await client.organizations.createOrganizationInvitation({
        organizationId: ids.clerkOrgId,
        emailAddress: email,
        role: "org:member",
        redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://jambahr.com"}/dashboard`,
      });
    } catch (inviteErr: any) {
      console.warn("Clerk invitation failed (non-fatal):", inviteErr?.message ?? inviteErr);
    }
  }
```

- [ ] **Step 5: Verify build + typecheck**

Run: `npm run build`
Expected: build completes (TS errors are ignored per next.config, but the build must not crash on syntax).

- [ ] **Step 6: Commit**

```bash
git add src/actions/employees.ts
git commit -m "feat(auth): addEmployee provisions phone-only employees via Clerk Backend API"
```

---

## Task 6: `sendInvite` guard for email-less employees

**Files:**
- Modify: `src/actions/invites.ts` (`sendInvite`, lines ~37-85)

- [ ] **Step 1: Add the guard**

In `sendInvite`, after the employee is fetched and before `const email = (emp as any).email as string;` (line ~53), add:
```typescript
  if (!(emp as any).email) {
    return { success: false, error: "This employee signs in by phone — no email invite needed." };
  }
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: build completes.

- [ ] **Step 3: Commit**

```bash
git add src/actions/invites.ts
git commit -m "feat(auth): block email invite for phone-login employees"
```

---

## Task 7: CSV import — accept phone-only rows

**Files:**
- Modify: `src/actions/employees.ts` (`ImportRow` type ~311-323, `bulkImportEmployees` validation ~404 and insert ~453-468)

- [ ] **Step 1: Make `ImportRow.email` optional**

Change `email: string;` to `email?: string;` in the `ImportRow` type (line ~314).

- [ ] **Step 2: Replace the row email validation**

Find the validation block (around line 404):
```typescript
    if (!row.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
      errors.push({ row: rowNum, reason: "Missing or invalid email", data: row });
```
Replace the condition with an email-or-phone rule:
```typescript
    const rowEmail = row.email?.trim() || "";
    const rowPhone = normalizePhone(row.phone);
    const emailOk = rowEmail !== "" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rowEmail);
    if (!emailOk && !rowPhone) {
      errors.push({ row: rowNum, reason: "Each row needs a valid email or phone", data: row });
      // (keep the existing `continue;` / skip handling that followed the original block)
```
Keep the rest of that block's control flow (the `continue` / `skipped++` that the original used). Only the condition and reason string change; if a row has only a phone, it must pass.

- [ ] **Step 3: Guard the duplicate-email check**

The duplicate check (`existingEmailMap.get(emailLower)` ~422) must only run when `emailOk`. Wrap it:
```typescript
    if (emailOk) {
      const emailLower = rowEmail.toLowerCase();
      const existingStatus = existingEmailMap.get(emailLower);
      // ... existing duplicate handling ...
    }
```

- [ ] **Step 4: Normalize identity in the insert object**

In the `toInsert` object (~453-457) set:
```typescript
      email: emailOk ? rowEmail.toLowerCase() : null,
      phone: rowPhone,
```

- [ ] **Step 5: Provision phone-only imported rows**

After the successful `supabase.from("employees").insert(toInsert)` (line ~468), for rows where `!emailOk && rowPhone`, call the provisioning helper for the newly-inserted row. If the importer inserts row-by-row, provision inline; if it batch-inserts, change it to `.select("id")` and loop the phone-only rows:
```typescript
    if (!emailOk && rowPhone) {
      try {
        const client = await clerkClient();
        const { clerkUserId } = await provisionPhoneOnlyUser(client, {
          phoneE164: rowPhone,
          clerkOrgId: ids.clerkOrgId, // use the importer's resolved clerk org id
          role: row.role,
        });
        await supabase.from("employees").update({ clerk_user_id: clerkUserId }).eq("id", insertedId);
      } catch (e: any) {
        console.warn("Import phone provisioning failed (non-fatal):", e?.message ?? e);
      }
    }
```
> `insertedId` = the id returned from the row insert; `ids.clerkOrgId` = however `bulkImportEmployees` already resolves the Clerk org (it uses `user.orgId`; resolve the Clerk org id the same way `addEmployee` does via `getOrgIds()` if not already available).

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: build completes.

- [ ] **Step 7: Commit**

```bash
git add src/actions/employees.ts
git commit -m "feat(auth): CSV import accepts and provisions phone-only rows"
```

---

## Task 8: Clerk webhook — phone-match fallback

**Files:**
- Modify: `src/app/api/webhooks/clerk/route.ts` (`organizationMembership.created`, lines ~199-237)

- [ ] **Step 1: Add the import**

At the top of the route file add:
```typescript
import { normalizePhone } from "@/lib/phone";
```

- [ ] **Step 2: Branch the link on identifier type**

The current code matches `employees.email = memberEmail`. A phone-only user's `identifier` is their phone (starts with `+`). Replace the "Find matching employee by email" update (lines ~221-227) with:
```typescript
        const identifier = membershipData.public_user_data?.identifier ?? "";
        const phoneFromIdentifier = normalizePhone(identifier);
        const matchColumn = phoneFromIdentifier ? "phone" : "email";
        const matchValue = phoneFromIdentifier ?? memberEmail;

        await supabase
          .from("employees")
          .update({ clerk_user_id: clerkUserId })
          .eq("org_id", (org as { id: string }).id)
          .eq(matchColumn, matchValue)
          .is("clerk_user_id", null); // only set if not already linked
```
> The `employee_invites` `accepted_at` stamp below it stays keyed on email; leave it unchanged (phone-only employees have no invite row, so it no-ops).

> Also relax the early guard at line ~210 so a phone-only membership isn't dropped: change `if (!clerkUserId || !clerkOrgId || !memberEmail) break;` to `if (!clerkUserId || !clerkOrgId) break;`. The existing `memberEmail` declaration (lines ~205-208) stays as-is — for a phone-only user it resolves to the phone string via `identifier`, which the Step 2 branch then routes to the `phone` column instead of `email`. No redeclaration.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build completes.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/webhooks/clerk/route.ts
git commit -m "feat(auth): webhook links phone-only members by phone identifier"
```

---

## Task 9: `getCurrentUser` — phone-match fallback

**Files:**
- Modify: `src/lib/current-user.ts` (email-fallback block, lines ~94-125)

- [ ] **Step 1: Add the import**

```typescript
import { normalizePhone } from "@/lib/phone";
```

- [ ] **Step 2: Extend the fallback**

Inside the existing `if (!emp) { ... }` block, after the email lookup attempt (after line ~121, still inside the `try`), add a phone fallback that runs only if email matching produced nothing:
```typescript
      if (!emp) {
        const phone =
          normalizePhone(clerkUser.primaryPhoneNumber?.phoneNumber) ??
          normalizePhone(clerkUser.phoneNumbers?.[0]?.phoneNumber);
        if (phone) {
          const { data: empByPhone } = await supabase
            .from("employees")
            .select("id, role, first_name")
            .eq("org_id", orgId)
            .eq("phone", phone)
            .is("clerk_user_id", null)
            .neq("status", "terminated")
            .limit(1)
            .maybeSingle();
          if (empByPhone) {
            await supabase
              .from("employees")
              .update({ clerk_user_id: userId })
              .eq("id", (empByPhone as { id: string }).id);
            emp = empByPhone as any;
          }
        }
      }
```
> Place this so `clerkUser` (already fetched for the email branch) is in scope. Reuse the same `clerkUser` object — do not fetch the user twice.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build completes.

- [ ] **Step 4: Commit**

```bash
git add src/lib/current-user.ts
git commit -m "feat(auth): getCurrentUser links phone-only users by phone fallback"
```

---

## Task 10: Directory UI — show phone when email is absent

**Files:**
- Modify: `src/components/dashboard/employee-table.tsx` (line ~131)

- [ ] **Step 1: Render phone fallback**

Change the email line (~131):
```tsx
                        <div className="text-xs text-muted-foreground">{emp.email}</div>
```
to:
```tsx
                        <div className="text-xs text-muted-foreground">
                          {emp.email || emp.phone || "—"}
                        </div>
```

> No change needed to `invite_status`: phone-only employees get `clerk_user_id` set at creation, so `listEmployees` already computes `invite_status = null` (no "Send Invite" button renders). If provisioning failed, `invite_status` becomes `"none"`; the Send-Invite action then returns the Task 6 guard message — acceptable and self-explanatory.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: build completes.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/employee-table.tsx
git commit -m "feat(auth): show phone in directory when employee has no email"
```

---

## Task 11: Null-email safety on notification senders

**Files (audit + guard each):**
- `src/actions/leaves.ts` (leave request/status emails)
- `src/actions/payroll.ts` (payslip email) + `src/lib/payroll/*` payslip senders
- `src/app/api/cron/doc-reminders/route.ts`
- `src/app/api/cron/onboarding-nudges/route.ts`

- [ ] **Step 1: Find every employee-email send site**

Use the Grep tool (or `grep -rn`) for `emails.send` and `.email` across:
`src/actions/leaves.ts`, `src/actions/payroll.ts`, `src/lib/payroll/`, `src/app/api/cron/doc-reminders/`, `src/app/api/cron/onboarding-nudges/`.
List every call that resolves a recipient from an employee row.

- [ ] **Step 2: Guard each send**

For every place that sends to an employee's email, wrap the recipient resolution so a null/empty email is skipped rather than passed to Resend. Pattern:
```typescript
const to = employee.email?.trim();
if (!to) {
  // Phase 1: phone-only employees receive no email. Phase 2 wires WhatsApp here.
  continue; // or `return;` / skip this recipient, matching the surrounding loop
}
// ... existing resend.emails.send({ to, ... })
```
Apply the same skip in batch senders (filter the recipient list to those with a non-empty email before mapping to sends).

- [ ] **Step 3: Verify build + full test suite**

Run: `npm run build && npx vitest run`
Expected: build completes; all existing tests pass (186+ baseline).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(auth): skip email notifications for phone-only employees (Phase 1)"
```

---

## Task 12: Manual end-to-end verification + operator config

**Files:**
- None (operational). Optionally append a short "Phone login" note to `docs/` operator docs.

- [ ] **Step 1: Clerk Dashboard config (operator)**

In the Clerk Dashboard for the production/dev instance:
- User & Authentication → Email, Phone, Username → enable **Phone number** (as an identifier) and **SMS verification code**.
- Keep Email address enabled.
- Complete TRAI/DLT registration for the SMS sender before production launch (operational; not code).

- [ ] **Step 2: Provision a phone-only employee**

As an admin in a test org, add an employee with a phone and no email. Confirm:
- The directory shows the phone (no "Send Invite" button).
- `employees` row has `clerk_user_id` populated and `email` null.

- [ ] **Step 3: Log in as the phone-only employee**

In a fresh browser, go to `/sign-in`, enter the phone, receive the SMS OTP, complete sign-in. Confirm landing on `/dashboard` with the correct role and org (not the admin default sidebar).

- [ ] **Step 4: Regression — email onboarding unchanged**

Add an employee with an email (no phone). Confirm a Clerk email invitation is sent and the existing accept-invite flow still links `clerk_user_id` by email.

- [ ] **Step 5: Final commit (docs note, if added)**

```bash
git add -A
git commit -m "docs(auth): phone-login operator notes"
```

---

## Notes for the implementer

- **Phase 1 only.** Phone-only employees get no email notifications by design; do not build WhatsApp dispatch here (separate Phase 2 spec).
- **`employeeSchema` is now exported** — keep it the single source of truth; the dialog form and both server actions use it.
- **Provisioning is best-effort and non-fatal** — a failed Clerk call leaves the employee row intact; the admin retries. Never let provisioning failure roll back the employee insert.
- **Do not re-fetch the Clerk user** in `getCurrentUser` for the phone branch — reuse the `clerkUser` already loaded for the email branch.
- **CLAUDE.md gotcha #4**: migration is applied via SQL Editor / Supabase MCP, not the CLI.
- After merge, update `CLAUDE.md` (Authentication section) and add a memory entry noting email is now optional and phone is a parallel identity key.
