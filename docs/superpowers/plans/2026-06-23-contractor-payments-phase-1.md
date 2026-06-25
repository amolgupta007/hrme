# Contractor Payments — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `contractor` a real worker type in JambaHR — onboard a contractor, verify their bank, and pay them an ad-hoc fee with correct Section 194J/194C TDS — reusing the existing RazorpayX disbursement, penny-drop, and self-service-payslip rails.

**Architecture:** Two locked decisions drive Phase 1 (see `docs/prds/contractor-features-audit-results.md`):
1. **Access is `employment_type`-gated, not a new role.** Contractors keep `role='employee'`; the sidebar and pages are filtered by `employment_type='contract'`. No churn to `ROLE_HIERARCHY` or existing guards.
2. **One disbursement engine, two worker types.** `disbursement_items.payroll_entry_id` becomes nullable and gains a sibling `contractor_engagement_id`; a new `payContractors` action builds an ad-hoc batch that flows through the unchanged RazorpayX + maker-checker + webhook-reconcile path.

A new `contractor_engagements` table holds the contractor-specific data (rate type, contract dates, TDS section). Contractor TDS is a new pure function in `ctc.ts`. Contractors are excluded from salaried payroll runs and statutory leave seeding.

**Tech Stack:** Next.js 14 App Router (Server Actions), TypeScript strict, Supabase Postgres (RLS, service-role bypass), Zod, RazorpayX HTTP client, Vitest, Tailwind + Radix.

## Global Constraints

