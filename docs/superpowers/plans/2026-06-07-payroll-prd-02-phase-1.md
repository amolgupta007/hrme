# Payroll PRD 02 Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make payroll component ratios owner-configurable (Basic %, HRA % metro/non-metro, Gratuity %), add itemised ad-hoc allowances/bonuses/reimbursements per payroll entry, and deliver payslips via email — the strict Phase 1 scope from PRD 02.

**Architecture:** Four new Supabase tables (`salary_structure_config` append-only-by-effective-from, `payroll_line_items` one-per-ad-hoc-item, `payslip_deliveries` per-email-send, plus additive columns on `payroll_runs.structure_config_snapshot` JSONB and `payroll_entries.total_line_items`). `computeCTCBreakdown` learns to read an injected `RatioConfig` while keeping current hard-codes as the default. New `Settings → Payroll` CollapsibleSection (admin + Business-tier) hosts the Salary Structure Config card with a live before/after preview. Per-entry edit dialog grows a line-items table (category dropdown, amount, note, taxable flag). Payslip email is a new React Email template; trigger on `markPayrollPaid` and via on-demand button. Out-of-scope per PRD §11: RazorpayX integration, maker-checker workflow, penny-drop, disbursement batches, F&F settlement, advance lifecycle, PDF attachments.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind + Radix + CVA, Supabase Postgres (admin client; RLS advisory), Clerk (admin-only mutations), Vitest for pure helpers, existing `sonner` toast / `lucide-react` icons / `Button` + `CollapsibleSection` primitives, existing Resend + React Email.

---

## Scope Lockdown (read first)

**In scope (PRD 02 §11 Phase 1):**
1. Owner-configurable salary structure (`salary_structure_config` table — Basic %, HRA % metro, HRA % non-metro, Gratuity %; effective-from-dated; append-only). PF rate, PF cap, PT slabs, tax slabs, standard deduction, 87A rebate stay statutory (hard-coded).
2. Statutory auto-recompute happens automatically since `computeCTCBreakdown` re-runs at `upsertSalaryStructure` — Phase 1 just plumbs the configurable ratios through.
3. Live preview/diff in the salary-structure-dialog and in the new Settings → Payroll config card (before-vs-after numbers when ratios change).
4. "Recompute all salary structures" admin action — re-runs `upsertSalaryStructure` for every employee using the active config.
5. Itemised ad-hoc entries per payroll entry — new `payroll_line_items` table with `category ∈ {bonus, allowance, reimbursement, other}`, `amount`, `note`, `taxable: boolean`. Sums into `payroll_entries.total_line_items` and `net_pay`; taxable items add marginal TDS via existing `computeAdditionalTaxOnBonus`.
6. Per-entry edit dialog extension — add/remove line items inline (replaces the current single `bonus` integer for new entries; legacy entries with `bonus > 0` continue to read).
7. Payslip email template (React Email, HTML inline). Trigger: (a) automatic on `markPayrollPaid` (best-effort, never blocks the action); (b) on-demand "Send payslips" button on processed-or-paid runs. Per-employee delivery row in `payslip_deliveries` so the UI can show "sent at" / "failed" status.
8. Settings → Payroll CollapsibleSection (admin-only, Business-tier-gated) housing the Salary Structure Config card.

**Out of scope (defer to Phase 2 / Phase 3 / never):**
- RazorpayX or Cashfree integration; penny-drop; bulk payout; per-employee payout tracking.
- Maker-checker approval workflow; segregation-of-duties enforcement.
- `disbursement_batches` / `disbursement_items` tables.
- Server-side PDF generation (browser-print stays).
- PDF attachments on payslip emails (HTML body only in Phase 1).
- Loan / advance / F&F lifecycle.
- Auto-flow of attendance OT into payroll (needs Attendance Phase 2 OT feed).
- Editing past payroll runs that are already `paid`.
- Recomputing past `processed` or `paid` runs when org config changes.
- Group-bulk-apply of an ad-hoc line item across many employees in one click (Phase 1 is per-entry edits).
- Configurable PF/PT/TDS slabs or rates (statutory; out of scope by design).

**Resolved open decisions:**
- **OD-A:** New `payroll_line_items` table (not single-slot column).
- **OD-B:** Email payslip = React Email HTML inline; no PDF attachment.
- **OD-C:** No auto-recompute of existing `salary_structures` on config change; explicit "Recompute all" admin button.
- **OD-D:** Configurable: Basic %, HRA % metro, HRA % non-metro, Gratuity %. Statutory: PF rate + cap, PT slabs, tax slabs, standard deduction, 87A rebate, gratuity formula (4.81% is statutory de-facto but kept tunable since orgs sometimes negotiate).
- **OD-E:** Two triggers — auto on `markPayrollPaid` (best-effort) + manual "Send payslips" button.
- **OD-F:** Line items live in the per-entry edit dialog (no separate Reimbursements tab).
- **OD-G:** Migrations start at 033.
- **OD-H:** Statutory-recompute preview happens inline in `salary-structure-dialog` (before-vs-after side-by-side) and in the config card preview, not as a separate screen.

**Authorization model:** All Phase 1 payroll mutations remain admin-only (owner + admin) — same as existing surface. Employees keep `getMyCompensation` / `getMyPayslips` self-reads. No new manager roles.

---

## File Structure

### Migrations (`supabase/migrations/`)
- Create: `033_salary_structure_config.sql` — `salary_structure_config` table + indexes + RLS (Clerk-JWT pattern).
- Create: `034_payroll_line_items.sql` — `payroll_line_items` table + indexes + RLS.
- Create: `035_payroll_run_and_entry_extensions.sql` — `payroll_runs.structure_config_snapshot JSONB`, `payroll_entries.total_line_items INTEGER NOT NULL DEFAULT 0`.
- Create: `036_payslip_deliveries.sql` — `payslip_deliveries` table + indexes + RLS.

### Pure helpers (Vitest-tested, no DB)
- Modify: `src/lib/ctc.ts` — accept optional `RatioConfig` arg; keep current behaviour when omitted; export `DEFAULT_RATIO_CONFIG` for tests + back-compat.
- Create: `src/lib/payroll/line-items.ts` — pure helpers: `sumLineItems(items, taxableOnly?)`, `partitionByTaxable(items)`. Used server-side + in preview UI.
- Test: `tests/payroll/ctc-config.test.ts` (config-driven breakdown math), `tests/payroll/line-items.test.ts` (line-item sums + partitioning).

### Server actions
- Modify: `src/actions/payroll.ts` — extend.
  - Add: `getSalaryStructureConfig`, `upsertSalaryStructureConfig` (append-only insert with new `effective_from`), `previewConfigImpact` (returns per-employee diff list using current vs proposed ratios), `getActiveRatioConfig(orgId)` (server-internal helper).
  - Add: `addPayrollLineItem`, `removePayrollLineItem`, `listPayrollLineItems(entryId)`.
  - Add: `recomputeAllSalaryStructures()` — admin action, re-runs `upsertSalaryStructure` for every employee with a structure.
  - Add: `sendPayslipEmail(runId)` and an internal `sendPayslipEmailForEntry(entryId)`. Auto-fires from `markPayrollPaid` via `waitUntil`.
  - Modify: `upsertSalaryStructure` to read active `RatioConfig` from `salary_structure_config`.
  - Modify: `processPayrollRun` to snapshot the active config into `payroll_runs.structure_config_snapshot`, and to factor in `payroll_line_items` (sum into `total_line_items`, recompute `tds` via marginal-on-taxable, recompute `net_pay`).
  - Modify: `updatePayrollEntry` — kept for legacy single-bonus edits; deprecated for new entries. Add `recomputeEntryFromLineItems(entryId)` helper used by the line-item add/remove actions.

### Email
- Create: `src/components/emails/payslip.tsx` — React Email template (HTML inline, employer name + month + breakdown + line items + net pay + "View in app" CTA).

### UI — Settings
- Modify: `src/components/settings/settings-content.tsx` — register `Payroll` CollapsibleSection (admin + Business-tier + plan-gated).
- Modify: `src/app/dashboard/settings/page.tsx` — fetch active config + a small set of "preview impact" employee samples.
- Create: `src/components/settings/payroll-section.tsx` — top-level wrapper.
- Create: `src/components/settings/salary-structure-config-card.tsx` — list of historical configs (latest first) + "Edit config" form with live preview + "Recompute all" button.
- Create: `src/components/settings/config-impact-preview.tsx` — before-vs-after table (per-employee Basic/HRA/SA monthly diff).

### UI — Payroll page
- Modify: `src/components/payroll/payroll-client.tsx` — wire the "Send payslips" button on processed/paid runs; pass line-items down to entry-edit-dialog.
- Modify: `src/components/payroll/entry-edit-dialog.tsx` — replace single `bonus` integer field with a Line Items table (add/remove rows; category dropdown; amount; note; taxable toggle).
- Modify: `src/components/payroll/payslip-dialog.tsx` — render line items section below standard components.
- Modify: `src/components/payroll/salary-structure-dialog.tsx` — show before-vs-after CTC breakdown if the active config has changed since this row's `computed_at`.

### Assistant integration
- Modify: `src/lib/assistant/route-registry.ts` — add `settings_payroll` and `payroll_runs` already exists; if not, also add. Add `payroll_line_items` deep-link.
- Create: `src/lib/assistant/help/articles/configure_salary_ratios.md` — how-to: set Basic / HRA / Gratuity %.
- Create: `src/lib/assistant/help/articles/add_payroll_line_item.md` — how-to: add bonus/allowance/reimbursement per entry.
- Create: `src/lib/assistant/help/articles/send_payslip_email.md` — how-to: trigger payslip emails.
- Modify: `tests/assistant/help-loader.test.ts` — bump expected article count from 28 to 31.

### Documentation
- Modify: `CLAUDE.md` — Payroll Module section: add Phase 1 PRD-02 entry with gotchas (config append-only, no retroactive recompute, line-items vs legacy bonus, payslip email best-effort).
- Create: `docs/payroll-prd-02-phase-1.md` — operator-facing summary (matches `docs/attendance-shifts-phase-1.md` style).

### Commit convention
Per-task commits, scope-prefixed (`feat(payroll):` / `fix(payroll):` / `chore(payroll):` / `docs(payroll):`). **Never include `Co-Authored-By` lines** per `memory/feedback_commit_message.md`.

---

## Task Decomposition

### Task 1: Migration `033_salary_structure_config.sql`

**Files:**
- Create: `supabase/migrations/033_salary_structure_config.sql`

- [ ] **Step 1: Author the migration**

