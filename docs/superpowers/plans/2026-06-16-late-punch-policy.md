# Late-Punch Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an optional, per-org "Late Policy" that flags employees bonus-ineligible when they punch in late more than a configurable number of days per calendar month, blocks bonus payroll line items for them, and notifies them by WhatsApp + email.

**Architecture:** Lateness is computed at clock-in from the existing `shifts.start_time + grace_minutes` (fallback cutoff for shiftless employees). A monthly count drives an upserted `late_policy_flags` row that `addPayrollLineItem` reads to block bonuses (admin override available). Notifications go through a per-org WhatsApp provider adapter (centralized / AiSensy / WATI in v1, Omni later) with email-only fallback, dispatched non-blocking via `waitUntil`. The whole feature is dark until `late_policies.enabled = true`.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (Postgres + RLS), Clerk, Resend + React Email, Vitest, AES-256-GCM (existing `src/lib/crypto/aes-gcm.ts`).

**Spec:** `docs/superpowers/specs/2026-06-16-late-punch-policy-design.md`

---

## File Structure

**New libs (pure, unit-tested):**
- `src/lib/attendance/lateness.ts` — `computeLateness()` boundary math
- `src/lib/attendance/late-policy-targets.ts` — `resolveCoveredEmployeeIds()` dept ∪ employee
- `src/lib/attendance/late-policy-notify.ts` — `planNotificationKinds()` which alerts to send
- `src/lib/whatsapp/types.ts` — `WhatsAppProvider` interface + template keys
- `src/lib/whatsapp/index.ts` — provider registry / `resolveProvider()`
- `src/lib/whatsapp/adapters/{centralized,aisensy,wati}.ts` — concrete adapters

**New server actions:**
- `src/actions/late-policy.ts` — policy + targets CRUD, flags, override
- `src/actions/whatsapp-credentials.ts` — per-org provider config + test send

**New emails:**
- `src/components/emails/late-punch-alert.tsx`
- `src/components/emails/bonus-ineligible-alert.tsx`

**New cron:**
- `src/app/api/cron/late-policy-reconcile/route.ts`

**New UI:**
- `src/components/settings/late-policy-card.tsx`
- `src/components/settings/late-policy-targets-select.tsx`
- `src/components/settings/whatsapp-provider-card.tsx`
- `src/components/payroll/bonus-ineligible-badge.tsx` (+ override dialog)
- Profile WhatsApp opt-in toggle (existing profile component)

**Modified:**
- `src/actions/attendance.ts` — `clockIn` hook (lateness + flag + notify)
- `src/actions/payroll.ts` — `addPayrollLineItem` bonus block
- `src/components/settings/attendance-section.tsx` — mount new cards
- `vercel.json` — register cron
- `supabase/migrations/061..065` — schema

**Migrations:** next free numbers are **061–065**.

---

## Task 1: Migrations — schema foundation

**Files:**
- Create: `supabase/migrations/061_late_policies.sql`
- Create: `supabase/migrations/062_late_policy_flags.sql`
- Create: `supabase/migrations/063_late_punch_notifications.sql`
- Create: `supabase/migrations/064_org_whatsapp_credentials.sql`
- Create: `supabase/migrations/065_attendance_late_columns.sql`

- [ ] **Step 1: Write `061_late_policies.sql`**

```sql
-- 061_late_policies.sql — Late-punch policy + targeting (idempotent)
CREATE TABLE IF NOT EXISTS public.late_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  name text NOT NULL DEFAULT 'Late Policy',
  threshold_days integer NOT NULL DEFAULT 3 CHECK (threshold_days >= 1 AND threshold_days <= 31),
  period text NOT NULL DEFAULT 'calendar_month' CHECK (period IN ('calendar_month')),
  late_definition text NOT NULL DEFAULT 'shift_grace' CHECK (late_definition IN ('shift_grace')),
  fallback_cutoff_time time NULL,
  notify_on_late boolean NOT NULL DEFAULT true,
  notify_on_threshold boolean NOT NULL DEFAULT true,
  warn_at integer NULL CHECK (warn_at IS NULL OR (warn_at >= 1 AND warn_at <= 31)),
  channel_whatsapp boolean NOT NULL DEFAULT false,
  channel_email boolean NOT NULL DEFAULT true,
  consequence text NOT NULL DEFAULT 'block_bonus' CHECK (consequence IN ('block_bonus')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_late_policies_org ON public.late_policies (org_id);

CREATE TABLE IF NOT EXISTS public.late_policy_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  policy_id uuid NOT NULL REFERENCES public.late_policies(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('department','employee')),
  target_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_late_policy_targets_unique
  ON public.late_policy_targets (policy_id, target_type, target_id);

ALTER TABLE public.late_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.late_policy_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_late_policies_org ON public.late_policies;
CREATE POLICY p_late_policies_org ON public.late_policies FOR ALL
  USING (org_id::text = (auth.jwt() ->> 'org_id'))
  WITH CHECK (org_id::text = (auth.jwt() ->> 'org_id'));
DROP POLICY IF EXISTS p_late_policy_targets_org ON public.late_policy_targets;
CREATE POLICY p_late_policy_targets_org ON public.late_policy_targets FOR ALL
  USING (org_id::text = (auth.jwt() ->> 'org_id'))
  WITH CHECK (org_id::text = (auth.jwt() ->> 'org_id'));
```

- [ ] **Step 2: Write `062_late_policy_flags.sql`**

```sql
-- 062_late_policy_flags.sql — monthly bonus-ineligibility verdict (idempotent)
CREATE TABLE IF NOT EXISTS public.late_policy_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  policy_id uuid NOT NULL REFERENCES public.late_policies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  month text NOT NULL,                       -- YYYY-MM (IST)
  late_days_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'flagged' CHECK (status IN ('flagged','overridden')),
  override_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  override_reason text NULL,
  overridden_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_late_policy_flags_unique
  ON public.late_policy_flags (org_id, employee_id, month);

ALTER TABLE public.late_policy_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_late_policy_flags_org ON public.late_policy_flags;
CREATE POLICY p_late_policy_flags_org ON public.late_policy_flags FOR ALL
  USING (org_id::text = (auth.jwt() ->> 'org_id'))
  WITH CHECK (org_id::text = (auth.jwt() ->> 'org_id'));
```

- [ ] **Step 3: Write `063_late_punch_notifications.sql`**

```sql
-- 063_late_punch_notifications.sql — idempotent delivery log (idempotent)
CREATE TABLE IF NOT EXISTS public.late_punch_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  attendance_record_id uuid NOT NULL REFERENCES public.attendance_records(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('late','threshold','warn')),
  channel text NOT NULL CHECK (channel IN ('whatsapp','email')),
  status text NOT NULL CHECK (status IN ('sent','failed','skipped')),
  provider text NULL,
  provider_message_id text NULL,
  error text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_late_punch_notifications_unique
  ON public.late_punch_notifications (attendance_record_id, kind, channel);

ALTER TABLE public.late_punch_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_late_punch_notifications_org ON public.late_punch_notifications;
CREATE POLICY p_late_punch_notifications_org ON public.late_punch_notifications FOR ALL
  USING (org_id::text = (auth.jwt() ->> 'org_id'))
  WITH CHECK (org_id::text = (auth.jwt() ->> 'org_id'));
```

- [ ] **Step 4: Write `064_org_whatsapp_credentials.sql`**

```sql
-- 064_org_whatsapp_credentials.sql — per-org BYO WhatsApp provider (idempotent)
CREATE TABLE IF NOT EXISTS public.org_whatsapp_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('omni','aisensy','wati','meta','centralized')),
  api_key_encrypted text NULL,
  endpoint text NULL,
  extra_encrypted jsonb NULL,
  template_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_whatsapp_credentials_org
  ON public.org_whatsapp_credentials (org_id);

ALTER TABLE public.org_whatsapp_credentials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_org_whatsapp_credentials_org ON public.org_whatsapp_credentials;
CREATE POLICY p_org_whatsapp_credentials_org ON public.org_whatsapp_credentials FOR ALL
  USING (org_id::text = (auth.jwt() ->> 'org_id'))
  WITH CHECK (org_id::text = (auth.jwt() ->> 'org_id'));
```

- [ ] **Step 5: Write `065_attendance_late_columns.sql`**

```sql
-- 065_attendance_late_columns.sql — lateness + opt-in columns (idempotent)
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS is_late boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS late_minutes integer NULL,
  ADD COLUMN IF NOT EXISTS late_policy_id uuid NULL REFERENCES public.late_policies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_records_late
  ON public.attendance_records (org_id, employee_id, is_late) WHERE is_late = true;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_at timestamptz NULL;
```

- [ ] **Step 6: Apply the 5 migrations**