- Next.js **14.2.x** — do NOT upgrade.
- All mutations are Server Actions returning `ActionResult<T>` (`{ success: true; data } | { success: false; error }`), guarded by `getCurrentUser()` + `isAdmin(user.role)`, Zod-validated, then `revalidatePath()`.
- DB access via `createAdminSupabase()` (service-role; bypasses RLS by design — gotcha #5). RLS policies are still authored (advisory) using the Clerk-JWT pattern (`auth.jwt() ->> 'org_id'` + `org_role IN ('org:owner','org:admin')`), mirroring `046_disbursement_items.sql`.
- Migrations are **idempotent** (`IF NOT EXISTS` / `DROP ... IF EXISTS`), applied via the Supabase MCP `apply_migration` or SQL Editor (Windows — gotcha #4). Next migration number is **079** (075 is latest committed; 076–078 exist as unapplied files on this branch — verify with `list_migrations` and pick the next free integer at execution time).
- `COMMENT ON COLUMN` via MCP must be a single-string literal (no `||` concat — gotcha).
- All money stored as **integer paise** in disbursement tables (matches `disbursement_items.amount INTEGER`), and as **rupees** in engagement rate fields (matches `salary_structures` numeric convention). Be explicit per field.
- Sender constants only from `src/lib/resend.ts` — never hardcode emails.
- Tests: pure logic only. `import { describe, it, expect } from "vitest"`, `@/` path alias. Run with `npx vitest run <path>`. Server actions / migrations / UI are build-and-manually-verify (no DB in unit tests).
- Indigo primary CTAs are JambaHire-only; this work is under `/dashboard/*` → use global teal `bg-primary`.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/079_contractor_engagements.sql` (create) | `contractor_engagements` table + RLS + updated_at trigger |
| `supabase/migrations/080_disbursement_contractor_support.sql` (create) | `disbursement_items.payroll_entry_id` → nullable; add `contractor_engagement_id`; replace UNIQUE; add `disbursement_batches.kind` |
| `src/lib/contractor/tds.ts` (create) | Pure `computeContractorTDS()` — 194J/194C rates, thresholds, no-PAN bump |
| `tests/contractor/tds.test.ts` (create) | Unit tests for the above |
| `src/lib/contractor/types.ts` (create) | Shared TS types/enums (rate type, TDS section, payee type, engagement status) — non-`"use server"` so client components can import |
| `src/actions/contractors.ts` (create) | `createContractorEngagement`, `updateContractorEngagement`, `listContractorEngagements`, `payContractors` |
| `src/actions/payroll.ts` (modify) | Exclude `employment_type='contract'` from `processPayrollRun` salary-structure query |
| `src/actions/employees.ts` (modify) | Skip leave-policy/balance seeding for `employment_type='contract'` |
| `src/lib/current-user.ts` (modify) | Add `employmentType` to `getCurrentUser()` return |
| `src/types/index.ts` (modify) | Add `employmentType` to the user type; extend `NavItem` with optional `hideForContractor` / `contractorOnly` |
| `src/config/navigation.ts` (modify) | Tag nav items the contractor should NOT see |
| `src/components/layout/sidebar.tsx` (modify) | Filter nav by employment type |
| `src/app/dashboard/contractors/page.tsx` (create) | Admin: contractor list + engagement form + "Pay contractors" entry |
| `src/components/contractors/contractors-client.tsx` (create) | Client wrapper: engagement table, add/edit dialog |
| `src/components/contractors/pay-contractors-dialog.tsx` (create) | Ad-hoc payout: pick contractors, enter amounts, preflight, initiate |

---

### Task 1: `contractor_engagements` table (migration 079)

**Files:**
- Create: `supabase/migrations/079_contractor_engagements.sql`

**Interfaces:**
- Produces: table `contractor_engagements` with columns consumed by Tasks 5–7:
  `id, org_id, employee_id, rate_type ('hourly'|'daily'|'monthly'|'milestone'), rate_amount numeric, tds_section ('194J'|'194C'), payee_type ('individual_huf'|'other'), has_pan boolean, contract_start date, contract_end date, renewal_date date, status ('active'|'ended'), created_at, updated_at`.

- [ ] **Step 1: Write the migration**

```sql
-- 079_contractor_engagements.sql
-- Contractor-specific engagement data. One active engagement per contractor employee.
-- The worker still lives in `employees` with employment_type='contract'; this row holds
-- the rate + contract + TDS-classification metadata that salaried employees don't have.

CREATE TABLE IF NOT EXISTS public.contractor_engagements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  rate_type       TEXT NOT NULL CHECK (rate_type IN ('hourly','daily','monthly','milestone')),
  rate_amount     NUMERIC NOT NULL CHECK (rate_amount >= 0),
  tds_section     TEXT NOT NULL CHECK (tds_section IN ('194J','194C')),
  payee_type      TEXT NOT NULL DEFAULT 'individual_huf' CHECK (payee_type IN ('individual_huf','other')),
  has_pan         BOOLEAN NOT NULL DEFAULT TRUE,
  contract_start  DATE,
  contract_end    DATE,
  renewal_date    DATE,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One active engagement per (org, employee).
CREATE UNIQUE INDEX IF NOT EXISTS contractor_engagements_one_active
  ON public.contractor_engagements (org_id, employee_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS contractor_engagements_org_idx
  ON public.contractor_engagements (org_id, status);

ALTER TABLE public.contractor_engagements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contractor_engagements_admin_all ON public.contractor_engagements;
CREATE POLICY contractor_engagements_admin_all ON public.contractor_engagements FOR ALL
  USING (auth.jwt() ->> 'org_id' = contractor_engagements.org_id::text AND auth.jwt() ->> 'org_role' IN ('org:owner','org:admin'))
  WITH CHECK (auth.jwt() ->> 'org_id' = contractor_engagements.org_id::text AND auth.jwt() ->> 'org_role' IN ('org:owner','org:admin'));

DROP POLICY IF EXISTS contractor_engagements_self_read ON public.contractor_engagements;
CREATE POLICY contractor_engagements_self_read ON public.contractor_engagements FOR SELECT
  USING (auth.jwt() ->> 'org_id' = contractor_engagements.org_id::text AND auth.jwt() ->> 'employee_id' = contractor_engagements.employee_id::text);

DROP TRIGGER IF EXISTS contractor_engagements_set_updated_at ON public.contractor_engagements;
CREATE TRIGGER contractor_engagements_set_updated_at BEFORE UPDATE ON public.contractor_engagements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

- [ ] **Step 2: Controller applies via Supabase MCP**

The controller (not this subagent) applies migration `079_contractor_engagements` to the live DB. This task only writes + commits the SQL file. Do NOT call `apply_migration`. (`update_updated_at_column()` already exists — gotcha #7.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/079_contractor_engagements.sql
git commit -m "feat(contractors): contractor_engagements table (migration 079)"
```

---

### Task 2: `computeContractorTDS()` pure function

**Files:**
- Create: `src/lib/contractor/tds.ts`
- Create: `src/lib/contractor/types.ts`
- Test: `tests/contractor/tds.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 6–7):
  - `types.ts`: `type RateType = "hourly"|"daily"|"monthly"|"milestone"`, `type TdsSection = "194J"|"194C"`, `type PayeeType = "individual_huf"|"other"`, `type EngagementStatus = "active"|"ended"`.
  - `tds.ts`: `computeContractorTDS(input: ContractorTDSInput): ContractorTDSResult` where
    `ContractorTDSInput = { amount: number; section: TdsSection; payeeType: PayeeType; hasPan: boolean; ytdPaid?: number }` (rupees) and
    `ContractorTDSResult = { tds: number; ratePct: number; thresholdApplied: boolean; reason: string }`.

Rules (FY 2025-26, India):
- **194J** (professional/technical fees): 10%. Annual threshold ₹30,000 — below it, no TDS.
- **194C** (contract work): 1% if `payeeType==='individual_huf'`, else 2%. Threshold: single payment ≥ ₹30,000 **or** YTD aggregate ≥ ₹1,00,000.
- **No PAN** (`hasPan===false`): rate becomes 20% under §206AA (overrides both), threshold still applies.
- Threshold test uses `ytdPaid + amount` for the aggregate check; `ytdPaid` defaults to 0.

- [ ] **Step 1: Write the types file**

```typescript
// src/lib/contractor/types.ts
export type RateType = "hourly" | "daily" | "monthly" | "milestone";
export type TdsSection = "194J" | "194C";
export type PayeeType = "individual_huf" | "other";
export type EngagementStatus = "active" | "ended";

export const RATE_TYPE_LABELS: Record<RateType, string> = {
  hourly: "Hourly",
  daily: "Daily",
  monthly: "Monthly",
  milestone: "Per milestone",
};

export const TDS_SECTION_LABELS: Record<TdsSection, string> = {
  "194J": "194J — Professional / technical fees",
  "194C": "194C — Contract work",
};
```

- [ ] **Step 2: Write the failing test**

```typescript
// tests/contractor/tds.test.ts
import { describe, it, expect } from "vitest";
import { computeContractorTDS } from "@/lib/contractor/tds";

describe("computeContractorTDS — 194J professional fees", () => {
  it("deducts 10% above the 30k threshold", () => {
    const r = computeContractorTDS({ amount: 50000, section: "194J", payeeType: "individual_huf", hasPan: true });
    expect(r.ratePct).toBe(10);
    expect(r.tds).toBe(5000);
    expect(r.thresholdApplied).toBe(false);
  });

  it("deducts nothing at or below the 30k threshold", () => {
    const r = computeContractorTDS({ amount: 30000, section: "194J", payeeType: "individual_huf", hasPan: true });
    expect(r.tds).toBe(0);
    expect(r.thresholdApplied).toBe(true);
  });
});

describe("computeContractorTDS — 194C contract work", () => {
  it("uses 1% for individual/HUF", () => {
    const r = computeContractorTDS({ amount: 50000, section: "194C", payeeType: "individual_huf", hasPan: true });
    expect(r.ratePct).toBe(1);
    expect(r.tds).toBe(500);
  });

  it("uses 2% for non-individual payees", () => {
    const r = computeContractorTDS({ amount: 50000, section: "194C", payeeType: "other", hasPan: true });
    expect(r.ratePct).toBe(2);
    expect(r.tds).toBe(1000);
  });

  it("triggers via YTD aggregate even when the single payment is under 30k", () => {
    const r = computeContractorTDS({ amount: 20000, section: "194C", payeeType: "individual_huf", hasPan: true, ytdPaid: 90000 });
    expect(r.thresholdApplied).toBe(false);
    expect(r.tds).toBe(200);
  });

  it("does not trigger when single < 30k and aggregate < 1L", () => {
    const r = computeContractorTDS({ amount: 20000, section: "194C", payeeType: "individual_huf", hasPan: true, ytdPaid: 10000 });
    expect(r.tds).toBe(0);
    expect(r.thresholdApplied).toBe(true);
  });
});

describe("computeContractorTDS — no PAN (§206AA)", () => {
  it("bumps the rate to 20% regardless of section", () => {
    const r = computeContractorTDS({ amount: 50000, section: "194C", payeeType: "individual_huf", hasPan: false });
    expect(r.ratePct).toBe(20);
    expect(r.tds).toBe(10000);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/contractor/tds.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/contractor/tds"`.

- [ ] **Step 4: Write the implementation**

```typescript
// src/lib/contractor/tds.ts
// Pure contractor TDS computation (FY 2025-26). No server/client directive — usable anywhere.
import type { TdsSection, PayeeType } from "@/lib/contractor/types";

const THRESHOLD_194J = 30000;          // annual, ₹
const THRESHOLD_194C_SINGLE = 30000;   // single payment, ₹
const THRESHOLD_194C_AGGREGATE = 100000; // YTD aggregate, ₹
const NO_PAN_RATE = 20;                // §206AA

export interface ContractorTDSInput {
  amount: number;        // this payment, ₹
  section: TdsSection;
  payeeType: PayeeType;
  hasPan: boolean;
  ytdPaid?: number;      // already paid this FY before this payment, ₹
}

export interface ContractorTDSResult {
  tds: number;           // ₹, rounded
  ratePct: number;
  thresholdApplied: boolean; // true => below threshold => no TDS
  reason: string;
}

export function computeContractorTDS(input: ContractorTDSInput): ContractorTDSResult {
  const { amount, section, payeeType, hasPan } = input;
  const ytdPaid = input.ytdPaid ?? 0;

  const belowThreshold =
    section === "194J"
      ? amount <= THRESHOLD_194J
      : amount < THRESHOLD_194C_SINGLE && ytdPaid + amount < THRESHOLD_194C_AGGREGATE;

  if (belowThreshold) {
    return { tds: 0, ratePct: 0, thresholdApplied: true, reason: `Below ${section} threshold` };
  }

  let ratePct: number;
  if (!hasPan) {
    ratePct = NO_PAN_RATE;
  } else if (section === "194J") {
    ratePct = 10;
  } else {
    ratePct = payeeType === "individual_huf" ? 1 : 2;
  }

  const tds = Math.round((amount * ratePct) / 100);
  const reason = hasPan ? `${section} @ ${ratePct}%` : `No PAN — §206AA @ ${ratePct}%`;
  return { tds, ratePct, thresholdApplied: false, reason };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/contractor/tds.test.ts`
Expected: PASS (all 8 tests green).

- [ ] **Step 6: Commit**

```bash
git add src/lib/contractor/tds.ts src/lib/contractor/types.ts tests/contractor/tds.test.ts
git commit -m "feat(contractors): pure computeContractorTDS (194J/194C, no-PAN §206AA)"
```

---

### Task 3: Disbursement schema reuse (migration 080)

**Files:**
- Create: `supabase/migrations/080_disbursement_contractor_support.sql`

**Interfaces:**
- Produces (consumed by Task 6): `disbursement_items.payroll_entry_id` nullable; new nullable `disbursement_items.contractor_engagement_id UUID REFERENCES contractor_engagements(id)`; new `disbursement_batches.kind ('payroll'|'contractor', default 'payroll')`. Old `UNIQUE (batch_id, payroll_entry_id)` replaced with two partial unique indexes so both worker types are de-duped within a batch.

- [ ] **Step 1: Write the migration**

```sql
-- 080_disbursement_contractor_support.sql
-- One disbursement engine, two worker types. Salaried items still carry payroll_entry_id;
-- contractor items carry contractor_engagement_id instead. Exactly one of the two is set.

ALTER TABLE public.disbursement_items
  ALTER COLUMN payroll_entry_id DROP NOT NULL;

ALTER TABLE public.disbursement_items
  ADD COLUMN IF NOT EXISTS contractor_engagement_id UUID
    REFERENCES public.contractor_engagements(id) ON DELETE CASCADE;

-- Exactly one source FK per item.
ALTER TABLE public.disbursement_items
  DROP CONSTRAINT IF EXISTS disbursement_items_one_source;
ALTER TABLE public.disbursement_items
  ADD CONSTRAINT disbursement_items_one_source CHECK (
    (payroll_entry_id IS NOT NULL AND contractor_engagement_id IS NULL) OR
    (payroll_entry_id IS NULL AND contractor_engagement_id IS NOT NULL)
  );

-- Replace the old composite UNIQUE (which assumed payroll_entry_id NOT NULL).
ALTER TABLE public.disbursement_items
  DROP CONSTRAINT IF EXISTS disbursement_items_batch_id_payroll_entry_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS disbursement_items_batch_payroll_uq
  ON public.disbursement_items (batch_id, payroll_entry_id)
  WHERE payroll_entry_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS disbursement_items_batch_contractor_uq
  ON public.disbursement_items (batch_id, contractor_engagement_id)
  WHERE contractor_engagement_id IS NOT NULL;

-- Tag batches so reconcile + UI can branch.
ALTER TABLE public.disbursement_batches
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'payroll'
    CHECK (kind IN ('payroll','contractor'));

-- Contractor batches are not tied to a payroll run. (Live schema confirmed:
-- disbursement_batches.payroll_run_id is currently NOT NULL — relax it so an
-- ad-hoc contractor batch can be created without a payroll_runs row.)
ALTER TABLE public.disbursement_batches
  ALTER COLUMN payroll_run_id DROP NOT NULL;
```

> The UNIQUE constraint name `disbursement_items_batch_id_payroll_entry_id_key` is **confirmed against the live DB** (controller verified via `pg_constraint`). Apply as written.

- [ ] **Step 2: Controller applies via Supabase MCP**

The controller (not this subagent) applies migration `080_disbursement_contractor_support` to the live DB. This task only writes + commits the SQL file. Do NOT call `apply_migration`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/080_disbursement_contractor_support.sql
git commit -m "feat(contractors): disbursement_items dual-source + batch kind (migration 080)"
```

---

### Task 4: Expose `employmentType` + gate navigation

**Files:**
- Modify: `src/lib/current-user.ts` (add `employmentType` to the returned object + its select)
- Modify: `src/types/index.ts` (user type + `NavItem`)
- Modify: `src/config/navigation.ts` (tag items)
- Modify: `src/components/layout/sidebar.tsx` (filter)

**Interfaces:**
- Consumes: nothing new.
- Produces: `getCurrentUser()` returns `employmentType: "full_time"|"part_time"|"contract"|"intern" | null`. `NavItem` gains `hideForContractor?: boolean`. Sidebar hides those items when `employmentType==='contract'`.

- [ ] **Step 1: Add `employmentType` to the user type**

In `src/types/index.ts`, find the type returned by `getCurrentUser` (the `CurrentUser`/`AppUser` shape) and add:

```typescript
  employmentType: "full_time" | "part_time" | "contract" | "intern" | null;
```

And extend `NavItem` (currently lines 55–63):

```typescript
export interface NavItem {
  title: string;
  href: string;
  icon: string;
  requiredRole?: UserRole;
  requiredPlan?: "growth" | "business";
  featureFlag?: string;
  badge?: string;
  hideForContractor?: boolean;
}
```

- [ ] **Step 2: Select + return `employment_type` in `getCurrentUser`**

In `src/lib/current-user.ts`, add `employment_type` to the `employees` select (both the primary `clerk_user_id` lookup and the email/phone fallback path), and include it in every returned object:

```typescript
employmentType: row.employment_type ?? null,
```

(Match the existing field-mapping style in that function. The null branch — signed-in but org-less — already returns `null`; no change there.)

- [ ] **Step 3: Tag contractor-irrelevant nav items**

In `src/config/navigation.ts`, add `hideForContractor: true` to items a contractor should not see in Phase 1: **Leaves**, **Objectives**, **Training**, **Reviews** (if present in the employee-visible set), **Refer**. Leave visible: Dashboard, Directory, Profile, Documents, Announcements, Feedback, Attendance, and the new Contractors-area payslip view via Payroll's "My Payslips" (contractors reach payslips through `/dashboard/profile` compensation + payslip self-service, which already works).

Example edit (Leaves item):

```typescript
  { title: "Leaves", href: "/dashboard/leaves", icon: "CalendarDays", hideForContractor: true },
```

- [ ] **Step 4: Filter in the sidebar**

In `src/components/layout/sidebar.tsx`, where items are already filtered by `hasPermission(role, item.requiredRole)` and plan/feature flags, add the employment-type filter. Assuming the sidebar receives `role` and now also `employmentType` (thread it from the layout that calls `getCurrentUser()`):

```typescript
const isContractor = employmentType === "contract";
// ...inside the existing .filter(...) chain:
if (isContractor && item.hideForContractor) return false;
```

Thread `employmentType` from `src/app/dashboard/layout.tsx` (which calls `getCurrentUser()`) into `<Sidebar employmentType={user.employmentType} ... />`.

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: build succeeds (TS errors are ignored per `next.config.js`, but the build must not fail on missing imports/props). Then `npm run lint` for the changed files.

- [ ] **Step 6: Commit**

```bash
git add src/lib/current-user.ts src/types/index.ts src/config/navigation.ts src/components/layout/sidebar.tsx
git commit -m "feat(contractors): expose employmentType + employment_type-gated sidebar"
```

---

### Task 5: Engagement actions + exclude contractors from salaried logic

**Files:**
- Create: `src/actions/contractors.ts` (engagement CRUD only here; payout in Task 6)
- Modify: `src/actions/payroll.ts` (`processPayrollRun` salary-structure query)
- Modify: `src/actions/employees.ts` (leave seeding skip)

**Interfaces:**
- Consumes: `contractor_engagements` (Task 1), `types.ts` (Task 2), `getCurrentUser`/`isAdmin`.
- Produces (consumed by Task 7):
  - `createContractorEngagement(input)` → `ActionResult<{ id: string }>`
  - `updateContractorEngagement(id, input)` → `ActionResult<void>`
  - `listContractorEngagements()` → `ActionResult<ContractorEngagementRow[]>` where
    `ContractorEngagementRow = { id, employee_id, employee_name, email, rate_type, rate_amount, tds_section, payee_type, has_pan, contract_start, contract_end, renewal_date, status, bank_verified: boolean }`.

- [ ] **Step 1: Write the engagement CRUD actions**

```typescript
// src/actions/contractors.ts
"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import type { ActionResult } from "@/types";

const EngagementSchema = z.object({
  employee_id: z.string().uuid(),
  rate_type: z.enum(["hourly", "daily", "monthly", "milestone"]),
  rate_amount: z.number().nonnegative(),
  tds_section: z.enum(["194J", "194C"]),
  payee_type: z.enum(["individual_huf", "other"]).default("individual_huf"),
  has_pan: z.boolean().default(true),
  contract_start: z.string().nullable().optional(),
  contract_end: z.string().nullable().optional(),
  renewal_date: z.string().nullable().optional(),
});

export async function createContractorEngagement(
  input: z.infer<typeof EngagementSchema>
): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };

  const parsed = EngagementSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const supabase = createAdminSupabase();

  // Guard: the target employee must belong to this org and be employment_type='contract'.
  const { data: emp } = await supabase
    .from("employees")
    .select("id, employment_type")
    .eq("id", parsed.data.employee_id)
    .eq("org_id", user.orgId)
    .maybeSingle();
  if (!emp) return { success: false, error: "Employee not found in this org" };
  if (emp.employment_type !== "contract")
    return { success: false, error: "Employee is not a contractor (set employment_type='contract' first)" };

  const { data, error } = await supabase
    .from("contractor_engagements")
    .insert({ org_id: user.orgId, ...parsed.data, status: "active" })
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/contractors");
  return { success: true, data: { id: data.id } };
}

export async function updateContractorEngagement(
  id: string,
  input: z.infer<typeof EngagementSchema>
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };

  const parsed = EngagementSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("contractor_engagements")
    .update(parsed.data)
    .eq("id", id)
    .eq("org_id", user.orgId);
  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/contractors");
  return { success: true, data: undefined };
}

