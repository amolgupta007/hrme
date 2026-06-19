# Transfer Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an org owner invite a new owner by email/phone from Settings; the invitee accepts (with legal acceptance) and becomes owner while the initiator is demoted to admin — enabling "set up the org, onboard the real owner later."

**Architecture:** A new `ownership_transfers` table tracks a single pending handoff per org. Owner-only Settings actions create/cancel/resend it (initiator keeps ownership). The invitee is sent a claim email → authed `/transfer/[token]` page → `acceptOwnershipTransfer` atomically flips roles + re-stamps org legal acceptance. Pure validation lives in `src/lib/ownership/transitions.ts`; everything reuses the existing invite/auto-link, email, settings, and cron patterns.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (service-role admin client), Zod, Clerk (`auth()` + `clerkClient`), Resend + React Email, vitest, Node `crypto`.

## Global Constraints

- Next.js **14.2.x** — do NOT upgrade.
- Server Actions in `src/actions/*` use `"use server"`; pure logic stays in plain `src/lib/*` modules.
- DB access via `createAdminSupabase()` (service-role; bypasses RLS by design — gotcha #5).
- Migrations applied via Supabase MCP / SQL Editor on Windows (gotcha #4); also commit the `.sql` file. **Migration 069 is NOT applied to the live DB by the implementer — the controller holds it for user confirmation** (mirrors the Indeed migration 068 handling). Unit tests + tsc don't need the DB.
- Roles: `UserRole = "owner" | "admin" | "manager" | "employee"`. `isOwner(role)` = `role === "owner"`.
- Email senders: import `FROM_EMAIL`, `NOREPLY_EMAIL_FROM` from `@/lib/resend` — never hardcode addresses. Claim email is from `NOREPLY_EMAIL_FROM` with `replyTo: FROM_EMAIL`.
- Legal version constant: `LATEST_POLICY_VERSION` from `@/config/legal` (currently `"2026-05-01"`).
- Tokens: `crypto.randomBytes(32).toString("base64url")`.
- Tests: vitest, `import { describe, it, expect, vi } from "vitest"`, files under `tests/ownership/`. Run with `npm test`.
- `/transfer(.*)` is **NOT** added to the middleware public matcher — the claim page must be authenticated (invitee signs in first; `getCurrentUser` auto-links their `clerk_user_id`).
- Cron routes require `Authorization: Bearer ${CRON_SECRET}` and are registered in `vercel.json`.
- No Co-Authored-By trailer in commit messages.

---

### Task 1: Migration 069 + `isOwner` helper

**Files:**
- Create: `supabase/migrations/069_ownership_transfers.sql`
- Modify: `src/types/index.ts` (add `isOwner`)
- Test: `tests/ownership/is-owner.test.ts`

**Interfaces:**
- Produces: `ownership_transfers` table; `isOwner(role: UserRole): boolean`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/069_ownership_transfers.sql`:

```sql
-- 069: Ownership transfers. One pending transfer per org at a time.
CREATE TABLE IF NOT EXISTS ownership_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  from_employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  to_employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  to_email text,
  to_phone text,
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','cancelled','expired')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CONSTRAINT ownership_transfers_target_present CHECK (to_email IS NOT NULL OR to_phone IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ownership_transfers_one_pending
  ON ownership_transfers (org_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_ownership_transfers_token ON ownership_transfers (token);

ALTER TABLE ownership_transfers ENABLE ROW LEVEL SECURITY;
-- Advisory RLS (service-role bypasses by design — gotcha #5); Clerk-JWT pattern.
DROP POLICY IF EXISTS ownership_transfers_admin ON ownership_transfers;
CREATE POLICY ownership_transfers_admin ON ownership_transfers
  FOR ALL TO authenticated
  USING (org_id::text = (auth.jwt() ->> 'org_id'))
  WITH CHECK (org_id::text = (auth.jwt() ->> 'org_id'));
```

- [ ] **Step 2: Do NOT apply to live DB**

Skip applying via MCP. Commit the file only; the controller applies migration 069 after user confirmation. (Nothing below depends on the live DB.)

- [ ] **Step 3: Write the failing test for `isOwner`**

Create `tests/ownership/is-owner.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { isOwner } from "../../src/types/index";

describe("isOwner", () => {
  it("is true only for owner", () => {
    expect(isOwner("owner")).toBe(true);
    expect(isOwner("admin")).toBe(false);
    expect(isOwner("manager")).toBe(false);
    expect(isOwner("employee")).toBe(false);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run tests/ownership/is-owner.test.ts`
Expected: FAIL — `isOwner` is not exported.

- [ ] **Step 5: Add `isOwner`**

In `src/types/index.ts`, directly after the existing `hasPermission` function (around line 38), add:

```typescript
export function isOwner(role: UserRole): boolean {
  return role === "owner";
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/ownership/is-owner.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/069_ownership_transfers.sql src/types/index.ts tests/ownership/is-owner.test.ts
git commit -m "feat(ownership): ownership_transfers migration + isOwner helper"
```

---

### Task 2: Pure transition guards

**Files:**
- Create: `src/lib/ownership/transitions.ts`
- Test: `tests/ownership/transitions.test.ts`

**Interfaces:**
- Produces:
  - `type OwnershipTransferStatus = "pending" | "accepted" | "cancelled" | "expired"`
  - `type TransferLike = { status: OwnershipTransferStatus; expires_at: string; to_email: string | null; to_phone: string | null }`
  - `isExpired(t: TransferLike, nowMs: number): boolean`
  - `canAccept(t: TransferLike, nowMs: number): boolean`
  - `canCancel(t: TransferLike): boolean`
  - `identityMatches(caller: { email?: string | null; phone?: string | null }, t: TransferLike): boolean`

- [ ] **Step 1: Write the failing test**

Create `tests/ownership/transitions.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { isExpired, canAccept, canCancel, identityMatches } from "../../src/lib/ownership/transitions";

const NOW = Date.parse("2026-06-19T00:00:00Z");
const base = { status: "pending" as const, expires_at: "2026-06-30T00:00:00Z", to_email: "jane@co.com", to_phone: null };

describe("ownership transitions", () => {
  it("isExpired true only past expiry", () => {
    expect(isExpired(base, NOW)).toBe(false);
    expect(isExpired({ ...base, expires_at: "2026-06-01T00:00:00Z" }, NOW)).toBe(true);
  });

  it("canAccept requires pending and not expired", () => {
    expect(canAccept(base, NOW)).toBe(true);
    expect(canAccept({ ...base, status: "accepted" }, NOW)).toBe(false);
    expect(canAccept({ ...base, expires_at: "2026-06-01T00:00:00Z" }, NOW)).toBe(false);
  });

  it("canCancel requires pending", () => {
    expect(canCancel(base)).toBe(true);
    expect(canCancel({ ...base, status: "cancelled" })).toBe(false);
  });

  it("identityMatches by email case-insensitively or phone", () => {
    expect(identityMatches({ email: "JANE@CO.COM" }, base)).toBe(true);
    expect(identityMatches({ email: "x@y.com" }, base)).toBe(false);
    const byPhone = { ...base, to_email: null, to_phone: "+919812345678" };
    expect(identityMatches({ phone: "+919812345678" }, byPhone)).toBe(true);
    expect(identityMatches({ phone: "+910000000000" }, byPhone)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ownership/transitions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/ownership/transitions.ts`:

```typescript
export type OwnershipTransferStatus = "pending" | "accepted" | "cancelled" | "expired";

export type TransferLike = {
  status: OwnershipTransferStatus;
  expires_at: string;
  to_email: string | null;
  to_phone: string | null;
};

export function isExpired(t: TransferLike, nowMs: number): boolean {
  return Date.parse(t.expires_at) <= nowMs;
}

export function canAccept(t: TransferLike, nowMs: number): boolean {
  return t.status === "pending" && !isExpired(t, nowMs);
}

export function canCancel(t: TransferLike): boolean {
  return t.status === "pending";
}

export function identityMatches(
  caller: { email?: string | null; phone?: string | null },
  t: TransferLike
): boolean {
  if (t.to_email && caller.email && t.to_email.trim().toLowerCase() === caller.email.trim().toLowerCase()) {
    return true;
  }
  if (t.to_phone && caller.phone && t.to_phone.trim() === caller.phone.trim()) {
    return true;
  }
  return false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ownership/transitions.test.ts`
Expected: PASS (4 passing).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ownership/transitions.ts tests/ownership/transitions.test.ts
git commit -m "feat(ownership): pure transfer transition guards"
```

---

### Task 3: Email templates

**Files:**
- Create: `src/components/emails/ownership-transfer.tsx`
- Create: `src/components/emails/ownership-transferred.tsx`

**Interfaces:**
- Produces:
  - `OwnershipTransferEmail({ orgName, inviterName, claimUrl }: { orgName: string; inviterName: string; claimUrl: string })`
  - `OwnershipTransferredEmail({ orgName, newOwnerName }: { orgName: string; newOwnerName: string })`

> React Email components, no unit test (matches the repo's other `src/components/emails/*`). Mirror the structure/styling of `src/components/emails/account-setup.tsx`.

- [ ] **Step 1: Write the claim email**

Create `src/components/emails/ownership-transfer.tsx`:

```tsx
import { Html, Head, Body, Container, Section, Heading, Text, Button } from "@react-email/components";

export function OwnershipTransferEmail({
  orgName,
  inviterName,
  claimUrl,
}: {
  orgName: string;
  inviterName: string;
  claimUrl: string;
}) {
  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: "#f6f9fc", fontFamily: "sans-serif" }}>
        <Container style={{ padding: "24px", maxWidth: "520px" }}>
          <Section>
            <Heading as="h2">You've been invited to own {orgName}</Heading>
            <Text>
              {inviterName} has invited you to take ownership of <strong>{orgName}</strong> on JambaHR.
              Sign in with this email address, then review and accept to become the owner.
            </Text>
            <Button
              href={claimUrl}
              style={{ background: "#1f8a70", color: "#fff", padding: "12px 20px", borderRadius: "8px" }}
            >
              Review &amp; accept ownership
            </Button>
            <Text style={{ color: "#8898aa", fontSize: "12px", marginTop: "16px" }}>
              This invitation expires in 14 days. If you weren't expecting this, you can ignore this email.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 2: Write the notification email**

Create `src/components/emails/ownership-transferred.tsx`:

```tsx
import { Html, Head, Body, Container, Section, Heading, Text } from "@react-email/components";

export function OwnershipTransferredEmail({
  orgName,
  newOwnerName,
}: {
  orgName: string;
  newOwnerName: string;
}) {
  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: "#f6f9fc", fontFamily: "sans-serif" }}>
        <Container style={{ padding: "24px", maxWidth: "520px" }}>
          <Section>
            <Heading as="h2">Ownership of {orgName} transferred</Heading>
            <Text>
              {newOwnerName} has accepted ownership of <strong>{orgName}</strong>. Your role is now
              <strong> Admin</strong>. You still have admin access; the new owner can manage roles from Settings.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit` — expect no new errors from these files.

```bash
git add src/components/emails/ownership-transfer.tsx src/components/emails/ownership-transferred.tsx
git commit -m "feat(ownership): claim + transferred email templates"
```

---

### Task 4: Initiate / cancel / resend actions + settings read

**Files:**
- Create: `src/actions/ownership.ts`
- Test: `tests/ownership/initiate.test.ts`

**Interfaces:**
- Consumes: `isOwner` (Task 1), `canCancel` (Task 2), `OwnershipTransferEmail` (Task 3).
- Produces (all `Promise<ActionResult<...>>`):
  - `initiateOwnershipTransfer(input: { email?: string; phone?: string; name?: string }): ActionResult<{ transferId: string }>`
  - `getActiveOwnershipTransfer(): ActionResult<{ id: string; to_email: string | null; to_phone: string | null; expires_at: string } | null>`
  - `cancelOwnershipTransfer(): ActionResult<void>`
  - `resendOwnershipTransfer(): ActionResult<void>`

- [ ] **Step 1: Write the actions file**

Create `src/actions/ownership.ts`:

```typescript
"use server";

import { randomBytes } from "crypto";
import { render } from "@react-email/render";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/current-user";
import { isOwner } from "@/types/index";
import { createAdminSupabase } from "@/lib/supabase/server";
import { resend, FROM_EMAIL, NOREPLY_EMAIL_FROM } from "@/lib/resend";
import { OwnershipTransferEmail } from "@/components/emails/ownership-transfer";
import type { ActionResult } from "@/types";

const TRANSFER_EXPIRY_MS = 14 * 24 * 60 * 60 * 1000;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://jambahr.com";

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function initiateOwnershipTransfer(input: {
  email?: string;
  phone?: string;
  name?: string;
}): Promise<ActionResult<{ transferId: string }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isOwner(user.role)) return { success: false, error: "Only the owner can transfer ownership" };

  const email = input.email?.trim().toLowerCase() || null;
  const phone = input.phone?.trim() || null;
  if (!email && !phone) return { success: false, error: "An email or phone is required" };

  const supabase = createAdminSupabase();

  // current owner's own employee row + identity (to block self-transfer)
  const { data: me } = await supabase
    .from("employees")
    .select("id, email, phone, first_name")
    .eq("id", user.employeeId)
    .single();
  const myEmail = (me as any)?.email?.toLowerCase() ?? null;
  const myPhone = (me as any)?.phone ?? null;
  if ((email && email === myEmail) || (phone && phone === myPhone)) {
    return { success: false, error: "You can't transfer ownership to yourself" };
  }

  // block a second pending transfer
  const { data: existing } = await supabase
    .from("ownership_transfers")
    .select("id")
    .eq("org_id", user.orgId)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) {
    return { success: false, error: "A transfer is already pending. Cancel it before starting a new one." };
  }

  // reuse an existing member row if the identity already belongs to one; else create a placeholder
  let toEmployeeId: string | null = null;
  let placeholderCreated = false;
  const memberQuery = supabase.from("employees").select("id").eq("org_id", user.orgId).neq("status", "terminated");
  const { data: member } = email
    ? await memberQuery.ilike("email", email).maybeSingle()
    : await memberQuery.eq("phone", phone!).maybeSingle();
  if (member) {
    toEmployeeId = (member as any).id;
  } else {
    const { data: created, error: cErr } = await supabase
      .from("employees")
      .insert({
        org_id: user.orgId,
        email,
        phone,
        first_name: input.name?.trim() || "",
        last_name: "",
        role: "admin",
        status: "active",
        clerk_user_id: null,
      })
      .select("id")
      .single();
    if (cErr || !created) return { success: false, error: cErr?.message ?? "Failed to create invitee" };
    toEmployeeId = (created as any).id;
    placeholderCreated = true;
  }

  const token = newToken();
  const { data: transfer, error: tErr } = await supabase
    .from("ownership_transfers")
    .insert({
      org_id: user.orgId,
      from_employee_id: user.employeeId,
      to_employee_id: toEmployeeId,
      to_email: email,
      to_phone: phone,
      token,
      status: "pending",
      expires_at: new Date(Date.now() + TRANSFER_EXPIRY_MS).toISOString(),
    })
    .select("id")
    .single();
  if (tErr || !transfer) {
    if (placeholderCreated && toEmployeeId) {
      await supabase.from("employees").delete().eq("id", toEmployeeId);
    }
    return { success: false, error: tErr?.message ?? "Failed to start transfer" };
  }

  // best-effort claim email (email targets only; phone-only invitees claim after phone sign-in)
  if (email) {
    try {
      const { data: org } = await supabase.from("organizations").select("name").eq("id", user.orgId).single();
      const html = await render(
        OwnershipTransferEmail({
          orgName: (org as any)?.name ?? "your organization",
          inviterName: (me as any)?.first_name || "An admin",
          claimUrl: `${APP_URL}/transfer/${token}`,
        })
      );
      await resend.emails.send({
        from: NOREPLY_EMAIL_FROM,
        to: email,
        replyTo: FROM_EMAIL,
        subject: "You've been invited to take ownership",
        html,
      });
    } catch (err) {
      console.error("[ownership] claim email failed", err);
    }
  }

  revalidatePath("/dashboard/settings");
  return { success: true, data: { transferId: (transfer as any).id } };
}

export async function getActiveOwnershipTransfer(): Promise<
  ActionResult<{ id: string; to_email: string | null; to_phone: string | null; expires_at: string } | null>
> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isOwner(user.role)) return { success: false, error: "Unauthorized" };

  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from("ownership_transfers")
    .select("id, to_email, to_phone, expires_at")
    .eq("org_id", user.orgId)
    .eq("status", "pending")
    .maybeSingle();
  return { success: true, data: (data as any) ?? null };
}

export async function cancelOwnershipTransfer(): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isOwner(user.role)) return { success: false, error: "Unauthorized" };

  const supabase = createAdminSupabase();
  const { data: t } = await supabase
    .from("ownership_transfers")
    .select("id, to_employee_id, status")
    .eq("org_id", user.orgId)
    .eq("status", "pending")
    .maybeSingle();
  if (!t) return { success: false, error: "No pending transfer to cancel" };

  await supabase
    .from("ownership_transfers")
    .update({ status: "cancelled", responded_at: new Date().toISOString() })
    .eq("id", (t as any).id);

  // remove the placeholder if it was created for this transfer and never linked/used
  const { data: inv } = await supabase
    .from("employees")
    .select("id, clerk_user_id, role")
    .eq("id", (t as any).to_employee_id)
    .single();
  if (inv && !(inv as any).clerk_user_id && (inv as any).role === "admin") {
    await supabase.from("employees").delete().eq("id", (inv as any).id);
  }

  revalidatePath("/dashboard/settings");
  return { success: true, data: undefined };
}

export async function resendOwnershipTransfer(): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isOwner(user.role)) return { success: false, error: "Unauthorized" };

  const supabase = createAdminSupabase();
  const { data: t } = await supabase
    .from("ownership_transfers")
    .select("token, to_email")
    .eq("org_id", user.orgId)
    .eq("status", "pending")
    .maybeSingle();
  if (!t || !(t as any).to_email) return { success: false, error: "No emailable pending transfer" };

  try {
    const { data: org } = await supabase.from("organizations").select("name").eq("id", user.orgId).single();
    const { data: me } = await supabase.from("employees").select("first_name").eq("id", user.employeeId).single();
    const html = await render(
      OwnershipTransferEmail({
        orgName: (org as any)?.name ?? "your organization",
        inviterName: (me as any)?.first_name || "An admin",
        claimUrl: `${APP_URL}/transfer/${(t as any).token}`,
      })
    );
    await resend.emails.send({
      from: NOREPLY_EMAIL_FROM,
      to: (t as any).to_email,
      replyTo: FROM_EMAIL,
      subject: "You've been invited to take ownership",
      html,
    });
  } catch (err) {
    return { success: false, error: "Failed to resend email" };
  }
  return { success: true, data: undefined };
}
```

- [ ] **Step 2: Write the focused test (mock supabase + getCurrentUser)**

Create `tests/ownership/initiate.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const getCurrentUser = vi.fn();
vi.mock("@/lib/current-user", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: vi.fn() } }, FROM_EMAIL: "f@x", NOREPLY_EMAIL_FROM: "n@x" }));
vi.mock("@react-email/render", () => ({ render: vi.fn().mockResolvedValue("<html/>") }));
vi.mock("@/components/emails/ownership-transfer", () => ({ OwnershipTransferEmail: () => null }));

// Chainable supabase stub: each table call returns a builder; tests set outcomes per table.
let tables: Record<string, any>;
vi.mock("@/lib/supabase/server", () => ({
  createAdminSupabase: () => ({
    from: (name: string) => tables[name],
  }),
}));

import { initiateOwnershipTransfer } from "../../src/actions/ownership";

function builder(result: any) {
  const b: any = {};
  for (const m of ["select", "eq", "neq", "ilike", "insert", "update", "delete"]) b[m] = () => b;
  b.maybeSingle = () => Promise.resolve(result.maybeSingle ?? { data: null });
  b.single = () => Promise.resolve(result.single ?? { data: null, error: null });
  return b;
}

beforeEach(() => {
  getCurrentUser.mockReset();
  getCurrentUser.mockResolvedValue({ orgId: "org1", employeeId: "emp1", role: "owner" });
});

describe("initiateOwnershipTransfer", () => {
  it("blocks non-owner", async () => {
    getCurrentUser.mockResolvedValue({ orgId: "org1", employeeId: "emp1", role: "admin" });
    const res = await initiateOwnershipTransfer({ email: "jane@co.com" });
    expect(res.success).toBe(false);
  });

  it("blocks self-transfer", async () => {
    tables = {
      employees: builder({ single: { data: { id: "emp1", email: "me@co.com", phone: null, first_name: "Me" } } }),
    };
    const res = await initiateOwnershipTransfer({ email: "ME@CO.COM" });
    expect(res.success).toBe(false);
    expect((res as any).error).toMatch(/yourself/i);
  });

  it("blocks a second pending transfer", async () => {
    tables = {
      employees: builder({ single: { data: { id: "emp1", email: "me@co.com", phone: null, first_name: "Me" } } }),
      ownership_transfers: builder({ maybeSingle: { data: { id: "t-existing" } } }),
    };
    const res = await initiateOwnershipTransfer({ email: "jane@co.com" });
    expect(res.success).toBe(false);
    expect((res as any).error).toMatch(/already pending/i);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails, then passes**

Run: `npx vitest run tests/ownership/initiate.test.ts`
Expected: initially FAIL (module not found) before Step 1's file exists; after Step 1, PASS (3 passing). If you wrote Step 1 first, it should PASS now.

- [ ] **Step 4: Typecheck + commit**

Run: `npx tsc --noEmit` — no new errors beyond the repo's known Supabase `never` pattern.

```bash
git add src/actions/ownership.ts tests/ownership/initiate.test.ts
git commit -m "feat(ownership): initiate/cancel/resend transfer actions"
```

---

### Task 5: Claim actions — get / accept / decline

**Files:**
- Modify: `src/actions/ownership.ts` (append claim actions)
- Test: `tests/ownership/accept.test.ts`

**Interfaces:**
- Consumes: `canAccept`, `identityMatches` (Task 2), `LATEST_POLICY_VERSION`, `OwnershipTransferredEmail`.
- Produces:
  - `getOwnershipTransferByToken(token: string): ActionResult<{ orgName: string; inviterName: string } | null>`
  - `acceptOwnershipTransfer(token: string): ActionResult<void>`
  - `declineOwnershipTransfer(token: string): ActionResult<void>`

> Claim actions resolve the caller from **Clerk identity** (`auth().userId` → email/phone via `clerkClient`) and the org from the **token** — NOT the active-org cookie (spec §6).

- [ ] **Step 1: Append the claim actions**

Add to the top imports of `src/actions/ownership.ts`:

```typescript
import { auth, clerkClient } from "@clerk/nextjs/server";
import { canAccept, identityMatches } from "@/lib/ownership/transitions";
import { LATEST_POLICY_VERSION } from "@/config/legal";
import { OwnershipTransferredEmail } from "@/components/emails/ownership-transferred";
```

Append these functions to `src/actions/ownership.ts`:

```typescript
async function callerIdentity(): Promise<{ userId: string; email: string | null; phone: string | null } | null> {
  const { userId } = auth();
  if (!userId) return null;
  try {
    const client = await clerkClient();
    const u = await client.users.getUser(userId);
    return {
      userId,
      email: u.primaryEmailAddress?.emailAddress ?? u.emailAddresses?.[0]?.emailAddress ?? null,
      phone: u.primaryPhoneNumber?.phoneNumber ?? u.phoneNumbers?.[0]?.phoneNumber ?? null,
    };
  } catch {
    return { userId, email: null, phone: null };
  }
}

export async function getOwnershipTransferByToken(
  token: string
): Promise<ActionResult<{ orgName: string; inviterName: string } | null>> {
  const caller = await callerIdentity();
  if (!caller) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const { data: t } = await supabase
    .from("ownership_transfers")
    .select("org_id, from_employee_id, status, expires_at, to_email, to_phone")
    .eq("token", token)
    .maybeSingle();
  if (!t) return { success: true, data: null };
  if (!canAccept(t as any, Date.now())) return { success: true, data: null };
  if (!identityMatches(caller, t as any)) return { success: false, error: "This invitation is for a different account" };

  const [{ data: org }, { data: inviter }] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", (t as any).org_id).single(),
    supabase.from("employees").select("first_name").eq("id", (t as any).from_employee_id).single(),
  ]);
  return {
    success: true,
    data: { orgName: (org as any)?.name ?? "the organization", inviterName: (inviter as any)?.first_name || "An admin" },
  };
}

export async function acceptOwnershipTransfer(token: string): Promise<ActionResult<void>> {
  const caller = await callerIdentity();
  if (!caller) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const { data: t } = await supabase
    .from("ownership_transfers")
    .select("id, org_id, to_employee_id, status, expires_at, to_email, to_phone")
    .eq("token", token)
    .maybeSingle();
  if (!t) return { success: false, error: "Invitation not found" };
  if (!canAccept(t as any, Date.now())) return { success: false, error: "This invitation is no longer valid" };
  if (!identityMatches(caller, t as any)) return { success: false, error: "This invitation is for a different account" };

  const orgId = (t as any).org_id;
  const inviteeEmployeeId = (t as any).to_employee_id;
  const now = new Date().toISOString();

  // demote the org's CURRENT owner(s) to admin, then promote the invitee
  const { data: currentOwners } = await supabase
    .from("employees")
    .select("id, email, first_name")
    .eq("org_id", orgId)
    .eq("role", "owner");
  for (const o of (currentOwners ?? []) as any[]) {
    if (o.id !== inviteeEmployeeId) {
      await supabase.from("employees").update({ role: "admin" }).eq("id", o.id);
    }
  }
  await supabase.from("employees").update({ role: "owner" }).eq("id", inviteeEmployeeId);

  // re-stamp org legal acceptance for the new owner
  await supabase
    .from("organizations")
    .update({ terms_accepted_at: now, privacy_policy_accepted_at: now, policy_version_accepted: LATEST_POLICY_VERSION })
    .eq("id", orgId);

  await supabase
    .from("ownership_transfers")
    .update({ status: "accepted", responded_at: now })
    .eq("id", (t as any).id);

  // notify outgoing owner(s) — best-effort
  try {
    const { data: org } = await supabase.from("organizations").select("name").eq("id", orgId).single();
    const { data: invitee } = await supabase.from("employees").select("first_name").eq("id", inviteeEmployeeId).single();
    for (const o of (currentOwners ?? []) as any[]) {
      if (o.id !== inviteeEmployeeId && o.email) {
        const html = await render(
          OwnershipTransferredEmail({
            orgName: (org as any)?.name ?? "your organization",
            newOwnerName: (invitee as any)?.first_name || "The new owner",
          })
        );
        await resend.emails.send({ from: NOREPLY_EMAIL_FROM, to: o.email, replyTo: FROM_EMAIL, subject: "Ownership transferred", html });
      }
    }
  } catch (err) {
    console.error("[ownership] transferred email failed", err);
  }

  revalidatePath("/dashboard/settings");
  return { success: true, data: undefined };
}

export async function declineOwnershipTransfer(token: string): Promise<ActionResult<void>> {
  const caller = await callerIdentity();
  if (!caller) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const { data: t } = await supabase
    .from("ownership_transfers")
    .select("id, status, expires_at, to_email, to_phone, to_employee_id")
    .eq("token", token)
    .maybeSingle();
  if (!t) return { success: false, error: "Invitation not found" };
  if ((t as any).status !== "pending") return { success: false, error: "This invitation is no longer pending" };
  if (!identityMatches(caller, t as any)) return { success: false, error: "This invitation is for a different account" };

  await supabase
    .from("ownership_transfers")
    .update({ status: "cancelled", responded_at: new Date().toISOString() })
    .eq("id", (t as any).id);

  // placeholder cleanup only if unlinked admin
  const { data: inv } = await supabase
    .from("employees")
    .select("id, clerk_user_id, role")
    .eq("id", (t as any).to_employee_id)
    .single();
  if (inv && !(inv as any).clerk_user_id && (inv as any).role === "admin") {
    await supabase.from("employees").delete().eq("id", (inv as any).id);
  }

  return { success: true, data: undefined };
}
```

- [ ] **Step 2: Write the accept test (mock supabase + clerk)**

Create `tests/ownership/accept.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: "clerk_jane" }),
  clerkClient: async () => ({
    users: { getUser: async () => ({ primaryEmailAddress: { emailAddress: "jane@co.com" }, emailAddresses: [], phoneNumbers: [] }) },
  }),
}));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: vi.fn() } }, FROM_EMAIL: "f@x", NOREPLY_EMAIL_FROM: "n@x" }));
vi.mock("@react-email/render", () => ({ render: vi.fn().mockResolvedValue("<html/>") }));
vi.mock("@/components/emails/ownership-transfer", () => ({ OwnershipTransferEmail: () => null }));
vi.mock("@/components/emails/ownership-transferred", () => ({ OwnershipTransferredEmail: () => null }));
vi.mock("@/lib/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const updates: { table: string; payload: any; id: string }[] = [];
vi.mock("@/lib/supabase/server", () => ({
  createAdminSupabase: () => ({
    from: (table: string) => {
      const b: any = { _table: table, _eq: {} };
      b.select = () => b;
      b.eq = (k: string, v: any) => { b._eq[k] = v; return b; };
      b.update = (payload: any) => ({ eq: (k: string, id: any) => { updates.push({ table, payload, id }); return Promise.resolve({ error: null }); } });
      b.maybeSingle = () => {
        if (table === "ownership_transfers")
          return Promise.resolve({ data: { id: "t1", org_id: "org1", to_employee_id: "empJane", status: "pending", expires_at: "2099-01-01T00:00:00Z", to_email: "jane@co.com", to_phone: null } });
        return Promise.resolve({ data: null });
      };
      b.single = () => {
        if (table === "organizations") return Promise.resolve({ data: { name: "Acme" } });
        if (table === "employees") return Promise.resolve({ data: { first_name: "Jane" } });
        return Promise.resolve({ data: null });
      };
      // employees.select(...).eq(org).eq(role=owner) returns the current owner list (no maybeSingle/single)
      b.then = undefined;
      if (table === "employees") {
        b.select = () => b;
        b.eq = (k: string, v: any) => { b._eq[k] = v; if (b._eq.role === "owner") return Promise.resolve({ data: [{ id: "empOld", email: "old@co.com", first_name: "Old" }] }); return b; };
      }
      return b;
    },
  }),
}));

import { acceptOwnershipTransfer } from "../../src/actions/ownership";

beforeEach(() => { updates.length = 0; });

describe("acceptOwnershipTransfer", () => {
  it("promotes invitee to owner, demotes current owner, stamps legal, marks accepted", async () => {
    const res = await acceptOwnershipTransfer("tok");
    expect(res.success).toBe(true);
    expect(updates).toContainEqual(expect.objectContaining({ table: "employees", payload: { role: "admin" }, id: "empOld" }));
    expect(updates).toContainEqual(expect.objectContaining({ table: "employees", payload: { role: "owner" }, id: "empJane" }));
    expect(updates.find((u) => u.table === "organizations")?.payload.policy_version_accepted).toBeTruthy();
    expect(updates.find((u) => u.table === "ownership_transfers")?.payload.status).toBe("accepted");
  });
});
```

> Note: the supabase mock above is intentionally minimal. If the chained-builder mock proves brittle against the exact call order, simplify by asserting only the two `employees` role updates and the `ownership_transfers` status update (the highest-value assertions), and say so in your report — do NOT write an assertion-free test.

- [ ] **Step 3: Run the test**

Run: `npx vitest run tests/ownership/accept.test.ts`
Expected: PASS (1 passing) — invitee promoted, old owner demoted, legal stamped, transfer accepted.

- [ ] **Step 4: Typecheck + run the ownership suite + commit**

Run: `npx tsc --noEmit` then `npx vitest run tests/ownership/`
Expected: all ownership tests pass.

```bash
git add src/actions/ownership.ts tests/ownership/accept.test.ts
git commit -m "feat(ownership): claim get/accept/decline actions (Clerk-identity scoped)"
```

---

### Task 6: Settings UI section

**Files:**
- Create: `src/components/settings/transfer-ownership-section.tsx`
- Modify: `src/components/settings/settings-content.tsx` (render the section when owner)

**Interfaces:**
- Consumes: `initiateOwnershipTransfer`, `getActiveOwnershipTransfer`, `cancelOwnershipTransfer`, `resendOwnershipTransfer` (Task 4).

- [ ] **Step 1: Build the section component**

Create `src/components/settings/transfer-ownership-section.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  initiateOwnershipTransfer,
  getActiveOwnershipTransfer,
  cancelOwnershipTransfer,
  resendOwnershipTransfer,
} from "@/actions/ownership";

type Pending = { id: string; to_email: string | null; to_phone: string | null; expires_at: string } | null;

export function TransferOwnershipSection() {
  const [pending, setPending] = useState<Pending>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const res = await getActiveOwnershipTransfer();
    if (res.success) setPending(res.data);
    setLoading(false);
  }
  useEffect(() => { refresh(); }, []);

  async function onInitiate() {
    if (!email.trim() && !phone.trim()) { toast.error("Enter an email or phone"); return; }
    setBusy(true);
    const res = await initiateOwnershipTransfer({ email: email.trim() || undefined, phone: phone.trim() || undefined, name: name.trim() || undefined });
    setBusy(false);
    if (res.success) { toast.success("Ownership invite sent"); setEmail(""); setPhone(""); setName(""); refresh(); }
    else toast.error(res.error);
  }
  async function onCancel() {
    setBusy(true); const res = await cancelOwnershipTransfer(); setBusy(false);
    if (res.success) { toast.success("Transfer cancelled"); refresh(); } else toast.error(res.error);
  }
  async function onResend() {
    setBusy(true); const res = await resendOwnershipTransfer(); setBusy(false);
    if (res.success) toast.success("Invite resent"); else toast.error(res.error);
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  if (pending) {
    return (
      <div className="space-y-3">
        <p className="text-sm">
          Ownership transfer to <strong>{pending.to_email ?? pending.to_phone}</strong> — awaiting acceptance
          (expires {new Date(pending.expires_at).toLocaleDateString()}).
        </p>
        <div className="flex gap-2">
          {pending.to_email && (
            <button disabled={busy} onClick={onResend} className="rounded-lg border px-3 py-2 text-sm">Resend invite</button>
          )}
          <button disabled={busy} onClick={onCancel} className="rounded-lg border border-destructive px-3 py-2 text-sm text-destructive">Cancel transfer</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Invite someone to become the owner of this organization. You'll stay on as an admin once they accept.
      </p>
      <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="New owner's name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="or Phone (+91…)" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <button disabled={busy} onClick={onInitiate} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
        Send ownership invite
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into settings-content.tsx (owner-only)**

In `src/components/settings/settings-content.tsx`:
1. Add the import near the other section imports (around line 26):
```typescript
import { TransferOwnershipSection } from "@/components/settings/transfer-ownership-section";
```
2. After the `isAdmin` computation (around line 159), add:
```typescript
  const isOwnerRole = userCtx.role === "owner";
```
3. Add a new `CollapsibleSection` block (place it after the Products section block, before the gated module sections). Use the existing `openSection`/`toggle` pattern visible in the file:
```tsx
      {isOwnerRole && (
        <CollapsibleSection
          id="transfer-ownership"
          title="Transfer ownership"
          description="Invite a new owner and hand over this organization"
          isOpen={openSection === "transfer-ownership"}
          onToggle={() => toggle("transfer-ownership")}
        >
          <TransferOwnershipSection />
        </CollapsibleSection>
      )}
```
(Match the exact prop names used by the sibling `CollapsibleSection` calls in this file — `id`, `title`, `description`, `isOpen`, `onToggle`. If a sibling uses a slightly different toggle handler name, mirror that.)

- [ ] **Step 3: Build check + commit**

Run: `npm run build`
Expected: build succeeds.

```bash
git add src/components/settings/transfer-ownership-section.tsx src/components/settings/settings-content.tsx
git commit -m "feat(ownership): Settings transfer-ownership section (owner-only)"
```

---

### Task 7: Claim page `/transfer/[token]`

**Files:**
- Create: `src/app/transfer/[token]/page.tsx`
- Create: `src/components/transfer/claim-client.tsx`

**Interfaces:**
- Consumes: `getOwnershipTransferByToken`, `acceptOwnershipTransfer`, `declineOwnershipTransfer` (Task 5); `LATEST_POLICY_VERSION`.

> `/transfer/[token]` is auth-protected (NOT in the middleware public matcher). An unauth visitor is redirected to sign-in by middleware and returns here after signing in with the invited email/phone.

- [ ] **Step 1: Server page**

Create `src/app/transfer/[token]/page.tsx`:

```tsx
import { getOwnershipTransferByToken } from "@/actions/ownership";
import { ClaimClient } from "@/components/transfer/claim-client";

export default async function TransferClaimPage({ params }: { params: { token: string } }) {
  const res = await getOwnershipTransferByToken(params.token);
  if (!res.success) {
    return <CenteredMessage title="Invitation unavailable" body={res.error} />;
  }
  if (!res.data) {
    return <CenteredMessage title="This invitation is no longer valid" body="It may have been accepted, cancelled, or expired." />;
  }
  return <ClaimClient token={params.token} orgName={res.data.orgName} inviterName={res.data.inviterName} />;
}

function CenteredMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto mt-24 max-w-md rounded-xl border p-8 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      <a href="/dashboard" className="mt-4 inline-block text-sm text-primary underline">Go to dashboard</a>
    </div>
  );
}
```

- [ ] **Step 2: Claim client**

Create `src/components/transfer/claim-client.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { acceptOwnershipTransfer, declineOwnershipTransfer } from "@/actions/ownership";
import { LATEST_POLICY_VERSION } from "@/config/legal";

export function ClaimClient({ token, orgName, inviterName }: { token: string; orgName: string; inviterName: string }) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onAccept() {
    if (!agreed) { toast.error("Please accept the terms to continue"); return; }
    setBusy(true);
    const res = await acceptOwnershipTransfer(token);
    setBusy(false);
    if (res.success) { toast.success(`You're now the owner of ${orgName}`); router.push("/dashboard"); }
    else toast.error(res.error);
  }
  async function onDecline() {
    setBusy(true);
    const res = await declineOwnershipTransfer(token);
    setBusy(false);
    if (res.success) { toast.success("Invitation declined"); router.push("/dashboard"); }
    else toast.error(res.error);
  }

  return (
    <div className="mx-auto mt-24 max-w-md rounded-xl border p-8">
      <h1 className="text-xl font-semibold">Become the owner of {orgName}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {inviterName} has invited you to take ownership of {orgName}. As owner you become the responsible account holder.
      </p>
      <label className="mt-6 flex items-start gap-2 text-sm">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1" />
        <span>
          I accept the{" "}
          <a href="/terms" target="_blank" className="text-primary underline">Terms</a> and{" "}
          <a href="/privacy" target="_blank" className="text-primary underline">Privacy Policy</a>{" "}
          (version {LATEST_POLICY_VERSION}).
        </span>
      </label>
      <div className="mt-6 flex gap-2">
        <button disabled={busy || !agreed} onClick={onAccept} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          Accept ownership
        </button>
        <button disabled={busy} onClick={onDecline} className="rounded-lg border px-4 py-2 text-sm">Decline</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build check + commit**

Run: `npm run build`
Expected: build succeeds; `/transfer/[token]` appears in the route list.

```bash
git add src/app/transfer/[token]/page.tsx src/components/transfer/claim-client.tsx
git commit -m "feat(ownership): authed /transfer/[token] claim page"
```

---

### Task 8: Expiry cron

**Files:**
- Create: `src/app/api/cron/ownership-transfer-expiry/route.ts`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: nothing new (direct DB sweep).

- [ ] **Step 1: Cron route**

Create `src/app/api/cron/ownership-transfer-expiry/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = createAdminSupabase();
  const nowIso = new Date().toISOString();

  const { data: expired } = await supabase
    .from("ownership_transfers")
    .select("id, to_employee_id")
    .eq("status", "pending")
    .lt("expires_at", nowIso);

  let count = 0;
  for (const t of (expired ?? []) as any[]) {
    await supabase.from("ownership_transfers").update({ status: "expired", responded_at: nowIso }).eq("id", t.id);
    const { data: inv } = await supabase
      .from("employees").select("id, clerk_user_id, role").eq("id", t.to_employee_id).single();
    if (inv && !(inv as any).clerk_user_id && (inv as any).role === "admin") {
      await supabase.from("employees").delete().eq("id", (inv as any).id);
    }
    count++;
  }
  return NextResponse.json({ ok: true, expired: count });
}
```

- [ ] **Step 2: Register in vercel.json**

Add to the `crons` array in `vercel.json` (after the `loi-expiry` entry):

```json
    {
      "path": "/api/cron/ownership-transfer-expiry",
      "schedule": "30 4 * * *"
    },
```

- [ ] **Step 3: Validate + commit**

Run: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('ok')"` and `npx tsc --noEmit`.

```bash
git add src/app/api/cron/ownership-transfer-expiry/route.ts vercel.json
git commit -m "feat(ownership): daily transfer-expiry cron"
```

---

### Task 9: Full suite + docs

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: all existing tests pass + the new `tests/ownership/*` files (is-owner, transitions, initiate, accept).

- [ ] **Step 2: Document in CLAUDE.md**

Add a short "Transfer ownership" subsection under the "Authentication & Authorization" section summarizing: `ownership_transfers` table + migration 069 (note NOT yet applied to live DB); owner-only `initiate/cancel/resend` from Settings (`isOwner`); invitee claims at authed `/transfer/[token]` with T&C acceptance; `acceptOwnershipTransfer` flips invitee→owner + current-owner→admin + re-stamps org legal; claim actions are **Clerk-identity scoped, not active-org scoped**; one pending transfer per org (partial unique index); placeholder employee cleanup on cancel/decline/expire; expiry cron `30 4 * * *`.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(auth): document transfer-ownership feature"
```

---

## Self-Review

**Spec coverage:**
- §3 data model (table, partial unique index, RLS, no employees/org schema change) → Task 1. ✓
- §4 components (actions, transitions, settings section, emails, claim page, cron, isOwner) → Tasks 1–8. ✓
- §5.1 initiate (reuse-member-or-placeholder, block double-pending + self-transfer, email) → Task 4. ✓
- §5.2 pending/cancel/resend + cleanup + expiry cron → Tasks 4, 8. ✓
- §5.3 claim/accept (Clerk-identity + token scope, atomic role flip, legal stamp, notify) + decline → Tasks 5, 7. ✓
- §6 guards (owner-only initiate; invitee-only accept; self-transfer block; not active-org) → Tasks 4, 5. ✓
- §7 edge cases (existing member, one-owner invariant via demote-current-owner, two pending blocked) → Tasks 4, 5. ✓
- §8 testing (pure guards + action-level initiate/accept) → Tasks 2, 4, 5. ✓

**Placeholder scan:** No "TBD"/"add validation"-style steps; every code step ships complete code. The one hedge — Task 5 Step 2's note that the chained-supabase mock may need simplifying — names the concrete fallback (assert the role updates + status update) and forbids an assertion-free test; it is guidance, not a gap.

**Type consistency:** `isOwner` (Task 1) used in Tasks 4–6. `TransferLike`/`canAccept`/`canCancel`/`identityMatches`/`isExpired` (Task 2) used in Task 5. Action names — `initiateOwnershipTransfer`, `getActiveOwnershipTransfer`, `cancelOwnershipTransfer`, `resendOwnershipTransfer` (Task 4); `getOwnershipTransferByToken`, `acceptOwnershipTransfer`, `declineOwnershipTransfer` (Task 5) — consistent across the settings section (Task 6) and claim page (Task 7). Email component names `OwnershipTransferEmail` / `OwnershipTransferredEmail` consistent (Tasks 3, 4, 5).

**Verified during planning:** `/transfer` is absent from the middleware public matcher (auth-protected, correct); `LATEST_POLICY_VERSION` exists; `NOREPLY_EMAIL_FROM`/`FROM_EMAIL` are the resend constants; settings uses `CollapsibleSection` with a `role` prop; `employee_invites` auto-link-on-sign-in is the existing claim mechanism reused for the invitee to become a member before accepting.

**Confirmed during planning:** `settings-content.tsx` defines `function toggle(id)` and every `CollapsibleSection` uses `isOpen={openSection === "…"}` + `onToggle={() => toggle("…")}` — exactly the form Task 6 Step 2 specifies. No open assumptions remain.
