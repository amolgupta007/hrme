# Employee Bulk Import & Invite System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow admins to bulk-import employees from a CSV file, review results, then send Clerk-based activation invites so employees can log in.

**Architecture:** New `/dashboard/employees/import` full-page flow with 3 inline stages (Upload → Preview → Results). Invite management added to the existing employees table. A new `employee_invites` Supabase table tracks invite state; Clerk's org invitation API handles email delivery. The existing `organizationMembership.created` webhook (already present) handles account linking on acceptance — we extend it to stamp `accepted_at`.

**Tech Stack:** Next.js 14 App Router, Supabase Postgres, Clerk Orgs API (`@clerk/nextjs` v5.3), `papaparse` (CSV parsing, new dependency), Sonner toasts, Lucide icons, Tailwind CSS, Radix UI.

---

## File Map

| File | Action |
|------|--------|
| `supabase/migrations/004_employee_invites.sql` | Create — new `employee_invites` table |
| `src/actions/employees.ts` | Modify — add `bulkImportEmployees`, update `listEmployees` (invite status), update `terminateEmployee` (revoke invite) |
| `src/actions/invites.ts` | Create — `sendInvite`, `sendBulkInvites`, `resendInvite` |
| `src/app/dashboard/employees/import/page.tsx` | Create — server component, auth + data fetch |
| `src/components/dashboard/import-client.tsx` | Create — 3-stage import UI |
| `public/employee-import-template.csv` | Create — downloadable CSV template |
| `src/components/dashboard/employees-client.tsx` | Modify — Import CSV button, Not activated filter chip, Send Invites button |
| `src/components/dashboard/employee-table.tsx` | Modify — invite status badge, Send Invite row action |
| `src/app/dashboard/employees/page.tsx` | Modify — pass invite data |
| `src/app/api/webhooks/clerk/route.ts` | Modify — stamp `accepted_at` in `organizationMembership.created` |

---

## Task 1: Install papaparse and run DB migration

**Files:**
- `supabase/migrations/004_employee_invites.sql` (create)
- `package.json` (modify via npm)

- [ ] **Step 1: Install papaparse**

```bash
cd "C:/Users/amolg/Downloads/hr-portal"
npm install papaparse @types/papaparse
```

Expected: papaparse added to `package.json` dependencies, `@types/papaparse` to devDependencies.

- [ ] **Step 2: Create the migration file**

Create `supabase/migrations/004_employee_invites.sql`:

```sql
-- Migration: 004_employee_invites
-- Tracks Clerk org invitation state per employee

CREATE TABLE public.employee_invites (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id              UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id         UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  email               TEXT NOT NULL,
  clerk_invitation_id TEXT,
  sent_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at         TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id)
);

CREATE INDEX idx_employee_invites_org      ON public.employee_invites(org_id);
CREATE INDEX idx_employee_invites_employee ON public.employee_invites(employee_id);
```

- [ ] **Step 3: Run the migration in Supabase SQL Editor**

Open: https://supabase.com/dashboard/project/imjwqktxzahhnfmfbtfc/sql/new

Paste and run the full SQL from Step 2.

Expected: `employee_invites` table appears in the Table Editor with 9 columns and the `UNIQUE(employee_id)` constraint.

- [ ] **Step 4: Verify build still passes**

```bash
npm run build
```

Expected: Exits 0. No new errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/004_employee_invites.sql package.json package-lock.json
git commit -m "feat: add employee_invites migration and install papaparse"
```

---

## Task 2: `bulkImportEmployees` server action

**Files:**
- Modify: `src/actions/employees.ts`

- [ ] **Step 1: Add the `ImportRow` and `ImportResult` types and the action**

Open `src/actions/employees.ts`. After the existing schemas section (around line 55), add:

```typescript
// ---- Bulk import types ----

export type ImportRow = {
  first_name: string;
  last_name: string;
  email: string;
  role: "admin" | "manager" | "employee";
  employment_type: "full_time" | "part_time" | "contract" | "intern";
  date_of_joining: string;
  phone?: string;
  department?: string;
  designation?: string;
  date_of_birth?: string;
  reporting_manager_email?: string;
};