export async function listContractorEngagements(): Promise<ActionResult<any[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("contractor_engagements")
    .select(`
      id, employee_id, rate_type, rate_amount, tds_section, payee_type,
      has_pan, contract_start, contract_end, renewal_date, status,
      employees!employee_id ( first_name, last_name, email ),
      employee_bank_accounts:employee_bank_accounts!employee_id ( beneficiary_sync_status )
    `)
    .eq("org_id", user.orgId)
    .order("created_at", { ascending: false });
  if (error) return { success: false, error: error.message };

  const rows = (data ?? []).map((r: any) => ({
    id: r.id,
    employee_id: r.employee_id,
    employee_name: `${r.employees?.first_name ?? ""} ${r.employees?.last_name ?? ""}`.trim(),
    email: r.employees?.email ?? null,
    rate_type: r.rate_type,
    rate_amount: r.rate_amount,
    tds_section: r.tds_section,
    payee_type: r.payee_type,
    has_pan: r.has_pan,
    contract_start: r.contract_start,
    contract_end: r.contract_end,
    renewal_date: r.renewal_date,
    status: r.status,
    bank_verified: r.employee_bank_accounts?.[0]?.beneficiary_sync_status === "synced",
  }));
  return { success: true, data: rows };
}
```

> Note: if the `employee_bank_accounts` embedded select shape causes Supabase to return `never` (gotcha #3), drop the embed and fetch bank status in a second query keyed by `employee_id`. The `any[]` return type is deliberate to avoid the v2 `never` inference trap (matches existing payroll actions).

- [ ] **Step 2: Exclude contractors from `processPayrollRun`**

In `src/actions/payroll.ts`, `processPayrollRun` loads `salary_structures` for the org (around line 555–600 per the audit). Contractors must never enter a salaried run. Join to `employees` and filter out contractors. Locate the salary-structure fetch and add an employee-type guard:

```typescript
// after loading salary_structures, fetch the employment_type for each employee_id
const empIds = structures.map((s) => s.employee_id);
const { data: emps } = await supabase
  .from("employees")
  .select("id, employment_type")
  .in("id", empIds);
