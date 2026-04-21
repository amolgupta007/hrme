# Settings Collapsible Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the five stacked settings sections (Leave Policies, Departments, Products & Features, Onboarding Steps, Fingerprint) collapsible so the settings page loads as a compact list of cards — all collapsed by default, one expands at a time.

**Architecture:** A reusable `CollapsibleSection` wrapper provides the outer card shell and a header row with "Manage ›" / "Close ✕" toggle button. A thin `SettingsContent` client component holds accordion state (`openSection: string | null`) and wraps each section. The server page fetches data unchanged and passes it all down to `SettingsContent`. Each of the five existing section components has its outer card wrapper removed (a one-line change each) so they render content-only inside `CollapsibleSection`.

**Tech Stack:** Next.js 14 App Router, React useState, Tailwind CSS (max-height transition), lucide-react icons, existing section components unchanged except outer card wrapper removal.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/components/settings/collapsible-section.tsx` | Outer card shell + animated header + toggle button |
| Create | `src/components/settings/settings-content.tsx` | Client wrapper holding `openSection` accordion state |
| Modify | `src/app/dashboard/settings/page.tsx` | Pass all data to `<SettingsContent>` instead of rendering sections directly |
| Modify | `src/components/settings/leave-policies-section.tsx` | Strip outer `rounded-xl border bg-card` wrapper |
| Modify | `src/components/settings/departments-section.tsx` | Strip outer `rounded-xl border bg-card` wrapper |
| Modify | `src/components/settings/products-section.tsx` | Strip outer `rounded-xl border bg-card` wrapper |
| Modify | `src/components/settings/onboarding-steps-section.tsx` | Replace `<Card>` with fragment |
| Modify | `src/components/settings/fingerprint-section.tsx` | Replace `<Card>` with fragment |

---

## Task 1: Create CollapsibleSection wrapper

**Files:**
- Create: `src/components/settings/collapsible-section.tsx`

- [ ] **Step 1: Create `src/components/settings/collapsible-section.tsx`**

```typescript
"use client";

import React from "react";

type CollapsibleSectionProps = {
  title: string;
  icon: React.ReactNode;
  summary: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
};

export function CollapsibleSection({
  title,
  icon,
  summary,
  isOpen,
  onToggle,
  children,
}: CollapsibleSectionProps) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          {icon}
          <div>
            <h3 className="font-semibold text-sm">{title}</h3>
            {!isOpen && (
              <p className="text-xs text-muted-foreground mt-0.5">{summary}</p>
            )}
          </div>
        </div>
        <button
          onClick={onToggle}
          className="shrink-0 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
        >
          {isOpen ? "Close ✕" : "Manage ›"}
        </button>
      </div>
      <div
        className={`overflow-hidden transition-all duration-200 ${
          isOpen ? "max-h-[3000px]" : "max-h-0"
        }`}
      >
        <div className="border-t border-border">
          {children}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build passes**

```bash
cd C:\Users\amolg\Downloads\hr-portal && npm run build
```

Expected: compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/collapsible-section.tsx
git commit -m "feat(settings): add CollapsibleSection wrapper component"
```

---

## Task 2: Strip outer card wrappers from section components

**Files:**
- Modify: `src/components/settings/leave-policies-section.tsx`
- Modify: `src/components/settings/departments-section.tsx`
- Modify: `src/components/settings/products-section.tsx`
- Modify: `src/components/settings/onboarding-steps-section.tsx`
- Modify: `src/components/settings/fingerprint-section.tsx`

Each section currently wraps its content in an outer card. `CollapsibleSection` now provides that shell, so each section just needs to render its content directly.

- [ ] **Step 1: Strip outer card from `leave-policies-section.tsx`**

Find this line in `src/components/settings/leave-policies-section.tsx` (the `return` statement's first `div`):
```tsx
    <div className="rounded-xl border border-border bg-card p-6">
```

Replace with:
```tsx
    <div className="p-6">