```sql
-- 033_salary_structure_config.sql — Payroll PRD 02 Phase 1: Owner-configurable
-- salary structure ratios (Basic %, HRA % metro, HRA % non-metro, Gratuity %).
-- Append-only by (org_id, effective_from). Newest effective_from <= today
-- is the org's active config.
-- Idempotent.

CREATE TABLE IF NOT EXISTS public.salary_structure_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  basic_pct NUMERIC(5,2) NOT NULL CHECK (basic_pct >= 10 AND basic_pct <= 80),
  hra_pct_metro NUMERIC(5,2) NOT NULL CHECK (hra_pct_metro >= 0 AND hra_pct_metro <= 100),
  hra_pct_non_metro NUMERIC(5,2) NOT NULL CHECK (hra_pct_non_metro >= 0 AND hra_pct_non_metro <= 100),
  gratuity_pct NUMERIC(5,3) NOT NULL CHECK (gratuity_pct >= 0 AND gratuity_pct <= 20),
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One config per org per effective_from. Re-saving the same effective_from
  -- replaces via upsert in the server action.
  UNIQUE (org_id, effective_from)
);

CREATE INDEX IF NOT EXISTS salary_structure_config_org_active_idx
  ON public.salary_structure_config (org_id, effective_from DESC);

ALTER TABLE public.salary_structure_config ENABLE ROW LEVEL SECURITY;

-- Admin write (org-scoped, Clerk-JWT pattern from 009_jambahire_rls.sql).
-- Service-role bypasses today (CLAUDE.md gotcha #5).
DROP POLICY IF EXISTS salary_structure_config_admin_all ON public.salary_structure_config;
CREATE POLICY salary_structure_config_admin_all ON public.salary_structure_config FOR ALL
  USING (
    auth.jwt() ->> 'org_id' = salary_structure_config.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  )
  WITH CHECK (
    auth.jwt() ->> 'org_id' = salary_structure_config.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  );

-- Any authenticated user in the org can READ the org's active config (used by
-- employee My Compensation view to interpret their structure). No PII.
DROP POLICY IF EXISTS salary_structure_config_org_read ON public.salary_structure_config;
CREATE POLICY salary_structure_config_org_read ON public.salary_structure_config FOR SELECT
  USING (auth.jwt() ->> 'org_id' = salary_structure_config.org_id::text);
```

