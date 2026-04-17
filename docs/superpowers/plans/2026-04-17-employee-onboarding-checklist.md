# Employee Onboarding Checklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a soft-nudge onboarding checklist card to the employee dashboard, admin configuration in Settings, and an admin tracking tab on the Employees page.

**Architecture:** Completion is derived from whether employee data fields are filled (no separate progress table). Admin config is stored in `organizations.settings.onboarding_steps` JSONB. Shared types/constants live in `src/config/onboarding.ts` (no `"use server"`); server actions live in `src/actions/onboarding.ts`.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase (admin client), Clerk, Tailwind CSS, Radix UI Tabs, `lucide-react`

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/005_employee_emergency_contact.sql` | Create | Add emergency contact columns to employees |
| `src/types/database.types.ts` | Modify | Add emergency contact columns to Row/Insert/Update types |
| `src/config/onboarding.ts` | Create | Shared types, constants, `DEFAULT_ONBOARDING_STEPS` |
| `src/actions/onboarding.ts` | Create | `getOrgOnboardingConfig`, `getMyOnboardingStatus`, `getAllEmployeesOnboardingStatus` |
| `src/actions/settings.ts` | Modify | Add `updateOnboardingSteps` server action |
| `src/actions/profile.ts` | Modify | Add `updateEmergencyContact`, extend `EmployeeProfile` type |
| `src/components/profile/profile-client.tsx` | Modify | Add emergency contact section |
| `src/app/api/webhooks/clerk/route.ts` | Modify | Seed `onboarding_steps` defaults on org creation |
| `src/components/ui/tabs.tsx` | Create | Radix UI Tabs component (not yet in codebase) |
| `src/components/dashboard/onboarding-card.tsx` | Create | Employee-facing dashboard checklist card |
| `src/app/dashboard/page.tsx` | Modify | Fetch onboarding status, render `OnboardingCard` for employee role |
| `src/components/settings/onboarding-steps-section.tsx` | Create | Admin toggle UI for onboarding step config |
| `src/app/dashboard/settings/page.tsx` | Modify | Add `OnboardingStepsSection` |
| `src/components/dashboard/onboarding-tracking.tsx` | Create | Admin table showing per-employee onboarding completion |
| `src/app/dashboard/employees/page.tsx` | Modify | Fetch `getAllEmployeesOnboardingStatus`, pass to client |
| `src/components/dashboard/employees-client.tsx` | Modify | Add Directory/Onboarding tabs |

---

## Task 1: DB Migration — Emergency Contact Columns

**Files:**
- Create: `supabase/migrations/005_employee_emergency_contact.sql`
- Modify: `src/types/database.types.ts`

- [ ] **Step 1: Create the migration file**

```sql
-- Migration: 005_employee_emergency_contact
-- Adds emergency contact fields to employees table

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS emergency_contact_name         TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone        TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship TEXT;
```

Save to `supabase/migrations/005_employee_emergency_contact.sql`.

- [ ] **Step 2: Run migration via Supabase SQL Editor**

Go to Supabase Dashboard → SQL Editor → paste and run the SQL above.

Expected: "Success. No rows returned."

- [ ] **Step 3: Add columns to `src/types/database.types.ts`**

Find the `employees` table's `Row`, `Insert`, and `Update` type blocks. Add the three columns to each:

In `Row`:
```typescript
emergency_contact_name: string | null;
emergency_contact_phone: string | null;
emergency_contact_relationship: string | null;
```

In `Insert`:
```typescript
emergency_contact_name?: string | null;
emergency_contact_phone?: string | null;
emergency_contact_relationship?: string | null;
```

In `Update`:
```typescript
emergency_contact_name?: string | null;
emergency_contact_phone?: string | null;
emergency_contact_relationship?: string | null;
```

- [ ] **Step 4: Verify build passes**

```bash
npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/005_employee_emergency_contact.sql src/types/database.types.ts
git commit -m "feat: add emergency contact columns to employees table"
```

---

## Task 2: Shared Onboarding Config (`src/config/onboarding.ts`)

**Files:**
- Create: `src/config/onboarding.ts`

- [ ] **Step 1: Create the config file**

```typescript
// src/config/onboarding.ts
// No "use server" — this file is imported by both server actions and the Clerk webhook route.

