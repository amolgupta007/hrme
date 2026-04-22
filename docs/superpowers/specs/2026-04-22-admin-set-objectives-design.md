# Admin-Set Objectives — Design Spec

**Date:** 2026-04-22  
**Status:** Approved

---

## Goal

Allow admins and owners to create objective sets on behalf of one or more employees in a single form submission. Each employee gets their own independent copy of the objective set and progresses through it independently.

---

## Architecture

### Data layer

`createObjectiveSet` in `src/actions/objectives.ts` accepts an optional `target_employee_ids: string[]`. Behaviour:

- If the caller is `admin` or `owner` AND `target_employee_ids` is non-empty: bulk-insert one `objectives` row per target employee, each with that employee's own `reporting_manager_id` as `manager_id`. Return `{ created: N }`.
- Otherwise (employee/manager, or admin with no targets selected): existing self-set behaviour — look up the caller's own employee record and insert a single row. Fully backwards-compatible.

No schema changes. The `objectives` table already has `employee_id`, `manager_id`, `org_id`, `period_type`, `period_label`, `items`, `status`.

### Zod schema change

```typescript
const createSchema = z.object({
  // existing fields unchanged
  period_type: z.enum(["quarterly", "yearly"]),
  period_label: z.string().min(1),
  items: z.array(itemSchema).min(1),
  // new optional field
  target_employee_ids: z.array(z.string().uuid()).optional(),
});
```

### UI layer

`CreateObjectiveDialog` (`src/components/objectives/create-objective-dialog.tsx`) gains:

- Optional `employees` prop: `Employee[]` (same type used in `CreateCycleDialog`)
- Optional `role` prop: `string` — used to conditionally render the picker

When `employees` is provided and `role` is `admin` or `owner`, a multi-select employee list renders at the top of the form:

- Checkbox list with employee name + designation (same pattern as `CreateCycleDialog`)
- "Select all" shortcut
- Selection count label: "3 employees selected"
- If zero employees selected → submits for self (existing flow, no UI change to the rest of the form)
- If one or more selected → submits for those employees

On submit with N > 0 targets: passes `target_employee_ids` to `createObjectiveSet`. Success toast: `"Objectives created for N employees"`. If N = 1, toast: `"Objectives created for [Name]"`.

### Objectives page wiring

`src/app/dashboard/objectives/page.tsx` already fetches employees (or can reuse the list fetched for the Team tab). Pass the active employee list and the current user's role down to `ObjectivesClient`, which passes them to `CreateObjectiveDialog`.

`ObjectivesClient` (`src/components/objectives/objectives-client.tsx`) already receives `role`. It needs an `employees` prop added so it can forward it to the dialog.

---

## Data Flow

```
Admin opens CreateObjectiveDialog
  → selects 3 employees from multi-select list
  → fills period, objective items, weights
  → submits

createObjectiveSet({ ..., target_employee_ids: [id1, id2, id3] })
  → verifies caller is admin/owner
  → looks up each employee's reporting_manager_id
  → bulk-inserts 3 independent objectives rows
  → returns { created: 3 }

Toast: "Objectives created for 3 employees"
Each employee sees their own copy in their Objectives tab
```

---

## Components & Files

| File | Change |
|------|--------|
| `src/actions/objectives.ts` | Add `target_employee_ids` to `createSchema`; add bulk-insert branch in `createObjectiveSet` |
| `src/components/objectives/create-objective-dialog.tsx` | Add `employees?: Employee[]` and `role?: string` props; render multi-select picker when admin/owner |
| `src/components/objectives/objectives-client.tsx` | Add `employees` prop; pass it and `role` to `CreateObjectiveDialog` |
| `src/app/dashboard/objectives/page.tsx` | Fetch active employees and pass to `ObjectivesClient` |

---

## Detailed Behaviour

### Employee picker

Rendered only when `employees` prop is present AND `role === "admin" || role === "owner"`.

```
For employees (optional)
[ ] Alice Johnson — Senior Engineer
[ ] Bob Smith — Product Manager  
[x] Carol Lee — Designer
[x] David Park — Engineer
                        Select all  (2 selected)
```

Positioned at the top of the form, above the period type selector. Uses the same `max-h-48 overflow-y-auto` scrollable list as `CreateCycleDialog`.

### Bulk insert logic

```typescript
if (isAdmin(user.role) && targetIds.length > 0) {
  const { data: targetEmps } = await supabase
    .from("employees")
    .select("id, reporting_manager_id")
    .in("id", targetIds)
    .eq("org_id", ctx.orgId);

  const inserts = (targetEmps ?? []).map((e) => ({
    org_id: ctx.orgId,
    employee_id: e.id,
    manager_id: e.reporting_manager_id,
    period_type: validated.data.period_type,
    period_label: validated.data.period_label,
    items: validated.data.items,
    status: "draft" as const,
  }));

  await supabase.from("objectives").insert(inserts);
  return { success: true, data: { created: inserts.length } };
}
// else: existing self-set path
```

### Success toast

- 0 targets selected (self-set): `"Objectives created"` (existing)
- 1 target: `"Objectives created for [First Last]"` — look up name from the `employees` prop
- 2+ targets: `"Objectives created for N employees"`

### Return type

`createObjectiveSet` currently returns `ActionResult<{ id: string }>`. The return type becomes `ActionResult<{ id: string } | { created: number }>`. The dialog checks `result.data` type to pick the correct toast.

---

## Error Handling

- If any target employee ID doesn't belong to the org, the server silently skips it (the `.eq("org_id", ctx.orgId)` filter handles this)
- If the bulk insert partially fails, return `{ success: false, error: error.message }`
- Weight validation (must sum to 100%) runs before the bulk insert, same as self-set

---

## What is NOT in scope

- Managers setting objectives for their direct reports (manager role excluded — admin/owner only)
- Editing an objective set that was admin-created on behalf of an employee (employee edits their own copy normally)
- Notifying employees when objectives are set for them
- Tracking who created the objective set (no `created_by` audit field)
