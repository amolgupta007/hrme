# Cycle ↔ Objectives Scoping — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scope which objective periods appear in a review cycle so managers see only the relevant approved objectives when conducting a review, not every objective the employee has ever had.

**Architecture:** Add `objective_period_labels TEXT[]` to `review_cycles`. Admin picks periods when creating a cycle. `listCycleReviews` passes those labels to `getApprovedObjectivesForEmployees` which filters by `period_label`. Empty array = no objectives shown (clean break, no fallback).

**Tech Stack:** Next.js 14 Server Actions, Supabase Postgres, Zod, Radix UI, TypeScript strict.

---

## Files

| File | Change |
|------|--------|
| Supabase SQL Editor | Add `objective_period_labels TEXT[]` column to `review_cycles` |
| `src/actions/objectives.ts` | Add `listObjectivePeriodLabels()`; update `getApprovedObjectivesForEmployees` signature |
| `src/actions/reviews.ts` | Add `objective_period_labels` to type, schema, insert, map, and `listCycleReviews` |
| `src/components/reviews/create-cycle-dialog.tsx` | Add period multi-select picker |

---

### Task 1: Add `objective_period_labels` column to `review_cycles`

**Files:**
- Supabase SQL Editor (manual step)

This is a manual step. No code changes in this task.

- [ ] **Step 1: Run the following SQL in the Supabase SQL Editor**

```sql
ALTER TABLE review_cycles
  ADD COLUMN objective_period_labels TEXT[] NOT NULL DEFAULT '{}';
```

Navigate to: Supabase Dashboard → SQL Editor → New query → paste → Run.

- [ ] **Step 2: Verify the column exists**

In Supabase Dashboard → Table Editor → `review_cycles` → confirm `objective_period_labels` column is present with type `text[]`.

---

### Task 2: Update `getApprovedObjectivesForEmployees` and add `listObjectivePeriodLabels`

**Files:**
- Modify: `src/actions/objectives.ts` (lines 167–180 and end of file)

**Context:** `getApprovedObjectivesForEmployees` currently has this signature (line 167):
```typescript
export async function getApprovedObjectivesForEmployees(
  orgId: string,
  employeeIds: string[]
): Promise<ObjectiveSet[]> {
  if (employeeIds.length === 0) return [];
  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from("objectives")
    .select(OBJ_SELECT)
    .in("employee_id", employeeIds)
    .eq("org_id", orgId)
    .eq("status", "approved");
  return mapObjectives(data ?? []);
}
```

- [ ] **Step 1: Update `getApprovedObjectivesForEmployees` to accept an optional `periodLabels` param**

Find:
```typescript
export async function getApprovedObjectivesForEmployees(
  orgId: string,
  employeeIds: string[]
): Promise<ObjectiveSet[]> {
  if (employeeIds.length === 0) return [];
  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from("objectives")
    .select(OBJ_SELECT)
    .in("employee_id", employeeIds)
    .eq("org_id", orgId)
    .eq("status", "approved");
  return mapObjectives(data ?? []);
}
```

Replace with:
```typescript
export async function getApprovedObjectivesForEmployees(
  orgId: string,
  employeeIds: string[],
  periodLabels?: string[]
): Promise<ObjectiveSet[]> {
  if (employeeIds.length === 0) return [];
  if (periodLabels !== undefined && periodLabels.length === 0) return [];
  const supabase = createAdminSupabase();
  let query = supabase
    .from("objectives")
    .select(OBJ_SELECT)
    .in("employee_id", employeeIds)
    .eq("org_id", orgId)
    .eq("status", "approved");
  if (periodLabels && periodLabels.length > 0) {
    query = query.in("period_label", periodLabels);
  }
  const { data } = await query;
  return mapObjectives(data ?? []);
}
```

- [ ] **Step 2: Add `listObjectivePeriodLabels` at the end of the objectives actions section**

Find the line:
```typescript
// ---- Mutation actions ----
```