export type OnboardingStepId =
  | "profile"
  | "photo"
  | "address"
  | "id_proof"
  | "emergency_contact"
  | "documents";

export type OnboardingStepConfig = {
  id: OnboardingStepId;
  enabled: boolean;
  required: boolean;
};

export type OnboardingStepStatus = OnboardingStepConfig & {
  label: string;
  complete: boolean;
  actionUrl: string;
};

export type OnboardingStatusResult = {
  steps: OnboardingStepStatus[];
  totalEnabled: number;
  totalComplete: number;
  allRequiredComplete: boolean;
};

export type EmployeeOnboardingSummary = {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  department_id: string | null;
  created_at: string;
  totalEnabled: number;
  totalComplete: number;
  allRequiredComplete: boolean;
};

export const DEFAULT_ONBOARDING_STEPS: OnboardingStepConfig[] = [
  { id: "profile",           enabled: true,  required: true  },
  { id: "photo",             enabled: true,  required: false },
  { id: "address",           enabled: true,  required: true  },
  { id: "id_proof",          enabled: true,  required: true  },
  { id: "emergency_contact", enabled: true,  required: false },
  { id: "documents",         enabled: false, required: false },
];

export const STEP_LABELS: Record<OnboardingStepId, string> = {
  profile:           "Complete your profile",
  photo:             "Upload a profile photo",
  address:           "Add your address",
  id_proof:          "Upload ID proof (PAN or Aadhaar)",
  emergency_contact: "Add emergency contact",
  documents:         "Acknowledge company documents",
};

export const STEP_ACTION_URLS: Record<OnboardingStepId, string> = {
  profile:           "/dashboard/profile",
  photo:             "/dashboard/profile",
  address:           "/dashboard/profile",
  id_proof:          "/dashboard/profile",
  emergency_contact: "/dashboard/profile",
  documents:         "/dashboard/documents",
};
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add src/config/onboarding.ts
git commit -m "feat: add onboarding config types and defaults"
```

---

## Task 3: Onboarding Server Actions (`src/actions/onboarding.ts`)

**Files:**
- Create: `src/actions/onboarding.ts`

- [ ] **Step 1: Create the file**

```typescript
"use server";

import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import type { ActionResult } from "@/types";
import {
  DEFAULT_ONBOARDING_STEPS,
  STEP_LABELS,
  STEP_ACTION_URLS,
  type OnboardingStepConfig,
  type OnboardingStepId,
  type OnboardingStepStatus,
  type OnboardingStatusResult,
  type EmployeeOnboardingSummary,
} from "@/config/onboarding";
import { getMyProfile } from "@/actions/profile";

// ---- Helpers ----

export async function getOrgOnboardingConfig(): Promise<OnboardingStepConfig[]> {
  const user = await getCurrentUser();
  if (!user) return DEFAULT_ONBOARDING_STEPS;

  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", user.orgId)
    .single();

  const steps = (data as any)?.settings?.onboarding_steps;
  if (!Array.isArray(steps) || steps.length === 0) return DEFAULT_ONBOARDING_STEPS;
  return steps as OnboardingStepConfig[];
}

type EmployeeFields = {
  phone: string | null;
  personal_email: string | null;
  avatar_url: string | null;
  communication_address: unknown;
  pan_number: string | null;
  aadhar_number: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
};

function computeStepComplete(
  stepId: OnboardingStepId,
  employee: EmployeeFields,
  docAckCount: number
): boolean {
  switch (stepId) {
    case "profile":
      return !!(employee.phone && employee.personal_email);
    case "photo":
      return !!employee.avatar_url;
    case "address":
      return !!employee.communication_address;
    case "id_proof":
      return !!(employee.pan_number || employee.aadhar_number);
    case "emergency_contact":
      return !!(employee.emergency_contact_name && employee.emergency_contact_phone);
    case "documents":
      return docAckCount > 0;
  }
}

