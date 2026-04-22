# Admin-Set Objectives — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow admins and owners to create objective sets on behalf of one or more employees in a single form submission, with each employee getting their own independent copy.

**Architecture:** `createObjectiveSet` gains an optional `target_employee_ids` field; when populated by an admin, it bulk-inserts one row per employee instead of the self-set path. `CreateObjectiveDialog` gets `employees` and `role` props that render a multi-select picker at the top of the form. `ObjectivesClient` and `objectives/page.tsx` are wired to fetch and pass the employee list down.

**Tech Stack:** Next.js 14 Server Actions, Supabase Postgres, Zod, Radix UI, Tailwind CSS, TypeScript strict.

---

## Files

| File | Change |
|------|--------|
| `src/actions/objectives.ts` | Add `target_employee_ids` to `createSchema`; add bulk-insert branch in `createObjectiveSet`; update return type |
| `src/components/objectives/create-objective-dialog.tsx` | Add `employees?: Employee[]` and `role?: string` props; render multi-select picker for admin/owner |
| `src/components/objectives/objectives-client.tsx` | Add `employees: Employee[]` prop; pass it and derived `role` to `CreateObjectiveDialog` |
| `src/app/dashboard/objectives/page.tsx` | Fetch active employees and pass to `ObjectivesClient` |

---

### Task 1: Extend `createObjectiveSet` with bulk-insert support

**Files:**
- Modify: `src/actions/objectives.ts`

The current `createSchema` (around line 155 — search for `const createSchema`) only has `period_type`, `period_label`, `items`. The current `createObjectiveSet` return type is `ActionResult<{ id: string }>`.

- [ ] **Step 1: Read the current `createSchema` and `createObjectiveSet`**

Run:
```bash
grep -n "createSchema\|createObjectiveSet" src/actions/objectives.ts
```
Note the exact line numbers for the schema and the function start.

- [ ] **Step 2: Add `target_employee_ids` to `createSchema`**

Find the schema (it looks like):
```typescript
const createSchema = z.object({
  period_type: z.enum(["quarterly", "yearly"]),
  period_label: z.string().min(1, "Select a period"),
  items: z.array(itemSchema).min(1),
});
```

Replace with:
```typescript
const createSchema = z.object({
  period_type: z.enum(["quarterly", "yearly"]),
  period_label: z.string().min(1, "Select a period"),
  items: z.array(itemSchema).min(1),
  target_employee_ids: z.array(z.string().uuid()).optional(),
});
```

- [ ] **Step 3: Update `createObjectiveSet` return type**

Find:
```typescript
export async function createObjectiveSet(
  formData: z.infer<typeof createSchema>
): Promise<ActionResult<{ id: string }>> {
```

Replace with:
```typescript
export async function createObjectiveSet(
  formData: z.infer<typeof createSchema>
): Promise<ActionResult<{ id: string } | { created: number }>> {
```

- [ ] **Step 4: Add bulk-insert branch inside `createObjectiveSet`**

The current function, after weight validation, does:
```typescript
  const supabase = createAdminSupabase();

  const { data: emp } = await supabase
    .from("employees")
    .select("id, reporting_manager_id")
    .eq("clerk_user_id", ctx.clerkUserId)
    .eq("org_id", ctx.orgId)
    .single();

  if (!emp) return { success: false, error: "Employee record not found" };
  const empData = emp as { id: string; reporting_manager_id: string | null };

  const { data, error } = await supabase
    .from("objectives")
    .insert({
      org_id: ctx.orgId,
      employee_id: empData.id,
      manager_id: empData.reporting_manager_id,
      period_type: validated.data.period_type,
      period_label: validated.data.period_label,
      items: validated.data.items,
      status: "draft",
    })
    .select("id")
    .single();
```

Insert a new branch **before** the existing `const { data: emp }` lookup. The full replacement of that section should be:

```typescript
  const supabase = createAdminSupabase();

  const user = await getCurrentUser();

  // Bulk-create for admin/owner targeting specific employees
  if (
    user &&
    (user.role === "admin" || user.role === "owner") &&
    validated.data.target_employee_ids &&
    validated.data.target_employee_ids.length > 0
  ) {
    const { data: targetEmps, error: empError } = await supabase
      .from("employees")
      .select("id, reporting_manager_id")
      .in("id", validated.data.target_employee_ids)
      .eq("org_id", ctx.orgId);

    if (empError) return { success: false, error: empError.message };

    const inserts = (targetEmps ?? []).map((e: any) => ({
      org_id: ctx.orgId,
      employee_id: e.id,
      manager_id: e.reporting_manager_id ?? null,
      period_type: validated.data.period_type,
      period_label: validated.data.period_label,
      items: validated.data.items,
      status: "draft" as const,
    }));

    if (inserts.length === 0) return { success: false, error: "No valid employees found" };

    const { error: insertError } = await supabase.from("objectives").insert(inserts);
    if (insertError) return { success: false, error: insertError.message };

    revalidatePath("/dashboard/objectives");
    return { success: true, data: { created: inserts.length } };
  }

  // Self-set path (unchanged)
  const { data: emp } = await supabase
    .from("employees")
    .select("id, reporting_manager_id")
    .eq("clerk_user_id", ctx.clerkUserId)
    .eq("org_id", ctx.orgId)
    .single();
```