const contractorIds = new Set((emps ?? []).filter((e) => e.employment_type === "contract").map((e) => e.id));

// then skip contractor structures when building entries:
const salariedStructures = structures.filter((s) => !contractorIds.has(s.employee_id));
```

Use `salariedStructures` everywhere the loop previously used `structures`. (Defensive: a contractor should not have a `salary_structures` row anyway, but this guarantees correctness even if one was created by mistake.)

- [ ] **Step 3: Skip leave seeding for contractors**

In `src/actions/employees.ts` `addEmployee` (and the bulk import path), find where new employees get leave policies / `leave_balances` seeded. Wrap the seeding in a guard:

```typescript
if (employment_type !== "contract") {
  // ...existing leave-policy / leave-balance seeding...
}
```

If `addEmployee` does NOT currently seed leave (seeding may happen at org-creation in `onboarding-seed.ts` rather than per-employee), confirm with a grep (`grep -rn "leave_balances" src/actions/employees.ts`) and only add the guard where seeding actually occurs. If no per-employee seeding exists, note that in the commit message and skip this step.

- [ ] **Step 4: Verify build + existing payroll tests still pass**

Run: `npm run build` then `npx vitest run tests/payroll`
Expected: build OK; payroll tests green (these are pure `ctc.ts` tests — unaffected, but confirm nothing regressed).

- [ ] **Step 5: Commit**

```bash
git add src/actions/contractors.ts src/actions/payroll.ts src/actions/employees.ts
git commit -m "feat(contractors): engagement CRUD + exclude contractors from salaried payroll/leave"
```

---

### Task 6: Ad-hoc contractor payout action

**Files:**
- Modify: `src/actions/contractors.ts` (add `payContractors`)

**Interfaces:**
- Consumes: `computeContractorTDS` (Task 2), `contractor_engagements` + dual-source `disbursement_items` (Tasks 1, 3), and the existing disbursement helpers in `src/actions/disbursement.ts` / `src/lib/razorpayx.ts`. **Read `initiateDisbursement` (line 231) and `approveDisbursement` (line 399) first** to reuse their batch-insert + RazorpayX-contact resolution shape rather than duplicating it.
- Produces: `payContractors(input)` → `ActionResult<{ batchId: string }>` where
  `input = { items: { engagement_id: string; gross_amount: number }[]; note?: string }` (gross in ₹). The action computes TDS per item via `computeContractorTDS`, net = gross − tds, writes a `kind='contractor'` batch + one `disbursement_items` row per engagement (`amount` in **paise** = net × 100, `contractor_engagement_id` set, `payroll_entry_id` null), status `awaiting_approval`. Approval/RazorpayX dispatch reuses the existing `approveDisbursement` path unchanged.

- [ ] **Step 1: Implement `payContractors`**

```typescript
// append to src/actions/contractors.ts
import { randomUUID } from "crypto";
import { computeContractorTDS } from "@/lib/contractor/tds";