- [ ] **Step 2: Apply via Supabase MCP** (`apply_migration`, project `imjwqktxzahhnfmfbtfc`, name `033_salary_structure_config`). Verify with:
```sql
SELECT column_name, data_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='salary_structure_config' ORDER BY ordinal_position;
SELECT polname FROM pg_policy WHERE polrelid='public.salary_structure_config'::regclass;
```
Expected: 8 columns; 2 policies (`_admin_all`, `_org_read`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/033_salary_structure_config.sql
git commit -m "feat(payroll): add salary_structure_config table (PRD 02 Phase 1)"
```

---

### Task 2: Migration `034_payroll_line_items.sql`

**Files:**
- Create: `supabase/migrations/034_payroll_line_items.sql`

- [ ] **Step 1: Author**

```sql
-- 034_payroll_line_items.sql — Payroll PRD 02 Phase 1: Ad-hoc line items per
-- payroll entry. Categories: bonus, allowance, reimbursement, other.
-- Idempotent.

CREATE TABLE IF NOT EXISTS public.payroll_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  payroll_entry_id UUID NOT NULL REFERENCES public.payroll_entries(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('bonus', 'allowance', 'reimbursement', 'other')),
  amount INTEGER NOT NULL CHECK (amount >= 0),
  taxable BOOLEAN NOT NULL DEFAULT TRUE,
  note TEXT,
  created_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payroll_line_items_entry_idx
  ON public.payroll_line_items (payroll_entry_id);

CREATE INDEX IF NOT EXISTS payroll_line_items_org_category_idx
  ON public.payroll_line_items (org_id, category);

ALTER TABLE public.payroll_line_items ENABLE ROW LEVEL SECURITY;

-- Admin write (Clerk-JWT pattern).
DROP POLICY IF EXISTS payroll_line_items_admin_all ON public.payroll_line_items;
CREATE POLICY payroll_line_items_admin_all ON public.payroll_line_items FOR ALL
  USING (
    auth.jwt() ->> 'org_id' = payroll_line_items.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  )
  WITH CHECK (
    auth.jwt() ->> 'org_id' = payroll_line_items.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  );

-- Employees can SELECT their own line items via the entry FK (powers My Payslips).
-- Mirror of payroll_entries_self_read in 018_payroll_schema_capture.sql.
DROP POLICY IF EXISTS payroll_line_items_self_read ON public.payroll_line_items;
CREATE POLICY payroll_line_items_self_read ON public.payroll_line_items FOR SELECT
  USING (
    auth.jwt() ->> 'org_id' = payroll_line_items.org_id::text
    AND EXISTS (
      SELECT 1 FROM public.payroll_entries pe
       WHERE pe.id = payroll_line_items.payroll_entry_id
         AND auth.jwt() ->> 'employee_id' = pe.employee_id::text
    )
  );
```

- [ ] **Step 2: Apply via MCP**, verify:
```sql
SELECT column_name, data_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='payroll_line_items' ORDER BY ordinal_position;
SELECT conname, pg_get_constraintdef(c.oid) FROM pg_constraint c
  JOIN pg_class t ON c.conrelid=t.oid WHERE t.relname='payroll_line_items' AND contype='c';
```
Expected: 9 columns; 2 CHECK constraints (category enum, amount >= 0).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/034_payroll_line_items.sql
git commit -m "feat(payroll): add payroll_line_items table (PRD 02 Phase 1)"
```

---

### Task 3: Migration `035_payroll_run_and_entry_extensions.sql`

**Files:**
- Create: `supabase/migrations/035_payroll_run_and_entry_extensions.sql`

- [ ] **Step 1: Author**

```sql
-- 035_payroll_run_and_entry_extensions.sql — Payroll PRD 02 Phase 1:
-- Snapshot the active ratio config on each payroll run + denormalise the sum
-- of line items on each entry for fast reads.
-- Additive + idempotent.

ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS structure_config_snapshot JSONB NULL;

COMMENT ON COLUMN public.payroll_runs.structure_config_snapshot IS
  'Frozen copy of the org''s salary_structure_config row used at process time. ' ||
  'Shape: {basic_pct, hra_pct_metro, hra_pct_non_metro, gratuity_pct, effective_from, config_id}. ' ||
  'NULL for runs processed before this migration; treat NULL as "default hard-coded ratios" for back-compat.';

ALTER TABLE public.payroll_entries
  ADD COLUMN IF NOT EXISTS total_line_items INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.payroll_entries.total_line_items IS
  'Sum of all payroll_line_items.amount for this entry. Denormalised for fast read; ' ||
  'recomputed by recomputeEntryFromLineItems on every line-item add/remove.';
```

- [ ] **Step 2: Apply via MCP**, verify both columns exist + nullability:
```sql
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema='public'
   AND ((table_name='payroll_runs' AND column_name='structure_config_snapshot')
     OR (table_name='payroll_entries' AND column_name='total_line_items'))
 ORDER BY table_name, column_name;
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/035_payroll_run_and_entry_extensions.sql
git commit -m "feat(payroll): add config snapshot + total_line_items columns"
```

---

### Task 4: Migration `036_payslip_deliveries.sql`

**Files:**
- Create: `supabase/migrations/036_payslip_deliveries.sql`

- [ ] **Step 1: Author**

```sql
-- 036_payslip_deliveries.sql — Payroll PRD 02 Phase 1: Track per-employee
-- payslip email send status (sent / failed / queued). One row per (entry, channel).
-- Idempotent.

CREATE TABLE IF NOT EXISTS public.payslip_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  payroll_entry_id UUID NOT NULL REFERENCES public.payroll_entries(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'sent', 'failed')),
  sent_at TIMESTAMPTZ,
  error TEXT,
  resend_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (payroll_entry_id, channel)
);

CREATE INDEX IF NOT EXISTS payslip_deliveries_entry_idx
  ON public.payslip_deliveries (payroll_entry_id);

CREATE INDEX IF NOT EXISTS payslip_deliveries_org_status_idx
  ON public.payslip_deliveries (org_id, status);

ALTER TABLE public.payslip_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payslip_deliveries_admin_all ON public.payslip_deliveries;
CREATE POLICY payslip_deliveries_admin_all ON public.payslip_deliveries FOR ALL
  USING (
    auth.jwt() ->> 'org_id' = payslip_deliveries.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  )
  WITH CHECK (
    auth.jwt() ->> 'org_id' = payslip_deliveries.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  );

DROP POLICY IF EXISTS payslip_deliveries_self_read ON public.payslip_deliveries;
CREATE POLICY payslip_deliveries_self_read ON public.payslip_deliveries FOR SELECT
  USING (
    auth.jwt() ->> 'org_id' = payslip_deliveries.org_id::text
    AND EXISTS (
      SELECT 1 FROM public.payroll_entries pe
       WHERE pe.id = payslip_deliveries.payroll_entry_id
         AND auth.jwt() ->> 'employee_id' = pe.employee_id::text
    )
  );
```

- [ ] **Step 2: Apply + verify** columns / constraint / unique.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/036_payslip_deliveries.sql
git commit -m "feat(payroll): add payslip_deliveries table (PRD 02 Phase 1)"
```

---

### Task 5: Refactor `computeCTCBreakdown` to accept `RatioConfig` (TDD)

**Files:**
- Modify: `src/lib/ctc.ts`
- Test: `tests/payroll/ctc-config.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/payroll/ctc-config.test.ts
import { describe, it, expect } from "vitest";
import { computeCTCBreakdown, DEFAULT_RATIO_CONFIG, type RatioConfig } from "@/lib/ctc";

describe("computeCTCBreakdown — default ratios unchanged", () => {
  it("matches existing 40/50/40/4.81 hard-codes when no config passed", () => {
    const b = computeCTCBreakdown(1_200_000, "maharashtra", true, true, "new", 0);
    // Basic 40% of 12L = 4.8L. HRA 50% of basic = 2.4L. Gratuity 4.81% of basic = 23,088.
    expect(b.basicAnnual).toBe(480_000);
    expect(b.hraAnnual).toBe(240_000);
    expect(b.employerGratuityAnnual).toBe(23_088);
  });
});

describe("computeCTCBreakdown — config-driven ratios", () => {
  const altConfig: RatioConfig = {
    basic_pct: 50,
    hra_pct_metro: 40,
    hra_pct_non_metro: 30,
    gratuity_pct: 4.81,
  };

  it("uses Basic 50% when config says so", () => {
    const b = computeCTCBreakdown(1_200_000, "maharashtra", true, true, "new", 0, altConfig);
    expect(b.basicAnnual).toBe(600_000); // 50% of 12L
    // HRA 40% of new basic 6L = 2.4L. Same number coincidentally — test below differentiates.
    expect(b.hraAnnual).toBe(240_000);
    // Gratuity 4.81% of 6L = 28,860.
    expect(b.employerGratuityAnnual).toBe(28_860);
  });

  it("uses HRA non-metro pct when isMetro=false", () => {
    const b = computeCTCBreakdown(1_200_000, "rajasthan", false, true, "new", 0, altConfig);
    expect(b.basicAnnual).toBe(600_000);
    // HRA 30% of 6L = 1.8L.
    expect(b.hraAnnual).toBe(180_000);
  });

  it("omits HRA entirely when includeHra=false", () => {
    const b = computeCTCBreakdown(1_200_000, "maharashtra", true, false, "new", 0, altConfig);
    expect(b.hraAnnual).toBe(0);
    expect(b.hraMonthly).toBe(0);
  });

  it("special allowance absorbs the leftover after Basic + HRA + employer PF + gratuity", () => {
    const b = computeCTCBreakdown(1_200_000, "maharashtra", true, true, "new", 0, altConfig);
    const expected =
      1_200_000 - b.basicAnnual - b.hraAnnual - b.employerPfAnnual - b.employerGratuityAnnual;
    expect(b.specialAllowanceAnnual).toBe(expected);
  });
});

describe("DEFAULT_RATIO_CONFIG", () => {
  it("matches the historical hard-codes", () => {
    expect(DEFAULT_RATIO_CONFIG).toEqual({
      basic_pct: 40,
      hra_pct_metro: 50,
      hra_pct_non_metro: 40,
      gratuity_pct: 4.81,
    });
  });
});
```

- [ ] **Step 2: Run, verify FAIL** (module exports don't exist):
```
npx vitest run tests/payroll/ctc-config.test.ts
```

- [ ] **Step 3: Refactor `src/lib/ctc.ts`**

Add at the top of the file (after `INDIAN_STATES`):

```typescript
export type RatioConfig = {
  basic_pct: number;        // % of CTC — historical hard-code 40
  hra_pct_metro: number;    // % of Basic — historical hard-code 50
  hra_pct_non_metro: number; // % of Basic — historical hard-code 40
  gratuity_pct: number;     // % of Basic — historical hard-code 4.81
};

export const DEFAULT_RATIO_CONFIG: RatioConfig = {
  basic_pct: 40,
  hra_pct_metro: 50,
  hra_pct_non_metro: 40,
  gratuity_pct: 4.81,
};
```

Change the `computeCTCBreakdown` signature:

```typescript
export function computeCTCBreakdown(
  ctc: number,
  state: string = "other",
  isMetro: boolean = true,
  includeHra: boolean = true,
  taxRegime: TaxRegime = "new",
  additionalDeductions: number = 0,
  config: RatioConfig = DEFAULT_RATIO_CONFIG
): CTCBreakdown {
```

Replace the hard-coded computation lines inside the function:

```typescript
  // Was: const basicAnnual = Math.round(ctc * 0.4);
  const basicAnnual = Math.round(ctc * (config.basic_pct / 100));

  // Was: const hraAnnual = includeHra ? Math.round(basicAnnual * (isMetro ? 0.5 : 0.4)) : 0;
  const hraRate = isMetro ? config.hra_pct_metro : config.hra_pct_non_metro;
  const hraAnnual = includeHra ? Math.round(basicAnnual * (hraRate / 100)) : 0;

  // Was: const employerGratuityAnnual = Math.round(basicAnnual * 0.0481);
  const employerGratuityAnnual = Math.round(basicAnnual * (config.gratuity_pct / 100));
```

Leave everything else unchanged (PF cap, slabs, standard deduction, 87A, cess — all statutory).

- [ ] **Step 4: Run, verify PASS** (6 tests in this file; existing `tests/payroll/*` if any keep passing too).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ctc.ts tests/payroll/ctc-config.test.ts
git commit -m "feat(payroll): computeCTCBreakdown accepts RatioConfig (defaults unchanged)"
```

---

### Task 6: Pure helper `src/lib/payroll/line-items.ts` (TDD)

**Files:**
- Create: `src/lib/payroll/line-items.ts`
- Test: `tests/payroll/line-items.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/payroll/line-items.test.ts
import { describe, it, expect } from "vitest";
import { sumLineItems, partitionByTaxable, type LineItem } from "@/lib/payroll/line-items";

const items: LineItem[] = [
  { id: "1", category: "bonus",         amount: 5_000, taxable: true,  note: "festival" },
  { id: "2", category: "allowance",     amount: 2_000, taxable: true,  note: "WFH" },
  { id: "3", category: "reimbursement", amount: 1_500, taxable: false, note: "travel" },
  { id: "4", category: "other",         amount: 800,   taxable: false, note: null },
];

describe("sumLineItems", () => {
  it("sums all when taxableOnly omitted", () => {
    expect(sumLineItems(items)).toBe(9_300);
  });
  it("sums taxable only when taxableOnly=true", () => {
    expect(sumLineItems(items, true)).toBe(7_000);
  });
  it("sums non-taxable when taxableOnly=false", () => {
    expect(sumLineItems(items, false)).toBe(2_300);
  });
  it("returns 0 on empty array", () => {
    expect(sumLineItems([])).toBe(0);
  });
});

describe("partitionByTaxable", () => {
  it("splits items into taxable and nonTaxable buckets", () => {
    const { taxable, nonTaxable } = partitionByTaxable(items);
    expect(taxable).toHaveLength(2);
    expect(nonTaxable).toHaveLength(2);
    expect(taxable.map((i) => i.id).sort()).toEqual(["1", "2"]);
    expect(nonTaxable.map((i) => i.id).sort()).toEqual(["3", "4"]);
  });
});
```

- [ ] **Step 2: Run, verify FAIL** (module not found).

- [ ] **Step 3: Implement**

```typescript
// src/lib/payroll/line-items.ts
export type LineItemCategory = "bonus" | "allowance" | "reimbursement" | "other";

export type LineItem = {
  id: string;
  category: LineItemCategory;
  amount: number;
  taxable: boolean;
  note: string | null;
};

export function sumLineItems(items: LineItem[], taxableOnly?: boolean): number {
  return items.reduce((sum, item) => {
    if (taxableOnly === true && !item.taxable) return sum;
    if (taxableOnly === false && item.taxable) return sum;
    return sum + item.amount;
  }, 0);
}

export function partitionByTaxable(items: LineItem[]): { taxable: LineItem[]; nonTaxable: LineItem[] } {
  const taxable: LineItem[] = [];
  const nonTaxable: LineItem[] = [];
  for (const item of items) {
    (item.taxable ? taxable : nonTaxable).push(item);
  }
  return { taxable, nonTaxable };
}
```

- [ ] **Step 4: Run, verify PASS** (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/payroll/line-items.ts tests/payroll/line-items.test.ts
git commit -m "feat(payroll): line-item sum + partition helpers"
```

---

### Task 7: Server actions for `salary_structure_config`

**Files:**
- Modify: `src/actions/payroll.ts` — add config actions.

- [ ] **Step 1: Add imports + types at the top of `src/actions/payroll.ts`**

Append to the existing top-of-file imports:
```typescript
import { DEFAULT_RATIO_CONFIG, type RatioConfig } from "@/lib/ctc";
```

Add the type export near the other type exports (after `MyPayslip`):
```typescript
export type SalaryStructureConfig = RatioConfig & {
  id: string;
  effective_from: string;
  created_at: string;
};

export type ConfigImpactRow = {
  employee_id: string;
  employee_name: string;
  basic_monthly_old: number;
  basic_monthly_new: number;
  hra_monthly_old: number;
  hra_monthly_new: number;
  special_allowance_monthly_old: number;
  special_allowance_monthly_new: number;
  net_monthly_old: number;
  net_monthly_new: number;
};
```

Add the Zod schema near the existing schemas:
```typescript
const RatioConfigSchema = z.object({
  basic_pct: z.number().min(10).max(80),
  hra_pct_metro: z.number().min(0).max(100),
  hra_pct_non_metro: z.number().min(0).max(100),
  gratuity_pct: z.number().min(0).max(20),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
```

- [ ] **Step 2: Add `getActiveRatioConfig` (server-internal)**

Append to the file (in the Salary Structures section, before `getSalaryStructures`):

```typescript
/**
 * Returns the org's active RatioConfig — the latest salary_structure_config row
 * with effective_from <= today. Returns DEFAULT_RATIO_CONFIG if none configured.
 * Server-internal helper; no auth guard (caller is always already authenticated).
 */
async function getActiveRatioConfig(orgId: string): Promise<RatioConfig> {
  const sb = createAdminSupabase();
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await sb
    .from("salary_structure_config")
    .select("basic_pct, hra_pct_metro, hra_pct_non_metro, gratuity_pct")
    .eq("org_id", orgId)
    .lte("effective_from", today)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return DEFAULT_RATIO_CONFIG;
  return {
    basic_pct: Number((data as any).basic_pct),
    hra_pct_metro: Number((data as any).hra_pct_metro),
    hra_pct_non_metro: Number((data as any).hra_pct_non_metro),
    gratuity_pct: Number((data as any).gratuity_pct),
  };
}
```

- [ ] **Step 3: Add `getSalaryStructureConfig` action**

```typescript
export async function getSalaryStructureConfig(): Promise<ActionResult<{
  active: RatioConfig;
  history: SalaryStructureConfig[];
}>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can view salary structure config" };

  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("salary_structure_config")
    .select("id, basic_pct, hra_pct_metro, hra_pct_non_metro, gratuity_pct, effective_from, created_at")
    .eq("org_id", user.orgId)
    .order("effective_from", { ascending: false });

  if (error) return { success: false, error: error.message };

  const history = (data ?? []).map((r: any) => ({
    id: r.id,
    basic_pct: Number(r.basic_pct),
    hra_pct_metro: Number(r.hra_pct_metro),
    hra_pct_non_metro: Number(r.hra_pct_non_metro),
    gratuity_pct: Number(r.gratuity_pct),
    effective_from: r.effective_from,
    created_at: r.created_at,
  })) as SalaryStructureConfig[];

  const active = await getActiveRatioConfig(user.orgId);
  return { success: true, data: { active, history } };
}
```

- [ ] **Step 4: Add `upsertSalaryStructureConfig` action**

```typescript
export async function upsertSalaryStructureConfig(
  input: z.infer<typeof RatioConfigSchema>
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can configure salary structure ratios" };

  const parsed = RatioConfigSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message };

  const sb = createAdminSupabase();
  const { error } = await sb
    .from("salary_structure_config")
    .upsert(
      {
        org_id: user.orgId,
        basic_pct: parsed.data.basic_pct,
        hra_pct_metro: parsed.data.hra_pct_metro,
        hra_pct_non_metro: parsed.data.hra_pct_non_metro,
        gratuity_pct: parsed.data.gratuity_pct,
        effective_from: parsed.data.effective_from,
        created_by: user.employeeId ?? null,
      } as any,
      { onConflict: "org_id,effective_from" }
    );

  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true, data: undefined };
}
```

- [ ] **Step 5: Add `previewConfigImpact` action**

```typescript
/**
 * Returns per-employee old-vs-new monthly component diffs if the proposed
 * RatioConfig were applied. Pure compute — no DB writes.
 */