export type ImportResult = {
  imported: number;
  skipped: number;
  errors: { row: number; reason: string; data: ImportRow }[];
};
```

Then add the action at the end of `src/actions/employees.ts`:

```typescript
export async function bulkImportEmployees(
  rows: ImportRow[]
): Promise<ActionResult<ImportResult>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };

  const orgId = user.orgId;
  if (!orgId) return { success: false, error: "Organization not found" };

  const supabase = createAdminSupabase();

  // Fetch plan limit
  const { data: org } = await supabase
    .from("organizations")
    .select("max_employees")
    .eq("id", orgId)
    .single();
  const maxEmployees = (org as any)?.max_employees ?? 10;

  // Fetch current active count
  const { count: currentCount } = await supabase
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .neq("status", "terminated");
  const activeCount = currentCount ?? 0;

  const remainingSlots = maxEmployees - activeCount;

  // Fetch existing emails in org (for duplicate detection)
  const { data: existingEmps } = await supabase
    .from("employees")
    .select("email, status")
    .eq("org_id", orgId);
  const existingEmailMap = new Map(
    (existingEmps ?? []).map((e: any) => [e.email.toLowerCase(), e.status])
  );

  // Fetch departments (for name→id lookup)
  const { data: depts } = await supabase
    .from("departments")
    .select("id, name")
    .eq("org_id", orgId);
  const deptMap = new Map(
    (depts ?? []).map((d: any) => [d.name.toLowerCase(), d.id])
  );

  // Fetch existing employees for reporting_manager_email lookup
  const { data: managers } = await supabase
    .from("employees")
    .select("id, email")
    .eq("org_id", orgId)
    .neq("status", "terminated");
  const managerEmailMap = new Map(
    (managers ?? []).map((m: any) => [m.email.toLowerCase(), m.id])
  );

  const errors: ImportResult["errors"] = [];
  const toInsert: any[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;

    // Required field validation
    if (!row.first_name?.trim()) {
      errors.push({ row: rowNum, reason: "Missing first_name", data: row });
      continue;
    }
    if (!row.last_name?.trim()) {
      errors.push({ row: rowNum, reason: "Missing last_name", data: row });
      continue;
    }
    if (!row.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
      errors.push({ row: rowNum, reason: "Missing or invalid email", data: row });
      continue;
    }
    if (!["admin", "manager", "employee"].includes(row.role)) {
      errors.push({ row: rowNum, reason: `Invalid role "${row.role}" — must be admin, manager, or employee`, data: row });
      continue;
    }
    if (!["full_time", "part_time", "contract", "intern"].includes(row.employment_type)) {
      errors.push({ row: rowNum, reason: `Invalid employment_type "${row.employment_type}"`, data: row });
      continue;
    }
    if (!row.date_of_joining || !/^\d{4}-\d{2}-\d{2}$/.test(row.date_of_joining)) {
      errors.push({ row: rowNum, reason: "Missing or invalid date_of_joining (use YYYY-MM-DD)", data: row });
      continue;
    }

    // Duplicate email check
    const emailLower = row.email.toLowerCase();
    const existingStatus = existingEmailMap.get(emailLower);
    if (existingStatus === "terminated") {
      errors.push({ row: rowNum, reason: "Email belongs to a terminated employee — re-activate manually", data: row });
      continue;
    }
    if (existingStatus) {
      errors.push({ row: rowNum, reason: "Email already exists in this organization", data: row });
      continue;
    }

    // Check plan limit — only add up to remainingSlots
    if (toInsert.length >= remainingSlots) {
      errors.push({ row: rowNum, reason: `Plan limit reached (${maxEmployees} employees). Upgrade to import more.`, data: row });
      continue;
    }

    // Resolve optional lookups
    const departmentId = row.department
      ? (deptMap.get(row.department.toLowerCase()) ?? null)
      : null;
    const reportingManagerId = row.reporting_manager_email
      ? (managerEmailMap.get(row.reporting_manager_email.toLowerCase()) ?? null)
      : null;

    toInsert.push({
      org_id: orgId,
      first_name: row.first_name.trim(),
      last_name: row.last_name.trim(),
      email: row.email.toLowerCase().trim(),
      role: row.role,
      employment_type: row.employment_type,
      date_of_joining: row.date_of_joining,
      phone: row.phone?.trim() || null,
      department_id: departmentId,
      designation: row.designation?.trim() || null,
      date_of_birth: row.date_of_birth && /^\d{4}-\d{2}-\d{2}$/.test(row.date_of_birth)
        ? row.date_of_birth
        : null,
      reporting_manager_id: reportingManagerId,
      status: "active",
    });
  }

  // Batch insert valid rows
  if (toInsert.length > 0) {
    const { error: insertError } = await supabase.from("employees").insert(toInsert);
    if (insertError) {
      return { success: false, error: insertError.message };
    }
  }

  revalidatePath("/dashboard/employees");

  return {
    success: true,
    data: {
      imported: toInsert.length,
      skipped: errors.length,
      errors,
    },
  };
}
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build
```

Expected: Exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/actions/employees.ts
git commit -m "feat: add bulkImportEmployees server action"
```

---

## Task 3: `src/actions/invites.ts`

**Files:**
- Create: `src/actions/invites.ts`

- [ ] **Step 1: Create the invites action file**

Create `src/actions/invites.ts`:

```typescript
"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import type { ActionResult } from "@/types";

// ---- Helpers ----

async function getOrgContext(): Promise<{
  internalOrgId: string;
  clerkOrgId: string;
  clerkUserId: string;
} | null> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.role)) return null;

  const { orgId, userId } = auth();
  let clerkOrgId = orgId ?? null;

  if (!clerkOrgId && userId) {
    const client = await clerkClient();
    const memberships = await client.users.getOrganizationMembershipList({ userId: userId! });
    clerkOrgId = memberships.data[0]?.organization.id ?? null;
  }
  if (!clerkOrgId || !userId) return null;

  return {
    internalOrgId: user.orgId!,
    clerkOrgId,
    clerkUserId: userId,
  };
}

// ---- Actions ----

export async function sendInvite(employeeId: string): Promise<ActionResult<void>> {
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Unauthorized" };

  const supabase = createAdminSupabase();

  // Fetch employee
  const { data: emp } = await supabase
    .from("employees")
    .select("id, email, role, clerk_user_id")
    .eq("id", employeeId)
    .eq("org_id", ctx.internalOrgId)
    .single();

  if (!emp) return { success: false, error: "Employee not found" };
  if ((emp as any).clerk_user_id) return { success: false, error: "Employee already has an active account" };

  const email = (emp as any).email as string;
  const role = (emp as any).role as string;

  // Create Clerk org invitation
  const client = await clerkClient();
  let clerkInvitationId: string | null = null;
  try {
    const invitation = await client.organizations.createOrganizationInvitation({
      organizationId: ctx.clerkOrgId,
      inviterUserId: ctx.clerkUserId,
      emailAddress: email,
      role: role === "admin" || role === "owner" ? "org:admin" : "org:member",
      redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://jambahr.com"}/dashboard`,
    });
    clerkInvitationId = invitation.id;
  } catch (err: any) {
    return { success: false, error: err?.message ?? "Failed to send invite via Clerk" };
  }

  // Upsert employee_invites row
  await supabase.from("employee_invites").upsert(
    {
      org_id: ctx.internalOrgId,
      employee_id: employeeId,
      email,
      clerk_invitation_id: clerkInvitationId,
      sent_at: new Date().toISOString(),
      accepted_at: null,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
    { onConflict: "employee_id" }
  );

  revalidatePath("/dashboard/employees");
  return { success: true, data: undefined };
}

export async function resendInvite(employeeId: string): Promise<ActionResult<void>> {
  // Revoke old Clerk invitation if present, then create a new one
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Unauthorized" };

  const supabase = createAdminSupabase();

  // Fetch existing invite to get clerk_invitation_id
  const { data: existing } = await supabase
    .from("employee_invites")
    .select("clerk_invitation_id")
    .eq("employee_id", employeeId)
    .single();

  const client = await clerkClient();

  // Revoke old invitation (best-effort — don't fail if it errors)
  if (existing && (existing as any).clerk_invitation_id) {
    try {
      await client.organizations.revokeOrganizationInvitation({
        organizationId: ctx.clerkOrgId,
        invitationId: (existing as any).clerk_invitation_id,
        requestingUserId: ctx.clerkUserId,
      });
    } catch {
      // Ignore — old invite may already be expired/revoked
    }
  }

  // Send fresh invite
  return sendInvite(employeeId);
}

export async function sendBulkInvites(
  employeeIds: string[]
): Promise<ActionResult<{ sent: number; failed: string[] }>> {
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Unauthorized" };

  const results = await Promise.allSettled(employeeIds.map((id) => sendInvite(id)));

  const sent = results.filter((r) => r.status === "fulfilled" && r.value.success).length;
  const failed = results
    .map((r, i) => {
      if (r.status === "rejected") return employeeIds[i];
      if (r.status === "fulfilled" && !r.value.success) return employeeIds[i];
      return null;
    })
    .filter(Boolean) as string[];

  revalidatePath("/dashboard/employees");
  return { success: true, data: { sent, failed } };
}
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build
```

Expected: Exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/actions/invites.ts
git commit -m "feat: add sendInvite, resendInvite, sendBulkInvites server actions"
```

---

## Task 4: Update `listEmployees` with invite status + update `terminateEmployee` to revoke invites

**Files:**
- Modify: `src/actions/employees.ts`

- [ ] **Step 1: Update `listEmployees` to fetch invite rows and compute `invite_status`**

In `src/actions/employees.ts`, find the `listEmployees` function. After the `onLeaveData` second query block, add a third parallel query for invites. Replace the current return with:

```typescript
export async function listEmployees(): Promise<
  ActionResult<(Employee & { department_name: string | null; is_on_leave: boolean; invite_status: "none" | "sent" | "expired" | null })[]>
> {
  const orgId = await getOrgId();
  if (!orgId) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();

  const today = new Date().toISOString().split("T")[0];

  const [empResult, leaveResult, inviteResult] = await Promise.all([
    supabase
      .from("employees")
      .select("*, departments!department_id(name)")
      .eq("org_id", orgId)
      .neq("status", "terminated")
      .order("created_at", { ascending: false }),
    supabase
      .from("leave_requests")
      .select("employee_id")
      .eq("org_id", orgId)
      .eq("status", "approved")
      .lte("start_date", today)
      .gte("end_date", today),
    supabase
      .from("employee_invites")
      .select("employee_id, sent_at, accepted_at, expires_at")
      .eq("org_id", orgId),
  ]);

  if (empResult.error) return { success: false, error: empResult.error.message };

  const onLeaveSet = new Set((leaveResult.data ?? []).map((r: any) => r.employee_id));

  const now = new Date();
  const inviteMap = new Map(
    (inviteResult.data ?? []).map((r: any) => [r.employee_id, r])
  );

  const employees = (empResult.data ?? []).map((e: any) => {
    let invite_status: "none" | "sent" | "expired" | null = null;
    if (!e.clerk_user_id) {
      const invite = inviteMap.get(e.id);
      if (!invite) {
        invite_status = "none";
      } else if (invite.accepted_at) {
        invite_status = null; // accepted but clerk_user_id not yet linked — treat as sent
      } else if (new Date(invite.expires_at) <= now) {
        invite_status = "expired";
      } else {
        invite_status = "sent";
      }
    }
    return {
      ...e,
      department_name: e.departments?.name ?? null,
      is_on_leave: onLeaveSet.has(e.id),
      invite_status,
    };
  });

  return { success: true, data: employees };
}
```

- [ ] **Step 2: Update `terminateEmployee` to revoke pending invites**

Find the `terminateEmployee` function in `src/actions/employees.ts`. After the update query and before `revalidatePath`, add:

```typescript
  // Revoke pending Clerk invitation if one exists
  const { data: invite } = await supabase
    .from("employee_invites")
    .select("clerk_invitation_id")
    .eq("employee_id", employeeId)
    .is("accepted_at", null)
    .single();

  if (invite && (invite as any).clerk_invitation_id) {
    try {
      const { userId, orgId: clerkOrgId } = auth();
      if (userId && clerkOrgId) {
        const client = await clerkClient();
        await client.organizations.revokeOrganizationInvitation({
          organizationId: clerkOrgId,
          invitationId: (invite as any).clerk_invitation_id,
          requestingUserId: userId,
        });
      }
    } catch {
      // Best-effort — log but don't fail termination
      console.error("Failed to revoke Clerk invitation during termination");
    }
  }

  // Delete the invite record
  await supabase.from("employee_invites").delete().eq("employee_id", employeeId);
```

Also add `import { auth, clerkClient } from "@clerk/nextjs/server";` to the top of the file if `clerkClient` is not already imported there. Check the existing imports — `clerkClient` is already imported in the file (`import { auth, clerkClient } from "@clerk/nextjs/server";`).

- [ ] **Step 3: Verify build passes**

```bash
npm run build
```

Expected: Exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/actions/employees.ts
git commit -m "feat: add invite_status to listEmployees, revoke invite on termination"
```

---

## Task 5: Template CSV + Import page server component

**Files:**
- Create: `public/employee-import-template.csv`
- Create: `src/app/dashboard/employees/import/page.tsx`

- [ ] **Step 1: Create the template CSV**

Create `public/employee-import-template.csv`:

```csv
first_name,last_name,email,role,employment_type,date_of_joining,phone,department,designation,date_of_birth,reporting_manager_email
Jane,Doe,jane.doe@company.com,employee,full_time,2026-01-15,9876543210,Engineering,Software Engineer,1995-06-20,manager@company.com
```

- [ ] **Step 2: Create the import page server component**

Create `src/app/dashboard/employees/import/page.tsx`:

```typescript
import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { listDepartments } from "@/actions/employees";
import { ImportClient } from "@/components/dashboard/import-client";

export default async function EmployeeImportPage() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.role)) {
    redirect("/dashboard/employees");
  }

  const deptsResult = await listDepartments();
  const departments = deptsResult.success ? deptsResult.data : [];
  const plan = user.plan ?? "starter";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import Employees</h1>
        <p className="mt-1 text-muted-foreground">
          Upload a CSV to bulk-add employees to your organization.
        </p>
      </div>
      <ImportClient departments={departments} plan={plan} />
    </div>
  );
}
```

- [ ] **Step 3: Verify build passes**

```bash
npm run build
```

Expected: Exits 0 (ImportClient doesn't exist yet — build may warn, but TypeScript errors are suppressed via `ignoreBuildErrors: true` in next.config.js).

- [ ] **Step 4: Commit**

```bash
git add public/employee-import-template.csv src/app/dashboard/employees/import/page.tsx
git commit -m "feat: add import page and CSV template"
```

---

## Task 6: Import client component (all 3 stages)

**Files:**
- Create: `src/components/dashboard/import-client.tsx`

This is the core UI. It manages three stages in local state: `"upload" | "preview" | "results"`.

- [ ] **Step 1: Create `src/components/dashboard/import-client.tsx`**

```typescript
"use client";