```

- [ ] **Step 2: Strip outer card from `departments-section.tsx`**

Find this line in `src/components/settings/departments-section.tsx`:
```tsx
    <div className="rounded-xl border border-border bg-card p-6">
```

Replace with:
```tsx
    <div className="p-6">
```

- [ ] **Step 3: Strip outer card from `products-section.tsx`**

Find this line in `src/components/settings/products-section.tsx`:
```tsx
    <div className="rounded-xl border border-border bg-card p-6">
```

Replace with:
```tsx
    <div className="p-6">
```

- [ ] **Step 4: Replace `<Card>` with fragment in `onboarding-steps-section.tsx`**

In `src/components/settings/onboarding-steps-section.tsx`, the return statement currently is:
```tsx
  return (
    <Card>
      <CardHeader>
        <CardTitle>Employee Onboarding Checklist</CardTitle>
      </CardHeader>
      <CardContent>
```

Replace `<Card>` opening tag and its closing `</Card>` with a React fragment. The full change:

1. Change the import line from:
```typescript
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
```
To:
```typescript
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
```

2. In the return statement, change:
```tsx
  return (
    <Card>
      <CardHeader>
```
To:
```tsx
  return (
    <>
      <CardHeader>
```

3. Change the closing tag from:
```tsx
    </Card>
  );
```
To:
```tsx
    </>
  );
```

- [ ] **Step 5: Replace `<Card>` with fragment in `fingerprint-section.tsx`**

In `src/components/settings/fingerprint-section.tsx`, the return statement currently is:
```tsx
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
```

Apply the same three-part change as Step 4:

1. Change the import line from:
```typescript
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
```
To:
```typescript
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
```

2. In the return statement, change:
```tsx
  return (
    <Card>
      <CardHeader>
```
To:
```tsx
  return (
    <>
      <CardHeader>
```

3. Change the closing tag from:
```tsx
    </Card>
  );
```
To:
```tsx
    </>
  );
```

- [ ] **Step 6: Verify build passes**

```bash
npm run build
```

Expected: compiles without errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/settings/leave-policies-section.tsx
git add src/components/settings/departments-section.tsx
git add src/components/settings/products-section.tsx
git add src/components/settings/onboarding-steps-section.tsx
git add src/components/settings/fingerprint-section.tsx
git commit -m "refactor(settings): strip outer card wrappers from section components"
```

---

## Task 3: Create SettingsContent client wrapper

**Files:**
- Create: `src/components/settings/settings-content.tsx`

This component holds accordion state and renders all five collapsible sections. The server page will pass all data down to it.

- [ ] **Step 1: Create `src/components/settings/settings-content.tsx`**

```typescript
"use client";

import React from "react";
import {
  CalendarDays,
  Building2,
  Settings,
  ClipboardList,
  Fingerprint,
} from "lucide-react";
import { CollapsibleSection } from "@/components/settings/collapsible-section";
import { LeavePoliciesSection } from "@/components/settings/leave-policies-section";
import { DepartmentsSection } from "@/components/settings/departments-section";
import { ProductsSection } from "@/components/settings/products-section";
import { OnboardingStepsSection } from "@/components/settings/onboarding-steps-section";
import { FingerprintSection } from "@/components/settings/fingerprint-section";
import type { LeavePolicy, Department } from "@/types";
import type { OnboardingStepConfig } from "@/config/onboarding";
import type { FingerprintConfig, EmployeeWithDeviceCode } from "@/actions/fingerprint";

type UserCtx = {
  role: string;
} | null;

type SettingsContentProps = {
  policies: LeavePolicy[];
  departments: Department[];
  jambaHireEnabled: boolean;
  isPlanEligible: boolean;
  attendanceEnabled: boolean;
  attendancePayrollEnabled: boolean;
  grievancesEnabled: boolean;
  onboardingSteps: OnboardingStepConfig[];
  fingerprintConfig: FingerprintConfig;
  fingerprintEmployees: EmployeeWithDeviceCode[];
  userCtx: UserCtx;
};

function pluralise(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

export function SettingsContent({
  policies,
  departments,
  jambaHireEnabled,
  isPlanEligible,
  attendanceEnabled,
  attendancePayrollEnabled,
  grievancesEnabled,
  onboardingSteps,
  fingerprintConfig,
  fingerprintEmployees,
  userCtx,
}: SettingsContentProps) {
  const [openSection, setOpenSection] = React.useState<string | null>(null);

  function toggle(id: string) {
    setOpenSection((prev) => (prev === id ? null : id));
  }

  // Summary strings
  const policySummary =
    policies.length === 0
      ? "None configured"
      : `${policies.length} ${pluralise(policies.length, "policy", "policies")}`;

  const deptSummary =
    departments.length === 0
      ? "None configured"
      : `${departments.length} ${pluralise(departments.length, "department", "departments")}`;

  const modulesEnabled = [
    jambaHireEnabled,
    attendanceEnabled,
    grievancesEnabled,
    attendancePayrollEnabled,
  ].filter(Boolean).length;
  const productsSummary =
    modulesEnabled === 0
      ? "None enabled"
      : `${modulesEnabled} ${pluralise(modulesEnabled, "module", "modules")} enabled`;

  const stepsEnabled = onboardingSteps.filter((s) => s.enabled).length;
  const onboardingSummary =
    stepsEnabled === 0
      ? "None configured"
      : `${stepsEnabled} ${pluralise(stepsEnabled, "step", "steps")} enabled`;

  const fingerprintSummary = fingerprintConfig.enabled ? "Enabled" : "Not configured";

  const isAdmin =
    userCtx !== null &&
    userCtx.role !== "employee" &&
    userCtx.role !== "manager";

  return (
    <div className="space-y-4">
      <CollapsibleSection
        title="Leave Policies"
        icon={<CalendarDays className="h-5 w-5 text-muted-foreground" />}
        summary={policySummary}
        isOpen={openSection === "leave-policies"}
        onToggle={() => toggle("leave-policies")}
      >
        <LeavePoliciesSection policies={policies} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Departments"
        icon={<Building2 className="h-5 w-5 text-muted-foreground" />}
        summary={deptSummary}
        isOpen={openSection === "departments"}
        onToggle={() => toggle("departments")}
      >
        <DepartmentsSection departments={departments} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Products & Features"
        icon={<Settings className="h-5 w-5 text-muted-foreground" />}
        summary={productsSummary}
        isOpen={openSection === "products"}
        onToggle={() => toggle("products")}
      >
        <ProductsSection
          jambaHireEnabled={jambaHireEnabled}
          isPlanEligible={isPlanEligible}
          attendanceEnabled={attendanceEnabled}
          attendancePayrollEnabled={attendancePayrollEnabled}
          grievancesEnabled={grievancesEnabled}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="Onboarding Steps"
        icon={<ClipboardList className="h-5 w-5 text-muted-foreground" />}
        summary={onboardingSummary}
        isOpen={openSection === "onboarding"}
        onToggle={() => toggle("onboarding")}
      >
        <OnboardingStepsSection initialSteps={onboardingSteps} />
      </CollapsibleSection>

      {attendanceEnabled && isAdmin && (
        <CollapsibleSection
          title="Fingerprint Integration"
          icon={<Fingerprint className="h-5 w-5 text-muted-foreground" />}
          summary={fingerprintSummary}
          isOpen={openSection === "fingerprint"}
          onToggle={() => toggle("fingerprint")}
        >
          <FingerprintSection
            initialConfig={fingerprintConfig}
            initialEmployees={fingerprintEmployees}
          />
        </CollapsibleSection>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build
```

Expected: compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/settings-content.tsx
git commit -m "feat(settings): add SettingsContent client wrapper with accordion state"
```

---

## Task 4: Update settings page to use SettingsContent

**Files:**
- Modify: `src/app/dashboard/settings/page.tsx`

- [ ] **Step 1: Replace the five direct section renders with `<SettingsContent>`**

The current `src/app/dashboard/settings/page.tsx` renders the five sections directly in the JSX. Replace the entire file with:

```typescript
import { listDepartments } from "@/actions/departments";
import { getOrgProfile, listSettingsPolicies } from "@/actions/settings";
import { OrgProfileSection } from "@/components/settings/org-profile-section";
import { BillingSection } from "@/components/settings/billing-section";
import { SettingsContent } from "@/components/settings/settings-content";
import { getCurrentUser } from "@/lib/current-user";
import { hasFeature } from "@/config/plans";
import { getOrgOnboardingConfig } from "@/actions/onboarding";
import {
  getFingerprintConfig,
  listEmployeesWithDeviceCodes,
} from "@/actions/fingerprint";

export default async function SettingsPage() {
  const [
    departmentsResult,
    profileResult,
    policiesResult,
    userCtx,
    onboardingSteps,
    fingerprintConfigResult,
    fingerprintEmployeesResult,
  ] = await Promise.all([
    listDepartments(),
    getOrgProfile(),
    listSettingsPolicies(),
    getCurrentUser(),
    getOrgOnboardingConfig(),
    getFingerprintConfig(),
    listEmployeesWithDeviceCodes(),
  ]);

  const departments = departmentsResult.success ? departmentsResult.data : [];
  const policies = policiesResult.success ? policiesResult.data : [];
  const plan = userCtx?.plan ?? "starter";
  const jambaHireEnabled = userCtx?.jambaHireEnabled ?? false;
  const attendanceEnabled = userCtx?.attendanceEnabled ?? false;
  const attendancePayrollEnabled = userCtx?.attendancePayrollEnabled ?? false;
  const grievancesEnabled = userCtx?.grievancesEnabled ?? false;
  const fingerprintConfig = fingerprintConfigResult.success
    ? fingerprintConfigResult.data
    : { enabled: false, device_token: null };
  const fingerprintEmployees = fingerprintEmployeesResult.success
    ? fingerprintEmployeesResult.data
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-muted-foreground">
          Manage your organization, billing, leave policies, and departments.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {profileResult.success && (
          <OrgProfileSection profile={profileResult.data} />
        )}
        {profileResult.success && (
          <BillingSection profile={profileResult.data} />
        )}
      </div>

      <SettingsContent
        policies={policies}
        departments={departments}
        jambaHireEnabled={jambaHireEnabled}
        isPlanEligible={hasFeature(plan, "ats")}
        attendanceEnabled={attendanceEnabled}
        attendancePayrollEnabled={attendancePayrollEnabled}
        grievancesEnabled={grievancesEnabled}
        onboardingSteps={onboardingSteps}
        fingerprintConfig={fingerprintConfig}
        fingerprintEmployees={fingerprintEmployees}
        userCtx={userCtx}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build
```

Expected: compiles without TypeScript errors. The settings page route appears in the build output.

- [ ] **Step 3: Verify visually**

Start dev server: `npm run dev`

Navigate to `http://localhost:3000/dashboard/settings`. Verify:
- Page loads with Org Profile + Billing grid at top (unchanged)
- Below that: five compact collapsed cards — Leave Policies, Departments, Products & Features, Onboarding Steps, and (if attendance enabled) Fingerprint Integration
- Each card shows the section title + summary line + "Manage ›" button
- Clicking "Manage ›" on Leave Policies expands it, button becomes "Close ✕"
- Clicking "Manage ›" on Departments collapses Leave Policies and expands Departments (accordion)
- Clicking "Close ✕" collapses the open section

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/settings/page.tsx
git commit -m "feat(settings): collapse sections into accordion via SettingsContent"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ 5 sections collapsible (Leave Policies, Departments, Products & Features, Onboarding Steps, Fingerprint)
- ✅ Org Profile + Billing grid untouched
- ✅ All collapsed on load (no defaultOpen)
- ✅ Accordion: one open at a time
- ✅ "Manage ›" → "Close ✕" on expand
- ✅ Summary text per section with "None configured" fallback
- ✅ Fingerprint only shown when `attendanceEnabled && isAdmin`
- ✅ No new npm packages