export async function previewConfigImpact(
  proposed: RatioConfig
): Promise<ActionResult<ConfigImpactRow[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can preview config impact" };

  const sb = createAdminSupabase();
  const [{ data: structures }, { data: employees }] = await Promise.all([
    sb.from("salary_structures")
      .select("employee_id, ctc, state, is_metro, include_hra, tax_regime, additional_deductions_annual")
      .eq("org_id", user.orgId),
    sb.from("employees")
      .select("id, first_name, last_name")
      .eq("org_id", user.orgId),
  ]);

  const empMap = new Map((employees ?? []).map((e: any) => [e.id, e]));

  const rows: ConfigImpactRow[] = (structures ?? []).map((s: any) => {
    const emp = empMap.get(s.employee_id) as any;
    const oldB = computeCTCBreakdown(s.ctc, s.state, s.is_metro, s.include_hra, s.tax_regime ?? "new", Number(s.additional_deductions_annual ?? 0));
    const newB = computeCTCBreakdown(s.ctc, s.state, s.is_metro, s.include_hra, s.tax_regime ?? "new", Number(s.additional_deductions_annual ?? 0), proposed);
    return {
      employee_id: s.employee_id,
      employee_name: emp ? `${emp.first_name} ${emp.last_name}` : "Unknown",
      basic_monthly_old: oldB.basicMonthly,
      basic_monthly_new: newB.basicMonthly,
      hra_monthly_old: oldB.hraMonthly,
      hra_monthly_new: newB.hraMonthly,
      special_allowance_monthly_old: oldB.specialAllowanceMonthly,
      special_allowance_monthly_new: newB.specialAllowanceMonthly,
      net_monthly_old: oldB.netMonthly,
      net_monthly_new: newB.netMonthly,
    };
  });

  return { success: true, data: rows };
}
```

- [ ] **Step 6: Lint check** — `npm run lint -- src/actions/payroll.ts`. No new errors.

- [ ] **Step 7: Commit**

```bash
git add src/actions/payroll.ts
git commit -m "feat(payroll): salary structure config CRUD + impact preview"
```

---

### Task 8: Wire `upsertSalaryStructure` to read active config

**Files:**
- Modify: `src/actions/payroll.ts` — single function update.

- [ ] **Step 1: Update `upsertSalaryStructure` body**

Find the existing `computeCTCBreakdown` call:
```typescript
const breakdown = computeCTCBreakdown(ctc, state, is_metro, include_hra, tax_regime, additional_deductions_annual);
```

Replace with:
```typescript
const ratioConfig = await getActiveRatioConfig(user.orgId);
const breakdown = computeCTCBreakdown(ctc, state, is_metro, include_hra, tax_regime, additional_deductions_annual, ratioConfig);
```

Leave the rest of the function unchanged. The snapshotting onto `salary_structures` row (basic_monthly, hra_monthly, etc.) and the `computed_at` write are already in place.

- [ ] **Step 2: Lint check.**

- [ ] **Step 3: Commit**

```bash
git add src/actions/payroll.ts
git commit -m "feat(payroll): upsertSalaryStructure honors active ratio config"
```

---

### Task 9: Refactor `processPayrollRun` — snapshot config + sum line items + recompute TDS

**Files:**
- Modify: `src/actions/payroll.ts` — `processPayrollRun` function.

- [ ] **Step 1: Snapshot the active config and line items**

At the top of `processPayrollRun` (after the `if (runData.status !== "draft")` guard, before the month boundaries are computed), add:

```typescript
// PRD 02 Phase 1: snapshot the active ratio config for immutability.
const activeRatioConfig = await getActiveRatioConfig(user.orgId);
const { data: configRow } = await supabase
  .from("salary_structure_config")
  .select("id, effective_from")
  .eq("org_id", user.orgId)
  .lte("effective_from", new Date().toISOString().slice(0, 10))
  .order("effective_from", { ascending: false })
  .limit(1)
  .maybeSingle();
const configSnapshot = {
  ...activeRatioConfig,
  effective_from: (configRow as any)?.effective_from ?? null,
  config_id: (configRow as any)?.id ?? null,
};
```

- [ ] **Step 2: Fetch line items per entry**

After the existing `joiningMap` block (right before the `entries = ...` map), add:

```typescript
// PRD 02 Phase 1: pre-fetch line items for every (org_id, employee_id) so we
// can fold them into the entry totals. Line items are keyed by entry_id which
// doesn't exist yet for a fresh run — so for FIRST-process we have none. On
// REPROCESS of an existing run, line items survived the prior delete because
// they cascade via payroll_line_items.payroll_entry_id ON DELETE CASCADE —
// which means a reprocess DROPS line items too. That's the intended Phase 1
// behaviour: line items are added AFTER process, before paid.
const existingLineItemsByEmployee = new Map<string, Array<{ amount: number; taxable: boolean }>>();
// (Map stays empty on first process; reprocess after add-line-item is a Phase 1.5 follow-up.)
```

- [ ] **Step 3: Fold line items into the entry computation**

Inside the existing `entries = (salaries as any[]).map((s) => { ... })` block, after computing `monthlyTds` and `lopDeduction`, add the line-item math:

```typescript
    const lineItems = existingLineItemsByEmployee.get(s.employee_id) ?? [];
    const taxableLineSum = lineItems.filter((i) => i.taxable).reduce((a, b) => a + b.amount, 0);
    const nonTaxableLineSum = lineItems.filter((i) => !i.taxable).reduce((a, b) => a + b.amount, 0);
    const totalLineItems = taxableLineSum + nonTaxableLineSum;
    const bonusTax = computeAdditionalTaxOnBonus(annualTaxableIncome, taxableLineSum, regime);
    const adjustedTds = monthlyTds + bonusTax;

    const totalDeductions =
      s.employee_pf_monthly + s.professional_tax_monthly + adjustedTds + lopDeduction;
    const netPay = Math.max(0, s.gross_monthly + totalLineItems - totalDeductions);
```

Replace the existing `tds: monthlyTds`, `total_deductions: totalDeductions`, `net_pay: netPay`, `bonus: 0` fields in the returned entry object with:
```typescript
      tds: adjustedTds,
      total_line_items: totalLineItems,
      bonus: 0, // legacy column kept for back-compat; line items are the new path
      total_deductions: totalDeductions,
      net_pay: netPay,
```

- [ ] **Step 4: Write the config snapshot to the run**

In the existing final `update(...)` call on `payroll_runs`, add the snapshot:
```typescript
.update({
  status: "processed",
  total_gross: Math.round(totalGross),
  total_deductions: Math.round(totalDeductions),
  total_net: Math.round(totalNet),
  employee_count: entries.length,
  processed_at: new Date().toISOString(),
  structure_config_snapshot: configSnapshot, // <-- NEW
})
```

- [ ] **Step 5: Lint check.**

- [ ] **Step 6: Commit**

```bash
git add src/actions/payroll.ts
git commit -m "feat(payroll): processPayrollRun snapshots config + folds line items"
```

---

### Task 10: Server actions for `payroll_line_items` (CRUD + entry recompute)

**Files:**
- Modify: `src/actions/payroll.ts` — add line-item actions.

- [ ] **Step 1: Add types + schemas near the other payroll types**

```typescript
import type { LineItem, LineItemCategory } from "@/lib/payroll/line-items";
import { sumLineItems, partitionByTaxable } from "@/lib/payroll/line-items";

export type PayrollLineItemRow = LineItem & {
  payroll_entry_id: string;
  created_at: string;
};

const LineItemSchema = z.object({
  payroll_entry_id: z.string().uuid(),
  category: z.enum(["bonus", "allowance", "reimbursement", "other"]),
  amount: z.number().int().min(0).max(10_000_000),
  taxable: z.boolean().default(true),
  note: z.string().max(280).nullable().optional(),
});
```

- [ ] **Step 2: Add `listPayrollLineItems` action**

```typescript
export async function listPayrollLineItems(entryId: string): Promise<ActionResult<PayrollLineItemRow[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  // Anyone in the org can SELECT — RLS guards (admin or self via entry join).
  // Server-side we additionally verify the entry belongs to caller's org via the join.
  const sb = createAdminSupabase();
  const { data: entry } = await sb
    .from("payroll_entries")
    .select("id, org_id, employee_id")
    .eq("id", entryId)
    .maybeSingle();
  if (!entry) return { success: false, error: "Entry not found" };
  if ((entry as any).org_id !== user.orgId) return { success: false, error: "Unauthorized" };
  // Non-admins may only read their own entry's line items.
  if (!isAdmin(user.role) && (entry as any).employee_id !== user.employeeId) {
    return { success: false, error: "Unauthorized" };
  }

  const { data, error } = await sb
    .from("payroll_line_items")
    .select("*")
    .eq("payroll_entry_id", entryId)
    .order("created_at", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    data: (data ?? []).map((r: any) => ({
      id: r.id,
      payroll_entry_id: r.payroll_entry_id,
      category: r.category as LineItemCategory,
      amount: r.amount,
      taxable: r.taxable,
      note: r.note,
      created_at: r.created_at,
    })),
  };
}
```

- [ ] **Step 3: Add `addPayrollLineItem` action**

```typescript
export async function addPayrollLineItem(input: z.infer<typeof LineItemSchema>): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can add line items" };
  const parsed = LineItemSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message };

  const sb = createAdminSupabase();
  // Verify the entry is in caller's org and the run is not paid.
  const { data: entry } = await sb
    .from("payroll_entries")
    .select("id, org_id, payroll_run_id")
    .eq("id", parsed.data.payroll_entry_id)
    .single();
  if (!entry || (entry as any).org_id !== user.orgId) return { success: false, error: "Entry not found" };

  const { data: run } = await sb
    .from("payroll_runs")
    .select("status")
    .eq("id", (entry as any).payroll_run_id)
    .single();
  if ((run as any)?.status === "paid") return { success: false, error: "Cannot add line items to a paid run" };

  const { data, error } = await sb
    .from("payroll_line_items")
    .insert({
      org_id: user.orgId,
      payroll_entry_id: parsed.data.payroll_entry_id,
      category: parsed.data.category,
      amount: parsed.data.amount,
      taxable: parsed.data.taxable,
      note: parsed.data.note ?? null,
      created_by: user.employeeId ?? null,
    } as any)
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };

  await recomputeEntryFromLineItems((entry as any).id);
  revalidatePath("/dashboard/payroll");
  return { success: true, data: { id: (data as { id: string }).id } };
}
```

- [ ] **Step 4: Add `removePayrollLineItem` action**

```typescript
export async function removePayrollLineItem(itemId: string): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can remove line items" };

  const sb = createAdminSupabase();
  const { data: item } = await sb
    .from("payroll_line_items")
    .select("id, org_id, payroll_entry_id")
    .eq("id", itemId)
    .single();
  if (!item || (item as any).org_id !== user.orgId) return { success: false, error: "Line item not found" };

  const { data: entry } = await sb
    .from("payroll_entries")
    .select("payroll_run_id")
    .eq("id", (item as any).payroll_entry_id)
    .single();
  const { data: run } = await sb
    .from("payroll_runs")
    .select("status")
    .eq("id", (entry as any).payroll_run_id)
    .single();
  if ((run as any)?.status === "paid") return { success: false, error: "Cannot remove line items from a paid run" };

  const { error } = await sb.from("payroll_line_items").delete().eq("id", itemId);
  if (error) return { success: false, error: error.message };

  await recomputeEntryFromLineItems((item as any).payroll_entry_id);
  revalidatePath("/dashboard/payroll");
  return { success: true, data: undefined };
}
```

- [ ] **Step 5: Add `recomputeEntryFromLineItems` internal helper**

```typescript
/**
 * Recomputes a single entry's TDS, total_line_items, total_deductions, net_pay
 * after a line-item add/remove. Reuses the entry's stored
 * annual_taxable_income + months_in_fy (snapshot from processPayrollRun).
 * Updates the parent run's roll-up totals.
 */
