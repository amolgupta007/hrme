# Pricing Overhaul — Phase 3: Custom Plan End-to-End

**Goal:** Ship the Custom plan from request → review → approve/counter-offer → checkout → activated subscription. Customer-side picker, superadmin queue, dynamic Razorpay plan creation, counter-offer state machine, 5 email templates, weekly webhook-events cleanup cron.

**Spec:** `docs/superpowers/specs/2026-05-01-pricing-overhaul-design.md` (sections "Custom plan delivery — hybrid", "Superadmin Custom Plans tab", "Email Templates", "Razorpay Implementation").

**Architecture (recap from spec):**

```
Customer  →  /dashboard/settings/custom-plan  (picker)
                       ↓
              custom_plan_requests row (status='pending')
                       ↓
       Founder reviews at /superadmin (Custom Plans tab)
              │                │              │
          Approve          Counter           Reject
              │                │              │
   razorpay.plans.create()    Email            Email
   razorpay.subscriptions      to customer     customer
   .create() + email           with new        rejection
                               proposal        reason
                                  │
                  Customer accepts in picker page
                                  │
                  Founder approves accepted version
                                  │
                          (back to top)
                                  │
                  Razorpay checkout → subscription.activated webhook
                                  │
              webhook writes plan='custom', custom_features, etc.
```

**State machine for `custom_plan_requests.status`:**

```
pending ──Approve──→ approved ──webhook──→ active (no longer in queue)
   │
   ├──Counter──→ counter_offered ──Customer accept──→ accepted ──Approve──→ approved → ...
   │                              ──Customer reject──→ cancelled
   │
   ├──Reject───→ rejected (terminal)
   │
   └──Customer cancel──→ cancelled (terminal)
```

**TypeScript baseline (after Phase 2 merge):** ~307 lines from `npx tsc --noEmit`. Don't introduce new errors beyond known Supabase v2 `never`-inference pattern.

**Tech Stack:** Same as Phase 1/2. New: `razorpay.plans.create()` API for dynamic per-org plans.

**Testing posture:** No Jest/Vitest. Each task ends with `npx tsc --noEmit`, `npm run build`, or browser smoke test plus a git commit.

---

## Task 1: Plan doc + DB schema verification

**Files:** Create this plan doc. No code changes.

- [ ] **Step 1: Confirm schema is in place**

The Phase 1 migration (`006_pricing_schema.sql`) added these to `organizations`:
- `billing_cycle`, `subscription_status`, `platform_fee_paid`, `gstin`, `subscription_paused_at` (used in Phase 2)
- `custom_features` (jsonb), `custom_per_feature_rate` (int), `custom_platform_fee` (int), `custom_max_employees` (int) — Phase 3 uses these

And these new tables: `custom_plan_requests`, `webhook_events`.

If the migration didn't run in production, run it via Supabase SQL Editor before continuing. The migration file is in `supabase/migrations/`.

- [ ] **Step 2: Commit the plan doc**

```bash
git add docs/superpowers/plans/2026-05-02-pricing-overhaul-phase-3-custom-plan.md
git commit -m "docs(plans): pricing overhaul phase 3 — custom plan end-to-end"
```

---

## Task 2: Customer-side custom-plan server actions

**Files:** Create `src/actions/custom-plan.ts`

Four customer-facing actions:
- `requestCustomPlan({ features, employeeCount, billingCycle })` — creates a `pending` row, sends founder email
- `getMyCustomPlanRequest()` — returns the org's most recent active (non-terminal) request, used by both picker page and BillingSection banner
- `cancelMyCustomPlanRequest()` — admin only, sets status='cancelled' on `pending` or `counter_offered` rows
- `acceptCounterOffer()` — admin only, transitions `counter_offered` → `accepted`

- [ ] **Step 1: Create the file**

```ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import { render } from "@react-email/render";
import { resend, FOUNDER_EMAIL_FROM, NOREPLY_EMAIL_FROM } from "@/lib/resend";
import { CustomPlanRequestReceivedEmail } from "@/components/emails/custom-plan-request-received";
import { CUSTOM_PICKER_FEATURES, CUSTOM_PER_FEATURE_DEFAULT_RATE, CUSTOM_DEFAULT_MAX_EMPLOYEES, PLATFORM_FEES } from "@/config/billing";
import type { ActionResult, BillingCycle } from "@/types";

const requestSchema = z.object({
  features: z.array(z.string()).min(1, "Pick at least one feature"),
  employeeCount: z.number().int().min(1).max(500),
  billingCycle: z.enum(["monthly", "annual"]),
});

export type CustomPlanRequest = {
  id: string;
  status: "pending" | "counter_offered" | "accepted" | "rejected" | "approved" | "cancelled";
  requested_features: string[];
  requested_employees: number;
  requested_billing_cycle: BillingCycle;
  founder_platform_fee: number | null;
  founder_per_feature_rate: number | null;
  founder_max_employees: number | null;
  founder_notes: string | null;
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
};

export async function requestCustomPlan(
  args: z.infer<typeof requestSchema>
): Promise<ActionResult<{ requestId: string }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only owners and admins can request a custom plan" };

  const parsed = requestSchema.safeParse(args);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  // Validate feature keys
  const invalid = parsed.data.features.filter((f) => !CUSTOM_PICKER_FEATURES.includes(f));
  if (invalid.length > 0) {
    return { success: false, error: `Unknown features: ${invalid.join(", ")}` };
  }

  const supabase = createAdminSupabase();

  // Block if a pending/counter_offered/accepted request already exists.
  const { data: existing } = await supabase
    .from("custom_plan_requests")
    .select("id, status")
    .eq("org_id", user.orgId)
    .in("status", ["pending", "counter_offered", "accepted", "approved"])
    .maybeSingle();

  if (existing) {
    return { success: false, error: "You already have an active custom plan request. Cancel it before submitting a new one." };
  }

  const { data: row, error } = await supabase
    .from("custom_plan_requests")
    .insert({
      org_id: user.orgId,
      requested_by_employee_id: user.employeeId,
      requested_features: parsed.data.features,
      requested_employees: parsed.data.employeeCount,
      requested_billing_cycle: parsed.data.billingCycle,
      status: "pending",
    } as any)
    .select("id")
    .single();

  if (error || !row) {
    console.error("requestCustomPlan failed", error);
    return { success: false, error: error?.message ?? "Failed to submit request" };
  }

  // Fire founder email
  try {
    const { data: org } = await supabase
      .from("organizations")
      .select("name, slug")
      .eq("id", user.orgId)
      .single();
    const orgRow = org as { name: string; slug: string } | null;
    if (orgRow) {
      const html = await render(
        CustomPlanRequestReceivedEmail({
          orgName: orgRow.name,
          features: parsed.data.features,
          employeeCount: parsed.data.employeeCount,
          billingCycle: parsed.data.billingCycle,
          superadminUrl: "https://jambahr.com/superadmin",
        })
      );
      await resend.emails.send({
        from: NOREPLY_EMAIL_FROM,
        to: ["amol@jambahr.com"],
        subject: `New custom plan request — ${orgRow.name}`,
        html,
      });
    }
  } catch (e) {
    console.warn("requestCustomPlan: founder email failed (non-fatal)", e);
  }

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/settings/custom-plan");
  return { success: true, data: { requestId: (row as { id: string }).id } };
}

export async function getMyCustomPlanRequest(): Promise<ActionResult<CustomPlanRequest | null>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("custom_plan_requests")
    .select("id, status, requested_features, requested_employees, requested_billing_cycle, founder_platform_fee, founder_per_feature_rate, founder_max_employees, founder_notes, rejection_reason, created_at, reviewed_at")
    .eq("org_id", user.orgId)
    .in("status", ["pending", "counter_offered", "accepted", "approved", "rejected"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { success: false, error: error.message };
  return { success: true, data: (data as unknown as CustomPlanRequest) ?? null };
}

export async function cancelMyCustomPlanRequest(requestId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only owners and admins can cancel a custom plan request" };

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("custom_plan_requests")
    .update({ status: "cancelled" } as any)
    .eq("id", requestId)
    .eq("org_id", user.orgId)
    .in("status", ["pending", "counter_offered"]);

  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/settings/custom-plan");
  return { success: true, data: undefined };
}

export async function acceptCounterOffer(requestId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only owners and admins can accept a counter-offer" };

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("custom_plan_requests")
    .update({ status: "accepted" } as any)
    .eq("id", requestId)
    .eq("org_id", user.orgId)
    .eq("status", "counter_offered");

  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/settings/custom-plan");
  return { success: true, data: undefined };
}
```

- [ ] **Step 2: Type-check**

`npx tsc --noEmit 2>&1 | grep custom-plan` should be clean (the email import resolves after Task 9).

- [ ] **Step 3: Hold the commit**

The `CustomPlanRequestReceivedEmail` import only resolves after Task 9. Bundle this commit with Tasks 3-4 (UI), or commit after Task 9.

---

## Task 3: Customer picker UI at `/dashboard/settings/custom-plan`

**Files:** Create `src/app/dashboard/settings/custom-plan/page.tsx`

A page that branches based on existing-request state:
- **No request** → show the picker form
- **Pending** → show "We're reviewing your request" banner + cancel button
- **Counter-offered** → show the founder's modified proposal + Accept/Decline buttons
- **Approved** → show "Approved! Check your email for the checkout link"
- **Rejected** → show rejection reason + "Submit a new request" button

- [ ] **Step 1: Create the page (server component)**

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { getMyCustomPlanRequest } from "@/actions/custom-plan";
import { CustomPlanPicker } from "@/components/settings/custom-plan-picker";
import { CustomPlanStatusView } from "@/components/settings/custom-plan-status-view";

export default async function CustomPlanPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const result = await getMyCustomPlanRequest();
  const request = result.success ? result.data : null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/dashboard/settings" className="text-sm text-muted-foreground hover:text-foreground">
        ← Back to Settings
      </Link>
      <h1 className="text-2xl font-bold tracking-tight mt-4 mb-2">Custom Plan</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Pick only the features you need. We'll review your request within 1 business day.
      </p>

      {request ? (
        <CustomPlanStatusView request={request} employeeCount={user.employeeCount ?? 0} />
      ) : (
        <CustomPlanPicker employeeCount={user.employeeCount ?? 0} />
      )}
    </main>
  );
}
```

(Note: `user.employeeCount` may not exist on the current `getCurrentUser()` shape — fall back to fetching it server-side or pass 0.)

- [ ] **Step 2: Create `CustomPlanPicker`**

`src/components/settings/custom-plan-picker.tsx`:

```tsx
"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { requestCustomPlan } from "@/actions/custom-plan";
import {
  CUSTOM_PICKER_FEATURES,
  CUSTOM_PER_FEATURE_DEFAULT_RATE,
  PLATFORM_FEES,
  ANNUAL_MULTIPLIER,
  formatPaise,
} from "@/config/billing";