import * as React from "react";
import Papa from "papaparse";
import { useRouter } from "next/navigation";
import { Upload, FileText, Download, CheckCircle2, XCircle, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { bulkImportEmployees } from "@/actions/employees";
import type { ImportRow, ImportResult } from "@/actions/employees";
import type { Department } from "@/types";

interface ImportClientProps {
  departments: Department[];
  plan: string;
}

type Stage = "upload" | "preview" | "results";

type ParsedRow = ImportRow & { _rowNum: number; _valid: boolean; _error?: string };

const COLUMN_REFERENCE = [
  { col: "first_name *", accepts: "Text" },
  { col: "last_name *", accepts: "Text" },
  { col: "email *", accepts: "Valid email address" },
  { col: "role *", accepts: "admin | manager | employee" },
  { col: "employment_type *", accepts: "full_time | part_time | contract | intern" },
  { col: "date_of_joining *", accepts: "YYYY-MM-DD" },
  { col: "phone", accepts: "Optional — digits only" },
  { col: "department", accepts: "Optional — must match existing department name" },
  { col: "designation", accepts: "Optional — free text job title" },
  { col: "date_of_birth", accepts: "Optional — YYYY-MM-DD" },
  { col: "reporting_manager_email", accepts: "Optional — must match existing employee email" },
];

function validateRow(row: any, rowNum: number): ParsedRow {
  const base = { ...row, _rowNum: rowNum };

  if (!row.first_name?.trim()) return { ...base, _valid: false, _error: "Missing first_name" };
  if (!row.last_name?.trim()) return { ...base, _valid: false, _error: "Missing last_name" };
  if (!row.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email))
    return { ...base, _valid: false, _error: "Missing or invalid email" };
  if (!["admin", "manager", "employee"].includes(row.role))
    return { ...base, _valid: false, _error: `Invalid role "${row.role}"` };
  if (!["full_time", "part_time", "contract", "intern"].includes(row.employment_type))
    return { ...base, _valid: false, _error: `Invalid employment_type "${row.employment_type}"` };
  if (!row.date_of_joining || !/^\d{4}-\d{2}-\d{2}$/.test(row.date_of_joining))
    return { ...base, _valid: false, _error: "Invalid date_of_joining (use YYYY-MM-DD)" };

  return { ...base, _valid: true };
}