function buildOnboardingResult(
  employee: EmployeeFields,
  docAckCount: number,
  steps: OnboardingStepConfig[]
): OnboardingStatusResult {
  const enabledSteps = steps.filter((s) => s.enabled);

  const stepsWithStatus: OnboardingStepStatus[] = enabledSteps.map((s) => ({
    ...s,
    label: STEP_LABELS[s.id],
    actionUrl: STEP_ACTION_URLS[s.id],
    complete: computeStepComplete(s.id, employee, docAckCount),
  }));

  const totalEnabled = stepsWithStatus.length;
  const totalComplete = stepsWithStatus.filter((s) => s.complete).length;
  const allRequiredComplete = stepsWithStatus
    .filter((s) => s.required)
    .every((s) => s.complete);

  return { steps: stepsWithStatus, totalEnabled, totalComplete, allRequiredComplete };
}

// ---- Public actions ----

export async function getMyOnboardingStatus(): Promise<ActionResult<OnboardingStatusResult>> {
  const profileResult = await getMyProfile();
  if (!profileResult.success) return { success: false, error: profileResult.error };

  const profile = profileResult.data;
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const [configResult, acksResult] = await Promise.all([
    getOrgOnboardingConfig(),
    supabase
      .from("document_acknowledgments")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", profile.id),
  ]);

  const docAckCount = acksResult.count ?? 0;
  const result = buildOnboardingResult(profile, docAckCount, configResult);

  return { success: true, data: result };
}

export async function getAllEmployeesOnboardingStatus(): Promise<
  ActionResult<EmployeeOnboardingSummary[]>
> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };

  const supabase = createAdminSupabase();

  const [empResult, acksResult, steps] = await Promise.all([
    supabase
      .from("employees")
      .select(
        "id, first_name, last_name, avatar_url, department_id, created_at, phone, personal_email, communication_address, pan_number, aadhar_number, emergency_contact_name, emergency_contact_phone"
      )
      .eq("org_id", user.orgId)
      .eq("status", "active")
      .order("first_name"),
    supabase
      .from("document_acknowledgments")
      .select("employee_id"),
    getOrgOnboardingConfig(),
  ]);

  if (empResult.error) return { success: false, error: empResult.error.message };

  const employees = empResult.data ?? [];

  // Build a set of employee_ids scoped to this org that have at least one ack
  const orgEmployeeIds = new Set(employees.map((e) => e.id));
  const ackedIds = new Set(
    (acksResult.data ?? [])
      .map((a) => a.employee_id)
      .filter((id) => orgEmployeeIds.has(id))
  );

  const summaries: EmployeeOnboardingSummary[] = employees.map((emp) => {
    const docAckCount = ackedIds.has(emp.id) ? 1 : 0;
    const { totalEnabled, totalComplete, allRequiredComplete } = buildOnboardingResult(
      emp as EmployeeFields,
      docAckCount,
      steps
    );
    return {
      id: emp.id,
      first_name: emp.first_name,
      last_name: emp.last_name,
      avatar_url: emp.avatar_url,
      department_id: emp.department_id,
      created_at: emp.created_at,
      totalEnabled,
      totalComplete,
      allRequiredComplete,
    };
  });

  return { success: true, data: summaries };
}
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add src/actions/onboarding.ts
git commit -m "feat: add onboarding status server actions"
```

---

## Task 4: Write Actions — `updateOnboardingSteps` + `updateEmergencyContact`

**Files:**
- Modify: `src/actions/settings.ts`
- Modify: `src/actions/profile.ts`

- [ ] **Step 1: Add `updateOnboardingSteps` to `src/actions/settings.ts`**

At the bottom of `src/actions/settings.ts`, add:

```typescript
import type { OnboardingStepConfig } from "@/config/onboarding";

export async function updateOnboardingSteps(
  steps: OnboardingStepConfig[]
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can update onboarding settings" };

  const supabase = createAdminSupabase();
  const { data: org } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", user.orgId)
    .single();

  const currentSettings = (org as any)?.settings ?? {};
  const newSettings = { ...currentSettings, onboarding_steps: steps };

  const { error } = await supabase
    .from("organizations")
    .update({ settings: newSettings })
    .eq("id", user.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/settings");
  return { success: true, data: undefined };
}
```

Note: `revalidatePath`, `getCurrentUser`, `isAdmin`, `createAdminSupabase` are already imported at the top of settings.ts. Just add the `OnboardingStepConfig` import and the function.

- [ ] **Step 2: Extend `EmployeeProfile` type in `src/actions/profile.ts`**

Find the `EmployeeProfile` type definition (line ~18) and add the emergency contact fields:

```typescript
export type EmployeeProfile = Employee & {
  personal_email: string | null;
  // ... existing fields ...
  pan_number: string | null;
  aadhar_number: string | null;
  communication_address: Address | null;
  permanent_address: Address | null;
  // Add these:
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;
};
```

- [ ] **Step 3: Add `updateEmergencyContact` to `src/actions/profile.ts`**

At the bottom of `src/actions/profile.ts`, add:

```typescript
const emergencyContactSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(1, "Phone is required"),
  relationship: z.string().optional(),
});