const PayInputSchema = z.object({
  items: z.array(z.object({
    engagement_id: z.string().uuid(),
    gross_amount: z.number().positive(),
  })).min(1),
});

export async function payContractors(
  input: z.infer<typeof PayInputSchema>
): Promise<ActionResult<{ batchId: string }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };

  const parsed = PayInputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const supabase = createAdminSupabase();

  // Load engagements + their employees' synced fund accounts.
  const engIds = parsed.data.items.map((i) => i.engagement_id);
  const { data: engs, error: engErr } = await supabase
    .from("contractor_engagements")
    .select("id, employee_id, tds_section, payee_type, has_pan, status")
    .eq("org_id", user.orgId)
    .in("id", engIds);
  if (engErr) return { success: false, error: engErr.message };
  const engById = new Map((engs ?? []).map((e) => [e.id, e]));

  // Build items: compute TDS, resolve fund account, convert net to paise.
  const itemRows: { contractor_engagement_id: string; employee_id: string; fund_account_id: string; amount: number }[] = [];
  for (const it of parsed.data.items) {
    const eng = engById.get(it.engagement_id);
    if (!eng) return { success: false, error: `Engagement ${it.engagement_id} not found` };
    if (eng.status !== "active") return { success: false, error: "Engagement is not active" };

    const { data: bank } = await supabase
      .from("employee_bank_accounts")
      .select("razorpayx_fund_account_id, beneficiary_sync_status")
      .eq("org_id", user.orgId)
      .eq("employee_id", eng.employee_id)
      .maybeSingle();
    if (!bank?.razorpayx_fund_account_id || bank.beneficiary_sync_status !== "synced")
      return { success: false, error: "Contractor bank account is not verified/synced" };

    const { tds } = computeContractorTDS({
      amount: it.gross_amount,
      section: eng.tds_section,
      payeeType: eng.payee_type,
      hasPan: eng.has_pan,
    });
    const net = Math.max(0, it.gross_amount - tds);
    itemRows.push({
      contractor_engagement_id: eng.id,
      employee_id: eng.employee_id,
      fund_account_id: bank.razorpayx_fund_account_id,
      amount: Math.round(net * 100), // paise
    });
  }

  // Create the batch (kind='contractor', awaiting_approval). These are the REAL
  // disbursement_batches columns (verified against the live DB): there is NO
  // created_by or note column — the maker is maker_id, and idempotency_key /
  // total_amount / total_fees_paise / override_wallet_shortfall are NOT NULL.
  // payroll_run_id is nullable after migration 080.
  const totalAmount = itemRows.reduce((s, r) => s + r.amount, 0); // paise
  const { data: batch, error: batchErr } = await supabase
    .from("disbursement_batches")
    .insert({
      org_id: user.orgId,
      kind: "contractor",
      status: "awaiting_approval",
      payroll_run_id: null,
      maker_id: user.employeeId,
      idempotency_key: randomUUID(),
      initiated_at: new Date().toISOString(),
      total_amount: totalAmount,
      total_fees_paise: 0,
      override_wallet_shortfall: false,
    })
    .select("id")
    .single();
  if (batchErr) return { success: false, error: batchErr.message };

  const { error: itemsErr } = await supabase
    .from("disbursement_items")
    .insert(itemRows.map((r) => ({ org_id: user.orgId, batch_id: batch.id, ...r })));
  if (itemsErr) return { success: false, error: itemsErr.message };

  revalidatePath("/dashboard/contractors");
  return { success: true, data: { batchId: batch.id } };
}
```

> **Read `initiateDisbursement` (disbursement.ts:231) first** and mirror its exact `disbursement_batches` insert column set + any helper it uses to build `idempotency_key`/`total_amount` — match the established pattern rather than the literal above if it differs.
>
> **Integration risk to handle (do not skip):** the existing `approveDisbursement` (disbursement.ts:399) and `reconcileBatchAndRunStatus` (`src/lib/payroll/disbursement-reconcile.ts`) were written assuming a non-null `payroll_run_id` (they update `payroll_runs.status`). A `kind='contractor'` batch has `payroll_run_id = null`. Before relying on approval reuse, **read both** and confirm they no-op the payroll-run update when `payroll_run_id`/`kind='contractor'`. If they would throw or update a null run, make the minimal guard (e.g. `if (batch.payroll_run_id) { …update run… }`) and note it in your report. This is the one place Phase 1 may need to touch shared disbursement code.

- [ ] **Step 2: Build + lint**

Run: `npm run build` then `npm run lint`
Expected: no failures on `src/actions/contractors.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/actions/contractors.ts
git commit -m "feat(contractors): payContractors ad-hoc disbursement with 194J/194C TDS"
```

---

### Task 7: Contractor admin UI

**Files:**
- Create: `src/app/dashboard/contractors/page.tsx`
- Create: `src/components/contractors/contractors-client.tsx`
- Create: `src/components/contractors/pay-contractors-dialog.tsx`
- Modify: `src/config/navigation.ts` (add the Contractors nav item, admin-only)

**Interfaces:**
- Consumes: `listContractorEngagements`, `createContractorEngagement`, `updateContractorEngagement`, `payContractors` (Tasks 5–6); `computeContractorTDS` + `types.ts` (Task 2) for the live net-preview.
- Produces: nothing downstream (Phase 1 leaf).

- [ ] **Step 1: Server page (admin-gated, fetch + pass to client)**

```tsx
// src/app/dashboard/contractors/page.tsx
import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { listContractorEngagements } from "@/actions/contractors";
import { ContractorsClient } from "@/components/contractors/contractors-client";