export function ImportClient({ plan }: ImportClientProps) {
  const router = useRouter();
  const [stage, setStage] = React.useState<Stage>("upload");
  const [dragging, setDragging] = React.useState(false);
  const [parsedRows, setParsedRows] = React.useState<ParsedRow[]>([]);
  const [importing, setImporting] = React.useState(false);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const validRows = parsedRows.filter((r) => r._valid);
  const skippedRows = parsedRows.filter((r) => !r._valid);

  function handleFile(file: File) {
    if (!file.name.endsWith(".csv")) {
      toast.error("Please upload a .csv file");
      return;
    }
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = (results.data as any[]).map((row, i) => validateRow(row, i + 1));
        setParsedRows(rows);
        setStage("preview");
      },
      error: () => toast.error("Failed to parse CSV. Make sure it is a valid file."),
    });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  async function handleImport() {
    const rows: ImportRow[] = validRows.map(({ _rowNum, _valid, _error, ...rest }) => rest as ImportRow);
    setImporting(true);
    try {
      const res = await bulkImportEmployees(rows);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setResult(res.data);
      setStage("results");
    } finally {
      setImporting(false);
    }
  }

  function downloadErrors() {
    if (!result) return;
    const errorRows = result.errors.map((e) => ({
      ...e.data,
      error_reason: e.reason,
    }));
    const csv = Papa.unparse(errorRows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "import-errors.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---- Stage: Upload ----
  if (stage === "upload") {
    return (
      <div className="space-y-6 max-w-3xl">
        {/* Drop zone */}
        <div
          className={cn(
            "rounded-xl border-2 border-dashed p-12 text-center transition-colors cursor-pointer",
            dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
          )}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
          <p className="font-medium">Drag and drop your CSV here</p>
          <p className="text-sm text-muted-foreground mt-1">or click to browse — .csv files only</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>

        {/* Download template */}
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
          <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Need the template?</p>
            <p className="text-xs text-muted-foreground">Download the CSV template with correct headers and an example row.</p>
          </div>
          <a href="/employee-import-template.csv" download className="shrink-0">
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-3.5 w-3.5" />
              Template
            </Button>
          </a>
        </div>

        {/* Column reference */}
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="bg-muted/60 px-4 py-2.5 text-sm font-medium">Column Reference</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Column</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Accepts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {COLUMN_REFERENCE.map((c) => (
                <tr key={c.col} className="hover:bg-muted/20">
                  <td className="px-4 py-2 font-mono text-xs">{c.col}</td>
                  <td className="px-4 py-2 text-muted-foreground">{c.accepts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ---- Stage: Preview ----
  if (stage === "preview") {
    return (
      <div className="space-y-4 max-w-5xl">
        {/* Summary bar */}
        <div className="flex items-center gap-4 rounded-lg border border-border bg-muted/30 px-4 py-3">
          <span className="flex items-center gap-1.5 text-sm font-medium text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            {validRows.length} valid
          </span>
          {skippedRows.length > 0 && (
            <span className="flex items-center gap-1.5 text-sm font-medium text-destructive">
              <XCircle className="h-4 w-4" />
              {skippedRows.length} skipped
            </span>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setParsedRows([]); setStage("upload"); }}>
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Re-upload
            </Button>
            <Button size="sm" onClick={handleImport} disabled={importing || validRows.length === 0}>
              {importing ? "Importing…" : `Import ${validRows.length} employees`}
            </Button>
          </div>
        </div>

        {/* Preview table */}
        <div className="rounded-xl border border-border overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-border bg-muted/60">
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground w-12">#</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Email</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Role</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Type</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Joining</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {parsedRows.map((row) => (
                <tr key={row._rowNum} className={cn("transition-colors", row._valid ? "hover:bg-muted/20" : "bg-destructive/5 opacity-60")}>
                  <td className="px-3 py-2 text-muted-foreground">{row._rowNum}</td>
                  <td className="px-3 py-2 font-medium">{row.first_name} {row.last_name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{row.email}</td>
                  <td className="px-3 py-2 text-muted-foreground">{row.role}</td>
                  <td className="px-3 py-2 text-muted-foreground">{row.employment_type}</td>
                  <td className="px-3 py-2 text-muted-foreground">{row.date_of_joining}</td>
                  <td className="px-3 py-2">
                    {row._valid ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Valid
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive" title={row._error}>
                        <XCircle className="h-3.5 w-3.5" /> {row._error}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ---- Stage: Results ----
  return (
    <div className="space-y-6 max-w-2xl">
      <div className="rounded-xl border border-border bg-muted/20 p-6 text-center space-y-3">
        <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
        <h2 className="text-xl font-semibold">Import complete</h2>
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">{result?.imported ?? 0} employees</span> imported successfully.
          {(result?.skipped ?? 0) > 0 && (
            <> <span className="font-medium text-destructive">{result!.skipped} skipped</span> due to errors.</>
          )}
        </p>
        <div className="flex justify-center gap-3 pt-2">
          {(result?.skipped ?? 0) > 0 && (
            <Button variant="outline" onClick={downloadErrors}>
              <Download className="mr-2 h-4 w-4" />
              Download errors.csv
            </Button>
          )}
          <Button onClick={() => router.push("/dashboard/employees")}>
            Go to Employees
          </Button>
        </div>
      </div>

      {(result?.skipped ?? 0) > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="bg-muted/60 px-4 py-2.5 text-sm font-medium">Skipped rows</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left font-medium text-muted-foreground w-12">Row</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Email</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {result!.errors.map((e) => (
                <tr key={e.row} className="hover:bg-muted/20">
                  <td className="px-4 py-2 text-muted-foreground">{e.row}</td>
                  <td className="px-4 py-2">{e.data.email || "—"}</td>
                  <td className="px-4 py-2 text-destructive">{e.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build
```

Expected: Exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/import-client.tsx
git commit -m "feat: add ImportClient 3-stage CSV import UI"
```

---

## Task 7: Update `employees-client.tsx` — Import button, Not activated filter, Send Invites button

**Files:**
- Modify: `src/components/dashboard/employees-client.tsx`
- Modify: `src/app/dashboard/employees/page.tsx`

- [ ] **Step 1: Update the employees page to pass invite-aware employee data**

The employees page already calls `listEmployees()` which now returns `invite_status`. No change needed — the data flows through automatically.

However, we need to add the employee type to include `invite_status`. In `src/app/dashboard/employees/page.tsx`, no change needed — TypeScript inference handles it.

- [ ] **Step 2: Update `EmployeesClientProps` and add new toolbar elements**

In `src/components/dashboard/employees-client.tsx`, make these changes:

**a) Add imports at the top:**

```typescript
import { useRouter } from "next/navigation";
import { Upload, Mail, MailCheck } from "lucide-react";
import { sendBulkInvites } from "@/actions/invites";
```

**b) Update the `EmployeeWithDept` type:**

```typescript
type EmployeeWithDept = Employee & {
  department_name: string | null;
  is_on_leave?: boolean;
  invite_status?: "none" | "sent" | "expired" | null;
};
```

**c) Add `activationFilter` state and `sendingInvites` state inside the component:**

```typescript
const router = useRouter();
const [activationFilter, setActivationFilter] = React.useState<"all" | "not_activated">("all");
const [sendingInvites, setSendingInvites] = React.useState(false);
```

**d) Update the `filtered` useMemo to include the activation filter:**

```typescript
const filtered = React.useMemo(() => {
  const q = search.toLowerCase();
  return employees.filter((emp) => {
    if (
      q &&
      !emp.first_name.toLowerCase().includes(q) &&
      !emp.last_name.toLowerCase().includes(q) &&
      !emp.email.toLowerCase().includes(q) &&
      !emp.designation?.toLowerCase().includes(q) &&
      !emp.department_name?.toLowerCase().includes(q)
    ) return false;
    if (deptFilter !== "all" && emp.department_name !== deptFilter) return false;
    if (roleFilter !== "all" && emp.role !== roleFilter) return false;
    if (statusFilter !== "all" && emp.status !== statusFilter) return false;
    if (activationFilter === "not_activated" && emp.clerk_user_id) return false;
    return true;
  });
}, [employees, search, deptFilter, roleFilter, statusFilter, activationFilter]);
```

**e) Add `handleSendAllInvites` function:**

```typescript
async function handleSendAllInvites() {
  const unactivated = employees.filter((e) => !e.clerk_user_id).map((e) => e.id);
  if (unactivated.length === 0) {
    toast.info("All employees already have active accounts");
    return;
  }
  setSendingInvites(true);
  try {
    const result = await sendBulkInvites(unactivated);
    if (result.success) {
      toast.success(`${result.data.sent} invite${result.data.sent !== 1 ? "s" : ""} sent`);
      if (result.data.failed.length > 0) {
        toast.error(`${result.data.failed.length} invite(s) failed to send`);
      }
    } else {
      toast.error(result.error);
    }
  } finally {
    setSendingInvites(false);
  }
}
```

**f) In the toolbar JSX, update the `hasActiveFilters` check and `clearFilters` function to include `activationFilter`:**

```typescript
const hasActiveFilters = deptFilter !== "all" || roleFilter !== "all" || statusFilter !== "all" || activationFilter !== "all";

function clearFilters() {
  setDeptFilter("all");
  setRoleFilter("all");
  setStatusFilter("all");
  setActivationFilter("all");
}
```

**g) Add the "Not activated" filter chip after the existing FilterSelect elements, still inside the filters div:**

```tsx
<button
  onClick={() => setActivationFilter(activationFilter === "not_activated" ? "all" : "not_activated")}
  className={cn(
    "flex h-9 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring",
    activationFilter === "not_activated"
      ? "border-amber-500 bg-amber-50 text-amber-700 font-medium dark:bg-amber-950 dark:text-amber-400"
      : "border-input bg-background text-muted-foreground hover:text-foreground"
  )}
>
  <MailCheck className="h-3.5 w-3.5" />
  Not activated
</button>
```

**h) In the right side of the toolbar (where the Add Employee button is), add Import CSV and Send Invites buttons:**

```tsx
{canManage && (
  <>
    <Button variant="outline" onClick={() => router.push("/dashboard/employees/import")}>
      <Upload className="mr-2 h-4 w-4" />
      Import CSV
    </Button>
    <Button variant="outline" onClick={handleSendAllInvites} disabled={sendingInvites}>
      <Mail className="mr-2 h-4 w-4" />
      {sendingInvites ? "Sending…" : "Send Invites"}
    </Button>
    <Button onClick={openAdd}>
      <UserPlus className="mr-2 h-4 w-4" />
      Add Employee
    </Button>
  </>
)}
```

- [ ] **Step 3: Verify build passes**

```bash
npm run build
```

Expected: Exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/employees-client.tsx src/app/dashboard/employees/page.tsx
git commit -m "feat: add Import CSV button, Not activated filter, Send Invites to employees page"
```

---

## Task 8: Update `employee-table.tsx` — invite status badge + Send Invite row action

**Files:**
- Modify: `src/components/dashboard/employee-table.tsx`

- [ ] **Step 1: Add imports and update the type**

At the top of `src/components/dashboard/employee-table.tsx`, add to the imports:

```typescript
import { Mail, MailCheck, MailX } from "lucide-react";
import { sendInvite, resendInvite } from "@/actions/invites";
```

Update the `EmployeeWithDept` type:

```typescript
type EmployeeWithDept = Employee & {
  department_name: string | null;
  is_on_leave?: boolean;
  invite_status?: "none" | "sent" | "expired" | null;
};
```

- [ ] **Step 2: Add `InviteBadge` component at the bottom of the file**

```typescript
function InviteBadge({ status, sentAt }: { status: "none" | "sent" | "expired" | null; sentAt?: string }) {
  if (!status) return null;
  if (status === "sent") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
        <MailCheck className="h-3 w-3" />
        Invite sent
      </span>
    );
  }
  if (status === "expired") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
        <MailX className="h-3 w-3" />
        Invite expired
      </span>
    );
  }
  // "none"
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
      <Mail className="h-3 w-3" />
      Not activated
    </span>
  );
}
```

- [ ] **Step 3: Add `inviting` state and `handleSendInvite` inside `EmployeeTable`**

Inside the `EmployeeTable` component, add state:

```typescript
const [inviting, setInviting] = React.useState<string | null>(null);
```

Add the handler:

```typescript
async function handleSendInvite(employeeId: string, isResend: boolean) {
  setInviting(employeeId);
  try {
    const result = isResend ? await resendInvite(employeeId) : await sendInvite(employeeId);
    if (result.success) {
      toast.success(isResend ? "Invite resent" : "Invite sent");
    } else {
      toast.error(result.error);
    }
  } finally {
    setInviting(null);
  }
}
```

- [ ] **Step 4: Add the invite badge below the StatusBadge in the Status column**

In the table row, find the Status `<td>`. Update it:

```tsx
{/* Status */}
<td className="px-4 py-3">
  <div className="flex flex-col gap-1">
    <StatusBadge status={emp.status} isOnLeave={(emp as any).is_on_leave} />
    {emp.status === "active" && (emp as EmployeeWithDept).invite_status && (
      <InviteBadge status={(emp as EmployeeWithDept).invite_status ?? null} />
    )}
  </div>
</td>
```

- [ ] **Step 5: Add Send Invite / Resend Invite to the row dropdown**

In the dropdown menu content, add after the Edit item (before the Separator):

```tsx
{canManage && (emp as EmployeeWithDept).invite_status !== null && (
  <>
    <DropdownMenu.Item
      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent disabled:opacity-50"
      onSelect={() => handleSendInvite(
        emp.id,
        (emp as EmployeeWithDept).invite_status === "sent" || (emp as EmployeeWithDept).invite_status === "expired"
      )}
      disabled={inviting === emp.id}
    >
      <Mail className="h-3.5 w-3.5" />
      {inviting === emp.id
        ? "Sending…"
        : (emp as EmployeeWithDept).invite_status === "none"
        ? "Send Invite"
        : "Resend Invite"}
    </DropdownMenu.Item>
    <DropdownMenu.Separator className="my-1 h-px bg-border" />
  </>
)}
```

- [ ] **Step 6: Verify build passes**

```bash
npm run build
```

Expected: Exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/employee-table.tsx
git commit -m "feat: add invite status badges and Send Invite row action to employee table"
```

---

## Task 9: Update Clerk webhook to stamp `accepted_at`

**Files:**
- Modify: `src/app/api/webhooks/clerk/route.ts`

The webhook already handles `organizationMembership.created` and links `clerk_user_id` on the employee record. We just need to also stamp `employee_invites.accepted_at`.

- [ ] **Step 1: Add `accepted_at` stamp inside the existing `organizationMembership.created` case**

Find this block in `src/app/api/webhooks/clerk/route.ts`:

```typescript
// Find matching employee by email and write their clerk_user_id
await supabase
  .from("employees")
  .update({ clerk_user_id: clerkUserId })
  .eq("org_id", (org as { id: string }).id)
  .eq("email", memberEmail)
  .is("clerk_user_id", null); // only set if not already linked
```

Add this block immediately after it:

```typescript
// Stamp accepted_at on the employee_invites record
await supabase
  .from("employee_invites")
  .update({ accepted_at: new Date().toISOString() })
  .eq("org_id", (org as { id: string }).id)
  .eq("email", memberEmail)
  .is("accepted_at", null);
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build
```

Expected: Exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/webhooks/clerk/route.ts
git commit -m "feat: stamp employee_invites.accepted_at on Clerk org membership created"
```

---

## Self-Review Checklist

After all tasks are complete:

- [ ] Navigate to `/dashboard/employees` — verify "Import CSV", "Send Invites" buttons appear for admins, hidden for non-admins
- [ ] Click "Import CSV" — verify redirect to `/dashboard/employees/import`
- [ ] Download template CSV — verify it downloads with correct headers
- [ ] Upload the template CSV — verify Stage 2 shows 1 valid row
- [ ] Upload a CSV with a bad row (missing email) — verify it shows as skipped with reason
- [ ] Confirm import — verify employee appears in `/dashboard/employees` with "Not activated" badge
- [ ] Click "Send Invite" in row dropdown — verify Clerk invitation email is sent
- [ ] "Send Invites" bulk button — verify all unactivated employees receive invites
- [ ] Accept invite as the employee — verify `clerk_user_id` is linked and badge turns green