export async function updateEmergencyContact(
  formData: z.infer<typeof emergencyContactSchema>
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const validated = emergencyContactSchema.safeParse(formData);
  if (!validated.success) return { success: false, error: validated.error.errors[0].message };

  const d = validated.data;
  const supabase = createAdminSupabase();

  // Find employee record for this user
  const { data: emp } = await supabase
    .from("employees")
    .select("id")
    .eq("org_id", user.orgId)
    .eq("clerk_user_id", user.clerkUserId)
    .neq("status", "terminated")
    .single();

  if (!emp) return { success: false, error: "Employee record not found" };

  const { error } = await supabase
    .from("employees")
    .update({
      emergency_contact_name: d.name,
      emergency_contact_phone: d.phone,
      emergency_contact_relationship: d.relationship || null,
    })
    .eq("id", (emp as { id: string }).id)
    .eq("org_id", user.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/profile");
  return { success: true, data: undefined };
}
```

Note: `z`, `getCurrentUser`, `createAdminSupabase`, `revalidatePath`, `ActionResult` are already imported at the top of profile.ts.

- [ ] **Step 4: Verify build passes**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add src/actions/settings.ts src/actions/profile.ts
git commit -m "feat: add updateOnboardingSteps and updateEmergencyContact actions"
```

---

## Task 5: Emergency Contact Section in Profile Client

**Files:**
- Modify: `src/components/profile/profile-client.tsx`

- [ ] **Step 1: Add emergency contact fields to the `form` state**

Find the `useState` call that initializes `form` (around line 36). Add three fields to the state object:

```typescript
const [form, setForm] = React.useState({
  // ... existing fields ...
  emergencyContactName: profile.emergency_contact_name ?? "",
  emergencyContactPhone: profile.emergency_contact_phone ?? "",
  emergencyContactRelationship: profile.emergency_contact_relationship ?? "",
});
```

- [ ] **Step 2: Add emergency contact fields to the save handler**

Find where `updateMyProfile` is called (the save function). The emergency contact is saved via a separate action `updateEmergencyContact`. Call it alongside the existing profile update:

```typescript
// Add this import at the top of the file:
import { updateMyProfile, updateEmergencyContact } from "@/actions/profile";

// In the save handler, after calling updateMyProfile:
const [profileRes, emergencyRes] = await Promise.all([
  updateMyProfile({ /* existing fields */ }),
  updateEmergencyContact({
    name: form.emergencyContactName,
    phone: form.emergencyContactPhone,
    relationship: form.emergencyContactRelationship,
  }),
]);
if (!profileRes.success) { toast.error(profileRes.error); return; }
if (!emergencyRes.success) { toast.error(emergencyRes.error); return; }
toast.success("Profile updated");
setEditing(false);
```

Note: if the existing save handler only calls `updateMyProfile`, replace it with the `Promise.all` pattern above. Keep all existing fields passed to `updateMyProfile`.

- [ ] **Step 3: Add Emergency Contact section to the JSX**

After the closing `</Section>` of the "Biographical Information" section (around line 253), add:

```tsx
<Section title="Emergency Contact">
  <Field label="Name">
    {editing
      ? <input className={inputCn} value={form.emergencyContactName} onChange={(e) => setField("emergencyContactName", e.target.value)} placeholder="Full name" />
      : <Value>{profile.emergency_contact_name}</Value>}
  </Field>
  <Field label="Phone">
    {editing
      ? <input type="tel" className={inputCn} value={form.emergencyContactPhone} onChange={(e) => setField("emergencyContactPhone", e.target.value)} placeholder="+91 98765 43210" />
      : <Value>{profile.emergency_contact_phone}</Value>}
  </Field>
  <Field label="Relationship">
    {editing
      ? <input className={inputCn} value={form.emergencyContactRelationship} onChange={(e) => setField("emergencyContactRelationship", e.target.value)} placeholder="e.g. Spouse, Parent, Sibling" />
      : <Value>{profile.emergency_contact_relationship}</Value>}
  </Field>
</Section>
```

Note: `Section`, `Field`, `Value`, `inputCn` are already defined in this file. Use the exact same pattern as the other sections.

- [ ] **Step 4: Verify build passes**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add src/components/profile/profile-client.tsx
git commit -m "feat: add emergency contact section to employee profile"
```

---

## Task 6: Seed Default Onboarding Config in Clerk Webhook

**Files:**
- Modify: `src/app/api/webhooks/clerk/route.ts`

- [ ] **Step 1: Import `DEFAULT_ONBOARDING_STEPS` at the top of the webhook route**

Find the imports section and add:

```typescript
import { DEFAULT_ONBOARDING_STEPS } from "@/config/onboarding";
```

- [ ] **Step 2: Update the `organization.created` handler to seed onboarding config**

Find the line `settings: {},` inside the `organization.created` case (around line 104). Replace it with:

```typescript
settings: { onboarding_steps: DEFAULT_ONBOARDING_STEPS },
```

This seeds the default step config for every new org so `getOrgOnboardingConfig()` reads it directly instead of falling back.

- [ ] **Step 3: Verify build passes**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/webhooks/clerk/route.ts
git commit -m "feat: seed default onboarding_steps config on org creation"
```

---

## Task 7: Tabs UI Component

**Files:**
- Create: `src/components/ui/tabs.tsx`

- [ ] **Step 1: Create `src/components/ui/tabs.tsx`**

```typescript
"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
      className
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow",
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-4 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/tabs.tsx
git commit -m "feat: add Tabs UI component (Radix UI)"
```

---

## Task 8: Employee Onboarding Dashboard Card

**Files:**
- Create: `src/components/dashboard/onboarding-card.tsx`
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Create `src/components/dashboard/onboarding-card.tsx`**

```tsx
"use client";

import Link from "next/link";
import { CheckCircle2, Circle, ChevronRight, PartyPopper } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OnboardingStatusResult } from "@/config/onboarding";

export function OnboardingCard({ status }: { status: OnboardingStatusResult }) {
  // Don't render if all required steps are done
  if (status.allRequiredComplete && status.totalComplete === status.totalEnabled) {
    return null;
  }

  const progressPct =
    status.totalEnabled > 0
      ? Math.round((status.totalComplete / status.totalEnabled) * 100)
      : 100;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            Complete your setup
          </p>
          <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
            {status.totalComplete} of {status.totalEnabled} steps done
          </p>
          {/* Progress bar */}
          <div className="mt-2 h-1.5 w-full rounded-full bg-amber-200 dark:bg-amber-800">
            <div
              className="h-1.5 rounded-full bg-amber-500 transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
        {status.allRequiredComplete && (
          <PartyPopper className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
        )}
      </div>

      <ul className="mt-3 space-y-1.5">
        {status.steps.map((step) => (
          <li key={step.id}>
            {step.complete ? (
              <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                <span className="line-through opacity-60">{step.label}</span>
                {step.required && (
                  <span className="ml-auto text-xs text-green-600 font-medium">Done</span>
                )}
              </div>
            ) : (
              <Link
                href={step.actionUrl}
                className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200 hover:text-primary transition-colors"
              >
                <Circle className="h-4 w-4 text-amber-400 shrink-0" />
                <span>{step.label}</span>
                {step.required && (
                  <span className="ml-auto text-xs text-amber-600 font-medium shrink-0">Required</span>
                )}
                <ChevronRight className={cn("h-3 w-3 shrink-0", step.required ? "" : "ml-auto")} />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Wire `OnboardingCard` into the dashboard page**

In `src/app/dashboard/page.tsx`:

a) Add import at the top:
```typescript
import { getMyOnboardingStatus } from "@/actions/onboarding";
import { OnboardingCard } from "@/components/dashboard/onboarding-card";
import type { OnboardingStatusResult } from "@/config/onboarding";
```

b) In `DashboardPage`, after `const data = await getDashboardData();`, add:
```typescript
// Fetch onboarding status for employee role only
let onboardingStatus: OnboardingStatusResult | null = null;
if (data.userRole === "employee") {
  const onboardingResult = await getMyOnboardingStatus();
  if (onboardingResult.success) onboardingStatus = onboardingResult.data;
}
```

c) In the JSX, after the announcement banners block and before the stat cards block, add:
```tsx
{/* Onboarding card — employee only, shown until all required steps done */}
{onboardingStatus && !onboardingStatus.allRequiredComplete && (
  <OnboardingCard status={onboardingStatus} />
)}
```

- [ ] **Step 3: Verify build passes**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/onboarding-card.tsx src/app/dashboard/page.tsx
git commit -m "feat: add employee onboarding checklist card to dashboard"
```

---

## Task 9: Admin Onboarding Steps Settings Section

**Files:**
- Create: `src/components/settings/onboarding-steps-section.tsx`
- Modify: `src/app/dashboard/settings/page.tsx`

- [ ] **Step 1: Create `src/components/settings/onboarding-steps-section.tsx`**

```tsx
"use client";

import React from "react";
import { toast } from "sonner";
import { updateOnboardingSteps } from "@/actions/settings";
import { STEP_LABELS, DEFAULT_ONBOARDING_STEPS, type OnboardingStepConfig } from "@/config/onboarding";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export function OnboardingStepsSection({
  initialSteps,
}: {
  initialSteps: OnboardingStepConfig[];
}) {
  const [steps, setSteps] = React.useState<OnboardingStepConfig[]>(initialSteps);
  const [saving, setSaving] = React.useState(false);

  // Merge with defaults to ensure all step IDs are present
  const allSteps = DEFAULT_ONBOARDING_STEPS.map((def) => {
    return steps.find((s) => s.id === def.id) ?? def;
  });

  function toggleEnabled(id: OnboardingStepConfig["id"]) {
    setSteps((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, enabled: !s.enabled, required: s.enabled ? false : s.required }
          : s
      )
    );
  }

  function toggleRequired(id: OnboardingStepConfig["id"]) {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, required: !s.required } : s))
    );
  }

  async function handleSave() {
    setSaving(true);
    const result = await updateOnboardingSteps(allSteps);
    setSaving(false);
    if (result.success) {
      toast.success("Onboarding steps updated");
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Employee Onboarding Checklist</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Choose which steps appear in new employees&apos; onboarding checklist.
          Required steps must be completed to dismiss the card.
        </p>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-border">
          {allSteps.map((step) => (
            <div key={step.id} className="flex items-center justify-between py-3 gap-4">
              <p className="text-sm font-medium">{STEP_LABELS[step.id]}</p>
              <div className="flex items-center gap-6 shrink-0">
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={step.enabled}
                    onChange={() => toggleEnabled(step.id)}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                  Enabled
                </label>
                <label className={`flex items-center gap-2 text-xs cursor-pointer select-none ${!step.enabled ? "opacity-40 pointer-events-none" : "text-muted-foreground"}`}>
                  <input
                    type="checkbox"
                    checked={step.required}
                    onChange={() => toggleRequired(step.id)}
                    disabled={!step.enabled}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                  Required
                </label>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Wire `OnboardingStepsSection` into the settings page**

In `src/app/dashboard/settings/page.tsx`:

a) Add import:
```typescript
import { OnboardingStepsSection } from "@/components/settings/onboarding-steps-section";
import { getOrgOnboardingConfig } from "@/actions/onboarding";
```

b) In the `Promise.all` block, add `getOrgOnboardingConfig()`:
```typescript
const [departmentsResult, profileResult, policiesResult, userCtx, onboardingSteps] = await Promise.all([
  listDepartments(),
  getOrgProfile(),
  listSettingsPolicies(),
  getCurrentUser(),
  getOrgOnboardingConfig(),
]);
```

c) In the JSX, after `<ProductsSection ... />`, add:
```tsx
<OnboardingStepsSection initialSteps={onboardingSteps} />
```

- [ ] **Step 3: Verify build passes**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/onboarding-steps-section.tsx src/app/dashboard/settings/page.tsx
git commit -m "feat: add admin onboarding steps configuration in settings"
```

---

## Task 10: Admin Onboarding Tracking Tab on Employees Page

**Files:**
- Create: `src/components/dashboard/onboarding-tracking.tsx`
- Modify: `src/app/dashboard/employees/page.tsx`
- Modify: `src/components/dashboard/employees-client.tsx`

- [ ] **Step 1: Create `src/components/dashboard/onboarding-tracking.tsx`**

```tsx
"use client";

import React from "react";
import { cn, getInitials, formatDate } from "@/lib/utils";
import type { EmployeeOnboardingSummary } from "@/config/onboarding";

type Filter = "all" | "complete" | "in_progress" | "not_started";

function getStatus(s: EmployeeOnboardingSummary): Filter {
  if (s.totalEnabled === 0) return "complete";
  if (s.totalComplete === 0) return "not_started";
  if (s.allRequiredComplete && s.totalComplete === s.totalEnabled) return "complete";
  return "in_progress";
}

const STATUS_LABELS: Record<string, string> = {
  complete: "Complete",
  in_progress: "In Progress",
  not_started: "Not Started",
};

const STATUS_COLORS: Record<string, string> = {
  complete: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  in_progress: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  not_started: "bg-muted text-muted-foreground",
};

export function OnboardingTracking({
  data,
  search,
}: {
  data: EmployeeOnboardingSummary[];
  search: string;
}) {
  const [filter, setFilter] = React.useState<Filter>("all");

  const filtered = data.filter((emp) => {
    const matchesSearch =
      search === "" ||
      `${emp.first_name} ${emp.last_name}`.toLowerCase().includes(search.toLowerCase());
    const status = getStatus(emp);
    const matchesFilter = filter === "all" || status === filter;
    return matchesSearch && matchesFilter;
  });

  const counts = {
    all: data.length,
    complete: data.filter((e) => getStatus(e) === "complete").length,
    in_progress: data.filter((e) => getStatus(e) === "in_progress").length,
    not_started: data.filter((e) => getStatus(e) === "not_started").length,
  };

  return (
    <div className="space-y-4">
      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {(["all", "complete", "in_progress", "not_started"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filter === f
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:border-primary/40"
            )}
          >
            {f === "all" ? "All" : STATUS_LABELS[f]} ({counts[f]})
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Employee</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Joined</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Steps</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                  No employees match this filter.
                </td>
              </tr>
            ) : (
              filtered.map((emp) => {
                const status = getStatus(emp);
                return (
                  <tr key={emp.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">
                          {getInitials(emp.first_name, emp.last_name)}
                        </div>
                        <span className="font-medium">
                          {emp.first_name} {emp.last_name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(emp.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 rounded-full bg-muted">
                          <div
                            className="h-1.5 rounded-full bg-primary transition-all"
                            style={{
                              width: emp.totalEnabled > 0
                                ? `${Math.round((emp.totalComplete / emp.totalEnabled) * 100)}%`
                                : "100%",
                            }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {emp.totalComplete}/{emp.totalEnabled}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_COLORS[status])}>
                        {STATUS_LABELS[status]}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `src/app/dashboard/employees/page.tsx` to fetch onboarding data**

Current file (28 lines). Replace the full content with:

```tsx
import { listEmployees } from "@/actions/employees";
import { listDepartments } from "@/actions/departments";
import { getAllEmployeesOnboardingStatus } from "@/actions/onboarding";
import { EmployeesClient } from "@/components/dashboard/employees-client";
import { getCurrentUser, isAdmin } from "@/lib/current-user";

export default async function EmployeesPage() {
  const [employeesResult, departmentsResult, userCtx] = await Promise.all([
    listEmployees(),
    listDepartments(),
    getCurrentUser(),
  ]);

  const employees = employeesResult.success ? employeesResult.data : [];
  const departments = departmentsResult.success ? departmentsResult.data : [];
  const role = userCtx?.role ?? "employee";

  // Only fetch onboarding data for admins/owners — employees see own card on dashboard
  const onboardingResult =
    isAdmin(role) ? await getAllEmployeesOnboardingStatus() : null;
  const onboardingData = onboardingResult?.success ? onboardingResult.data : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Employees</h1>
        <p className="mt-1 text-muted-foreground">
          Manage your team members, roles, and onboarding progress.
        </p>
      </div>
      <EmployeesClient
        employees={employees}
        departments={departments}
        role={role}
        onboardingData={onboardingData}
      />
    </div>
  );
}
```

- [ ] **Step 3: Add Directory/Onboarding tabs to `src/components/dashboard/employees-client.tsx`**

a) Add imports at the top:
```typescript
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { OnboardingTracking } from "./onboarding-tracking";
import type { EmployeeOnboardingSummary } from "@/config/onboarding";
import { isAdmin as checkIsAdmin } from "@/lib/current-user";
```

Note: `isAdmin` from `@/lib/current-user` is a regular (non-async) helper function used client-side only for UI guards. It accepts a role string and returns boolean. Check if it's exported as a plain function (it is: `export function isAdmin(role: UserRole): boolean`). Import it with an alias to avoid naming collision with any local variable.

b) Update `EmployeesClientProps` to add `onboardingData`:
```typescript
interface EmployeesClientProps {
  employees: Employee[];
  departments: { id: string; name: string }[];
  role: UserRole;
  onboardingData: EmployeeOnboardingSummary[];
}
```

c) Update the function signature:
```typescript
export function EmployeesClient({ employees, departments, role, onboardingData }: EmployeesClientProps) {
```

d) Wrap the existing return JSX in `<Tabs defaultValue="directory">`. Replace the outermost `<div className="space-y-4">` with:

```tsx
return (
  <Tabs defaultValue="directory">
    {/* Only admins see the Onboarding tab */}
    {checkIsAdmin(role) && (
      <TabsList className="mb-4">
        <TabsTrigger value="directory">Directory</TabsTrigger>
        <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
      </TabsList>
    )}

    <TabsContent value="directory">
      <div className="space-y-4">
        {/* --- existing toolbar and table JSX stays exactly as-is --- */}
      </div>
    </TabsContent>

    {checkIsAdmin(role) && (
      <TabsContent value="onboarding">
        <OnboardingTracking data={onboardingData} search={search} />
      </TabsContent>
    )}
  </Tabs>
);
```

The search state (`search`) already exists in `EmployeesClient` — pass it through to `OnboardingTracking` so the search bar filters both tabs.

- [ ] **Step 4: Verify build passes**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/onboarding-tracking.tsx src/app/dashboard/employees/page.tsx src/components/dashboard/employees-client.tsx
git commit -m "feat: add onboarding tracking tab to employees page"
```

---

## Self-Review

### Spec coverage check
| Spec requirement | Task |
|-----------------|------|
| Soft nudge dashboard card for employees | Task 8 |
| Progress bar + step list with action links | Task 8 |
| Card hides when all required steps complete | Task 8 — `allRequiredComplete` check |
| Emergency contact step | Tasks 1, 4, 5 |
| Completion derived from existing data | Task 3 — `computeStepComplete` |
| Admin toggle enabled/required per step | Task 9 |
| Config stored in `organizations.settings` JSONB | Tasks 4, 6 |
| Default config seeded on org creation | Task 6 |
| Admin tracking table with filter chips | Task 10 |
| Progress bar + status per employee | Task 10 |
| Search applies to tracking tab | Task 10 — passes `search` prop |
| Existing orgs fall back to defaults | Task 3 — `getOrgOnboardingConfig` returns `DEFAULT_ONBOARDING_STEPS` when key missing |

### Placeholder scan
No TBDs or incomplete steps found.

### Type consistency
- `OnboardingStepConfig`, `OnboardingStepId`, `EmployeeOnboardingSummary` defined in Task 2 (`src/config/onboarding.ts`) and used consistently in Tasks 3, 8, 9, 10.
- `buildOnboardingResult` defined in Task 3 and used for both `getMyOnboardingStatus` and `getAllEmployeesOnboardingStatus`.
- `updateOnboardingSteps` defined in Task 4 and imported in Task 9 settings section.
- `getOrgOnboardingConfig` defined in Task 3 and imported in Tasks 6 (settings page) and 9 (employees page).