export default async function ContractorsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!isAdmin(user.role)) redirect("/dashboard");

  const res = await listContractorEngagements();
  const engagements = res.success ? res.data : [];

  return <ContractorsClient engagements={engagements} />;
}
```

- [ ] **Step 2: Client wrapper — table + add/edit dialog**

Build `contractors-client.tsx` (`"use client"`): a table of engagements (name, rate, TDS section, bank-verified chip, contract dates, status) with an "Add contractor engagement" button opening a dialog whose fields map to `EngagementSchema`. Employee picker lists org employees with `employment_type='contract'` that don't yet have an active engagement (fetch via a small action or pass from the page). On submit call `createContractorEngagement` / `updateContractorEngagement`, `toast` the result (`sonner`), and `router.refresh()`. Use `bg-primary` (teal) for the primary CTA. A "Pay contractors" button opens the Task-7 dialog.

Follow the existing dialog pattern in `src/components/dashboard/` (e.g. the employee form dialog) for Radix Dialog + form structure — match field grid (`grid-cols-1 sm:grid-cols-2`).

- [ ] **Step 3: Pay-contractors dialog with live TDS preview**

```tsx
// src/components/contractors/pay-contractors-dialog.tsx  (excerpt of the core logic)
"use client";
import { computeContractorTDS } from "@/lib/contractor/tds";
import { payContractors } from "@/actions/contractors";
// ...for each selected engagement row, as the admin types a gross amount:
const preview = computeContractorTDS({
  amount: grossAmount,
  section: eng.tds_section,
  payeeType: eng.payee_type,
  hasPan: eng.has_pan,
});
// show: gross, `${preview.ratePct}% ${preview.reason}`, tds = preview.tds, net = grossAmount - preview.tds
// on submit: payContractors({ items: rows.map(r => ({ engagement_id: r.id, gross_amount: r.gross })) })
// then toast + route to the existing disbursement-batch detail page for approval (maker-checker).
```

Disable the submit when any selected contractor has `bank_verified === false`, with an inline hint to verify the bank account first (penny-drop already exists on the employee bank screen).

- [ ] **Step 4: Add the nav item (admin-only)**

In `src/config/navigation.ts`:

```typescript
  { title: "Contractors", href: "/dashboard/contractors", icon: "Briefcase", requiredRole: "admin", featureFlag: "payroll" },