Insert before it:
```typescript
export async function listObjectivePeriodLabels(): Promise<ActionResult<string[]>> {
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("objectives")
    .select("period_label")
    .eq("org_id", ctx.orgId)
    .order("period_label", { ascending: true });
  if (error) return { success: false, error: error.message };
  const labels = [...new Set((data ?? []).map((r: any) => r.period_label as string))].sort();
  return { success: true, data: labels };
}

```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd "C:/Users/amolg/Downloads/hr-portal" && npx tsc --noEmit 2>&1 | grep "objectives.ts"
```

Expected: no errors on `objectives.ts` lines.

- [ ] **Step 4: Commit**

```bash
git add src/actions/objectives.ts
git commit -m "feat(objectives): add period filter to getApprovedObjectivesForEmployees, add listObjectivePeriodLabels"
```

---

### Task 3: Update `reviews.ts` — type, schema, insert, map, and `listCycleReviews`

**Files:**
- Modify: `src/actions/reviews.ts`

**Context:** Key locations in `src/actions/reviews.ts`:
- `ReviewCycleWithStats` type starts at line 13
- `cycleSchema` at line 49
- `createReviewCycle` at line 96 — inserts into `review_cycles`
- `listReviewCycles` at line 58 — maps cycle rows
- `listCycleReviews` at line 216 — calls `getApprovedObjectivesForEmployees`

- [ ] **Step 1: Add `objective_period_labels` to `ReviewCycleWithStats`**

Find:
```typescript
export type ReviewCycleWithStats = {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  status: "draft" | "active" | "completed";
  start_date: string;
  end_date: string;
  created_at: string;
  rating_scale: 3 | 5 | 10;
  total_reviews: number;
  completed_reviews: number;
};
```

Replace with:
```typescript
export type ReviewCycleWithStats = {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  status: "draft" | "active" | "completed";
  start_date: string;
  end_date: string;
  created_at: string;
  rating_scale: 3 | 5 | 10;
  objective_period_labels: string[];
  total_reviews: number;
  completed_reviews: number;
};
```

- [ ] **Step 2: Add `objective_period_labels` to `cycleSchema`**

Find:
```typescript
const cycleSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  start_date: z.string().min(1, "Start date is required"),
  end_date: z.string().min(1, "End date is required"),
  employee_ids: z.array(z.string().uuid()).min(1, "Select at least one employee"),
  rating_scale: z.union([z.literal(3), z.literal(5), z.literal(10)]).default(5),
});
```

Replace with:
```typescript
const cycleSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  start_date: z.string().min(1, "Start date is required"),
  end_date: z.string().min(1, "End date is required"),
  employee_ids: z.array(z.string().uuid()).min(1, "Select at least one employee"),
  rating_scale: z.union([z.literal(3), z.literal(5), z.literal(10)]).default(5),
  objective_period_labels: z.array(z.string()).default([]),
});
```

- [ ] **Step 3: Add `objective_period_labels` to the `createReviewCycle` insert**

Find the insert call inside `createReviewCycle`:
```typescript
  const { data: cycle, error: cycleError } = await supabase
    .from("review_cycles")
    .insert({
      org_id: ctx.orgId,
      name: validated.data.name,
      description: validated.data.description || null,
      start_date: validated.data.start_date,
      end_date: validated.data.end_date,
      status: "draft",
      rating_scale: validated.data.rating_scale,
    })
    .select("id")
    .single();
```

Replace with:
```typescript
  const { data: cycle, error: cycleError } = await supabase
    .from("review_cycles")
    .insert({
      org_id: ctx.orgId,
      name: validated.data.name,
      description: validated.data.description || null,
      start_date: validated.data.start_date,
      end_date: validated.data.end_date,
      status: "draft",
      rating_scale: validated.data.rating_scale,
      objective_period_labels: validated.data.objective_period_labels,
    })
    .select("id")
    .single();
```

- [ ] **Step 4: Add `objective_period_labels` to the `listReviewCycles` map**

Find the result map in `listReviewCycles`:
```typescript
  const result = (cycles ?? []).map((c: any) => ({
    ...c,
    rating_scale: (c.rating_scale as 3 | 5 | 10) ?? 5,
    total_reviews: statsMap[c.id]?.total ?? 0,
    completed_reviews: statsMap[c.id]?.completed ?? 0,
  }));
```

Replace with:
```typescript
  const result = (cycles ?? []).map((c: any) => ({
    ...c,
    rating_scale: (c.rating_scale as 3 | 5 | 10) ?? 5,
    objective_period_labels: (c.objective_period_labels as string[]) ?? [],
    total_reviews: statsMap[c.id]?.total ?? 0,
    completed_reviews: statsMap[c.id]?.completed ?? 0,
  }));
```

- [ ] **Step 5: Update `listCycleReviews` to fetch the cycle's period labels and pass them**

Find inside `listCycleReviews` (after the `if (error)` check, before the `baseReviews` map):
```typescript
  const employeeIds = [...new Set(baseReviews.map((r) => r.employee_id))];
  const allObjectives = await getApprovedObjectivesForEmployees(ctx.orgId, employeeIds);