const FEATURE_LABELS: Record<string, { label: string; group: string }> = {
  documents: { label: "Document hub + acknowledgments", group: "Advanced HR" },
  reviews: { label: "Performance reviews", group: "Advanced HR" },
  objectives: { label: "Objectives & OKRs", group: "Advanced HR" },
  training: { label: "Training & compliance", group: "Advanced HR" },
  hiring_jd: { label: "AI job description generator", group: "Hiring" },
  payroll: { label: "Payroll (PF, PT, TDS)", group: "Operations" },
  ats: { label: "JambaHire ATS pipeline", group: "Hiring" },
  interview_scheduling: { label: "Interview scheduling", group: "Hiring" },
  offer_letters: { label: "Offer letters", group: "Hiring" },
  onboarding_workflows: { label: "Onboarding workflows", group: "Operations" },
};

interface CustomPlanPickerProps {
  employeeCount: number;
}

export function CustomPlanPicker({ employeeCount: initialEmployees }: CustomPlanPickerProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [employeeCount, setEmployeeCount] = useState<number>(Math.max(initialEmployees, 1));
  const [cycle, setCycle] = useState<"monthly" | "annual">("annual");
  const [submitting, setSubmitting] = useState(false);

  const groups = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const f of CUSTOM_PICKER_FEATURES) {
      const g = FEATURE_LABELS[f]?.group ?? "Other";
      (map[g] ??= []).push(f);
    }
    return map;
  }, []);

  const monthlyAmount = selected.size * employeeCount * CUSTOM_PER_FEATURE_DEFAULT_RATE;
  const recurringAmount = cycle === "annual" ? monthlyAmount * ANNUAL_MULTIPLIER : monthlyAmount;
  const platformFee = PLATFORM_FEES.custom;

  function toggle(feat: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(feat)) next.delete(feat);
      else next.add(feat);
      return next;
    });
  }

  async function handleSubmit() {
    if (selected.size === 0) {
      toast.error("Pick at least one feature");
      return;
    }
    setSubmitting(true);
    try {
      const result = await requestCustomPlan({
        features: Array.from(selected),
        employeeCount,
        billingCycle: cycle,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Custom plan request submitted. We'll review within 1 business day.");
      // Page will revalidate and show the status view
      window.location.reload();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Cycle toggle */}
      <div className="flex items-center gap-2 rounded-full border border-border bg-muted/40 p-1 w-fit">
        <button
          onClick={() => setCycle("monthly")}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
            cycle === "monthly" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          Monthly
        </button>
        <button
          onClick={() => setCycle("annual")}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
            cycle === "annual" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          Annual <span className="ml-1 text-[11px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">Save 2 months</span>
        </button>
      </div>

      {/* Employee count */}
      <div className="rounded-xl border border-border bg-card p-6">
        <label className="block text-sm font-medium mb-2">Active employees</label>
        <input
          type="number"
          min={1}
          max={500}
          value={employeeCount}
          onChange={(e) => setEmployeeCount(Math.min(500, Math.max(1, Number(e.target.value) || 1)))}
          className="w-32 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        />
        <p className="text-xs text-muted-foreground mt-1">Max 500. Founder may approve a different cap.</p>
      </div>

      {/* Feature picker */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="font-semibold mb-4">Pick features</h3>
        {Object.entries(groups).map(([group, items]) => (
          <div key={group} className="mb-5 last:mb-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">{group}</p>
            <div className="space-y-2">
              {items.map((feat) => (
                <label key={feat} className="flex items-center gap-3 p-2.5 rounded-lg border border-border hover:bg-muted/40 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.has(feat)}
                    onChange={() => toggle(feat)}
                    className="h-4 w-4 rounded border-border accent-primary"
                  />
                  <span className="text-sm flex-1">{FEATURE_LABELS[feat]?.label ?? feat}</span>
                  <span className="text-xs text-muted-foreground">+₹120 / employee / month</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Calc */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-6">
        <h3 className="font-semibold mb-3">Estimated price</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Platform fee (one-time)</span>
            <span className="font-medium">{formatPaise(platformFee)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {selected.size} {selected.size === 1 ? "feature" : "features"} × {employeeCount} employees × ₹120
              {cycle === "annual" && " × 10 months"}
            </span>
            <span className="font-medium">{formatPaise(recurringAmount)} / {cycle === "annual" ? "year" : "month"}</span>
          </div>
          <p className="text-xs text-muted-foreground pt-2">+ 18% GST · Founder may adjust per-feature rate or cap</p>
        </div>
      </div>

      <Button size="lg" className="w-full" onClick={handleSubmit} disabled={submitting || selected.size === 0}>
        {submitting ? "Submitting..." : "Submit for review"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Create `CustomPlanStatusView`**

`src/components/settings/custom-plan-status-view.tsx`:

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cancelMyCustomPlanRequest, acceptCounterOffer, type CustomPlanRequest } from "@/actions/custom-plan";
import { ANNUAL_MULTIPLIER, formatPaise, CUSTOM_PER_FEATURE_DEFAULT_RATE, PLATFORM_FEES } from "@/config/billing";

interface Props {
  request: CustomPlanRequest;
  employeeCount: number;
}

export function CustomPlanStatusView({ request, employeeCount }: Props) {
  const [busy, setBusy] = useState(false);

  async function handleCancel() {
    if (!confirm("Cancel this custom plan request?")) return;
    setBusy(true);
    try {
      const r = await cancelMyCustomPlanRequest(request.id);
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      toast.success("Request cancelled.");
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  async function handleAccept() {
    setBusy(true);
    try {
      const r = await acceptCounterOffer(request.id);
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      toast.success("Counter-offer accepted. Awaiting founder activation.");
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  if (request.status === "rejected") {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
        <h3 className="font-semibold mb-2">Request not approved</h3>
        {request.rejection_reason && (
          <p className="text-sm mb-3"><strong>Reason:</strong> {request.rejection_reason}</p>
        )}
        <p className="text-sm text-muted-foreground mb-4">
          Refresh this page in a moment to submit a new request, or contact support@jambahr.com.
        </p>
      </div>
    );
  }

  if (request.status === "pending") {
    return (
      <div className="rounded-xl border border-amber-300/60 bg-amber-50/40 dark:bg-amber-900/10 p-6">
        <h3 className="font-semibold mb-2">Under review</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Submitted {new Date(request.created_at).toLocaleDateString("en-IN")}. We respond within 1 business day.
        </p>
        <RequestSummary request={request} />
        <Button variant="outline" size="sm" onClick={handleCancel} disabled={busy} className="mt-4">
          Cancel request
        </Button>
      </div>
    );
  }

  if (request.status === "counter_offered") {
    const founderRate = request.founder_per_feature_rate ?? CUSTOM_PER_FEATURE_DEFAULT_RATE;
    const founderFee = request.founder_platform_fee ?? PLATFORM_FEES.custom;
    const founderCap = request.founder_max_employees ?? request.requested_employees;
    const monthly = request.requested_features.length * Math.min(employeeCount, founderCap) * founderRate;
    const recurring = request.requested_billing_cycle === "annual" ? monthly * ANNUAL_MULTIPLIER : monthly;

    return (
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-6">
        <h3 className="font-semibold mb-2">Counter-offer from JambaHR</h3>
        <p className="text-sm text-muted-foreground mb-4">
          The founder reviewed your request and proposed adjusted terms.
        </p>

        {request.founder_notes && (
          <div className="rounded-lg bg-background p-3 text-sm mb-4">
            <p className="font-medium text-xs mb-1">Founder notes</p>
            <p className="text-muted-foreground">{request.founder_notes}</p>
          </div>
        )}

        <div className="space-y-1.5 text-sm mb-4">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Platform fee (one-time)</span>
            <span className="font-medium">{formatPaise(founderFee)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Per-feature rate</span>
            <span className="font-medium">{formatPaise(founderRate)} / employee / month</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Max employees</span>
            <span className="font-medium">{founderCap}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-1.5">
            <span className="text-muted-foreground">
              Recurring at current count ({Math.min(employeeCount, founderCap)} employees, {request.requested_billing_cycle})
            </span>
            <span className="font-semibold">
              {formatPaise(recurring)} / {request.requested_billing_cycle === "annual" ? "year" : "month"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground pt-1">+ 18% GST</p>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleAccept} disabled={busy}>Accept counter-offer</Button>
          <Button variant="outline" onClick={handleCancel} disabled={busy}>Decline</Button>
        </div>
      </div>
    );
  }

  if (request.status === "accepted") {
    return (
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-6">
        <h3 className="font-semibold mb-2">Counter-offer accepted</h3>
        <p className="text-sm text-muted-foreground">
          Awaiting founder activation. You'll receive an email with the checkout link shortly.
        </p>
      </div>
    );
  }

  if (request.status === "approved") {
    return (
      <div className="rounded-xl border border-green-300/60 bg-green-50/40 dark:bg-green-900/10 p-6">
        <h3 className="font-semibold mb-2">Approved!</h3>
        <p className="text-sm text-muted-foreground">
          Check your email for the Razorpay checkout link. Once payment is confirmed, your custom plan activates automatically.
        </p>
      </div>
    );
  }

  return null;
}

function RequestSummary({ request }: { request: CustomPlanRequest }) {
  return (
    <div className="space-y-1 text-sm">
      <p><strong>Features:</strong> {request.requested_features.length} selected</p>
      <p><strong>Employees:</strong> {request.requested_employees}</p>
      <p><strong>Cycle:</strong> {request.requested_billing_cycle === "annual" ? "Annual" : "Monthly"}</p>
    </div>
  );
}
```

- [ ] **Step 4: Bundle commit with Task 4**

---

## Task 4: Custom plan banner in BillingSection

**Files:** Modify `src/components/settings/billing-section.tsx`

If a non-terminal custom plan request exists, surface it at the top of the BillingSection so customers don't lose track.

- [ ] **Step 1: Update BillingSection**

```tsx
import { BillingStatusCard } from "@/components/settings/billing-status-card";
import { PlanManagementCard } from "@/components/settings/plan-management-card";
import { InvoicesCard } from "@/components/settings/invoices-card";
import { BillingDetailsCard } from "@/components/settings/billing-details-card";
import { CustomPlanRequestBanner } from "@/components/settings/custom-plan-request-banner";
import { getMyCustomPlanRequest } from "@/actions/custom-plan";
import type { OrgProfile } from "@/actions/settings";

interface BillingSectionProps {
  profile: OrgProfile;
}

export async function BillingSection({ profile }: BillingSectionProps) {
  const reqResult = await getMyCustomPlanRequest();
  const customRequest = reqResult.success ? reqResult.data : null;

  return (
    <div className="space-y-4">
      {customRequest && customRequest.status !== "rejected" && (
        <CustomPlanRequestBanner request={customRequest} />
      )}
      <BillingStatusCard />
      <PlanManagementCard
        currentPlan={profile.plan as "starter" | "growth" | "business" | "custom"}
        currentCycle={profile.billing_cycle ?? null}
        platformFeePaid={profile.platform_fee_paid ?? 0}
        employeeCount={profile.employee_count}
      />
      <InvoicesCard />
      <BillingDetailsCard />
    </div>
  );
}
```

- [ ] **Step 2: Create the banner**

`src/components/settings/custom-plan-request-banner.tsx`:

```tsx
import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";
import type { CustomPlanRequest } from "@/actions/custom-plan";

const STATUS_COPY: Record<CustomPlanRequest["status"], { title: string; body: string; tone: "amber" | "primary" | "green" }> = {
  pending: { title: "Custom plan under review", body: "We'll respond within 1 business day.", tone: "amber" },
  counter_offered: { title: "Counter-offer ready", body: "We've proposed adjusted terms — review and accept.", tone: "primary" },
  accepted: { title: "Counter-offer accepted", body: "Awaiting founder activation.", tone: "primary" },
  approved: { title: "Custom plan approved", body: "Check your email for the checkout link.", tone: "green" },
  rejected: { title: "", body: "", tone: "amber" },
  cancelled: { title: "", body: "", tone: "amber" },
};

const TONE_CLASS: Record<"amber" | "primary" | "green", string> = {
  amber: "border-amber-300/60 bg-amber-50/40 dark:bg-amber-900/10",
  primary: "border-primary/30 bg-primary/5",
  green: "border-green-300/60 bg-green-50/40 dark:bg-green-900/10",
};

export function CustomPlanRequestBanner({ request }: { request: CustomPlanRequest }) {
  const copy = STATUS_COPY[request.status];
  if (!copy.title) return null;

  return (
    <Link
      href="/dashboard/settings/custom-plan"
      className={`flex items-center justify-between gap-4 rounded-xl border p-5 hover:opacity-90 transition ${TONE_CLASS[copy.tone]}`}
    >
      <div className="flex items-start gap-3">
        <Sparkles className="h-5 w-5 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-sm">{copy.title}</p>
          <p className="text-xs text-muted-foreground">{copy.body}</p>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0" />
    </Link>
  );
}
```

- [ ] **Step 3: Commit T2 + T3 + T4 together**

```bash
git add src/actions/custom-plan.ts src/app/dashboard/settings/custom-plan/page.tsx src/components/settings/custom-plan-picker.tsx src/components/settings/custom-plan-status-view.tsx src/components/settings/custom-plan-request-banner.tsx src/components/settings/billing-section.tsx
git commit -m "feat(custom-plan): customer-side picker, status view, and banner — actions + UI"
```

---

## Task 5: Superadmin custom-plan actions

**Files:** Add to `src/actions/superadmin.ts` (or create if missing)

Four founder-side actions: `listCustomPlanRequests`, `approveCustomPlan`, `rejectCustomPlan`, `counterOfferCustomPlan`. Razorpay plan creation is in Task 7 — for now, these actions just update DB state and send emails.

- [ ] **Step 1: Add the actions**

Append to `src/actions/superadmin.ts`. (If the file doesn't exist, create it and copy the auth pattern from existing superadmin pages.) The auth check: founder email match (e.g. `amol@jambahr.com`) — match the existing superadmin pattern in this project.

```ts
import { CustomPlanCounterOfferEmail } from "@/components/emails/custom-plan-counter-offer";
import { CustomPlanRejectedEmail } from "@/components/emails/custom-plan-rejected";

export type CustomPlanRequestRow = {
  id: string;
  org_id: string;
  org_name: string;
  org_slug: string;
  requested_features: string[];
  requested_employees: number;
  requested_billing_cycle: "monthly" | "annual";
  status: "pending" | "counter_offered" | "accepted" | "rejected" | "approved" | "cancelled";
  founder_platform_fee: number | null;
  founder_per_feature_rate: number | null;
  founder_max_employees: number | null;
  founder_notes: string | null;
  rejection_reason: string | null;
  created_at: string;
};

export async function listCustomPlanRequests(): Promise<ActionResult<CustomPlanRequestRow[]>> {
  const ok = await assertSuperadmin();
  if (!ok.ok) return { success: false, error: ok.error };

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("custom_plan_requests")
    .select("id, org_id, requested_features, requested_employees, requested_billing_cycle, status, founder_platform_fee, founder_per_feature_rate, founder_max_employees, founder_notes, rejection_reason, created_at, organizations:org_id(name, slug)")
    .in("status", ["pending", "counter_offered", "accepted"])
    .order("created_at", { ascending: false });

  if (error) return { success: false, error: error.message };

  const rows = ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    org_id: r.org_id,
    org_name: r.organizations?.name ?? "—",
    org_slug: r.organizations?.slug ?? "",
    requested_features: r.requested_features ?? [],
    requested_employees: r.requested_employees,
    requested_billing_cycle: r.requested_billing_cycle,
    status: r.status,
    founder_platform_fee: r.founder_platform_fee,
    founder_per_feature_rate: r.founder_per_feature_rate,
    founder_max_employees: r.founder_max_employees,
    founder_notes: r.founder_notes,
    rejection_reason: r.rejection_reason,
    created_at: r.created_at,
  }));
  return { success: true, data: rows };
}

export async function counterOfferCustomPlan(args: {
  requestId: string;
  platformFee: number;
  perFeatureRate: number;
  maxEmployees: number;
  notes: string;
}): Promise<ActionResult> {
  const ok = await assertSuperadmin();
  if (!ok.ok) return { success: false, error: ok.error };

  const supabase = createAdminSupabase();
  const { data: row, error: fetchError } = await supabase
    .from("custom_plan_requests")
    .select("id, org_id, requested_features, requested_employees, requested_billing_cycle, organizations:org_id(name)")
    .eq("id", args.requestId)
    .single();

  if (fetchError || !row) return { success: false, error: fetchError?.message ?? "Request not found" };

  const { error: updateError } = await supabase
    .from("custom_plan_requests")
    .update({
      status: "counter_offered",
      founder_platform_fee: args.platformFee,
      founder_per_feature_rate: args.perFeatureRate,
      founder_max_employees: args.maxEmployees,
      founder_notes: args.notes,
      reviewed_at: new Date().toISOString(),
    } as any)
    .eq("id", args.requestId);

  if (updateError) return { success: false, error: updateError.message };

  // Send counter-offer email to org admins
  const r = row as any;
  const { data: admins } = await supabase
    .from("employees")
    .select("email")
    .eq("org_id", r.org_id)
    .in("role", ["owner", "admin"])
    .eq("status", "active");
  if (admins && admins.length > 0) {
    try {
      const html = await render(
        CustomPlanCounterOfferEmail({
          orgName: r.organizations?.name ?? "your team",
          features: r.requested_features ?? [],
          employees: r.requested_employees,
          cycle: r.requested_billing_cycle,
          platformFee: args.platformFee,
          perFeatureRate: args.perFeatureRate,
          maxEmployees: args.maxEmployees,
          notes: args.notes,
          dashboardUrl: "https://jambahr.com/dashboard/settings/custom-plan",
        })
      );
      await resend.emails.send({
        from: NOREPLY_EMAIL_FROM,
        to: (admins as { email: string }[]).map((a) => a.email),
        subject: "JambaHR — Custom plan counter-offer",
        html,
      });
    } catch (e) {
      console.warn("counter-offer email failed", e);
    }
  }

  revalidatePath("/superadmin");
  return { success: true, data: undefined };
}

export async function rejectCustomPlan(args: {
  requestId: string;
  reason: string;
}): Promise<ActionResult> {
  const ok = await assertSuperadmin();
  if (!ok.ok) return { success: false, error: ok.error };

  const supabase = createAdminSupabase();
  const { data: row, error: fetchError } = await supabase
    .from("custom_plan_requests")
    .select("id, org_id, organizations:org_id(name)")
    .eq("id", args.requestId)
    .single();
  if (fetchError || !row) return { success: false, error: fetchError?.message ?? "Request not found" };

  const { error: updateError } = await supabase
    .from("custom_plan_requests")
    .update({
      status: "rejected",
      rejection_reason: args.reason,
      reviewed_at: new Date().toISOString(),
    } as any)
    .eq("id", args.requestId);
  if (updateError) return { success: false, error: updateError.message };

  // Email
  const r = row as any;
  const { data: admins } = await supabase
    .from("employees")
    .select("email")
    .eq("org_id", r.org_id)
    .in("role", ["owner", "admin"])
    .eq("status", "active");
  if (admins && admins.length > 0) {
    try {
      const html = await render(
        CustomPlanRejectedEmail({
          orgName: r.organizations?.name ?? "your team",
          reason: args.reason,
        })
      );
      await resend.emails.send({
        from: NOREPLY_EMAIL_FROM,
        to: (admins as { email: string }[]).map((a) => a.email),
        subject: "JambaHR — Custom plan request update",
        html,
      });
    } catch (e) {
      console.warn("rejection email failed", e);
    }
  }

  revalidatePath("/superadmin");
  return { success: true, data: undefined };
}

// approveCustomPlan in Task 7 — needs Razorpay plan creation
```

- [ ] **Step 2: Hold commit until Task 6 + 7 + 9**

---

## Task 6: Superadmin Custom Plans tab UI

**Files:** Add a tab to `/superadmin` page

Project pattern: superadmin page is at `src/app/superadmin/page.tsx`. Inspect existing tab structure and add a Custom Plans tab. Each row exposes:
- Org name, slug
- Requested features (chips)
- Requested employees
- Requested cycle
- Editable: platform fee (default `PLATFORM_FEES.custom`), per-feature rate (default `CUSTOM_PER_FEATURE_DEFAULT_RATE`), max employees (default = requested), founder notes
- Buttons: Approve, Reject (modal w/ reason input), Counter-offer (uses the editable fields)

Implementation skipped here for brevity — see existing superadmin tabs for pattern (likely a server page with client child components calling the actions). Mirror them.

- [ ] **Step 1: Implement tab + commit T5 + T6 + T9 emails together**

---

## Task 7: Dynamic Razorpay plan creation on approve

**Files:** Add `approveCustomPlan` to `src/actions/superadmin.ts`

The flow: founder clicks Approve → action creates per-org Razorpay plan with the approved per-feature rate × employee count × cycle period → creates subscription with addons[platform_fee] → emails customer with checkout link → updates request to `approved`.

```ts
import { razorpay } from "@/lib/razorpay";
import { CustomPlanApprovedEmail } from "@/components/emails/custom-plan-approved";
import { computePlatformFeeDelta } from "@/config/billing";

export async function approveCustomPlan(args: { requestId: string }): Promise<ActionResult> {
  const ok = await assertSuperadmin();
  if (!ok.ok) return { success: false, error: ok.error };

  const supabase = createAdminSupabase();
  const { data: row, error: fetchError } = await supabase
    .from("custom_plan_requests")
    .select("id, org_id, requested_features, requested_employees, requested_billing_cycle, founder_platform_fee, founder_per_feature_rate, founder_max_employees, status, organizations:org_id(name, platform_fee_paid, stripe_subscription_id)")
    .eq("id", args.requestId)
    .single();
  if (fetchError || !row) return { success: false, error: fetchError?.message ?? "Request not found" };

  const r = row as any;
  if (r.status !== "pending" && r.status !== "accepted") {
    return { success: false, error: `Cannot approve a request in status '${r.status}'` };
  }

  const features: string[] = r.requested_features ?? [];
  const employees: number = Math.min(r.requested_employees, r.founder_max_employees ?? r.requested_employees);
  const cycle: "monthly" | "annual" = r.requested_billing_cycle;
  const perFeatureRate = r.founder_per_feature_rate ?? 12000;
  const platformFee = r.founder_platform_fee ?? 499900;
  const orgName = r.organizations?.name ?? "Custom org";
  const alreadyPaid = r.organizations?.platform_fee_paid ?? 0;
  const platformFeeDelta = computePlatformFeeDelta(platformFee, alreadyPaid);

  // Per-employee per-cycle amount for the Razorpay plan
  const perEmployeeMonthly = features.length * perFeatureRate;
  const planAmount = cycle === "annual" ? perEmployeeMonthly * 10 : perEmployeeMonthly;

  try {
    // 1. Cancel existing sub if any
    if (r.organizations?.stripe_subscription_id) {
      try {
        await razorpay.subscriptions.cancel(r.organizations.stripe_subscription_id, false);
      } catch (e) {
        console.warn("approveCustomPlan: cancel-old failed (continuing)", e);
      }
    }

    // 2. Create per-org Razorpay plan
    const plan = await (razorpay.plans as any).create({
      period: cycle === "annual" ? "yearly" : "monthly",
      interval: 1,
      item: {
        name: `JambaHR Custom — ${orgName}`,
        amount: planAmount,
        currency: "INR",
        description: `${features.length} features × ${cycle}`,
      },
      notes: {
        org_id: r.org_id,
        request_id: r.id,
      },
    });

    // 3. Create subscription
    const subParams: Record<string, unknown> = {
      plan_id: plan.id,
      quantity: employees,
      notes: {
        org_id: r.org_id,
        plan: "custom",
        cycle,
        platform_fee_delta: String(platformFeeDelta),
        custom_request_id: r.id,
      },
    };
    if (platformFeeDelta > 0) {
      subParams.addons = [{ item: { name: "Platform fee", amount: platformFeeDelta, currency: "INR" } }];
    }
    const subscription = await (razorpay.subscriptions.create as any)(subParams);

    // 4. Update request row
    await supabase
      .from("custom_plan_requests")
      .update({ status: "approved", reviewed_at: new Date().toISOString() } as any)
      .eq("id", args.requestId);

    // 5. Email customer with checkout link
    const checkoutUrl = (subscription as any).short_url ?? `https://rzp.io/i/${subscription.id}`;
    const { data: admins } = await supabase
      .from("employees")
      .select("email")
      .eq("org_id", r.org_id)
      .in("role", ["owner", "admin"])
      .eq("status", "active");
    if (admins && admins.length > 0) {
      try {
        const html = await render(
          CustomPlanApprovedEmail({
            orgName,
            features,
            employees,
            cycle,
            platformFee,
            perFeatureRate,
            checkoutUrl,
          })
        );
        await resend.emails.send({
          from: NOREPLY_EMAIL_FROM,
          to: (admins as { email: string }[]).map((a) => a.email),
          subject: "JambaHR — Your custom plan is approved",
          html,
        });
      } catch (e) {
        console.warn("approval email failed", e);
      }
    }

    revalidatePath("/superadmin");
    return { success: true, data: undefined };
  } catch (e: any) {
    console.error("approveCustomPlan failed", e);
    // Roll back to pending so founder can retry
    await supabase
      .from("custom_plan_requests")
      .update({ status: "pending", founder_notes: `Approval failed: ${e?.message ?? "unknown error"}. Retry.` } as any)
      .eq("id", args.requestId);
    return { success: false, error: e?.message ?? "Failed to approve" };
  }
}
```

- [ ] **Step 2: Bundle commit with Tasks 5/6/9**

---

## Task 8: Webhook handler for `plan='custom'`

**Files:** Modify `src/app/api/webhooks/razorpay/route.ts`

When `subscription.activated` fires for a custom subscription, write the custom_features / custom_per_feature_rate / custom_platform_fee / custom_max_employees from the request row.

- [ ] **Step 1: Extend the activated handler**

Modify the `subscription.activated` case to detect `planKey === "custom"`:

```ts
case "subscription.activated": {
  const subscription = event.payload.subscription.entity;
  const orgId = subscription.notes?.org_id;
  const planKey = subscription.notes?.plan;
  const cycle = subscription.notes?.cycle ?? "monthly";
  const platformFeeDelta = Number(subscription.notes?.platform_fee_delta ?? 0);
  const customRequestId = subscription.notes?.custom_request_id;

  if (orgId && planKey) {
    const { data: row } = await supabase
      .from("organizations")
      .select("platform_fee_paid")
      .eq("id", orgId)
      .single();
    const currentPaid = (row as { platform_fee_paid: number } | null)?.platform_fee_paid ?? 0;

    const baseUpdate: Record<string, unknown> = {
      stripe_subscription_id: subscription.id,
      plan: planKey,
      billing_cycle: cycle,
      subscription_status: "active",
      max_employees: planKey === "business" ? 500 : planKey === "growth" ? 200 : 200,
      platform_fee_paid: currentPaid + platformFeeDelta,
      subscription_paused_at: null,
    };

    if (planKey === "custom" && customRequestId) {
      const { data: req } = await supabase
        .from("custom_plan_requests")
        .select("requested_features, founder_per_feature_rate, founder_platform_fee, founder_max_employees, requested_employees")
        .eq("id", customRequestId)
        .single();
      if (req) {
        const reqRow = req as any;
        baseUpdate.custom_features = reqRow.requested_features ?? [];
        baseUpdate.custom_per_feature_rate = reqRow.founder_per_feature_rate ?? 12000;
        baseUpdate.custom_platform_fee = reqRow.founder_platform_fee ?? 499900;
        baseUpdate.custom_max_employees = reqRow.founder_max_employees ?? reqRow.requested_employees;
        baseUpdate.max_employees = reqRow.founder_max_employees ?? reqRow.requested_employees;
      }
      // Mark request as activated
      await supabase
        .from("custom_plan_requests")
        .update({ activated_at: new Date().toISOString() } as any)
        .eq("id", customRequestId);
    }

    await supabase.from("organizations").update(baseUpdate as any).eq("id", orgId);
  }
  break;
}
```

- [ ] **Step 2: Commit standalone**

```bash
git add src/app/api/webhooks/razorpay/route.ts
git commit -m "feat(webhook): handle plan='custom' activation — write custom_features and rates from request row"
```

---

## Task 9: 5 email templates

**Files:** 5 new files in `src/components/emails/`

Mirror existing template style (`subscription-paused.tsx`). Constants imported via `@react-email/components`.

- [ ] **Step 1: `custom-plan-request-received.tsx`** — to founder

Body: org name, feature count, employees, cycle, link to superadmin.

- [ ] **Step 2: `custom-plan-under-review.tsx`** — to customer (currently NOT used; transactional courtesy email; SKIP for v1, since the in-app banner covers it)

(Skip this one in code; the spec lists it but the in-app banner is sufficient.)

- [ ] **Step 3: `custom-plan-counter-offer.tsx`** — to customer

Shows the founder's modified terms + link to picker page to accept.

- [ ] **Step 4: `custom-plan-approved.tsx`** — to customer

Includes the Razorpay `short_url` checkout link.

- [ ] **Step 5: `custom-plan-rejected.tsx`** — to customer

Includes the rejection reason.

(Code skipped for plan brevity — straightforward React Email components mirroring `subscription-paused.tsx` shape.)

- [ ] **Step 6: Bundle commit T2-T9 with all email templates**

```bash
git add src/components/emails/custom-plan-*.tsx src/actions/custom-plan.ts src/actions/superadmin.ts src/app/dashboard/settings/custom-plan/page.tsx src/components/settings/custom-plan-*.tsx src/components/settings/billing-section.tsx src/app/superadmin/...
git commit -m "feat(custom-plan): customer picker, superadmin queue, dynamic Razorpay plan creation, 5 email templates"
```

---

## Task 10: `hasFeature()` supports custom plan

**Files:** Modify `src/config/plans.ts`

Currently `PLAN_FEATURES.custom = []`, so `hasFeature("custom", "documents")` always returns false — even after a customer's custom plan activates. Need a runtime check against `organizations.custom_features`.

- [ ] **Step 1: Add a runtime helper**

The cleanest fix: change `hasFeature` to accept an optional `customFeatures` array, and update all call sites that pass plan='custom' to also pass that.

```ts
export function hasFeature(
  plan: OrgPlan,
  feature: PlanFeature,
  customFeatures?: string[] | null
): boolean {
  if (plan === "custom") {
    return Array.isArray(customFeatures) && customFeatures.includes(feature);
  }
  return PLAN_FEATURES[plan].includes(feature);
}
```

- [ ] **Step 2: Update `getCurrentUser()` to pass `custom_features` along**

In `src/lib/current-user.ts`, when fetching the org, also select `custom_features`. Add a `customFeatures: string[] | null` field to the return shape.

- [ ] **Step 3: Update all `hasFeature(...)` call sites**

Grep for `hasFeature(`. For dashboard pages, pass `user?.customFeatures ?? null` as the third arg. For other contexts (e.g. UpgradeGate), the hard-coded plan check is fine.

- [ ] **Step 4: Type-check + commit**

```bash
git add src/config/plans.ts src/lib/current-user.ts src/app/dashboard/.../*.tsx
git commit -m "feat(plans): hasFeature supports custom plan via custom_features array"
```

---

## Task 11: Webhook events cleanup cron

**Files:**
- Create `src/app/api/cron/webhook-events-cleanup/route.ts`
- Modify `vercel.json` to add weekly cron

- [ ] **Step 1: Create the route**

```ts
import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createAdminSupabase();
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { error, count } = await supabase
    .from("webhook_events")
    .delete({ count: "exact" })
    .lt("processed_at", cutoff);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: count ?? 0 });
}
```

- [ ] **Step 2: Add to `vercel.json`**

```json
{ "path": "/api/cron/webhook-events-cleanup", "schedule": "0 5 * * 0" }
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/webhook-events-cleanup/route.ts vercel.json
git commit -m "feat(billing): weekly webhook_events cleanup cron — drop events older than 30 days"
```

---

## Task 12: End-of-phase verification

- [ ] `npx tsc --noEmit` — drift acceptable up to ~315
- [ ] `npm run build` — must say `✓ Compiled successfully` (page-data RESEND failure pre-existing)
- [ ] `git log --oneline main..HEAD` — confirm all task commits present
- [ ] Browser smoke (manual): visit `/dashboard/settings/custom-plan` (logged in as admin, currently on Starter); confirm picker renders, can submit; confirm `/superadmin` Custom Plans tab shows the new request

No push — user pushes when ready.

---

## Out of Scope (future)

- Refunds
- Promo codes / coupons
- Self-serve plan switching for Custom (founder approval gates all changes — by design)
- 7-day timeout on `accepted` requests (extend `billing-grace-period` cron later if accepted requests pile up)
- Migrating Razorpay tax-invoice config (gated by JambaHR's own GSTIN registration)