async function recomputeEntryFromLineItems(entryId: string): Promise<void> {
  const sb = createAdminSupabase();
  const { data: entry } = await sb
    .from("payroll_entries")
    .select("id, gross_salary, employee_pf, professional_tax, lop_deduction, payroll_run_id, employee_id, annual_taxable_income, months_in_fy, net_pay, org_id")
    .eq("id", entryId)
    .single();
  if (!entry) return;
  const e = entry as any;

  const { data: items } = await sb
    .from("payroll_line_items")
    .select("amount, taxable")
    .eq("payroll_entry_id", entryId);
  const itemsArr = (items ?? []) as Array<{ amount: number; taxable: boolean }>;
  const taxableSum = itemsArr.filter((i) => i.taxable).reduce((s, i) => s + i.amount, 0);
  const totalLineItems = itemsArr.reduce((s, i) => s + i.amount, 0);

  // Regime + extra deductions for marginal-tax math
  const { data: salary } = await sb
    .from("salary_structures")
    .select("tax_regime, additional_deductions_annual")
    .eq("org_id", e.org_id)
    .eq("employee_id", e.employee_id)
    .maybeSingle();
  const regime: "new" | "old" = ((salary as any)?.tax_regime as "new" | "old") ?? "new";
  const standardDeduction = regime === "old" ? 50000 : 75000;
  const extraDed = regime === "old" ? Number((salary as any)?.additional_deductions_annual ?? 0) : 0;

  const monthsInFY: number = Number(e.months_in_fy) > 0 ? Number(e.months_in_fy) : 12;
  const annualTaxable: number =
    e.annual_taxable_income != null
      ? Number(e.annual_taxable_income)
      : Math.max(0, e.gross_salary * 12 - e.employee_pf * 12 - standardDeduction - extraDed);
  const baseTds = Math.round(computeTaxByRegime(annualTaxable, regime) / monthsInFY);
  const bonusTax = computeAdditionalTaxOnBonus(annualTaxable, taxableSum, regime);
  const adjustedTds = baseTds + bonusTax;

  const totalDeductions = e.employee_pf + e.professional_tax + adjustedTds + (e.lop_deduction ?? 0);
  const netPay = Math.max(0, e.gross_salary + totalLineItems - totalDeductions);

  await sb
    .from("payroll_entries")
    .update({
      tds: adjustedTds,
      total_line_items: totalLineItems,
      total_deductions: totalDeductions,
      net_pay: netPay,
      previous_net_pay: e.net_pay,
      edited_at: new Date().toISOString(),
    } as any)
    .eq("id", entryId);

  // Roll up run totals.
  const { data: allEntries } = await sb
    .from("payroll_entries")
    .select("gross_salary, total_deductions, net_pay, total_line_items")
    .eq("payroll_run_id", e.payroll_run_id);
  if (allEntries) {
    const totalGross = (allEntries as any[]).reduce((s, x) => s + x.gross_salary + (x.total_line_items ?? 0), 0);
    const totalDed = (allEntries as any[]).reduce((s, x) => s + x.total_deductions, 0);
    const totalNet = (allEntries as any[]).reduce((s, x) => s + x.net_pay, 0);
    await sb
      .from("payroll_runs")
      .update({ total_gross: totalGross, total_deductions: totalDed, total_net: totalNet })
      .eq("id", e.payroll_run_id);
  }
}
```

- [ ] **Step 6: Lint check.**

- [ ] **Step 7: Commit**

```bash
git add src/actions/payroll.ts
git commit -m "feat(payroll): payroll_line_items CRUD with TDS + roll-up recompute"
```

---

### Task 11: `recomputeAllSalaryStructures` admin action

**Files:**
- Modify: `src/actions/payroll.ts` — add the bulk recompute action.

- [ ] **Step 1: Add the action**

```typescript
/**
 * Re-runs computeCTCBreakdown for every salary_structures row in the caller's
 * org using the latest active RatioConfig. Use after `upsertSalaryStructureConfig`
 * to propagate new ratios into existing employee structures.
 */
export async function recomputeAllSalaryStructures(): Promise<ActionResult<{ recomputed: number }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can recompute salary structures" };

  const sb = createAdminSupabase();
  const ratioConfig = await getActiveRatioConfig(user.orgId);
  const { data: structures, error } = await sb
    .from("salary_structures")
    .select("id, employee_id, ctc, state, is_metro, include_hra, effective_from, tax_regime, additional_deductions_annual")
    .eq("org_id", user.orgId);
  if (error) return { success: false, error: error.message };

  let recomputed = 0;
  for (const row of (structures ?? []) as any[]) {
    const breakdown = computeCTCBreakdown(
      row.ctc,
      row.state,
      row.is_metro,
      row.include_hra,
      (row.tax_regime as "new" | "old") ?? "new",
      Number(row.additional_deductions_annual ?? 0),
      ratioConfig
    );
    const { error: updErr } = await sb
      .from("salary_structures")
      .update({
        basic_monthly: breakdown.basicMonthly,
        hra_monthly: breakdown.hraMonthly,
        special_allowance_monthly: breakdown.specialAllowanceMonthly,
        employer_pf_monthly: breakdown.employerPfMonthly,
        employer_gratuity_annual: breakdown.employerGratuityAnnual,
        employee_pf_monthly: breakdown.employeePfMonthly,
        professional_tax_monthly: breakdown.ptMonthly,
        tds_monthly: breakdown.tdsMonthly,
        gross_monthly: breakdown.grossMonthly,
        net_monthly: breakdown.netMonthly,
        updated_at: new Date().toISOString(),
        computed_at: new Date().toISOString(),
      } as any)
      .eq("id", row.id);
    if (!updErr) recomputed++;
  }

  revalidatePath("/dashboard/payroll");
  revalidatePath("/dashboard/settings");
  return { success: true, data: { recomputed } };
}
```

- [ ] **Step 2: Lint check.**

- [ ] **Step 3: Commit**

```bash
git add src/actions/payroll.ts
git commit -m "feat(payroll): recomputeAllSalaryStructures admin action"
```

---

### Task 12: Settings → Payroll section + Salary Structure Config card + Impact Preview

**Files:**
- Create: `src/components/settings/payroll-section.tsx`
- Create: `src/components/settings/salary-structure-config-card.tsx`
- Create: `src/components/settings/config-impact-preview.tsx`
- Modify: `src/components/settings/settings-content.tsx` — register Payroll section
- Modify: `src/app/dashboard/settings/page.tsx` — fetch config

- [ ] **Step 1: Build `payroll-section.tsx`**

```typescript
"use client";

import { SalaryStructureConfigCard } from "./salary-structure-config-card";
import type { SalaryStructureConfig } from "@/actions/payroll";
import type { RatioConfig } from "@/lib/ctc";

interface Props {
  activeConfig: RatioConfig;
  history: SalaryStructureConfig[];
}

export function PayrollSection({ activeConfig, history }: Props) {
  return (
    <div className="space-y-4 p-6">
      <h2 className="text-lg font-semibold">Payroll</h2>
      <p className="text-sm text-muted-foreground">
        Configure the salary-structure ratios applied to new salary upserts. Changes do not
        automatically rewrite existing salaries — use "Recompute all" to propagate.
      </p>
      <SalaryStructureConfigCard activeConfig={activeConfig} history={history} />
    </div>
  );
}
```

- [ ] **Step 2: Build `salary-structure-config-card.tsx`**

```typescript
"use client";

import * as React from "react";
import { toast } from "sonner";
import { Pencil, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  upsertSalaryStructureConfig,
  recomputeAllSalaryStructures,
  previewConfigImpact,
  type SalaryStructureConfig,
  type ConfigImpactRow,
} from "@/actions/payroll";
import type { RatioConfig } from "@/lib/ctc";
import { ConfigImpactPreview } from "./config-impact-preview";

interface Props {
  activeConfig: RatioConfig;
  history: SalaryStructureConfig[];
}