```

(Gate on the `payroll` feature so it tracks the Business-tier disbursement capability. Confirm `"payroll"` is the right feature key for the org's plan in `src/config/plans.ts`.)

- [ ] **Step 5: Build + lint + manual verify**

Run: `npm run build` then `npm run lint`.
Manual smoke test (`npm run dev`, signed in as admin of `test1`):
  1. Add an employee with `employment_type='contract'`.
  2. Create an engagement (194J, monthly, ₹50,000).
  3. Verify their bank account (penny-drop) on the employee bank screen.
  4. Open "Pay contractors", enter ₹50,000 gross → preview shows 10% / ₹5,000 TDS / ₹45,000 net.
  5. Submit → lands on the disbursement batch in `awaiting_approval`; a second admin approves (maker-checker).
  6. Sign in as the contractor → confirm the narrowed sidebar (no Leaves/Objectives/Training/Refer) and that they can see their payout statement.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/contractors src/components/contractors src/config/navigation.ts
git commit -m "feat(contractors): admin contractors page + pay-contractors dialog with live TDS"
```

---

### Task 8: Contractor-payout approval surface (discovered gap)

**Why this exists:** The existing disbursement approval UI is **run-scoped** — `getDisbursementBatchByRun(runId)` filters `.eq("payroll_run_id", runId)`, and the payroll page doesn't read query params. A `kind='contractor'` batch has `payroll_run_id = null`, so it never appears there and can't be approved. `approveDisbursement(batchId)` itself is batch-id-scoped and works for a null-run batch (reconcile was guarded in Task 6), so we only need a UI entry point + a list action. **Also: amounts in `disbursement_items.amount` are stored in RUPEES** (the engine multiplies ×100 at dispatch — see disbursement.ts:500/542/682); `payContractors` was corrected to store rupees.