Note: `getCurrentUser` is already imported at the top of the file.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd "C:/Users/amolg/Downloads/hr-portal" && npx tsc --noEmit 2>&1 | grep "objectives.ts"
```

Expected: no errors on `objectives.ts` lines.

- [ ] **Step 6: Commit**

```bash
git add src/actions/objectives.ts
git commit -m "feat(objectives): add target_employee_ids for bulk admin-set objectives"
```

---

### Task 2: Add employee picker to `CreateObjectiveDialog`

**Files:**
- Modify: `src/components/objectives/create-objective-dialog.tsx`

- [ ] **Step 1: Add `Employee` import and extend `Props`**

At the top of the file, add the Employee type import. Find the existing imports line (e.g. `import type { ObjectiveSet, ObjectiveItem } from "@/actions/objectives";`) and add after it:
```typescript
import type { Employee } from "@/types";
```

Find the `Props` interface:
```typescript
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: ObjectiveSet;
  template?: ObjectiveTemplate;
}
```

Replace with:
```typescript
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: ObjectiveSet;
  template?: ObjectiveTemplate;
  employees?: Employee[];
  role?: string;
}
```

- [ ] **Step 2: Update destructure**

Find:
```typescript
export function CreateObjectiveDialog({ open, onOpenChange, editing, template }: Props) {
```

Replace with:
```typescript
export function CreateObjectiveDialog({ open, onOpenChange, editing, template, employees, role }: Props) {
```

- [ ] **Step 3: Add `selectedEmployeeIds` state and reset it on open**

Find the existing state block (the `React.useState` calls at the top of the function body). After the last `useState` in that block, add:
```typescript
  const [selectedEmployeeIds, setSelectedEmployeeIds] = React.useState<string[]>([]);
```

The dialog uses a `React.useEffect` to reset state when `open` changes or `editing`/`template` change. Find that effect and add a reset for `selectedEmployeeIds`:
```typescript
    setSelectedEmployeeIds([]);
```

- [ ] **Step 4: Update `handleSubmit` to pass `target_employee_ids` and show correct toast**

Find the current `handleSubmit` submit call:
```typescript
    const payload = { period_type: periodType, period_label: periodLabel, items };
    const result = editing
      ? await updateObjectiveSet(editing.id, payload)
      : await createObjectiveSet(payload);
    setLoading(false);

    if (result.success) {
      toast.success(editing ? "Objectives updated" : "Objectives saved as draft");
      onOpenChange(false);
    } else {
      toast.error(result.error);
    }
```

Replace with:
```typescript
    const isAdminBulk = !editing && (role === "admin" || role === "owner") && selectedEmployeeIds.length > 0;
    const payload = {
      period_type: periodType,
      period_label: periodLabel,
      items,
      ...(isAdminBulk ? { target_employee_ids: selectedEmployeeIds } : {}),
    };
    const result = editing
      ? await updateObjectiveSet(editing.id, { period_type: periodType, period_label: periodLabel, items })
      : await createObjectiveSet(payload);
    setLoading(false);

    if (result.success) {
      if (editing) {
        toast.success("Objectives updated");
      } else if (isAdminBulk && result.data && "created" in result.data) {
        const n = result.data.created;
        if (n === 1 && employees) {
          const emp = employees.find((e) => e.id === selectedEmployeeIds[0]);
          const name = emp ? `${emp.first_name} ${emp.last_name}` : "1 employee";
          toast.success(`Objectives created for ${name}`);
        } else {
          toast.success(`Objectives created for ${n} employees`);
        }
      } else {
        toast.success("Objectives saved as draft");
      }
      onOpenChange(false);
    } else {
      toast.error(result.error);
    }
```

- [ ] **Step 5: Add employee picker JSX**

The form JSX starts with `<form onSubmit={handleSubmit} className="space-y-4">`. After the opening `<form>` tag and before the first field (period type), add the employee picker — but only render it when applicable:

```tsx
            {/* Admin: set objectives for other employees */}
            {!editing && employees && employees.length > 0 && (role === "admin" || role === "owner") && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label.Root className="text-sm font-medium">
                    For employees
                    {selectedEmployeeIds.length > 0 && (
                      <span className="ml-2 font-normal text-muted-foreground">
                        ({selectedEmployeeIds.length} selected)
                      </span>
                    )}
                  </Label.Root>
                  <button
                    type="button"
                    onClick={() => setSelectedEmployeeIds(employees.map((e) => e.id))}
                    className="text-xs text-primary hover:underline"
                  >
                    Select all
                  </button>
                </div>
                <div className="max-h-40 overflow-y-auto rounded-lg border border-input divide-y divide-border">
                  {employees.map((emp) => (
                    <label
                      key={emp.id}
                      className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40 transition-colors"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input accent-primary"
                        checked={selectedEmployeeIds.includes(emp.id)}
                        onChange={() =>
                          setSelectedEmployeeIds((prev) =>
                            prev.includes(emp.id)
                              ? prev.filter((id) => id !== emp.id)
                              : [...prev, emp.id]
                          )
                        }
                      />
                      <div>
                        <p className="text-sm font-medium">{emp.first_name} {emp.last_name}</p>
                        {emp.designation && (
                          <p className="text-xs text-muted-foreground">{emp.designation}</p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
                {selectedEmployeeIds.length === 0 && (
                  <p className="text-xs text-muted-foreground">No employees selected — objectives will be saved for yourself.</p>
                )}
              </div>
            )}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd "C:/Users/amolg/Downloads/hr-portal" && npx tsc --noEmit 2>&1 | grep "create-objective-dialog"
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/objectives/create-objective-dialog.tsx
git commit -m "feat(objectives): add employee multi-select picker to CreateObjectiveDialog for admins"
```

---

### Task 3: Wire employees through `ObjectivesClient` and `objectives/page.tsx`

**Files:**
- Modify: `src/components/objectives/objectives-client.tsx`
- Modify: `src/app/dashboard/objectives/page.tsx`

- [ ] **Step 1: Add `Employee` import and `employees` prop to `ObjectivesClient`**

In `src/components/objectives/objectives-client.tsx`, find the imports at the top. Add:
```typescript
import type { Employee } from "@/types";
```

Find `ObjectivesClientProps`:
```typescript
interface ObjectivesClientProps {
  myObjectives: ObjectiveSet[];
  pendingApprovals: ObjectiveSet[];
  allObjectives: ObjectiveSet[];
  isAdmin: boolean;
  hasDirectReports: boolean;
}
```

Replace with:
```typescript
interface ObjectivesClientProps {
  myObjectives: ObjectiveSet[];
  pendingApprovals: ObjectiveSet[];
  allObjectives: ObjectiveSet[];
  isAdmin: boolean;
  hasDirectReports: boolean;
  employees: Employee[];
}
```

- [ ] **Step 2: Destructure `employees` in `ObjectivesClient`**

Find:
```typescript
export function ObjectivesClient({
  myObjectives,
  pendingApprovals,
  allObjectives,
  isAdmin,
  hasDirectReports,
}: ObjectivesClientProps) {
```

Replace with:
```typescript
export function ObjectivesClient({
  myObjectives,
  pendingApprovals,
  allObjectives,
  isAdmin,
  hasDirectReports,
  employees,
}: ObjectivesClientProps) {
```

- [ ] **Step 3: Pass `employees` and `role` to `CreateObjectiveDialog`**

Find the `<CreateObjectiveDialog` call (currently):
```tsx
      <CreateObjectiveDialog
        open={createOpen}
        onOpenChange={(v) => { setCreateOpen(v); if (!v) { setEditingObj(undefined); setSelectedTemplate(undefined); } }}
        editing={editingObj}
        template={selectedTemplate}
      />
```

Replace with:
```tsx
      <CreateObjectiveDialog
        open={createOpen}
        onOpenChange={(v) => { setCreateOpen(v); if (!v) { setEditingObj(undefined); setSelectedTemplate(undefined); } }}
        editing={editingObj}
        template={selectedTemplate}
        employees={isAdmin ? employees : undefined}
        role={isAdmin ? "admin" : undefined}
      />
```

- [ ] **Step 4: Fetch employees in `objectives/page.tsx` and pass to `ObjectivesClient`**

In `src/app/dashboard/objectives/page.tsx`, add `listEmployees` to the imports:
```typescript
import { listMyObjectives, listPendingApprovals, listAllObjectives } from "@/actions/objectives";
import { listEmployees } from "@/actions/employees";
```

Add `listEmployees()` to the `Promise.all`:
```typescript
  const [myResult, approvalsResult, allResult, employeesResult] = await Promise.all([
    listMyObjectives(),
    listPendingApprovals(),
    listAllObjectives(),
    listEmployees(),
  ]);
```

Add the result extraction:
```typescript
  const employees = employeesResult.success ? employeesResult.data : [];
```

Pass it to `ObjectivesClient`:
```tsx
      <ObjectivesClient
        myObjectives={myObjectives}
        pendingApprovals={pendingApprovals}
        allObjectives={allObjectives}
        isAdmin={isAdminUser}
        hasDirectReports={hasDirectReports}
        employees={employees}
      />
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd "C:/Users/amolg/Downloads/hr-portal" && npx tsc --noEmit 2>&1 | grep -E "objectives-client|objectives/page"
```

Expected: no errors on those files.

- [ ] **Step 6: Full build check**

```bash
cd "C:/Users/amolg/Downloads/hr-portal" && npm run build 2>&1 | tail -15
```

Expected: clean build, all pages generate successfully.

- [ ] **Step 7: Commit**

```bash
git add src/components/objectives/objectives-client.tsx src/app/dashboard/objectives/page.tsx
git commit -m "feat(objectives): wire employees list to ObjectivesClient and objectives page for admin bulk-set"
```

---

### Task 4: Push to GitHub

- [ ] **Step 1: Verify all commits are on main**

```bash
git log --oneline -5
```

Expected: see commits from Tasks 1–3.

- [ ] **Step 2: Push**

```bash
git push origin main
```