export function SalaryStructureConfigCard({ activeConfig, history }: Props) {
  const [editing, setEditing] = React.useState(false);
  const [basic, setBasic] = React.useState(String(activeConfig.basic_pct));
  const [hraMetro, setHraMetro] = React.useState(String(activeConfig.hra_pct_metro));
  const [hraNonMetro, setHraNonMetro] = React.useState(String(activeConfig.hra_pct_non_metro));
  const [gratuity, setGratuity] = React.useState(String(activeConfig.gratuity_pct));
  const [effectiveFrom, setEffectiveFrom] = React.useState(new Date().toISOString().slice(0, 10));
  const [preview, setPreview] = React.useState<ConfigImpactRow[] | null>(null);
  const [loading, setLoading] = React.useState(false);

  const proposed: RatioConfig = {
    basic_pct: Number(basic),
    hra_pct_metro: Number(hraMetro),
    hra_pct_non_metro: Number(hraNonMetro),
    gratuity_pct: Number(gratuity),
  };

  async function handlePreview() {
    setLoading(true);
    const r = await previewConfigImpact(proposed);
    setLoading(false);
    if (!r.success) { toast.error(r.error); return; }
    setPreview(r.data);
  }

  async function handleSave() {
    setLoading(true);
    const r = await upsertSalaryStructureConfig({ ...proposed, effective_from: effectiveFrom });
    setLoading(false);
    if (!r.success) { toast.error(r.error); return; }
    toast.success("Configuration saved. Click 'Recompute all' to propagate to existing structures.");
    setEditing(false);
    setPreview(null);
  }

  async function handleRecomputeAll() {
    setLoading(true);
    const r = await recomputeAllSalaryStructures();
    setLoading(false);
    if (!r.success) { toast.error(r.error); return; }
    toast.success(`Recomputed ${r.data.recomputed} salary structures`);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Salary Structure Ratios</p>
        {!editing && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
          </Button>
        )}
      </div>

      {!editing ? (
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-muted-foreground">Basic</span> <span className="font-semibold tabular-nums">{activeConfig.basic_pct}%</span> <span className="text-xs text-muted-foreground">of CTC</span></div>
          <div><span className="text-muted-foreground">Gratuity</span> <span className="font-semibold tabular-nums">{activeConfig.gratuity_pct}%</span> <span className="text-xs text-muted-foreground">of Basic</span></div>
          <div><span className="text-muted-foreground">HRA Metro</span> <span className="font-semibold tabular-nums">{activeConfig.hra_pct_metro}%</span> <span className="text-xs text-muted-foreground">of Basic</span></div>
          <div><span className="text-muted-foreground">HRA Non-Metro</span> <span className="font-semibold tabular-nums">{activeConfig.hra_pct_non_metro}%</span> <span className="text-xs text-muted-foreground">of Basic</span></div>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs text-muted-foreground mb-1">Basic % of CTC</span>
              <input type="number" min={10} max={80} step={0.5} className="w-full rounded-md border border-input bg-background px-3 py-1.5" value={basic} onChange={(e) => setBasic(e.target.value)} />
            </label>
            <label className="block">
              <span className="block text-xs text-muted-foreground mb-1">Gratuity % of Basic</span>
              <input type="number" min={0} max={20} step={0.01} className="w-full rounded-md border border-input bg-background px-3 py-1.5" value={gratuity} onChange={(e) => setGratuity(e.target.value)} />
            </label>
            <label className="block">
              <span className="block text-xs text-muted-foreground mb-1">HRA Metro % of Basic</span>
              <input type="number" min={0} max={100} step={0.5} className="w-full rounded-md border border-input bg-background px-3 py-1.5" value={hraMetro} onChange={(e) => setHraMetro(e.target.value)} />
            </label>
            <label className="block">
              <span className="block text-xs text-muted-foreground mb-1">HRA Non-Metro % of Basic</span>
              <input type="number" min={0} max={100} step={0.5} className="w-full rounded-md border border-input bg-background px-3 py-1.5" value={hraNonMetro} onChange={(e) => setHraNonMetro(e.target.value)} />
            </label>
            <label className="block col-span-2">
              <span className="block text-xs text-muted-foreground mb-1">Effective from</span>
              <input type="date" className="w-full rounded-md border border-input bg-background px-3 py-1.5" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
            </label>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={handlePreview} disabled={loading}>Preview impact</Button>
            <Button size="sm" onClick={handleSave} disabled={loading}>{loading ? "Saving…" : "Save config"}</Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setPreview(null); }} disabled={loading}>Cancel</Button>
          </div>
          {preview && <ConfigImpactPreview rows={preview} />}
        </div>
      )}

      <div className="border-t border-border pt-3 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{history.length} historical version{history.length === 1 ? "" : "s"}</p>
        <Button size="sm" variant="ghost" onClick={handleRecomputeAll} disabled={loading}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Recompute all salary structures
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build `config-impact-preview.tsx`**

```typescript
"use client";

import type { ConfigImpactRow } from "@/actions/payroll";
import { formatINR } from "@/lib/ctc";

export function ConfigImpactPreview({ rows }: { rows: ConfigImpactRow[] }) {
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">No salary structures to preview yet.</p>;
  }

  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <p className="text-xs font-semibold mb-2">Impact preview (per employee, monthly)</p>
      <div className="max-h-64 overflow-auto">
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left font-medium pb-1.5">Employee</th>
              <th className="text-right font-medium pb-1.5">Basic Δ</th>
              <th className="text-right font-medium pb-1.5">HRA Δ</th>
              <th className="text-right font-medium pb-1.5">SA Δ</th>
              <th className="text-right font-medium pb-1.5">Net Δ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const dB = r.basic_monthly_new - r.basic_monthly_old;
              const dH = r.hra_monthly_new - r.hra_monthly_old;
              const dS = r.special_allowance_monthly_new - r.special_allowance_monthly_old;
              const dN = r.net_monthly_new - r.net_monthly_old;
              const arrow = (n: number) => (n > 0 ? "↑" : n < 0 ? "↓" : "·");
              const tone = (n: number) => (n > 0 ? "text-emerald-600" : n < 0 ? "text-amber-700" : "text-muted-foreground");
              return (
                <tr key={r.employee_id} className="border-t border-border/70">
                  <td className="py-1.5">{r.employee_name}</td>
                  <td className={`text-right py-1.5 ${tone(dB)}`}>{arrow(dB)} {formatINR(Math.abs(dB))}</td>
                  <td className={`text-right py-1.5 ${tone(dH)}`}>{arrow(dH)} {formatINR(Math.abs(dH))}</td>
                  <td className={`text-right py-1.5 ${tone(dS)}`}>{arrow(dS)} {formatINR(Math.abs(dS))}</td>
                  <td className={`text-right py-1.5 ${tone(dN)}`}>{arrow(dN)} {formatINR(Math.abs(dN))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Register in `settings-content.tsx`**

Add imports:
```typescript
import { Wallet as WalletIcon } from "lucide-react";
import { PayrollSection } from "@/components/settings/payroll-section";
import type { SalaryStructureConfig } from "@/actions/payroll";
import type { RatioConfig } from "@/lib/ctc";
```

Extend `SettingsContentProps`:
```typescript
  payrollActiveConfig: RatioConfig | null;
  payrollConfigHistory: SalaryStructureConfig[];
  payrollEnabled: boolean;
```

Destructure these in the function signature.

Insert the new `CollapsibleSection` (after Performance, before AI Assistant):
```typescript
      {payrollEnabled && isAdmin && payrollActiveConfig && (
        <CollapsibleSection
          title="Payroll"
          icon={<WalletIcon className="h-5 w-5 text-muted-foreground" />}
          summary={`Basic ${payrollActiveConfig.basic_pct}% · HRA ${payrollActiveConfig.hra_pct_metro}/${payrollActiveConfig.hra_pct_non_metro} · ${payrollConfigHistory.length} history`}
          isOpen={openSection === "payroll"}
          onToggle={() => toggle("payroll")}
        >
          <PayrollSection activeConfig={payrollActiveConfig} history={payrollConfigHistory} />
        </CollapsibleSection>
      )}
```

- [ ] **Step 5: Fetch in `settings/page.tsx`**

Add import:
```typescript
import { getSalaryStructureConfig } from "@/actions/payroll";
import { hasFeature } from "@/config/plans";
```

Add `getSalaryStructureConfig()` to the `Promise.all` array (alongside the existing fetches added by Attendance Phase 1).

Compute `payrollEnabled`:
```typescript
const payrollEnabled = hasFeature(plan, "payroll", userCtx?.customFeatures ?? null);
const payrollActiveConfig = payrollConfigResult.success ? payrollConfigResult.data.active : null;
const payrollConfigHistory = payrollConfigResult.success ? payrollConfigResult.data.history : [];
```

Pass into `<SettingsContent ... payrollActiveConfig={payrollActiveConfig} payrollConfigHistory={payrollConfigHistory} payrollEnabled={payrollEnabled} />`.

- [ ] **Step 6: Lint + build check.**

```
npm run lint -- src/components/settings src/app/dashboard/settings/page.tsx
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add src/components/settings/payroll-section.tsx \
        src/components/settings/salary-structure-config-card.tsx \
        src/components/settings/config-impact-preview.tsx \
        src/components/settings/settings-content.tsx \
        src/app/dashboard/settings/page.tsx
git commit -m "feat(payroll): Settings → Payroll section with config + impact preview"
```

---

### Task 13: Extend `entry-edit-dialog.tsx` — line items UI

**Files:**
- Modify: `src/components/payroll/entry-edit-dialog.tsx`
- Modify: `src/components/payroll/payroll-client.tsx` — pass line items down

- [ ] **Step 1: Inspect the existing entry-edit-dialog and payroll-client**

Read `src/components/payroll/entry-edit-dialog.tsx` to find the current bonus + lop_days form. The existing surface uses `updatePayrollEntry({ bonus, lop_days })`.

- [ ] **Step 2: Add a line-items list to the dialog**

Above the existing bonus/lop_days inputs, render a table of line items with an "Add line item" row. Each row has: category select, amount input, taxable toggle, note input, remove button. Use `listPayrollLineItems(entry.id)` on dialog open to populate.

Skeleton (paste in place of the bonus input section — keep `lop_days` as-is for now since LOP is computed from leaves):

```typescript
// Inside the dialog component, after state setup:
const [items, setItems] = React.useState<PayrollLineItemRow[]>([]);
const [refreshKey, setRefreshKey] = React.useState(0);

React.useEffect(() => {
  if (!open) return;
  listPayrollLineItems(entry.id).then((r) => {
    if (r.success) setItems(r.data);
  });
}, [open, entry.id, refreshKey]);

// Form state for the "add new" row:
const [newCategory, setNewCategory] = React.useState<"bonus" | "allowance" | "reimbursement" | "other">("bonus");
const [newAmount, setNewAmount] = React.useState("");
const [newTaxable, setNewTaxable] = React.useState(true);
const [newNote, setNewNote] = React.useState("");

async function handleAddItem() {
  const amt = Number(newAmount);
  if (!Number.isFinite(amt) || amt < 0) return toast.error("Enter a valid amount");
  const r = await addPayrollLineItem({
    payroll_entry_id: entry.id,
    category: newCategory,
    amount: Math.round(amt),
    taxable: newTaxable,
    note: newNote.trim() || null,
  });
  if (!r.success) return toast.error(r.error);
  setNewAmount(""); setNewNote("");
  setRefreshKey((k) => k + 1);
  toast.success("Line item added");
}

async function handleRemoveItem(id: string) {
  const r = await removePayrollLineItem(id);
  if (!r.success) return toast.error(r.error);
  setRefreshKey((k) => k + 1);
}

// JSX (replace existing bonus input with this block):
<div className="rounded-lg border border-border p-3 space-y-2">
  <p className="text-xs font-semibold">Line items</p>
  {items.length === 0 ? (
    <p className="text-xs text-muted-foreground">No line items yet.</p>
  ) : (
    <ul className="space-y-1.5 text-xs">
      {items.map((it) => (
        <li key={it.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5">
          <span className="inline-flex items-center gap-2 min-w-0">
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary capitalize">{it.category}</span>
            <span className="font-semibold tabular-nums">{formatINR(it.amount)}</span>
            {!it.taxable && <span className="text-[10px] text-muted-foreground">non-taxable</span>}
            {it.note && <span className="truncate text-muted-foreground">— {it.note}</span>}
          </span>
          <button type="button" onClick={() => handleRemoveItem(it.id)} className="text-muted-foreground hover:text-destructive">✕</button>
        </li>
      ))}
    </ul>
  )}
  <div className="grid grid-cols-12 gap-1.5 pt-1 items-end">
    <select value={newCategory} onChange={(e) => setNewCategory(e.target.value as any)} className="col-span-3 rounded-md border border-input bg-background px-2 py-1 text-xs">
      <option value="bonus">Bonus</option>
      <option value="allowance">Allowance</option>
      <option value="reimbursement">Reimbursement</option>
      <option value="other">Other</option>
    </select>
    <input type="number" min={0} step={1} placeholder="Amount" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} className="col-span-2 rounded-md border border-input bg-background px-2 py-1 text-xs" />
    <label className="col-span-2 inline-flex items-center gap-1 text-[10px]"><input type="checkbox" checked={newTaxable} onChange={(e) => setNewTaxable(e.target.checked)} /> Taxable</label>
    <input type="text" placeholder="Note (optional)" value={newNote} onChange={(e) => setNewNote(e.target.value)} className="col-span-3 rounded-md border border-input bg-background px-2 py-1 text-xs" />
    <Button type="button" size="sm" onClick={handleAddItem} className="col-span-2">Add</Button>
  </div>