**Files:**
- Modify: `src/actions/contractors.ts` (add `listContractorBatches`)
- Modify: `src/app/dashboard/contractors/page.tsx` (fetch batches, pass down)
- Modify: `src/components/contractors/contractors-client.tsx` (render a "Contractor payouts" section + Approve action calling the existing `approveDisbursement`)
- Modify: `src/components/contractors/pay-contractors-dialog.tsx` (redirect to `/dashboard/contractors` after submit, not the run-scoped payroll URL)

**Interfaces:**
- Produces: `listContractorBatches()` → `ActionResult<ContractorBatchRow[]>` where
  `ContractorBatchRow = { id, status, total_amount /* rupees */, item_count, created_at }`.
- Reuses: `approveDisbursement(batchId)` (already exported from `src/actions/disbursement.ts`; admin-guarded, maker-checker enforced, works for null-run batches).

- [ ] **Step 1: Add `listContractorBatches`**

```typescript
export async function listContractorBatches(): Promise<ActionResult<any[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("disbursement_batches")
    .select("id, status, total_amount, created_at")
    .eq("org_id", user.orgId)
    .eq("kind", "contractor")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return { success: false, error: error.message };

  const batchIds = (data ?? []).map((b: any) => b.id);
  const countByBatch = new Map<string, number>();
  if (batchIds.length) {
    const { data: items } = await supabase
      .from("disbursement_items")
      .select("batch_id")
      .in("batch_id", batchIds);
    for (const it of (items ?? []) as any[])
      countByBatch.set(it.batch_id, (countByBatch.get(it.batch_id) ?? 0) + 1);
  }

  const rows = (data ?? []).map((b: any) => ({
    id: b.id,
    status: b.status,
    total_amount: b.total_amount, // rupees
    item_count: countByBatch.get(b.id) ?? 0,
    created_at: b.created_at,
  }));
  return { success: true, data: rows };
}
```

- [ ] **Step 2: Surface batches + approval on the contractors page**

In `page.tsx` add `listContractorBatches()` to the `Promise.all`, pass `batches` to `ContractorsClient`. In `contractors-client.tsx` render a "Contractor payouts" section (a simple table: created date · ₹total_amount · N contractors · status chip). For rows with `status === 'awaiting_approval'`, show an "Approve & pay" button that opens a small confirm dialog → calls `approveDisbursement(row.id)` → on `success` toast the `{ pushed, failed }` summary + `router.refresh()`; on error toast `error` (e.g. "RazorpayX not connected", "A different admin must approve" — both are expected/handled). Use `formatINR` from `@/lib/ctc` (or the repo's currency formatter) for `total_amount`. Teal `bg-primary` CTA.

- [ ] **Step 3: Redirect the pay dialog to the contractors page**

In `pay-contractors-dialog.tsx`, change the post-submit `router.push(...)` to `/dashboard/contractors` (the run-scoped `/dashboard/payroll?tab=disbursements&batch=...` URL is a dead-link — the payroll page is run-scoped and ignores query params), then `router.refresh()` so the new `awaiting_approval` batch appears in the payouts section.

- [ ] **Step 4: Verify**

`npm run build` succeeds; `npm run lint` on changed files clean. No automated interactive test — the controller runs the end-to-end smoke test.

- [ ] **Step 5: Commit**

```bash
git add src/actions/contractors.ts src/app/dashboard/contractors/page.tsx src/components/contractors/contractors-client.tsx src/components/contractors/pay-contractors-dialog.tsx
git commit -m "feat(contractors): contractor-payout approval surface on contractors page"
```

---

## Self-Review notes (for the implementer)

- **Type consistency:** `RateType`/`TdsSection`/`PayeeType`/`EngagementStatus` are defined once in `src/lib/contractor/types.ts` (Task 2) and reused by the migration CHECK constraints (Task 1), Zod enums (Task 5), and UI (Task 7) — keep the string literals identical (`'194J'`, `'194C'`, `'individual_huf'`, `'other'`, `'hourly'|'daily'|'monthly'|'milestone'`, `'active'|'ended'`).
- **Money units:** rupees in `contractor_engagements.rate_amount` and in `computeContractorTDS` I/O; **paise** in `disbursement_items.amount` (×100 at the boundary in `payContractors`). Don't mix.
- **Spec coverage (Phase 1 items 1–5 of the audit):** #1 table → Task 1; #2 TDS → Task 2; #3 ad-hoc disbursement → Tasks 3+6; #4 suppress PF/PT/leave → Task 5; #5 scoped access → Task 4+7. All covered.
- **Out of Phase-1 scope (do NOT build here):** invoices, Form 16A, contract/NDA signing, expense submission, project/client mapping, renewal reminders — those are Phase 2/3 in the audit results doc.
- **Known gotchas to respect:** #3 (Supabase `never` inference — keep `any[]` returns), #4 (migrations via SQL Editor/MCP on Windows), #5 (service-role bypasses RLS), #7 (`update_updated_at_column` pre-exists), #54 (payroll RLS advisory).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-23-contractor-payments-phase-1.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