Apply via Supabase MCP `apply_migration` (or SQL Editor — Windows gotcha #4), in order 061→065. Each is idempotent.

- [ ] **Step 7: Verify columns exist**

Run via MCP `execute_sql`:
```sql
select column_name from information_schema.columns
where table_name='attendance_records' and column_name in ('is_late','late_minutes','late_policy_id');
select to_regclass('public.late_policies'), to_regclass('public.late_policy_flags'),
       to_regclass('public.late_punch_notifications'), to_regclass('public.org_whatsapp_credentials');
```
Expected: 3 attendance columns + 4 non-null regclasses.

- [ ] **Step 8: Regenerate DB types**

```bash
npx supabase gen types typescript --project-id imjwqktxzahhnfmfbtfc > src/types/database.types.ts
```
(If CLI unavailable on Windows, hand-add the new tables/columns to `src/types/database.types.ts` mirroring existing table entries. Build tolerates `never` inference via gotcha #3.)

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/061_late_policies.sql supabase/migrations/062_late_policy_flags.sql supabase/migrations/063_late_punch_notifications.sql supabase/migrations/064_org_whatsapp_credentials.sql supabase/migrations/065_attendance_late_columns.sql src/types/database.types.ts
git commit -m "feat(attendance): late-policy schema (migrations 061-065)"
```

---

## Task 2: `computeLateness()` — boundary math (TDD)

**Files:**
- Create: `src/lib/attendance/lateness.ts`
- Test: `tests/attendance/lateness.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { computeLateness } from "@/lib/attendance/lateness";

// Helper: build a UTC ISO string for a given IST wall-clock time on 2026-06-16.
function istToUtcIso(hh: number, mm: number): string {
  // IST = UTC + 5:30 → subtract 5.5h to get UTC.
  const ms = Date.UTC(2026, 5, 16, hh, mm, 0) - 5.5 * 3600 * 1000;
  return new Date(ms).toISOString();
}

describe("computeLateness", () => {
  it("flags late when clock-in is after start + grace", () => {
    const r = computeLateness({
      clockInAtUtc: istToUtcIso(9, 25), // 09:25 IST
      shift: { start_time: "09:00", grace_minutes: 10, is_overnight: false },
      fallbackCutoff: null,
    });
    expect(r.evaluated).toBe(true);
    expect(r.isLate).toBe(true);
    expect(r.lateMinutes).toBe(15); // 09:25 - 09:10 boundary
  });

  it("is on-time within grace", () => {
    const r = computeLateness({
      clockInAtUtc: istToUtcIso(9, 8),
      shift: { start_time: "09:00", grace_minutes: 10, is_overnight: false },
      fallbackCutoff: null,
    });
    expect(r.isLate).toBe(false);
    expect(r.lateMinutes).toBe(0);
  });

  it("uses fallback cutoff when no shift", () => {
    const r = computeLateness({
      clockInAtUtc: istToUtcIso(9, 45),
      shift: null,
      fallbackCutoff: "09:30",
    });
    expect(r.evaluated).toBe(true);
    expect(r.isLate).toBe(true);
    expect(r.lateMinutes).toBe(15);
  });

  it("does not evaluate when no shift and no fallback", () => {
    const r = computeLateness({ clockInAtUtc: istToUtcIso(9, 45), shift: null, fallbackCutoff: null });
    expect(r.evaluated).toBe(false);
    expect(r.isLate).toBe(false);
  });

  it("skips overnight shifts in v1 (not evaluated)", () => {
    const r = computeLateness({
      clockInAtUtc: istToUtcIso(22, 30),
      shift: { start_time: "22:00", grace_minutes: 10, is_overnight: true },
      fallbackCutoff: null,
    });
    expect(r.evaluated).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/attendance/lateness.test.ts`
Expected: FAIL — `computeLateness` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
import { parseHHMM } from "@/lib/attendance/shift-time";

export type LatenessShift = {
  start_time: string;
  grace_minutes: number;
  is_overnight: boolean;
} | null;

export type LatenessResult = { evaluated: boolean; isLate: boolean; lateMinutes: number };

/** IST minutes-past-midnight for a UTC ISO timestamp. */
function istMinutesPastMidnight(clockInAtUtc: string): number {
  const istMs = new Date(clockInAtUtc).getTime() + 5.5 * 3600 * 1000;
  const d = new Date(istMs);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/**
 * Determine whether a clock-in is "late".
 * v1: overnight shifts are NOT evaluated (boundary wrap is a Phase-2 concern).
 */
export function computeLateness(params: {
  clockInAtUtc: string;
  shift: LatenessShift;
  fallbackCutoff: string | null; // "HH:MM" or "HH:MM:SS"
}): LatenessResult {
  const { clockInAtUtc, shift, fallbackCutoff } = params;

  let boundaryMin: number | null = null;
  if (shift) {
    if (shift.is_overnight) return { evaluated: false, isLate: false, lateMinutes: 0 };
    boundaryMin = parseHHMM(shift.start_time) + (shift.grace_minutes ?? 0);
  } else if (fallbackCutoff) {
    boundaryMin = parseHHMM(fallbackCutoff);
  }

  if (boundaryMin === null) return { evaluated: false, isLate: false, lateMinutes: 0 };

  const nowMin = istMinutesPastMidnight(clockInAtUtc);
  const diff = nowMin - boundaryMin;
  return { evaluated: true, isLate: diff > 0, lateMinutes: diff > 0 ? diff : 0 };
}
```

(Note: `parseHHMM("09:30")` and `parseHHMM("09:30:00")` both work — it splits on `:` and reads HH/MM.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/attendance/lateness.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendance/lateness.ts tests/attendance/lateness.test.ts
git commit -m "feat(attendance): computeLateness boundary helper"
```

---

## Task 3: `resolveCoveredEmployeeIds()` — target resolution (TDD)

**Files:**
- Create: `src/lib/attendance/late-policy-targets.ts`
- Test: `tests/attendance/late-policy-targets.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { resolveCoveredEmployeeIds } from "@/lib/attendance/late-policy-targets";

const employees = [
  { id: "e1", department_id: "d1" },
  { id: "e2", department_id: "d1" },
  { id: "e3", department_id: "d2" },
  { id: "e4", department_id: null },
];

describe("resolveCoveredEmployeeIds", () => {
  it("covers all employees in a targeted department", () => {
    const s = resolveCoveredEmployeeIds({
      targets: [{ target_type: "department", target_id: "d1" }],
      employees,
    });
    expect([...s].sort()).toEqual(["e1", "e2"]);
  });

  it("unions department + individual employee targets", () => {
    const s = resolveCoveredEmployeeIds({
      targets: [
        { target_type: "department", target_id: "d1" },
        { target_type: "employee", target_id: "e3" },
      ],
      employees,
    });
    expect([...s].sort()).toEqual(["e1", "e2", "e3"]);
  });

  it("returns empty set for empty targets", () => {
    expect(resolveCoveredEmployeeIds({ targets: [], employees }).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/attendance/late-policy-targets.test.ts`
Expected: FAIL — function not found.

- [ ] **Step 3: Write minimal implementation**

```ts
export type LatePolicyTarget = { target_type: "department" | "employee"; target_id: string };

export function resolveCoveredEmployeeIds(params: {
  targets: LatePolicyTarget[];
  employees: Array<{ id: string; department_id: string | null }>;
}): Set<string> {
  const { targets, employees } = params;
  const deptIds = new Set(targets.filter((t) => t.target_type === "department").map((t) => t.target_id));
  const empIds = new Set(targets.filter((t) => t.target_type === "employee").map((t) => t.target_id));
  const covered = new Set<string>();
  for (const e of employees) {
    if (empIds.has(e.id)) covered.add(e.id);
    else if (e.department_id && deptIds.has(e.department_id)) covered.add(e.id);
  }
  return covered;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/attendance/late-policy-targets.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendance/late-policy-targets.ts tests/attendance/late-policy-targets.test.ts
git commit -m "feat(attendance): resolveCoveredEmployeeIds target helper"
```

---

## Task 4: `planNotificationKinds()` — which alerts to send (TDD)

**Files:**
- Create: `src/lib/attendance/late-policy-notify.ts`
- Test: `tests/attendance/late-policy-notify.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { planNotificationKinds } from "@/lib/attendance/late-policy-notify";

const policy = {
  threshold_days: 3,
  warn_at: 2,
  notify_on_late: true,
  notify_on_threshold: true,
};

describe("planNotificationKinds", () => {
  it("returns ['late'] on a normal late punch below thresholds", () => {
    expect(planNotificationKinds({ policy, isLate: true, prevCount: 0, newCount: 1 })).toEqual(["late"]);
  });

  it("adds 'warn' when newCount hits warn_at", () => {
    expect(planNotificationKinds({ policy, isLate: true, prevCount: 1, newCount: 2 }).sort()).toEqual(
      ["late", "warn"],
    );
  });

  it("adds 'threshold' only on the crossing punch", () => {
    expect(planNotificationKinds({ policy, isLate: true, prevCount: 2, newCount: 3 }).sort()).toEqual(
      ["late", "threshold"],
    );
  });

  it("does not repeat 'threshold' after already crossed", () => {
    expect(planNotificationKinds({ policy, isLate: true, prevCount: 3, newCount: 4 })).toEqual(["late"]);
  });

  it("returns [] when not late", () => {
    expect(planNotificationKinds({ policy, isLate: false, prevCount: 0, newCount: 0 })).toEqual([]);
  });

  it("respects notify_on_late=false", () => {
    expect(
      planNotificationKinds({ policy: { ...policy, notify_on_late: false }, isLate: true, prevCount: 2, newCount: 3 }),
    ).toEqual(["threshold"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/attendance/late-policy-notify.test.ts`
Expected: FAIL — function not found.

- [ ] **Step 3: Write minimal implementation**

```ts
export type NotifyKind = "late" | "threshold" | "warn";

export function planNotificationKinds(params: {
  policy: { threshold_days: number; warn_at: number | null; notify_on_late: boolean; notify_on_threshold: boolean };
  isLate: boolean;
  prevCount: number; // late days this month BEFORE this punch
  newCount: number;  // late days this month INCLUDING this punch
}): NotifyKind[] {
  const { policy, isLate, prevCount, newCount } = params;
  if (!isLate) return [];
  const kinds: NotifyKind[] = [];
  if (policy.notify_on_late) kinds.push("late");
  if (policy.warn_at != null && prevCount < policy.warn_at && newCount >= policy.warn_at && newCount < policy.threshold_days) {
    kinds.push("warn");
  }
  if (policy.notify_on_threshold && prevCount < policy.threshold_days && newCount >= policy.threshold_days) {
    kinds.push("threshold");
  }
  return kinds;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/attendance/late-policy-notify.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendance/late-policy-notify.ts tests/attendance/late-policy-notify.test.ts
git commit -m "feat(attendance): planNotificationKinds helper"
```

---

## Task 5: WhatsApp provider interface + registry + adapters

**Files:**
- Create: `src/lib/whatsapp/types.ts`
- Create: `src/lib/whatsapp/adapters/centralized.ts`
- Create: `src/lib/whatsapp/adapters/aisensy.ts`
- Create: `src/lib/whatsapp/adapters/wati.ts`
- Create: `src/lib/whatsapp/index.ts`
- Test: `tests/whatsapp/registry.test.ts`

- [ ] **Step 1: Write `types.ts`**

```ts
export type WhatsAppTemplateKey = "late_punch_alert" | "bonus_ineligible_alert" | "late_warning";

export type SendTemplateInput = {
  to: string; // E.164 phone
  templateKey: WhatsAppTemplateKey;
  variables: Record<string, string>;
};

export type SendTemplateResult = { ok: boolean; providerMessageId?: string; error?: string };

export interface WhatsAppProvider {
  readonly name: string;
  sendTemplate(input: SendTemplateInput): Promise<SendTemplateResult>;
}

export type ProviderConfig = {
  provider: "omni" | "aisensy" | "wati" | "meta" | "centralized";
  apiKey: string | null;
  endpoint: string | null;
  templateMap: Record<string, string>; // internal key → provider template name/id
  active: boolean;
};
```

- [ ] **Step 2: Write `adapters/aisensy.ts`**

```ts
import type { ProviderConfig, SendTemplateInput, SendTemplateResult, WhatsAppProvider } from "../types";

export function aisensyAdapter(cfg: ProviderConfig): WhatsAppProvider {
  return {
    name: "aisensy",
    async sendTemplate(input: SendTemplateInput): Promise<SendTemplateResult> {
      if (!cfg.apiKey) return { ok: false, error: "AiSensy API key missing" };
      const templateName = cfg.templateMap[input.templateKey];
      if (!templateName) return { ok: false, error: `No template mapped for ${input.templateKey}` };
      try {
        const res = await fetch(cfg.endpoint ?? "https://backend.aisensy.com/campaign/t1/api/v2", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey: cfg.apiKey,
            campaignName: templateName,
            destination: input.to,
            templateParams: Object.values(input.variables),
          }),
        });
        if (!res.ok) return { ok: false, error: `AiSensy HTTP ${res.status}` };
        const json = (await res.json().catch(() => ({}))) as { messageId?: string };
        return { ok: true, providerMessageId: json.messageId };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "AiSensy send failed" };
      }
    },
  };
}
```

- [ ] **Step 3: Write `adapters/wati.ts`**

```ts
import type { ProviderConfig, SendTemplateInput, SendTemplateResult, WhatsAppProvider } from "../types";

export function watiAdapter(cfg: ProviderConfig): WhatsAppProvider {
  return {
    name: "wati",
    async sendTemplate(input: SendTemplateInput): Promise<SendTemplateResult> {
      if (!cfg.apiKey || !cfg.endpoint) return { ok: false, error: "WATI apiKey/endpoint missing" };
      const templateName = cfg.templateMap[input.templateKey];
      if (!templateName) return { ok: false, error: `No template mapped for ${input.templateKey}` };
      try {
        const url = `${cfg.endpoint.replace(/\/$/, "")}/api/v1/sendTemplateMessage?whatsappNumber=${encodeURIComponent(input.to)}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
          body: JSON.stringify({
            template_name: templateName,
            broadcast_name: templateName,
            parameters: Object.entries(input.variables).map(([name, value]) => ({ name, value })),
          }),
        });
        if (!res.ok) return { ok: false, error: `WATI HTTP ${res.status}` };
        const json = (await res.json().catch(() => ({}))) as { id?: string };
        return { ok: true, providerMessageId: json.id };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "WATI send failed" };
      }
    },
  };
}
```

- [ ] **Step 4: Write `adapters/centralized.ts`**

```ts
import type { ProviderConfig, WhatsAppProvider } from "../types";
import { aisensyAdapter } from "./aisensy";
import { watiAdapter } from "./wati";

/**
 * Centralized = JambaHR's own provider account, configured via env.
 * Reuses whichever underlying BSP is set in WHATSAPP_CENTRALIZED_PROVIDER.
 */
export function centralizedAdapter(): WhatsAppProvider {
  const cfg: ProviderConfig = {
    provider: "centralized",
    apiKey: process.env.WHATSAPP_CENTRALIZED_API_KEY ?? null,
    endpoint: process.env.WHATSAPP_CENTRALIZED_ENDPOINT ?? null,
    templateMap: {
      late_punch_alert: process.env.WHATSAPP_CENTRALIZED_TPL_LATE ?? "late_punch_alert",
      bonus_ineligible_alert: process.env.WHATSAPP_CENTRALIZED_TPL_INELIGIBLE ?? "bonus_ineligible_alert",
      late_warning: process.env.WHATSAPP_CENTRALIZED_TPL_WARN ?? "late_warning",
    },
    active: true,
  };
  const kind = (process.env.WHATSAPP_CENTRALIZED_PROVIDER ?? "aisensy").toLowerCase();
  return kind === "wati" ? watiAdapter(cfg) : aisensyAdapter(cfg);
}
```

- [ ] **Step 5: Write `index.ts`**

```ts
import type { ProviderConfig, WhatsAppProvider } from "./types";
import { aisensyAdapter } from "./adapters/aisensy";
import { watiAdapter } from "./adapters/wati";
import { centralizedAdapter } from "./adapters/centralized";

export * from "./types";

/** Resolve a provider from a per-org config. Returns null when no usable provider. */
export function resolveProvider(cfg: ProviderConfig | null): WhatsAppProvider | null {
  if (!cfg || !cfg.active) return null;
  switch (cfg.provider) {
    case "aisensy":
      return aisensyAdapter(cfg);
    case "wati":
      return watiAdapter(cfg);
    case "centralized":
      return centralizedAdapter();
    case "omni": // Follow-up: Omni adapter once its API is confirmed.
    case "meta": // Not in v1.
    default:
      return null;
  }
}
```

- [ ] **Step 6: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { resolveProvider } from "@/lib/whatsapp";

describe("resolveProvider", () => {
  it("returns null for inactive config", () => {
    expect(resolveProvider({ provider: "aisensy", apiKey: "k", endpoint: null, templateMap: {}, active: false })).toBeNull();
  });
  it("returns null for omni (not in v1)", () => {
    expect(resolveProvider({ provider: "omni", apiKey: "k", endpoint: null, templateMap: {}, active: true })).toBeNull();
  });
  it("returns an aisensy provider when active", () => {
    const p = resolveProvider({ provider: "aisensy", apiKey: "k", endpoint: null, templateMap: {}, active: true });
    expect(p?.name).toBe("aisensy");
  });
});
```

- [ ] **Step 7: Run tests**

Run: `npx vitest run tests/whatsapp/registry.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
git add src/lib/whatsapp tests/whatsapp/registry.test.ts
git commit -m "feat(whatsapp): provider interface, registry, aisensy/wati/centralized adapters"
```

---

## Task 6: Email templates for late alerts

**Files:**
- Create: `src/components/emails/late-punch-alert.tsx`
- Create: `src/components/emails/bonus-ineligible-alert.tsx`

- [ ] **Step 1: Write `late-punch-alert.tsx`** (mirror existing template structure, e.g. `doc-reminder.tsx`)

```tsx
import { Body, Container, Head, Heading, Html, Preview, Section, Text } from "@react-email/components";

export type LatePunchAlertProps = {
  employeeName: string;
  orgName: string;
  clockInTime: string; // formatted IST
  lateMinutes: number;
  lateDaysThisMonth: number;
  thresholdDays: number;
};

export function LatePunchAlert({
  employeeName,
  orgName,
  clockInTime,
  lateMinutes,
  lateDaysThisMonth,
  thresholdDays,
}: LatePunchAlertProps) {
  return (
    <Html>
      <Head />
      <Preview>Late punch-in recorded — {clockInTime}</Preview>
      <Body style={{ fontFamily: "Arial, sans-serif", background: "#f6f9fc" }}>
        <Container style={{ background: "#fff", padding: 24, borderRadius: 8, maxWidth: 480 }}>
          <Heading style={{ fontSize: 18 }}>Late punch-in recorded</Heading>
          <Section>
            <Text>Hi {employeeName},</Text>
            <Text>
              Your clock-in at <strong>{clockInTime}</strong> was {lateMinutes} minute(s) late.
            </Text>
            <Text>
              This is late day <strong>{lateDaysThisMonth}</strong> of {thresholdDays} allowed this
              month at {orgName}. Reaching {thresholdDays} late days makes you ineligible for this
              month&apos;s incentive/bonus.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default LatePunchAlert;
```

- [ ] **Step 2: Write `bonus-ineligible-alert.tsx`**

```tsx
import { Body, Container, Head, Heading, Html, Preview, Section, Text } from "@react-email/components";

export type BonusIneligibleAlertProps = {
  employeeName: string;
  orgName: string;
  month: string; // e.g. "June 2026"
  lateDaysThisMonth: number;
  thresholdDays: number;
};

export function BonusIneligibleAlert({
  employeeName,
  orgName,
  month,
  lateDaysThisMonth,
  thresholdDays,
}: BonusIneligibleAlertProps) {
  return (
    <Html>
      <Head />
      <Preview>Bonus eligibility update — {month}</Preview>
      <Body style={{ fontFamily: "Arial, sans-serif", background: "#f6f9fc" }}>
        <Container style={{ background: "#fff", padding: 24, borderRadius: 8, maxWidth: 480 }}>
          <Heading style={{ fontSize: 18 }}>Bonus eligibility update</Heading>
          <Section>
            <Text>Hi {employeeName},</Text>
            <Text>
              You have reached <strong>{lateDaysThisMonth}</strong> late punch-ins in {month}, which
              meets the {thresholdDays}-day limit set by {orgName}.
            </Text>
            <Text>As a result, you are not eligible for this month&apos;s incentive/bonus.</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default BonusIneligibleAlert;
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "late-punch-alert|bonus-ineligible" || echo "no errors in new templates"`
Expected: `no errors in new templates`.

- [ ] **Step 4: Commit**

```bash
git add src/components/emails/late-punch-alert.tsx src/components/emails/bonus-ineligible-alert.tsx
git commit -m "feat(emails): late-punch + bonus-ineligible alert templates"
```

---

## Task 7: Late-policy server actions (policy + targets + flags + override)

**Files:**
- Create: `src/actions/late-policy.ts`

- [ ] **Step 1: Write the action file**

```ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import type { ActionResult } from "@/types";

export type LatePolicy = {
  id: string;
  org_id: string;
  enabled: boolean;
  name: string;
  threshold_days: number;
  fallback_cutoff_time: string | null;
  notify_on_late: boolean;
  notify_on_threshold: boolean;
  warn_at: number | null;
  channel_whatsapp: boolean;
  channel_email: boolean;
};

export type LatePolicyTargetRow = { target_type: "department" | "employee"; target_id: string };

const PolicySchema = z.object({
  enabled: z.boolean(),
  name: z.string().min(1).max(120),
  threshold_days: z.number().int().min(1).max(31),
  fallback_cutoff_time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  notify_on_late: z.boolean(),
  notify_on_threshold: z.boolean(),
  warn_at: z.number().int().min(1).max(31).nullable(),
  channel_whatsapp: z.boolean(),
  channel_email: z.boolean(),
  targets: z.array(z.object({ target_type: z.enum(["department", "employee"]), target_id: z.string().uuid() })),
});

export async function getLatePolicy(): Promise<
  ActionResult<{ policy: LatePolicy | null; targets: LatePolicyTargetRow[] }>
> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };
  const sb = createAdminSupabase();
  const { data: policy } = await sb.from("late_policies").select("*").eq("org_id", user.orgId).maybeSingle();
  if (!policy) return { success: true, data: { policy: null, targets: [] } };
  const { data: targets } = await sb
    .from("late_policy_targets")
    .select("target_type, target_id")
    .eq("policy_id", (policy as any).id);
  return { success: true, data: { policy: policy as any, targets: (targets ?? []) as any } };
}

export async function upsertLatePolicy(input: z.infer<typeof PolicySchema>): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can edit the late policy" };
  const parsed = PolicySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message };
  if (parsed.data.warn_at != null && parsed.data.warn_at >= parsed.data.threshold_days) {
    return { success: false, error: "Warn-at must be below the threshold" };
  }
  const sb = createAdminSupabase();
  const { targets, ...policyFields } = parsed.data;

  const { data: existing } = await sb.from("late_policies").select("id").eq("org_id", user.orgId).maybeSingle();
  let policyId: string;
  if (existing) {
    policyId = (existing as any).id;
    const { error } = await sb
      .from("late_policies")
      .update({ ...policyFields, updated_at: new Date().toISOString() } as any)
      .eq("id", policyId);
    if (error) return { success: false, error: error.message };
  } else {
    const { data, error } = await sb
      .from("late_policies")
      .insert({ org_id: user.orgId, ...policyFields } as any)
      .select("id")
      .single();
    if (error) return { success: false, error: error.message };
    policyId = (data as { id: string }).id;
  }

  // Replace targets wholesale (simplest correct semantics for select/unselect).
  await sb.from("late_policy_targets").delete().eq("policy_id", policyId);
  if (targets.length > 0) {
    const rows = targets.map((t) => ({
      org_id: user.orgId,
      policy_id: policyId,
      target_type: t.target_type,
      target_id: t.target_id,
    }));
    const { error: tErr } = await sb.from("late_policy_targets").insert(rows as any);
    if (tErr) return { success: false, error: tErr.message };
  }

  revalidatePath("/dashboard/settings");
  return { success: true, data: { id: policyId } };
}

/** List the current IST month's flags for the payroll/admin UI. */
export async function getLateFlagsForMonth(month: string): Promise<
  ActionResult<Array<{ employee_id: string; late_days_count: number; status: "flagged" | "overridden" }>>
> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("late_policy_flags")
    .select("employee_id, late_days_count, status")
    .eq("org_id", user.orgId)
    .eq("month", month);
  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as any };
}

export async function overrideLateFlag(input: {
  employeeId: string;
  month: string;
  reason: string;
}): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can override" };
  if (!input.reason.trim()) return { success: false, error: "A reason is required" };
  const sb = createAdminSupabase();
  const { error } = await sb
    .from("late_policy_flags")
    .update({
      status: "overridden",
      override_by: user.employeeId ?? null,
      override_reason: input.reason.trim(),
      overridden_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any)
    .eq("org_id", user.orgId)
    .eq("employee_id", input.employeeId)
    .eq("month", input.month);
  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/payroll");
  return { success: true, data: undefined };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "late-policy.ts" || echo "no errors in late-policy.ts"`
Expected: `no errors in late-policy.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/actions/late-policy.ts
git commit -m "feat(late-policy): policy CRUD, targets, monthly flags + override actions"
```

---

## Task 8: WhatsApp credentials server actions (per-org, encrypted)

**Files:**
- Create: `src/actions/whatsapp-credentials.ts`

- [ ] **Step 1: Confirm the crypto helper exports**

Run: `grep -nE "export (async )?function (encrypt|decrypt)" src/lib/crypto/aes-gcm.ts`
Expected: two export lines (e.g. `encrypt(plaintext)` / `decrypt(ciphertext)`). Use those exact names in Step 2. If signatures differ (e.g. `encryptString`), substitute accordingly.

- [ ] **Step 2: Write the action file**

```ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import { encrypt } from "@/lib/crypto/aes-gcm";
import { resolveProvider, type ProviderConfig } from "@/lib/whatsapp";
import type { ActionResult } from "@/types";

const CredsSchema = z.object({
  provider: z.enum(["omni", "aisensy", "wati", "meta", "centralized"]),
  apiKey: z.string().max(2000).nullable(),
  endpoint: z.string().url().max(500).nullable(),
  templateMap: z.record(z.string(), z.string()),
  active: z.boolean(),
});

export type WhatsAppCredsView = {
  provider: ProviderConfig["provider"] | null;
  hasApiKey: boolean;
  endpoint: string | null;
  templateMap: Record<string, string>;
  active: boolean;
};

export async function getWhatsAppCredentials(): Promise<ActionResult<WhatsAppCredsView | null>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };
  const sb = createAdminSupabase();
  const { data } = await sb
    .from("org_whatsapp_credentials")
    .select("provider, api_key_encrypted, endpoint, template_map, active")
    .eq("org_id", user.orgId)
    .maybeSingle();
  if (!data) return { success: true, data: null };
  const row = data as any;
  return {
    success: true,
    data: {
      provider: row.provider,
      hasApiKey: !!row.api_key_encrypted,
      endpoint: row.endpoint,
      templateMap: row.template_map ?? {},
      active: row.active,
    },
  };
}

export async function upsertWhatsAppCredentials(input: z.infer<typeof CredsSchema>): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can configure WhatsApp" };
  const parsed = CredsSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message };
  const sb = createAdminSupabase();

  // Only re-encrypt the key when a new one is provided (null = keep existing).
  const update: Record<string, any> = {
    org_id: user.orgId,
    provider: parsed.data.provider,
    endpoint: parsed.data.endpoint,
    template_map: parsed.data.templateMap,
    active: parsed.data.active,
    updated_at: new Date().toISOString(),
  };
  if (parsed.data.apiKey) update.api_key_encrypted = await encrypt(parsed.data.apiKey);

  const { error } = await sb.from("org_whatsapp_credentials").upsert(update as any, { onConflict: "org_id" });
  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true, data: undefined };
}

/** Load + decrypt the org's provider config for the dispatcher (server-internal). */
export async function loadProviderConfig(orgId: string): Promise<ProviderConfig | null> {
  const sb = createAdminSupabase();
  const { data } = await sb
    .from("org_whatsapp_credentials")
    .select("provider, api_key_encrypted, endpoint, template_map, active")
    .eq("org_id", orgId)
    .maybeSingle();
  if (!data) return null;
  const row = data as any;
  const { decrypt } = await import("@/lib/crypto/aes-gcm");
  return {
    provider: row.provider,
    apiKey: row.api_key_encrypted ? await decrypt(row.api_key_encrypted) : null,
    endpoint: row.endpoint,
    templateMap: row.template_map ?? {},
    active: row.active,
  };
}

export async function sendTestWhatsApp(toPhone: string): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };
  const cfg = await loadProviderConfig(user.orgId);
  const provider = resolveProvider(cfg);
  if (!provider) return { success: false, error: "No active WhatsApp provider configured" };
  const res = await provider.sendTemplate({
    to: toPhone,
    templateKey: "late_punch_alert",
    variables: { name: "Test", time: "09:25", count: "1", threshold: "3" },
  });
  if (!res.ok) return { success: false, error: res.error ?? "Send failed" };
  return { success: true, data: undefined };
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "whatsapp-credentials.ts" || echo "ok"`
Expected: `ok` (or fix any mismatch with the real `aes-gcm` export names from Step 1).

- [ ] **Step 4: Commit**

```bash
git add src/actions/whatsapp-credentials.ts
git commit -m "feat(whatsapp): per-org encrypted credential CRUD + test send"
```

---

## Task 9: Notification dispatcher (idempotent, email + WhatsApp)

**Files:**
- Create: `src/actions/late-policy-dispatch.ts`

- [ ] **Step 1: Write the dispatcher**

```ts
"use server";

import { render } from "@react-email/render";
import { createAdminSupabase } from "@/lib/supabase/server";
import { resend, FROM_EMAIL } from "@/lib/resend";
import { resolveProvider, type WhatsAppTemplateKey } from "@/lib/whatsapp";
import { loadProviderConfig } from "@/actions/whatsapp-credentials";
import { LatePunchAlert } from "@/components/emails/late-punch-alert";
import { BonusIneligibleAlert } from "@/components/emails/bonus-ineligible-alert";
import type { NotifyKind } from "@/lib/attendance/late-policy-notify";

type DispatchInput = {
  orgId: string;
  orgName: string;
  attendanceRecordId: string;
  employee: { id: string; name: string; email: string | null; phone: string | null; whatsappOptIn: boolean };
  kinds: NotifyKind[];
  channels: { email: boolean; whatsapp: boolean };
  data: { clockInTime: string; lateMinutes: number; lateDaysThisMonth: number; thresholdDays: number; monthLabel: string };
};

const TEMPLATE_KEY: Record<NotifyKind, WhatsAppTemplateKey> = {
  late: "late_punch_alert",
  warn: "late_warning",
  threshold: "bonus_ineligible_alert",
};

/** Best-effort, idempotent. Never throws into the caller. */
export async function dispatchLateNotifications(input: DispatchInput): Promise<void> {
  const sb = createAdminSupabase();
  const cfg = input.channels.whatsapp ? await loadProviderConfig(input.orgId) : null;
  const provider = resolveProvider(cfg);

  for (const kind of input.kinds) {
    // EMAIL
    if (input.channels.email && input.employee.email) {
      const already = await sb
        .from("late_punch_notifications")
        .select("id")
        .eq("attendance_record_id", input.attendanceRecordId)
        .eq("kind", kind)
        .eq("channel", "email")
        .maybeSingle();
      if (!already.data) {
        let status: "sent" | "failed" = "sent";
        let error: string | null = null;
        try {
          const html =
            kind === "threshold"
              ? await render(
                  BonusIneligibleAlert({
                    employeeName: input.employee.name,
                    orgName: input.orgName,
                    month: input.data.monthLabel,
                    lateDaysThisMonth: input.data.lateDaysThisMonth,
                    thresholdDays: input.data.thresholdDays,
                  }),
                )
              : await render(
                  LatePunchAlert({
                    employeeName: input.employee.name,
                    orgName: input.orgName,
                    clockInTime: input.data.clockInTime,
                    lateMinutes: input.data.lateMinutes,
                    lateDaysThisMonth: input.data.lateDaysThisMonth,
                    thresholdDays: input.data.thresholdDays,
                  }),
                );
          const subject = kind === "threshold" ? `Bonus eligibility update — ${input.data.monthLabel}` : "Late punch-in recorded";
          const r = await resend.emails.send({ from: FROM_EMAIL, to: input.employee.email, subject, html });
          if ((r as any)?.error) { status = "failed"; error = String((r as any).error?.message ?? "send error"); }
        } catch (e) {
          status = "failed";
          error = e instanceof Error ? e.message : "email failed";
        }
        await sb.from("late_punch_notifications").insert({
          org_id: input.orgId, attendance_record_id: input.attendanceRecordId, employee_id: input.employee.id,
          kind, channel: "email", status, error,
        } as any);
      }
    }

    // WHATSAPP
    if (input.channels.whatsapp && provider && input.employee.whatsappOptIn && input.employee.phone) {
      const already = await sb
        .from("late_punch_notifications")
        .select("id")
        .eq("attendance_record_id", input.attendanceRecordId)
        .eq("kind", kind)
        .eq("channel", "whatsapp")
        .maybeSingle();
      if (!already.data) {
        const res = await provider.sendTemplate({
          to: input.employee.phone,
          templateKey: TEMPLATE_KEY[kind],
          variables: {
            name: input.employee.name,
            time: input.data.clockInTime,
            count: String(input.data.lateDaysThisMonth),
            threshold: String(input.data.thresholdDays),
          },
        });
        await sb.from("late_punch_notifications").insert({
          org_id: input.orgId, attendance_record_id: input.attendanceRecordId, employee_id: input.employee.id,
          kind, channel: "whatsapp", status: res.ok ? "sent" : "failed",
          provider: provider.name, provider_message_id: res.providerMessageId ?? null, error: res.ok ? null : res.error ?? null,
        } as any);
      }
    }
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "late-policy-dispatch.ts" || echo "ok"`
Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
git add src/actions/late-policy-dispatch.ts
git commit -m "feat(late-policy): idempotent email + whatsapp notification dispatcher"
```

---

## Task 10: Hook lateness into `clockIn`

**Files:**
- Modify: `src/actions/attendance.ts` (the `clockIn` action — insert block ends ~line 165)

- [ ] **Step 1: Add a private evaluator helper at the bottom of `attendance.ts`**

```ts
// --- Late policy evaluation (runs after a successful clock-in) ---
import { computeLateness } from "@/lib/attendance/lateness";
import { resolveCoveredEmployeeIds } from "@/lib/attendance/late-policy-targets";
import { planNotificationKinds } from "@/lib/attendance/late-policy-notify";
import { dispatchLateNotifications } from "@/actions/late-policy-dispatch";

async function evaluateLatePolicyForClockIn(args: {
  orgId: string;
  employeeId: string;
  attendanceRecordId: string;
  clockInAtUtc: string;
  recordDate: string; // YYYY-MM-DD (IST)
  shift: { start_time: string; grace_minutes: number; is_overnight: boolean } | null;
}): Promise<void> {
  const supabase = createAdminSupabase();

  // 1. Resolve enabled policy for this org.
  const { data: policy } = await supabase
    .from("late_policies").select("*").eq("org_id", args.orgId).eq("enabled", true).maybeSingle();
  if (!policy) return;
  const p = policy as any;

  // 2. Is this employee targeted?
  const { data: targets } = await supabase
    .from("late_policy_targets").select("target_type, target_id").eq("policy_id", p.id);
  const { data: emps } = await supabase
    .from("employees").select("id, department_id").eq("org_id", args.orgId);
  const covered = resolveCoveredEmployeeIds({ targets: (targets ?? []) as any, employees: (emps ?? []) as any });
  if (!covered.has(args.employeeId)) return;

  // 3. Compute lateness.
  const lateness = computeLateness({
    clockInAtUtc: args.clockInAtUtc,
    shift: args.shift,
    fallbackCutoff: p.fallback_cutoff_time,
  });
  if (!lateness.evaluated) return;

  await supabase
    .from("attendance_records")
    .update({ is_late: lateness.isLate, late_minutes: lateness.lateMinutes, late_policy_id: p.id } as any)
    .eq("id", args.attendanceRecordId);

  if (!lateness.isLate) return;

  // 4. Count late days this IST month (including this record).
  const month = args.recordDate.slice(0, 7); // YYYY-MM
  const monthStart = `${month}-01`;
  const { count: newCountRaw } = await supabase
    .from("attendance_records")
    .select("id", { count: "exact", head: true })
    .eq("org_id", args.orgId).eq("employee_id", args.employeeId).eq("is_late", true)
    .gte("date", monthStart).lte("date", args.recordDate);
  const newCount = newCountRaw ?? 1;
  const prevCount = Math.max(0, newCount - 1);

  // 5. Upsert flag if threshold reached (never re-flag an overridden month).
  if (newCount >= p.threshold_days) {
    const { data: existingFlag } = await supabase
      .from("late_policy_flags").select("id, status").eq("org_id", args.orgId)
      .eq("employee_id", args.employeeId).eq("month", month).maybeSingle();
    if (existingFlag) {
      if ((existingFlag as any).status !== "overridden") {
        await supabase.from("late_policy_flags")
          .update({ late_days_count: newCount, updated_at: new Date().toISOString() } as any)
          .eq("id", (existingFlag as any).id);
      }
    } else {
      await supabase.from("late_policy_flags").insert({
        org_id: args.orgId, policy_id: p.id, employee_id: args.employeeId, month,
        late_days_count: newCount, status: "flagged",
      } as any);
    }
  }

  // 6. Plan + dispatch notifications.
  const kinds = planNotificationKinds({
    policy: { threshold_days: p.threshold_days, warn_at: p.warn_at, notify_on_late: p.notify_on_late, notify_on_threshold: p.notify_on_threshold },
    isLate: true, prevCount, newCount,
  });
  if (kinds.length === 0) return;

  const { data: emp } = await supabase
    .from("employees").select("first_name, last_name, email, phone, whatsapp_opt_in").eq("id", args.employeeId).single();
  const { data: org } = await supabase.from("organizations").select("name").eq("id", args.orgId).single();
  const e = emp as any;
  const istTime = new Date(new Date(args.clockInAtUtc).getTime() + 5.5 * 3600 * 1000).toISOString().slice(11, 16);
  const monthLabel = new Date(`${month}-01T00:00:00Z`).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

  await dispatchLateNotifications({
    orgId: args.orgId,
    orgName: (org as any)?.name ?? "your organization",
    attendanceRecordId: args.attendanceRecordId,
    employee: {
      id: args.employeeId, name: `${e.first_name} ${e.last_name}`.trim(),
      email: e.email ?? null, phone: e.phone ?? null, whatsappOptIn: !!e.whatsapp_opt_in,
    },
    kinds,
    channels: { email: p.channel_email, whatsapp: p.channel_whatsapp },
    data: { clockInTime: istTime, lateMinutes: lateness.lateMinutes, lateDaysThisMonth: newCount, thresholdDays: p.threshold_days, monthLabel },
  });
}
```

- [ ] **Step 2: Call it (non-blocking) at the end of `clockIn`, before `return { success: true, ... }`**

Add `import { waitUntil } from "@vercel/functions";` at the top if not already imported, then inside `clockIn` after the successful insert (where `data` is the inserted record and `shift`/`recordDate`/`nowUtc` are in scope):

```ts
  waitUntil(
    evaluateLatePolicyForClockIn({
      orgId: user.orgId,
      employeeId: user.employeeId,
      attendanceRecordId: (data as any).id,
      clockInAtUtc: nowUtc,
      recordDate,
      shift: shift ? { start_time: shift.start_time, grace_minutes: shift.grace_minutes, is_overnight: shift.is_overnight } : null,
    }).catch((e) => console.error("late-policy eval failed", e)),
  );
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "attendance.ts" || echo "ok"`
Then: `npm run lint 2>&1 | grep -E "attendance.ts|error" || echo "lint clean"`
Expected: `ok` and no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/actions/attendance.ts
git commit -m "feat(attendance): evaluate late policy on clock-in (flag + notify via waitUntil)"
```

---

## Task 11: Block bonus line items for flagged employees

**Files:**
- Modify: `src/actions/payroll.ts` (`LineItemSchema` ~line 1107, `addPayrollLineItem` ~line 1151)

- [ ] **Step 1: Add `override` to the schema**

Change `LineItemSchema` (line 1107) to add an optional override flag:

```ts
const LineItemSchema = z.object({
  payroll_entry_id: z.string().uuid(),
  category: z.enum(["bonus", "allowance", "reimbursement", "other"]),
  amount: z.number().int().min(0).max(10_000_000),
  taxable: z.boolean().default(true),
  note: z.string().max(280).nullable().optional(),
  override: z.boolean().optional(), // bypass late-policy bonus block (admin)
});
```

- [ ] **Step 2: Add the block check inside `addPayrollLineItem`**

After the existing block that loads `entry` and verifies the run is not paid, and BEFORE the insert, add (the action already has `entry.payroll_run_id` and `sb` in scope):

```ts
  // Late-policy bonus block: refuse a bonus for an employee flagged this month.
  if (parsed.data.category === "bonus" && !parsed.data.override) {
    const { data: runRow } = await sb
      .from("payroll_runs").select("month").eq("id", (entry as any).payroll_run_id).single();
    const { data: entryRow } = await sb
      .from("payroll_entries").select("employee_id").eq("id", (entry as any).id).single();
    if (runRow && entryRow) {
      const { data: flag } = await sb
        .from("late_policy_flags").select("late_days_count, status")
        .eq("org_id", user.orgId)
        .eq("employee_id", (entryRow as any).employee_id)
        .eq("month", (runRow as any).month)
        .maybeSingle();
      if (flag && (flag as any).status === "flagged") {
        return {
          success: false,
          error: `Employee is bonus-ineligible this month (${(flag as any).late_days_count} late days). Override required.`,
        };
      }
    }
  }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "payroll.ts" || echo "ok"`
Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
git add src/actions/payroll.ts
git commit -m "feat(payroll): block bonus line items for late-policy-flagged employees"
```

---

## Task 12: Reconcile cron

**Files:**
- Create: `src/app/api/cron/late-policy-reconcile/route.ts`
- Modify: `vercel.json` (crons array)

- [ ] **Step 1: Write the cron route** (mirrors `attendance-auto-clockout` auth/structure)

```ts
import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";

function istMonth(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 7);
}

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sb = createAdminSupabase();
  const month = istMonth();
  const monthStart = `${month}-01`;

  // Enabled policies → recompute each covered employee's late count → upsert flags.
  const { data: policies } = await sb.from("late_policies").select("*").eq("enabled", true);
  let flagged = 0;
  for (const p of (policies ?? []) as any[]) {
    const { data: lateRows } = await sb
      .from("attendance_records")
      .select("employee_id")
      .eq("org_id", p.org_id).eq("is_late", true)
      .gte("date", monthStart);
    const counts = new Map<string, number>();
    for (const r of (lateRows ?? []) as any[]) counts.set(r.employee_id, (counts.get(r.employee_id) ?? 0) + 1);
    for (const [employeeId, count] of counts) {
      if (count < p.threshold_days) continue;
      const { data: existing } = await sb
        .from("late_policy_flags").select("id, status")
        .eq("org_id", p.org_id).eq("employee_id", employeeId).eq("month", month).maybeSingle();
      if (existing) {
        if ((existing as any).status !== "overridden") {
          await sb.from("late_policy_flags").update({ late_days_count: count, updated_at: new Date().toISOString() } as any).eq("id", (existing as any).id);
        }
      } else {
        await sb.from("late_policy_flags").insert({ org_id: p.org_id, policy_id: p.id, employee_id: employeeId, month, late_days_count: count, status: "flagged" } as any);
        flagged++;
      }
    }
  }
  return NextResponse.json({ ok: true, month, newlyFlagged: flagged });
}
```

- [ ] **Step 2: Register the cron in `vercel.json`** (add to the `crons` array)

```json
    {
      "path": "/api/cron/late-policy-reconcile",
      "schedule": "0 20 * * *"
    }
```
(20:00 UTC = 01:30 IST — after the auto-clockout cron at 18:30 UTC has closed shifts.)

- [ ] **Step 3: Verify the route compiles**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "late-policy-reconcile" || echo "ok"`
Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/late-policy-reconcile/route.ts vercel.json
git commit -m "feat(cron): daily late-policy reconcile + flag sweep"
```

---

## Task 13: Settings UI — Late Policy card + nested dept/employee select

**Files:**
- Create: `src/components/settings/late-policy-targets-select.tsx`
- Create: `src/components/settings/late-policy-card.tsx`
- Modify: `src/components/settings/attendance-section.tsx` (mount the card)
- Modify: `src/components/settings/settings-content.tsx` (thread the new props through to `AttendanceSection`)
- Modify: `src/app/dashboard/settings/page.tsx` (server component — fetch policy + departments + employees and pass down)

- [ ] **Step 1: Write `late-policy-targets-select.tsx`** — grouped multi-select for departments + employees

```tsx
"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export type TargetRow = { target_type: "department" | "employee"; target_id: string };

export function LatePolicyTargetsSelect({
  departments,
  employees,
  value,
  onChange,
}: {
  departments: Array<{ id: string; name: string }>;
  employees: Array<{ id: string; name: string; department_id: string | null }>;
  value: TargetRow[];
  onChange: (next: TargetRow[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => new Set(value.map((t) => `${t.target_type}:${t.target_id}`)), [value]);

  function toggle(type: "department" | "employee", id: string) {
    const key = `${type}:${id}`;
    if (selected.has(key)) onChange(value.filter((t) => `${t.target_type}:${t.target_id}` !== key));
    else onChange([...value, { target_type: type, target_id: id }]);
  }

  const summary =
    value.length === 0
      ? "No one selected"
      : `${value.filter((t) => t.target_type === "department").length} dept(s), ${value.filter((t) => t.target_type === "employee").length} employee(s)`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm"
      >
        <span className="text-muted-foreground">{summary}</span>
        <ChevronDown className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-popover p-2 shadow-md">
          <p className="px-2 pb-1 pt-2 text-xs font-semibold uppercase text-muted-foreground">Departments</p>
          {departments.map((d) => (
            <Row key={d.id} label={d.name} checked={selected.has(`department:${d.id}`)} onClick={() => toggle("department", d.id)} />
          ))}
          <p className="px-2 pb-1 pt-3 text-xs font-semibold uppercase text-muted-foreground">Employees</p>
          {employees.map((e) => (
            <Row key={e.id} label={e.name} checked={selected.has(`employee:${e.id}`)} onClick={() => toggle("employee", e.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent">
      <span className={`flex h-4 w-4 items-center justify-center rounded border ${checked ? "bg-primary text-primary-foreground" : ""}`}>
        {checked && <Check className="h-3 w-3" />}
      </span>
      {label}
    </button>
  );
}
```

- [ ] **Step 2: Write `late-policy-card.tsx`** — the rule form (collapsible card, `sonner` toasts)

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { upsertLatePolicy, type LatePolicy } from "@/actions/late-policy";
import { LatePolicyTargetsSelect, type TargetRow } from "./late-policy-targets-select";

export function LatePolicyCard({
  initialPolicy,
  initialTargets,
  departments,
  employees,
}: {
  initialPolicy: LatePolicy | null;
  initialTargets: TargetRow[];
  departments: Array<{ id: string; name: string }>;
  employees: Array<{ id: string; name: string; department_id: string | null }>;
}) {
  const [enabled, setEnabled] = useState(initialPolicy?.enabled ?? false);
  const [name, setName] = useState(initialPolicy?.name ?? "Late Policy");
  const [threshold, setThreshold] = useState(initialPolicy?.threshold_days ?? 3);
  const [fallback, setFallback] = useState(initialPolicy?.fallback_cutoff_time ?? "");
  const [warnAt, setWarnAt] = useState<number | "">(initialPolicy?.warn_at ?? "");
  const [notifyLate, setNotifyLate] = useState(initialPolicy?.notify_on_late ?? true);
  const [notifyThreshold, setNotifyThreshold] = useState(initialPolicy?.notify_on_threshold ?? true);
  const [chEmail, setChEmail] = useState(initialPolicy?.channel_email ?? true);
  const [chWhatsapp, setChWhatsapp] = useState(initialPolicy?.channel_whatsapp ?? false);
  const [targets, setTargets] = useState<TargetRow[]>(initialTargets);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await upsertLatePolicy({
      enabled, name, threshold_days: threshold,
      fallback_cutoff_time: fallback ? fallback : null,
      notify_on_late: notifyLate, notify_on_threshold: notifyThreshold,
      warn_at: warnAt === "" ? null : Number(warnAt),
      channel_whatsapp: chWhatsapp, channel_email: chEmail,
      targets,
    });
    setSaving(false);
    if (res.success) toast.success("Late policy saved");
    else toast.error(res.error);
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Late Policy</h3>
          <p className="text-sm text-muted-foreground">Flag employees bonus-ineligible after too many late punch-ins.</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Enabled
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">Rule name
          <input className="mt-1 w-full rounded-md border px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="text-sm">Late days / month before block
          <input type="number" min={1} max={31} className="mt-1 w-full rounded-md border px-3 py-2" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
        </label>
        <label className="text-sm">Fallback cutoff (no shift) — HH:MM
          <input type="time" className="mt-1 w-full rounded-md border px-3 py-2" value={fallback} onChange={(e) => setFallback(e.target.value)} />
        </label>
        <label className="text-sm">Warn at (optional)
          <input type="number" min={1} max={31} className="mt-1 w-full rounded-md border px-3 py-2" value={warnAt} onChange={(e) => setWarnAt(e.target.value === "" ? "" : Number(e.target.value))} />
        </label>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={notifyLate} onChange={(e) => setNotifyLate(e.target.checked)} /> Notify on each late punch</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={notifyThreshold} onChange={(e) => setNotifyThreshold(e.target.checked)} /> Notify on threshold</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={chEmail} onChange={(e) => setChEmail(e.target.checked)} /> Email</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={chWhatsapp} onChange={(e) => setChWhatsapp(e.target.checked)} /> WhatsApp</label>
      </div>

      <div>
        <p className="mb-1 text-sm font-medium">Applies to</p>
        <LatePolicyTargetsSelect departments={departments} employees={employees} value={targets} onChange={setTargets} />
      </div>

      <button onClick={save} disabled={saving} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">
        {saving ? "Saving…" : "Save late policy"}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Mount in `attendance-section.tsx`**

Add `LatePolicyCard` to the `AttendanceSection` props + render it after `OvertimeCard`. Pass `latePolicy`, `latePolicyTargets`, `departments`, `employees` through. Example render line:

```tsx
<LatePolicyCard initialPolicy={latePolicy} initialTargets={latePolicyTargets} departments={departments} employees={employeeOptions} />
```

- [ ] **Step 4: Wire the Settings page server component (`src/app/dashboard/settings/page.tsx`)**

In `src/app/dashboard/settings/page.tsx` (the server page already fetching `shifts`, `weekOffPolicy`, etc.), add the fetch below and thread the props through `src/components/settings/settings-content.tsx` down to `AttendanceSection`:

```ts
import { getLatePolicy } from "@/actions/late-policy";
// ...
const latePolicyRes = await getLatePolicy();
const latePolicy = latePolicyRes.success ? latePolicyRes.data.policy : null;
const latePolicyTargets = latePolicyRes.success ? latePolicyRes.data.targets : [];
// employeeOptions = employees mapped to { id, name: `${first} ${last}`, department_id }
```
Pass these into `<AttendanceSection ... latePolicy={latePolicy} latePolicyTargets={latePolicyTargets} departments={departments} employeeOptions={employeeOptions} />`.

- [ ] **Step 5: Build check**

Run: `npm run build 2>&1 | tail -20`
Expected: build succeeds (gotcha #65: lint is decoupled from build).

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/late-policy-card.tsx src/components/settings/late-policy-targets-select.tsx src/components/settings/attendance-section.tsx
git add -A src/app/dashboard/settings
git commit -m "feat(settings): late-policy card with dept/employee nested multi-select"
```

---

## Task 14: Settings UI — WhatsApp provider sub-card

**Files:**
- Create: `src/components/settings/whatsapp-provider-card.tsx`
- Modify: `src/components/settings/attendance-section.tsx` (mount under Late Policy)

- [ ] **Step 1: Write `whatsapp-provider-card.tsx`**

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { upsertWhatsAppCredentials, sendTestWhatsApp, type WhatsAppCredsView } from "@/actions/whatsapp-credentials";

const PROVIDERS = ["centralized", "aisensy", "wati", "omni"] as const;

export function WhatsAppProviderCard({ initial }: { initial: WhatsAppCredsView | null }) {
  const [provider, setProvider] = useState<string>(initial?.provider ?? "centralized");
  const [apiKey, setApiKey] = useState("");
  const [endpoint, setEndpoint] = useState(initial?.endpoint ?? "");
  const [active, setActive] = useState(initial?.active ?? false);
  const [tplLate, setTplLate] = useState(initial?.templateMap?.late_punch_alert ?? "");
  const [tplWarn, setTplWarn] = useState(initial?.templateMap?.late_warning ?? "");
  const [tplBlock, setTplBlock] = useState(initial?.templateMap?.bonus_ineligible_alert ?? "");
  const [testPhone, setTestPhone] = useState("");

  async function save() {
    const res = await upsertWhatsAppCredentials({
      provider: provider as any,
      apiKey: apiKey ? apiKey : null,
      endpoint: endpoint ? endpoint : null,
      templateMap: { late_punch_alert: tplLate, late_warning: tplWarn, bonus_ineligible_alert: tplBlock },
      active,
    });
    if (res.success) { toast.success("WhatsApp settings saved"); setApiKey(""); }
    else toast.error(res.error);
  }

  async function test() {
    if (!testPhone) return toast.error("Enter a phone number");
    const res = await sendTestWhatsApp(testPhone);
    if (res.success) toast.success("Test message sent");
    else toast.error(res.error);
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <h3 className="font-semibold">WhatsApp provider</h3>
      <p className="text-sm text-muted-foreground">Optional. If unset, late alerts go by email only. Omni adapter coming soon.</p>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">Provider
          <select className="mt-1 w-full rounded-md border px-3 py-2" value={provider} onChange={(e) => setProvider(e.target.value)}>
            {PROVIDERS.map((p) => <option key={p} value={p} disabled={p === "omni"}>{p}{p === "omni" ? " (soon)" : ""}</option>)}
          </select>
        </label>
        <label className="text-sm">Endpoint (optional)
          <input className="mt-1 w-full rounded-md border px-3 py-2" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
        </label>
        <label className="text-sm">API key {initial?.hasApiKey && <span className="text-xs text-muted-foreground">(saved — leave blank to keep)</span>}
          <input type="password" className="mt-1 w-full rounded-md border px-3 py-2" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        </label>
        <label className="flex items-end gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <label className="text-sm">Template: late<input className="mt-1 w-full rounded-md border px-3 py-2" value={tplLate} onChange={(e) => setTplLate(e.target.value)} /></label>
        <label className="text-sm">Template: warn<input className="mt-1 w-full rounded-md border px-3 py-2" value={tplWarn} onChange={(e) => setTplWarn(e.target.value)} /></label>
        <label className="text-sm">Template: block<input className="mt-1 w-full rounded-md border px-3 py-2" value={tplBlock} onChange={(e) => setTplBlock(e.target.value)} /></label>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={save} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">Save</button>
        <input className="rounded-md border px-3 py-2 text-sm" placeholder="+91… test number" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} />
        <button onClick={test} className="rounded-md border px-3 py-2 text-sm">Send test</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Mount in `attendance-section.tsx`** + fetch `getWhatsAppCredentials()` in `src/app/dashboard/settings/page.tsx`, thread through `settings-content.tsx`, pass `initial`.

```tsx
<WhatsAppProviderCard initial={whatsappCreds} />
```

- [ ] **Step 3: Build check**

Run: `npm run build 2>&1 | tail -20`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/whatsapp-provider-card.tsx src/components/settings/attendance-section.tsx
git add -A src/app/dashboard/settings
git commit -m "feat(settings): per-org WhatsApp provider sub-card + test send"
```

---

## Task 15: Payroll UI — bonus-ineligible badge + override

**Files:**
- Create: `src/components/payroll/bonus-ineligible-badge.tsx`
- Modify: the payroll entries client component (where line-item/bonus UI renders per employee)
- Modify: the payroll page server component (fetch `getLateFlagsForMonth(run.month)`, pass down)

- [ ] **Step 1: Write the badge + override dialog**

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";
import { overrideLateFlag } from "@/actions/late-policy";

export function BonusIneligibleBadge({
  employeeId,
  month,
  lateDays,
  status,
  onOverridden,
}: {
  employeeId: string;
  month: string;
  lateDays: number;
  status: "flagged" | "overridden";
  onOverridden?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (status === "overridden") {
    return <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Bonus override applied</span>;
  }

  async function doOverride() {
    if (!reason.trim()) return toast.error("Reason required");
    setBusy(true);
    const res = await overrideLateFlag({ employeeId, month, reason });
    setBusy(false);
    if (res.success) { toast.success("Override applied"); setOpen(false); onOverridden?.(); }
    else toast.error(res.error);
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
        <AlertCircle className="h-3 w-3" /> Bonus-ineligible · {lateDays} late days
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div className="w-96 rounded-lg bg-background p-4" onClick={(e) => e.stopPropagation()}>
            <h4 className="font-semibold">Override bonus block</h4>
            <p className="mt-1 text-sm text-muted-foreground">This employee hit {lateDays} late days this month. Enter a reason to allow a bonus.</p>
            <textarea className="mt-2 w-full rounded-md border px-3 py-2 text-sm" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-md border px-3 py-1.5 text-sm">Cancel</button>
              <button onClick={doOverride} disabled={busy} className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50">Apply override</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Render the badge in the payroll entries client**

Where each payroll entry row renders, look up the flag for that `employee_id` from the `lateFlags` prop (a `Map` or array keyed by `employee_id`) and render `<BonusIneligibleBadge ... />` when present. Pass `month={run.month}`.

- [ ] **Step 3: Fetch flags in the payroll page server component**

```ts
import { getLateFlagsForMonth } from "@/actions/late-policy";
// after resolving the active run:
const flagsRes = await getLateFlagsForMonth(run.month);
const lateFlags = flagsRes.success ? flagsRes.data : [];
// pass lateFlags into the entries client
```

- [ ] **Step 4: Build check**

Run: `npm run build 2>&1 | tail -20`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/payroll/bonus-ineligible-badge.tsx
git add -A src/app/dashboard/payroll src/components/payroll
git commit -m "feat(payroll): bonus-ineligible badge + admin override"
```

---

## Task 16: Profile — WhatsApp opt-in toggle

**Files:**
- Modify: `src/actions/profile.ts` (`updateMyProfile`, returns `ProfileSaveResult` — gotcha #35)
- Modify: the employee profile form client component (under `src/app/dashboard/profile` / `src/components`)

- [ ] **Step 1: Add `whatsapp_opt_in` to `updateMyProfile` in `src/actions/profile.ts`**

In `src/actions/profile.ts`, add `whatsapp_opt_in: z.boolean().optional()` to the `updateMyProfile` schema and, when present, write both `whatsapp_opt_in` and `whatsapp_opt_in_at = opt_in ? now() : null` to the employee row.

```ts
// inside the update payload mapping:
...(parsed.data.whatsapp_opt_in !== undefined
  ? { whatsapp_opt_in: parsed.data.whatsapp_opt_in, whatsapp_opt_in_at: parsed.data.whatsapp_opt_in ? new Date().toISOString() : null }
  : {}),
```

- [ ] **Step 2: Add the toggle + phone hint to the profile form client**

```tsx
<label className="flex items-center gap-2 text-sm">
  <input type="checkbox" checked={whatsappOptIn} onChange={(e) => setWhatsappOptIn(e.target.checked)} />
  Receive WhatsApp notifications (requires a valid phone number on file)
</label>
```
Include `whatsapp_opt_in: whatsappOptIn` in the submit payload. Initialize `whatsappOptIn` from the loaded profile.

- [ ] **Step 3: Build check**

Run: `npm run build 2>&1 | tail -20`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add -A src/app/dashboard/profile src/components src/actions
git commit -m "feat(profile): WhatsApp opt-in consent toggle"
```

---

## Task 17: Full verification pass

- [ ] **Step 1: Run all unit tests**

Run: `npx vitest run`
Expected: all pass, including the 4 new test files (`lateness`, `late-policy-targets`, `late-policy-notify`, `whatsapp/registry`).

- [ ] **Step 2: Build + lint**

Run: `npm run build && npm run lint`
Expected: build succeeds; lint shows no new errors (warnings ok per repo baseline).

- [ ] **Step 3: Manual smoke (demo org, email-only first)**

1. Settings → Attendance → Late Policy: enable, threshold = 2, target a department, channels = Email only, save.
2. As a targeted employee with a shift starting earlier than now, clock in (late). Confirm `attendance_records.is_late = true`, `late_minutes > 0` (check via Supabase).
3. Clock in late on a second day (or insert a second late row for testing) → confirm a `late_policy_flags` row appears with `status='flagged'`, and the employee got a "late" + "threshold" email.
4. Payroll → process a run for that month → try to add a `bonus` line item for the flagged employee → expect the block error. Override with a reason → bonus now allowed; badge flips to "override applied".

- [ ] **Step 4: WhatsApp smoke (once a provider account + templates exist)**

Configure the WhatsApp provider sub-card (AiSensy/WATI key + approved template names), mark Active, enable WhatsApp channel on the policy, set an opted-in employee phone, "Send test". Then trigger a late punch and confirm a WhatsApp message + a `late_punch_notifications` row with `channel='whatsapp', status='sent'`.

- [ ] **Step 5: Final commit (if any fixes were needed)**

```bash
git add -A
git commit -m "test: late-policy verification fixes"
```

---

## Notes / Known v1 limitations (carried from spec §10)

- **Overnight shifts are not evaluated** for lateness in v1 (boundary wrap deferred). `computeLateness` returns `evaluated:false` for them.
- One policy per org; targeting selects *who it covers* (not per-department different thresholds).
- Period = calendar month (IST) only.
- Consequence = bonus block only (no penalty deductions).
- Omni adapter is stubbed out of `resolveProvider` (returns null) until its API is confirmed; those orgs fall back to email.
- WhatsApp templates must be pre-approved in the provider/Meta console (Utility category) before any message sends.