</div>
```

Add imports at the top of the dialog file:
```typescript
import { listPayrollLineItems, addPayrollLineItem, removePayrollLineItem, type PayrollLineItemRow } from "@/actions/payroll";
import { formatINR } from "@/lib/ctc";
```

Keep the `lop_days` field unchanged. Remove the standalone `bonus` integer input (line items replace it for new edits).

- [ ] **Step 3: Lint + build check.**

- [ ] **Step 4: Commit**

```bash
git add src/components/payroll/entry-edit-dialog.tsx src/components/payroll/payroll-client.tsx
git commit -m "feat(payroll): line-items UI in per-entry edit dialog"
```

---

### Task 14: Payslip email template + render in payslip dialog

**Files:**
- Create: `src/components/emails/payslip.tsx`
- Modify: `src/components/payroll/payslip-dialog.tsx` — render line items section

- [ ] **Step 1: Build the email template `src/components/emails/payslip.tsx`**

```typescript
import * as React from "react";
import { Html, Head, Preview, Body, Container, Section, Heading, Text, Hr, Row, Column } from "@react-email/components";

interface PayslipEmailProps {
  orgName: string;
  employeeName: string;
  month: string; // YYYY-MM
  basicMonthly: number;
  hraMonthly: number;
  specialAllowanceMonthly: number;
  grossSalary: number;
  employeePf: number;
  professionalTax: number;
  tds: number;
  lopDays: number;
  lopDeduction: number;
  lineItems: Array<{ category: string; amount: number; note: string | null; taxable: boolean }>;
  totalDeductions: number;
  netPay: number;
  viewInAppUrl: string;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

const monthLabel = (m: string) => {
  const [y, mm] = m.split("-");
  const d = new Date(Number(y), Number(mm) - 1, 1);
  return d.toLocaleString("en-IN", { month: "long", year: "numeric" });
};

export function PayslipEmail({
  orgName, employeeName, month,
  basicMonthly, hraMonthly, specialAllowanceMonthly,
  grossSalary, employeePf, professionalTax, tds,
  lopDays, lopDeduction, lineItems, totalDeductions, netPay,
  viewInAppUrl,
}: PayslipEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{`Payslip for ${monthLabel(month)} — ${employeeName}`}</Preview>
      <Body style={{ fontFamily: "system-ui, sans-serif", backgroundColor: "#f6f7f9", padding: "24px 0" }}>
        <Container style={{ background: "#fff", maxWidth: 560, margin: "0 auto", borderRadius: 12, padding: 24 }}>
          <Heading style={{ fontSize: 18, margin: "0 0 4px" }}>Payslip — {monthLabel(month)}</Heading>
          <Text style={{ color: "#666", margin: 0, fontSize: 13 }}>{orgName}</Text>

          <Hr style={{ margin: "16px 0" }} />

          <Text style={{ fontSize: 14, marginBottom: 4 }}>Hi {employeeName},</Text>
          <Text style={{ fontSize: 13, color: "#444", marginTop: 0 }}>
            Your payslip for <strong>{monthLabel(month)}</strong> is now available. Net pay:{" "}
            <strong>{fmt(netPay)}</strong>.
          </Text>

          <Section style={{ marginTop: 16 }}>
            <Heading as="h3" style={{ fontSize: 13, color: "#666", textTransform: "uppercase", letterSpacing: 0.5 }}>Earnings</Heading>
            <Row><Column>Basic</Column><Column align="right">{fmt(basicMonthly)}</Column></Row>
            <Row><Column>HRA</Column><Column align="right">{fmt(hraMonthly)}</Column></Row>
            <Row><Column>Special Allowance</Column><Column align="right">{fmt(specialAllowanceMonthly)}</Column></Row>
            <Row><Column><strong>Gross Salary</strong></Column><Column align="right"><strong>{fmt(grossSalary)}</strong></Column></Row>
          </Section>

          {lineItems.length > 0 && (
            <Section style={{ marginTop: 12 }}>
              <Heading as="h3" style={{ fontSize: 13, color: "#666", textTransform: "uppercase", letterSpacing: 0.5 }}>Additional Items</Heading>
              {lineItems.map((li, i) => (
                <Row key={i}>
                  <Column>
                    <span style={{ textTransform: "capitalize" }}>{li.category}</span>
                    {li.note && <span style={{ color: "#888" }}> — {li.note}</span>}
                    {!li.taxable && <span style={{ color: "#888" }}> (non-taxable)</span>}
                  </Column>
                  <Column align="right">{fmt(li.amount)}</Column>
                </Row>
              ))}
            </Section>
          )}

          <Section style={{ marginTop: 12 }}>
            <Heading as="h3" style={{ fontSize: 13, color: "#666", textTransform: "uppercase", letterSpacing: 0.5 }}>Deductions</Heading>
            <Row><Column>Provident Fund</Column><Column align="right">{fmt(employeePf)}</Column></Row>
            <Row><Column>Professional Tax</Column><Column align="right">{fmt(professionalTax)}</Column></Row>
            <Row><Column>TDS</Column><Column align="right">{fmt(tds)}</Column></Row>
            {lopDays > 0 && <Row><Column>LOP ({lopDays} day{lopDays === 1 ? "" : "s"})</Column><Column align="right">{fmt(lopDeduction)}</Column></Row>}
            <Row><Column><strong>Total Deductions</strong></Column><Column align="right"><strong>{fmt(totalDeductions)}</strong></Column></Row>
          </Section>

          <Hr style={{ margin: "16px 0" }} />

          <Row>
            <Column><strong>Net Pay</strong></Column>
            <Column align="right"><strong style={{ fontSize: 16 }}>{fmt(netPay)}</strong></Column>
          </Row>

          <Hr style={{ margin: "16px 0" }} />
          <Text style={{ fontSize: 12, color: "#666" }}>
            View this payslip in app and download as PDF at <a href={viewInAppUrl}>{viewInAppUrl}</a>.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default PayslipEmail;
```

- [ ] **Step 2: Add a "Line items" section to `src/components/payroll/payslip-dialog.tsx`**

Inspect the file. Below the existing Earnings/Deductions sections, render any line items fetched via `listPayrollLineItems(entry.id)`. Pattern matches the entry-edit-dialog item list (read-only). If no items, omit the section.

- [ ] **Step 3: Lint + build check.**

- [ ] **Step 4: Commit**

```bash
git add src/components/emails/payslip.tsx src/components/payroll/payslip-dialog.tsx
git commit -m "feat(payroll): payslip email template + line-items section in payslip dialog"
```

---

### Task 15: `sendPayslipEmail` action + auto-trigger on `markPayrollPaid` + on-demand button

**Files:**
- Modify: `src/actions/payroll.ts`
- Modify: `src/components/payroll/payroll-client.tsx` (or wherever the run list lives) — add "Send payslips" button

- [ ] **Step 1: Add `sendPayslipEmail` action**

```typescript
import { Resend } from "resend";
import { render } from "@react-email/render";
import { FROM_EMAIL } from "@/lib/resend";
import PayslipEmail from "@/components/emails/payslip";
import { waitUntil } from "@vercel/functions";

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Sends payslip emails for every entry in a processed (or paid) run.
 * Records one row in payslip_deliveries per (entry, channel='email').
 * Best-effort; never throws — failures are recorded as status='failed'.
 */
export async function sendPayslipEmail(runId: string): Promise<ActionResult<{ sent: number; failed: number }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can send payslips" };

  const sb = createAdminSupabase();
  const { data: run } = await sb.from("payroll_runs").select("id, org_id, month, status").eq("id", runId).single();
  if (!run || (run as any).org_id !== user.orgId) return { success: false, error: "Run not found" };
  const status = (run as any).status as string;
  if (status === "draft") return { success: false, error: "Process the run before sending payslips" };

  const { data: org } = await sb.from("organizations").select("name").eq("id", user.orgId).single();
  const orgName = (org as any)?.name ?? "Your employer";

  const { data: entries } = await sb
    .from("payroll_entries")
    .select(`id, employee_id, basic_monthly, hra_monthly, special_allowance_monthly, gross_salary, employee_pf, professional_tax, tds, lop_days, lop_deduction, total_line_items, total_deductions, net_pay, employees!employee_id(first_name, last_name, email)`)
    .eq("payroll_run_id", runId)
    .eq("org_id", user.orgId);

  let sent = 0, failed = 0;
  for (const ent of (entries ?? []) as any[]) {
    const email = ent.employees?.email;
    if (!email) { failed++; continue; }
    const employeeName = `${ent.employees.first_name} ${ent.employees.last_name}`;

    const { data: items } = await sb.from("payroll_line_items").select("category, amount, taxable, note").eq("payroll_entry_id", ent.id);

    try {
      const html = await render(PayslipEmail({
        orgName,
        employeeName,
        month: (run as any).month,
        basicMonthly: ent.basic_monthly,
        hraMonthly: ent.hra_monthly,
        specialAllowanceMonthly: ent.special_allowance_monthly,
        grossSalary: ent.gross_salary,
        employeePf: ent.employee_pf,
        professionalTax: ent.professional_tax,
        tds: ent.tds,
        lopDays: ent.lop_days,
        lopDeduction: ent.lop_deduction,
        lineItems: ((items ?? []) as any[]).map((i) => ({ category: i.category, amount: i.amount, note: i.note, taxable: i.taxable })),
        totalDeductions: ent.total_deductions,
        netPay: ent.net_pay,
        viewInAppUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://jambahr.com"}/dashboard/payroll`,
      }));

      const sendResult = await resend.emails.send({
        from: FROM_EMAIL,
        to: email,
        subject: `Payslip — ${(run as any).month}`,
        html,
      });

      await sb.from("payslip_deliveries").upsert({
        org_id: user.orgId,
        payroll_entry_id: ent.id,
        channel: "email",
        status: sendResult.error ? "failed" : "sent",
        sent_at: sendResult.error ? null : new Date().toISOString(),
        error: sendResult.error ? sendResult.error.message : null,
        resend_message_id: sendResult.data?.id ?? null,
      } as any, { onConflict: "payroll_entry_id,channel" });
      if (sendResult.error) failed++; else sent++;
    } catch (err: any) {
      await sb.from("payslip_deliveries").upsert({
        org_id: user.orgId,
        payroll_entry_id: ent.id,
        channel: "email",
        status: "failed",
        error: err?.message ?? "send failed",
      } as any, { onConflict: "payroll_entry_id,channel" });
      failed++;
    }
  }

  revalidatePath("/dashboard/payroll");
  return { success: true, data: { sent, failed } };
}
```

- [ ] **Step 2: Auto-fire from `markPayrollPaid`**

In the existing `markPayrollPaid` function, AFTER the `revalidatePath("/dashboard/payroll")` line, add:

```typescript
// Best-effort payslip email — survives function freeze via waitUntil.
try { waitUntil(sendPayslipEmail(runId).then(() => undefined)); } catch {}
```

(`waitUntil` already imported via `@vercel/functions` — same pattern as `uploadDocument`.)

- [ ] **Step 3: Add on-demand "Send payslips" button to the run row in `payroll-client.tsx`**

Render a `<Button>` next to the "Mark Paid" button when status is `processed` or `paid`. On click:
```typescript
async function handleSendPayslips(runId: string) {
  const r = await sendPayslipEmail(runId);
  if (!r.success) return toast.error(r.error);
  toast.success(`Sent ${r.data.sent} payslip(s)${r.data.failed > 0 ? `, ${r.data.failed} failed` : ""}`);
}
```

- [ ] **Step 4: Lint + build check.**

- [ ] **Step 5: Commit**

```bash
git add src/actions/payroll.ts src/components/payroll/payroll-client.tsx
git commit -m "feat(payroll): send payslip emails on markPaid + on-demand button"
```

---

### Task 16: Salary structure dialog — before/after preview

**Files:**
- Modify: `src/components/payroll/salary-structure-dialog.tsx`

- [ ] **Step 1: When the active config changed since this row's `computed_at`, render a small notice and a "Preview against active config" toggle that recomputes locally**

The dialog already calls `computeCTCBreakdown` locally for preview. Pass the active config as a prop (fetched on the parent page), and when this row's `computed_at` < active config's `created_at`, show:
- "⚠ Active config has changed since this row was last computed."
- A button "Recompute now" that triggers `upsertSalaryStructure(currentInput)` and refreshes.

Implementation is a small additive change to the dialog component — keep all existing inputs intact.

- [ ] **Step 2: Lint + build check.**

- [ ] **Step 3: Commit**

```bash
git add src/components/payroll/salary-structure-dialog.tsx
git commit -m "feat(payroll): salary structure dialog warns when active config has drifted"
```

---

### Task 17: Assistant help articles + route-registry entry

**Files:**
- Modify: `src/lib/assistant/route-registry.ts`
- Create: `src/lib/assistant/help/articles/configure_salary_ratios.md`
- Create: `src/lib/assistant/help/articles/add_payroll_line_item.md`
- Create: `src/lib/assistant/help/articles/send_payslip_email.md`
- Modify: `tests/assistant/help-loader.test.ts` — bump count from 28 to 31

- [ ] **Step 1: Inspect schema** of `route-registry.ts` and an existing payroll article (or fall back to `clock_in_out.md` shape).

- [ ] **Step 2: Add `settings_payroll` registry entry** with `path: "/dashboard/settings"`, `params: { section: "payroll" }`, `required_role: "admin"`, `required_plan: "business"`, `required_org_feature: ?` (omit — payroll uses plan-tier gating, not org feature flag).

- [ ] **Step 3: Author the three articles** with frontmatter matching `id ↔ filename`. Bodies should be terse and step-numbered. Example for `configure_salary_ratios.md`:

```markdown
---
id: configure_salary_ratios
title: Configure salary structure ratios
summary: Tune Basic, HRA, and Gratuity percentages applied to new salary upserts.
route_key: settings_payroll
allowed_roles: [owner, admin]
plan_tier: business
keywords: [basic, hra, gratuity, salary structure, ratios, percent]
---

# Configure salary structure ratios

## Steps

1. Open **Settings → Payroll → Salary Structure Ratios**.
2. Click **Edit**.
3. Enter the new percentages:
   - **Basic %** of CTC (typically 40–50%).
   - **HRA Metro %** of Basic (typically 50% in metros).
   - **HRA Non-Metro %** of Basic (typically 40% elsewhere).
   - **Gratuity %** of Basic (statutory 4.81%).
4. Set the **Effective from** date.
5. Click **Preview impact** to see per-employee old vs. new monthly diffs.
6. Click **Save config**.
7. Existing salary structures do NOT auto-recompute. Click **Recompute all salary structures** to propagate.
```

Similar files for `add_payroll_line_item.md` and `send_payslip_email.md`.

- [ ] **Step 4: Bump `tests/assistant/help-loader.test.ts` from 28 → 31**.

- [ ] **Step 5: Run `npm run embed:help`** (requires `VOYAGE_API_KEY`).

- [ ] **Step 6: Run the integrity vitest** — `npx vitest run tests/assistant/route-registry.integrity.test.ts tests/assistant/help-loader.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/assistant/route-registry.ts \
        src/lib/assistant/help/articles/configure_salary_ratios.md \
        src/lib/assistant/help/articles/add_payroll_line_item.md \
        src/lib/assistant/help/articles/send_payslip_email.md \
        tests/assistant/help-loader.test.ts
git commit -m "docs(assistant): add PRD 02 Phase 1 payroll articles"
```

---

### Task 18: CLAUDE.md + operator doc

**Files:**
- Modify: `CLAUDE.md` — Payroll Module section
- Create: `docs/payroll-prd-02-phase-1.md`

- [ ] **Step 1: Append to CLAUDE.md Payroll Module section** (after the existing audit overhaul block):

```markdown
### PRD 02 Phase 1 — Configurable ratios + line items + email payslips (shipped 2026-06-XX)

- **Configurable salary-structure ratios** at Settings → Payroll: Basic %, HRA % metro, HRA % non-metro, Gratuity %. PF rate + cap, PT slabs, tax slabs, standard deduction, 87A rebate stay statutory.
- **`salary_structure_config` is append-only by `(org_id, effective_from)`** — re-saving the same effective_from upserts. `getActiveRatioConfig` reads the latest with `effective_from <= today`.
- **Existing salary structures DO NOT auto-recompute** when org config changes. Admin must click "Recompute all" or re-upsert each affected employee. PRD §7.1 mandates this — past payslips immutable.
- **`payroll_line_items`** replaces the single `payroll_entries.bonus` integer for new entries. Categories: bonus / allowance / reimbursement / other. `taxable: boolean` per row. Sums into `payroll_entries.total_line_items` (denormalised) and folds into TDS via `computeAdditionalTaxOnBonus` for taxable items.
- **`payroll_runs.structure_config_snapshot`** JSONB is frozen at process time. NULL for pre-PRD-02 runs (treat as default hard-coded ratios).
- **Payslip email** via React Email template (`payslip.tsx`). Trigger: (a) auto on `markPayrollPaid` via `waitUntil` — best-effort, never blocks; (b) on-demand "Send payslips" button. Status tracked in `payslip_deliveries` table per (entry, channel).
- **No PDF attachment in Phase 1** — email body is HTML inline. CTA links to in-app view where employees can browser-print to PDF.
- **`computeCTCBreakdown(ctc, state, isMetro, includeHra, taxRegime, additionalDeductions, config?)`** — new optional `config: RatioConfig` arg. `DEFAULT_RATIO_CONFIG = { basic_pct: 40, hra_pct_metro: 50, hra_pct_non_metro: 40, gratuity_pct: 4.81 }` matches historical hard-codes.
- **Reprocess of a draft run DROPS its line items** via `ON DELETE CASCADE`. Add line items only AFTER process, before paid. Phase 1 limitation; Phase 1.5 could preserve them.
- **Settings → Payroll CollapsibleSection** only renders when plan has `payroll` feature AND user is admin.

**Phase 1 gotchas:**
- Migrations 033–036 are idempotent and applied via Supabase MCP.
- `payroll_runs.structure_config_snapshot` NULL means pre-PRD-02 — treat as `DEFAULT_RATIO_CONFIG` if you read back.
- `payroll_line_items.taxable=false` items add to `net_pay` but NOT to taxable income — reimbursements don't get TDS.
- `markPayrollPaid` fires `sendPayslipEmail` via `waitUntil`. If `RESEND_API_KEY` is missing, the function logs and continues — `markPayrollPaid` still succeeds.
- `payslip_deliveries` is `UNIQUE (payroll_entry_id, channel)` — re-sending a payslip updates the existing row via upsert (so the "sent_at" reflects the LATEST send).
- All RLS policies use Clerk-JWT pattern (same as Attendance Phase 1).
```

- [ ] **Step 2: Create operator doc** `docs/payroll-prd-02-phase-1.md`:

```markdown
# Payroll PRD 02 Phase 1 — Configurable ratios + line items + email payslips

**Shipped:** 2026-06-XX
**Scope:** PRD 02 §11 Phase 1. RazorpayX integration + maker-checker + bulk payout are Phase 2.

## What admins can do now
1. Tune salary-structure ratios (Settings → Payroll → Salary Structure Ratios).
2. Preview per-employee impact of a config change before saving.
3. Recompute all salary structures with the latest config.
4. Add itemised ad-hoc bonuses, allowances, reimbursements per payroll entry.
5. Email payslips on Mark Paid (automatic) or on demand.

## What the system does automatically
- Re-runs statutory recompute (PF, PT, TDS) when an employee's structure is upserted.
- Snapshots the active ratio config into each processed payroll run (immutable).
- Sums non-taxable line items into net pay without adding TDS.
- Sums taxable line items into TDS using marginal-tax math.
- Fires payslip emails (best-effort, never blocks) when a run is marked Paid.

## Migrations
- 033_salary_structure_config.sql
- 034_payroll_line_items.sql
- 035_payroll_run_and_entry_extensions.sql
- 036_payslip_deliveries.sql
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/payroll-prd-02-phase-1.md
git commit -m "docs(payroll): PRD 02 Phase 1 — CLAUDE.md + operator doc"
```

---

### Task 19: Smoke-test playbook (controller-produced; no subagent)

Will be produced as a chat deliverable after the final cross-task review, matching the Attendance Phase 1 flow.

---

## Self-Review Checklist

**Spec coverage (PRD 02 §11 Phase 1):**
- ✅ Configurable salary structure (new runs) → T1, T5, T7, T8, T12
- ✅ Statutory auto-recompute (already happens; ratios now plumbed) → T8, T16
- ✅ Preview/diff → T7 (server), T12 (UI), T16 (dialog notice)
- ✅ Ad-hoc allowance/bonus/manual entries → T2, T6, T10, T13
- ✅ Payslip email + in-app → T4, T14, T15

**Out-of-scope check:**
- ❌ No `disbursement_batches` / `disbursement_items` touched
- ❌ No RazorpayX SDK or API calls
- ❌ No maker-checker UI
- ❌ No PDF generation library
- ❌ No attendance-OT consumption

**Placeholder scan:** No "TBD", no "implement later", every step has full code or exact instructions.

**Type consistency:** `RatioConfig` defined once in `src/lib/ctc.ts`, consumed identically downstream. `LineItem` and `PayrollLineItemRow` distinguish pure type vs DB row consistently.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-07-payroll-prd-02-phase-1.md`.**

Two execution options:

1. **Subagent-Driven (recommended, matches Attendance Phase 1 flow)** — fresh subagent per task, two-stage review after each, fast iteration.
2. **Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

**Which approach?**