```

Replace with:
```typescript
  const employeeIds = [...new Set(baseReviews.map((r) => r.employee_id))];

  // Fetch the cycle to get its linked objective periods
  const { data: cycleRow } = await supabase
    .from("review_cycles")
    .select("objective_period_labels")
    .eq("id", cycleId)
    .single();
  const periodLabels: string[] = (cycleRow as any)?.objective_period_labels ?? [];

  const allObjectives = await getApprovedObjectivesForEmployees(ctx.orgId, employeeIds, periodLabels);
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd "C:/Users/amolg/Downloads/hr-portal" && npx tsc --noEmit 2>&1 | grep "reviews.ts"
```

Expected: no errors on `reviews.ts` lines.

- [ ] **Step 7: Commit**

```bash
git add src/actions/reviews.ts
git commit -m "feat(reviews): add objective_period_labels to cycle schema, type, insert, and listCycleReviews filter"
```

---

### Task 4: Add period picker to `CreateCycleDialog`

**Files:**
- Modify: `src/components/reviews/create-cycle-dialog.tsx`

**Context:** The full file is 250 lines. Key locations:
- Imports: lines 1–12
- State declarations: lines 24–30
- `useEffect` reset: lines 32–41
- `handleSubmit` → `createReviewCycle` call: lines 62–84
- Description field JSX: lines 158–166 (ends the `</div>`)
- Employee picker section starts at line 192

- [ ] **Step 1: Add `listObjectivePeriodLabels` to the import**

Find:
```typescript
import { createReviewCycle } from "@/actions/reviews";
```

Replace with:
```typescript
import { createReviewCycle } from "@/actions/reviews";
import { listObjectivePeriodLabels } from "@/actions/objectives";
```

- [ ] **Step 2: Add `availablePeriods` and `selectedPeriods` state**

Find:
```typescript
  const [ratingScale, setRatingScale] = React.useState<3 | 5 | 10>(5);
  const [loading, setLoading] = React.useState(false);
```

Replace with:
```typescript
  const [ratingScale, setRatingScale] = React.useState<3 | 5 | 10>(5);
  const [availablePeriods, setAvailablePeriods] = React.useState<string[]>([]);
  const [selectedPeriods, setSelectedPeriods] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);
```

- [ ] **Step 3: Fetch available periods and reset `selectedPeriods` when dialog opens**

Find:
```typescript
  React.useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setStartDate("");
      setEndDate("");
      setSelectedIds([]);
      setRatingScale(5);
    }
  }, [open]);
```

Replace with:
```typescript
  React.useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setStartDate("");
      setEndDate("");
      setSelectedIds([]);
      setRatingScale(5);
      setSelectedPeriods([]);
      listObjectivePeriodLabels().then((result) => {
        setAvailablePeriods(result.success ? result.data : []);
      });
    }
  }, [open]);
```

- [ ] **Step 4: Pass `objective_period_labels` in the `createReviewCycle` call**

Find:
```typescript
    const result = await createReviewCycle({
      name,
      description,
      start_date: startDate,
      end_date: endDate,
      employee_ids: selectedIds,
      rating_scale: ratingScale,
    });
```

Replace with:
```typescript
    const result = await createReviewCycle({
      name,
      description,
      start_date: startDate,
      end_date: endDate,
      employee_ids: selectedIds,
      rating_scale: ratingScale,
      objective_period_labels: selectedPeriods,
    });
```

- [ ] **Step 5: Add period picker JSX after the Description field**

Find:
```typescript
            <div className="space-y-1.5">
              <Label.Root className="text-sm font-medium">Description</Label.Root>
              <input
                className={inputCn}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
```

Replace with:
```typescript
            <div className="space-y-1.5">
              <Label.Root className="text-sm font-medium">Description</Label.Root>
              <input
                className={inputCn}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional"
              />
            </div>

            {availablePeriods.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label.Root className="text-sm font-medium">
                    Objective periods
                    {selectedPeriods.length > 0 && (
                      <span className="ml-2 font-normal text-muted-foreground">
                        ({selectedPeriods.length} selected)
                      </span>
                    )}
                  </Label.Root>
                  <button
                    type="button"
                    onClick={() => setSelectedPeriods([...availablePeriods])}
                    className="text-xs text-primary hover:underline"
                  >
                    Select all
                  </button>
                </div>
                <div className="max-h-40 overflow-y-auto rounded-lg border border-input divide-y divide-border">
                  {availablePeriods.map((period) => (
                    <label
                      key={period}
                      className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40 transition-colors"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input accent-primary"
                        checked={selectedPeriods.includes(period)}
                        onChange={() =>
                          setSelectedPeriods((prev) =>
                            prev.includes(period)
                              ? prev.filter((p) => p !== period)
                              : [...prev, period]
                          )
                        }
                      />
                      <p className="text-sm font-medium">{period}</p>
                    </label>
                  ))}
                </div>
                {selectedPeriods.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No periods selected — objectives won&apos;t appear in reviews for this cycle.
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd "C:/Users/amolg/Downloads/hr-portal" && npx tsc --noEmit 2>&1 | grep "create-cycle-dialog"
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/reviews/create-cycle-dialog.tsx
git commit -m "feat(reviews): add objective period picker to CreateCycleDialog"
```

---

### Task 5: Full build check and push

- [ ] **Step 1: Run full TypeScript check**

```bash
cd "C:/Users/amolg/Downloads/hr-portal" && npx tsc --noEmit 2>&1 | grep -E "objectives|reviews|create-cycle"
```

Expected: no errors on any of those files.

- [ ] **Step 2: Run production build**

```bash
cd "C:/Users/amolg/Downloads/hr-portal" && npm run build 2>&1 | tail -15
```

Expected: clean build, all pages generate successfully.

- [ ] **Step 3: Verify all commits are on main**

```bash
git log --oneline -5
```

Expected: see commits from Tasks 2–4.

- [ ] **Step 4: Push to GitHub**

```bash
git push origin main
```
