# Rating Scale Per Review Cycle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow admins to choose a 3-, 5-, or 10-point rating scale when creating a review cycle; replace the 5-star widget with numbered chips; configure per-scale labels in Performance Settings.

**Architecture:** `rating_scale` is stored on `review_cycles`, flows through `ReviewCycleWithStats` → `ReviewsClient` → `ReviewDialog`. A new `NumberRating` component replaces `StarRating` everywhere in the dialog. Org-level labels for the 3-point and 10-point scales live in `organizations.settings.performance` alongside the existing 5-point labels.

**Tech Stack:** Next.js 14 Server Actions, Supabase Postgres, Radix UI, Tailwind CSS, Zod, TypeScript strict.

---

### Task 1: Add `rating_scale` column to Supabase

**Files:**
- No code files — SQL run directly in Supabase Dashboard SQL Editor

- [ ] **Step 1: Run migration SQL**

Open Supabase Dashboard → SQL Editor → New query. Paste and run:

```sql
ALTER TABLE review_cycles
  ADD COLUMN IF NOT EXISTS rating_scale INTEGER NOT NULL DEFAULT 5
  CHECK (rating_scale IN (3, 5, 10));
```

Expected output: `ALTER TABLE` with no error. Verify by running:

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'review_cycles' AND column_name = 'rating_scale';
```

Expected: one row, `integer`, default `5`.

---

### Task 2: Extend `PerformanceSettings` type and `getPerformanceSettings()`

**Files:**
- Modify: `src/lib/performance-settings.ts`

- [ ] **Step 1: Update the type and defaults**

Replace the entire file content:

```typescript
export type PerformanceSettings = {
  rating_labels: [string, string, string, string, string];
  rating_labels_3: [string, string, string];
  rating_labels_10_anchors: [string, string, string];
  competencies: string[];
  self_review_required: boolean;
};

const DEFAULTS: PerformanceSettings = {
  rating_labels: ["Poor", "Fair", "Good", "Great", "Excellent"],
  rating_labels_3: ["Needs Improvement", "Meets Expectations", "Exceeds Expectations"],
  rating_labels_10_anchors: ["Poor", "Average", "Excellent"],
  competencies: [],
  self_review_required: true,
};

export function getPerformanceSettings(orgSettings: Record<string, any> | null): PerformanceSettings {
  const perf = orgSettings?.performance ?? {};
  return {
    rating_labels:
      Array.isArray(perf.rating_labels) &&
      perf.rating_labels.length === 5 &&
      (perf.rating_labels as unknown[]).every((l) => typeof l === "string" && l.length > 0)
        ? (perf.rating_labels as [string, string, string, string, string])
        : DEFAULTS.rating_labels,
    rating_labels_3:
      Array.isArray(perf.rating_labels_3) &&
      perf.rating_labels_3.length === 3 &&
      (perf.rating_labels_3 as unknown[]).every((l) => typeof l === "string" && l.length > 0)
        ? (perf.rating_labels_3 as [string, string, string])
        : DEFAULTS.rating_labels_3,
    rating_labels_10_anchors:
      Array.isArray(perf.rating_labels_10_anchors) &&
      perf.rating_labels_10_anchors.length === 3 &&
      (perf.rating_labels_10_anchors as unknown[]).every((l) => typeof l === "string" && l.length > 0)
        ? (perf.rating_labels_10_anchors as [string, string, string])
        : DEFAULTS.rating_labels_10_anchors,
    competencies: Array.isArray(perf.competencies) ? perf.competencies : DEFAULTS.competencies,
    self_review_required:
      typeof perf.self_review_required === "boolean"
        ? perf.self_review_required
        : DEFAULTS.self_review_required,
  };
}

// Goals JSONB structure — supports both old array format and new object format
export type GoalsData = {
  items: { title: string; status: "pending" | "achieved" | "missed" }[];
  self_competency_ratings: Record<string, number>;
  manager_competency_ratings: Record<string, number>;
};

export function normalizeGoalsData(raw: unknown): GoalsData {
  if (Array.isArray(raw)) {
    const VALID_STATUSES = new Set(["pending", "achieved", "missed"]);
    const items = (raw as any[]).filter(
      (i): i is GoalsData["items"][number] =>
        i !== null &&
        typeof i === "object" &&
        typeof i.title === "string" &&
        VALID_STATUSES.has(i.status)
    );
    return { items, self_competency_ratings: {}, manager_competency_ratings: {} };
  }
  if (raw && typeof raw === "object") {
    const obj = raw as any;
    return {
      items: Array.isArray(obj.items) ? obj.items : [],
      self_competency_ratings: obj.self_competency_ratings ?? {},
      manager_competency_ratings: obj.manager_competency_ratings ?? {},
    };
  }
  return { items: [], self_competency_ratings: {}, manager_competency_ratings: {} };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | head -20
```

Expected: zero errors (or only pre-existing unrelated errors).

- [ ] **Step 3: Commit**

```bash
git add src/lib/performance-settings.ts
git commit -m "feat(settings): add rating_labels_3 and rating_labels_10_anchors to PerformanceSettings"
```

---

### Task 3: Update `reviews.ts` — schema, type, and create action

**Files:**
- Modify: `src/actions/reviews.ts`

- [ ] **Step 1: Add `rating_scale` to `ReviewCycleWithStats` type**

In `src/actions/reviews.ts`, find:

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
  total_reviews: number;
  completed_reviews: number;
};
```

- [ ] **Step 2: Add `rating_scale` to `cycleSchema`**

Find:

```typescript
const cycleSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  start_date: z.string().min(1, "Start date is required"),
  end_date: z.string().min(1, "End date is required"),
  employee_ids: z.array(z.string().uuid()).min(1, "Select at least one employee"),
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
});
```

- [ ] **Step 3: Pass `rating_scale` in `createReviewCycle` insert**

Find the insert block:

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
    })
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
      rating_scale: validated.data.rating_scale,
      status: "draft",
    })
```

- [ ] **Step 4: Ensure `listReviewCycles` spreads `rating_scale`**

The current mapper is `(c: any) => ({ ...c, total_reviews, completed_reviews })`. The spread already includes every DB column, so `rating_scale` comes through automatically — no change needed.

However, the returned type needs a default for legacy rows (pre-column). Find the map in `listReviewCycles`:

```typescript
  const result = (cycles ?? []).map((c: any) => ({
    ...c,
    total_reviews: statsMap[c.id]?.total ?? 0,
    completed_reviews: statsMap[c.id]?.completed ?? 0,
  }));
```

Replace with:

```typescript
  const result = (cycles ?? []).map((c: any) => ({
    ...c,
    rating_scale: (c.rating_scale as 3 | 5 | 10) ?? 5,
    total_reviews: statsMap[c.id]?.total ?? 0,
    completed_reviews: statsMap[c.id]?.completed ?? 0,
  }));
```

- [ ] **Step 5: Add `rating_scale` to `MyReviewWithCycle`**

Find:

```typescript
export type MyReviewWithCycle = ReviewWithDetails & {
  cycle_name: string;
  cycle_start_date: string;
  cycle_end_date: string;
};
```

Replace with:

```typescript
export type MyReviewWithCycle = ReviewWithDetails & {
  cycle_name: string;
  cycle_start_date: string;
  cycle_end_date: string;
  cycle_rating_scale: 3 | 5 | 10;
};
```

- [ ] **Step 6: Populate `cycle_rating_scale` in `listMyReviews`**

Find the map in `listMyReviews`:

```typescript
    cycle_start_date: r.review_cycles?.start_date ?? "",
    cycle_end_date: r.review_cycles?.end_date ?? "",
```

Replace with:

```typescript
    cycle_start_date: r.review_cycles?.start_date ?? "",
    cycle_end_date: r.review_cycles?.end_date ?? "",
    cycle_rating_scale: (r.review_cycles?.rating_scale as 3 | 5 | 10) ?? 5,
```

Also update the `listMyReviews` select query to include `rating_scale` from the cycle:

Find:

```typescript
    .select("*, review_cycles(name, start_date, end_date), employees!employee_id(first_name, last_name), reviewers:employees!reviewer_id(first_name, last_name)")
```

Replace with:

```typescript
    .select("*, review_cycles(name, start_date, end_date, rating_scale), employees!employee_id(first_name, last_name), reviewers:employees!reviewer_id(first_name, last_name)")
```

- [ ] **Step 7: Verify build**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 8: Commit**

```bash
git add src/actions/reviews.ts
git commit -m "feat(reviews): add rating_scale to ReviewCycleWithStats, cycleSchema, and createReviewCycle"
```

---

### Task 4: Add scale picker to `CreateCycleDialog`

**Files:**
- Modify: `src/components/reviews/create-cycle-dialog.tsx`

- [ ] **Step 1: Add `ratingScale` state and reset it on open**

Find the existing state block:

```typescript
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setStartDate("");
      setEndDate("");
      setSelectedIds([]);
    }
  }, [open]);
```

Replace with:

```typescript
  const [ratingScale, setRatingScale] = React.useState<3 | 5 | 10>(5);
  const [loading, setLoading] = React.useState(false);

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

- [ ] **Step 2: Pass `rating_scale` in `handleSubmit`**

Find:

```typescript
    const result = await createReviewCycle({
      name,
      description,
      start_date: startDate,
      end_date: endDate,
      employee_ids: selectedIds,
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
    });
```

- [ ] **Step 3: Add scale picker JSX below the cycle name field**

Find the description field block:

```tsx
            <div className="space-y-1.5">
              <Label.Root className="text-sm font-medium">Description</Label.Root>
              <input
                className={inputCn}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional"
              />
            </div>
```

Replace with:

```tsx
            <div className="space-y-1.5">
              <Label.Root className="text-sm font-medium">Rating Scale</Label.Root>
              <div className="flex gap-2">
                {([3, 5, 10] as const).map((scale) => (
                  <button
                    key={scale}
                    type="button"
                    onClick={() => setRatingScale(scale)}
                    className={cn(
                      "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                      ratingScale === scale
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-muted/50"
                    )}
                  >
                    {scale}-point
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label.Root className="text-sm font-medium">Description</Label.Root>
              <input
                className={inputCn}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional"
              />
            </div>
```

- [ ] **Step 4: Add `cn` import if not already present** (it is already imported — no change needed)

- [ ] **Step 5: Verify build**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 6: Commit**

```bash
git add src/components/reviews/create-cycle-dialog.tsx
git commit -m "feat(reviews): add 3/5/10-point scale picker to CreateCycleDialog"
```

---

### Task 5: Add `NumberRating` component and replace `StarRating` in `ReviewDialog`

**Files:**
- Modify: `src/components/reviews/review-dialog.tsx`

- [ ] **Step 1: Remove the `Star` import from lucide-react**

Find the imports at the top of the file. There will be a `Star` import from `lucide-react`. Remove it (keep other lucide imports).

- [ ] **Step 2: Add `NumberRating` component — paste before `const inputCn` line**

Find:

```typescript
const inputCn =
  "flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";
```

Insert the `NumberRating` component before it (replace the `StarRating` function at line 32 with `NumberRating`):

First, delete the entire `StarRating` function (lines 32–74 in the current file). Then add `NumberRating` in its place:

```typescript
function NumberRating({
  value,
  onChange,
  scale,
  labels,
}: {
  value: number;
  onChange?: (v: number) => void;
  scale: 3 | 5 | 10;
  labels: string[];
}) {
  const chips = Array.from({ length: scale }, (_, i) => i + 1);

  // For scale=10: anchor labels shown at positions 1, 5, 10
  function getLabelBelow(n: number): string | null {
    if (scale === 10) {
      if (n === 1) return labels[0] ?? null;
      if (n === 5) return labels[1] ?? null;
      if (n === 10) return labels[2] ?? null;
      return null;
    }
    // scale 3 or 5: show label under selected chip only
    return value === n ? (labels[n - 1] ?? null) : null;
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1.5">
        {chips.map((n) => (
          <div key={n} className="flex flex-col items-center gap-0.5">
            <button
              type="button"
              onClick={() => onChange?.(n)}
              disabled={!onChange}
              className={cn(
                "h-9 min-w-[2.25rem] rounded-md border px-2 text-sm font-medium transition-colors",
                onChange ? "cursor-pointer" : "cursor-default",
                value === n
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-muted/50 text-foreground"
              )}
            >
              {n}
            </button>
            <span className="text-[10px] text-muted-foreground h-3 leading-none">
              {scale === 10 ? (getLabelBelow(n) ?? "") : ""}
            </span>
          </div>
        ))}
      </div>
      {scale !== 10 && value > 0 && labels[value - 1] && (
        <p className="text-xs font-medium text-muted-foreground">{labels[value - 1]}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add `rating_scale` prop to `ReviewDialogProps`**

Find:

```typescript
interface ReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  review: ReviewWithDetails;
  mode: "self" | "manager" | "view";
  performanceSettings: PerformanceSettings;
}

export function ReviewDialog({ open, onOpenChange, review, mode, performanceSettings }: ReviewDialogProps) {
```

Replace with:

```typescript
interface ReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  review: ReviewWithDetails;
  mode: "self" | "manager" | "view";
  performanceSettings: PerformanceSettings;
  rating_scale?: 3 | 5 | 10;
}

export function ReviewDialog({ open, onOpenChange, review, mode, performanceSettings, rating_scale = 5 }: ReviewDialogProps) {
```

- [ ] **Step 4: Derive the correct labels inside `ReviewDialog`**

Immediately after the opening brace of `ReviewDialog`, after the existing `React.useState` declarations, add:

```typescript
  const scale = rating_scale;
  const ratingLabels: string[] =
    scale === 3
      ? performanceSettings.rating_labels_3
      : scale === 10
        ? performanceSettings.rating_labels_10_anchors
        : performanceSettings.rating_labels;
```

- [ ] **Step 5: Replace all `<StarRating` with `<NumberRating` in the JSX**

There are three `<StarRating` usages (lines ~190, ~209, ~232, ~236 in the original). Replace each one:

**Overall self/manager rating (interactive):**

Find:
```tsx
              <StarRating value={rating} onChange={isReadOnly ? undefined : setRating} labels={performanceSettings.rating_labels} />
```

Replace with:
```tsx
              <NumberRating value={rating} onChange={isReadOnly ? undefined : setRating} scale={scale} labels={ratingLabels} />
```

**Completed view — self rating:**

Find:
```tsx
                  <StarRating value={review.self_rating ?? 0} labels={performanceSettings.rating_labels} />
```

Replace with:
```tsx
                  <NumberRating value={review.self_rating ?? 0} scale={scale} labels={ratingLabels} />
```

**Completed view — manager rating:**

Find:
```tsx
                  <StarRating value={review.manager_rating ?? 0} labels={performanceSettings.rating_labels} />
```

Replace with:
```tsx
                  <NumberRating value={review.manager_rating ?? 0} scale={scale} labels={ratingLabels} />
```

- [ ] **Step 6: Update submit validation to use dynamic scale**

In `handleSubmit`, find the self-review validation:

```typescript
      self_rating: z.number().min(1).max(5),
```

This is in `selfReviewSchema` in `reviews.ts` — the schema there hardcodes `max(5)`. For now the dialog-side validation uses `rating >= 1`. Find where the rating is validated in `handleSubmit` (inside `ReviewDialog`) and ensure the check uses `scale`:

Find any inline check like `if (rating < 1 || rating > 5)` and replace with:
```typescript
if (rating < 1 || rating > scale) {
  toast.error(`Rating must be between 1 and ${scale}`);
  return;
}
```

If no inline check exists, add it before the `submitSelfReview` / `submitManagerReview` call:
```typescript
    if (rating < 1 || rating > scale) {
      toast.error(`Please select a rating`);
      return;
    }
```

- [ ] **Step 7: Verify build**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 8: Commit**

```bash
git add src/components/reviews/review-dialog.tsx
git commit -m "feat(reviews): replace StarRating with NumberRating component, add rating_scale prop"
```

---

### Task 6: Update Performance Settings — add 3-point and 10-point label editors

**Files:**
- Modify: `src/actions/settings.ts`
- Modify: `src/components/settings/performance-section.tsx`

- [ ] **Step 1: Extend `performanceSettingsSchema` in `settings.ts`**

Find:

```typescript
const performanceSettingsSchema = z.object({
  rating_labels: z.tuple([
    z.string().min(1),
    z.string().min(1),
    z.string().min(1),
    z.string().min(1),
    z.string().min(1),
  ]),
  competencies: z.array(z.string().min(1)).max(8),
  self_review_required: z.boolean(),
});
```

Replace with:

```typescript
const performanceSettingsSchema = z.object({
  rating_labels: z.tuple([
    z.string().min(1),
    z.string().min(1),
    z.string().min(1),
    z.string().min(1),
    z.string().min(1),
  ]),
  rating_labels_3: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1)]),
  rating_labels_10_anchors: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1)]),
  competencies: z.array(z.string().min(1)).max(8),
  self_review_required: z.boolean(),
});
```

- [ ] **Step 2: Update `updatePerformanceSettings` parameter type**

The function signature accepts `data: PerformanceSettings`. Since `PerformanceSettings` now includes the two new fields, the signature is already correct — no change needed after Task 2 is done.

- [ ] **Step 3: Add state and editors in `PerformanceSection`**

Replace the entire `performance-section.tsx` file content:

```typescript
"use client";

import * as React from "react";
import * as Label from "@radix-ui/react-label";
import { Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { updatePerformanceSettings } from "@/actions/settings";
import type { PerformanceSettings } from "@/lib/performance-settings";

const inputCn =
  "flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";

interface PerformanceSectionProps {
  initialSettings: PerformanceSettings;
}

export function PerformanceSection({ initialSettings }: PerformanceSectionProps) {
  const [labels, setLabels] = React.useState<[string, string, string, string, string]>(
    initialSettings.rating_labels
  );
  const [labels3, setLabels3] = React.useState<[string, string, string]>(
    initialSettings.rating_labels_3
  );
  const [labels10, setLabels10] = React.useState<[string, string, string]>(
    initialSettings.rating_labels_10_anchors
  );
  const [competencies, setCompetencies] = React.useState<string[]>(initialSettings.competencies);
  const [newCompetency, setNewCompetency] = React.useState("");
  const [selfReviewRequired, setSelfReviewRequired] = React.useState(initialSettings.self_review_required);
  const [loading, setLoading] = React.useState(false);

  function updateLabel(idx: number, value: string) {
    setLabels((prev) => {
      const next = [...prev] as [string, string, string, string, string];
      next[idx] = value;
      return next;
    });
  }

  function updateLabel3(idx: number, value: string) {
    setLabels3((prev) => {
      const next = [...prev] as [string, string, string];
      next[idx] = value;
      return next;
    });
  }

  function updateLabel10(idx: number, value: string) {
    setLabels10((prev) => {
      const next = [...prev] as [string, string, string];
      next[idx] = value;
      return next;
    });
  }

  function addCompetency() {
    const trimmed = newCompetency.trim();
    if (!trimmed) return;
    if (competencies.length >= 8) { toast.error("Maximum 8 competencies"); return; }
    if (competencies.includes(trimmed)) { toast.error("Already added"); return; }
    setCompetencies((prev) => [...prev, trimmed]);
    setNewCompetency("");
  }

  function removeCompetency(idx: number) {
    setCompetencies((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    if (labels.some((l) => !l.trim()) || labels3.some((l) => !l.trim()) || labels10.some((l) => !l.trim())) {
      toast.error("All rating labels must be filled in");
      return;
    }
    setLoading(true);
    const result = await updatePerformanceSettings({
      rating_labels: labels,
      rating_labels_3: labels3,
      rating_labels_10_anchors: labels10,
      competencies,
      self_review_required: selfReviewRequired,
    });
    setLoading(false);
    if (result.success) toast.success("Performance settings saved");
    else toast.error(result.error);
  }

  return (
    <div className="space-y-6">
      {/* 5-Point Rating Labels */}
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium">5-Point Rating Labels</p>
          <p className="text-xs text-muted-foreground mt-0.5">Labels for each position in the 5-point scale.</p>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {labels.map((label, idx) => (
            <div key={idx} className="space-y-1">
              <Label.Root className="text-xs text-muted-foreground">Point {idx + 1}</Label.Root>
              <input
                className={cn(inputCn, "h-9 text-xs")}
                value={label}
                onChange={(e) => updateLabel(idx, e.target.value)}
                placeholder={`Label ${idx + 1}`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* 3-Point Rating Labels */}
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium">3-Point Rating Labels</p>
          <p className="text-xs text-muted-foreground mt-0.5">Labels for each position in the 3-point scale.</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {labels3.map((label, idx) => (
            <div key={idx} className="space-y-1">
              <Label.Root className="text-xs text-muted-foreground">Point {idx + 1}</Label.Root>
              <input
                className={cn(inputCn, "h-9 text-xs")}
                value={label}
                onChange={(e) => updateLabel3(idx, e.target.value)}
                placeholder={`Label ${idx + 1}`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* 10-Point Anchor Labels */}
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium">10-Point Anchor Labels</p>
          <p className="text-xs text-muted-foreground mt-0.5">Shown at positions 1, 5, and 10 on the 10-point scale.</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(["Position 1", "Position 5", "Position 10"] as const).map((pos, idx) => (
            <div key={idx} className="space-y-1">
              <Label.Root className="text-xs text-muted-foreground">{pos}</Label.Root>
              <input
                className={cn(inputCn, "h-9 text-xs")}
                value={labels10[idx]}
                onChange={(e) => updateLabel10(idx, e.target.value)}
                placeholder={pos}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Competencies */}
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium">Competencies</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Define up to 8 competencies. When set, managers can rate each dimension in the review dialog.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {competencies.map((c, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-medium"
            >
              {c}
              <button
                type="button"
                onClick={() => removeCompetency(idx)}
                className="ml-1 hover:text-destructive transition-colors"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          ))}
          {competencies.length === 0 && (
            <p className="text-xs text-muted-foreground italic">No competencies — add one below.</p>
          )}
        </div>
        {competencies.length < 8 && (
          <div className="flex gap-2">
            <input
              className={cn(inputCn, "h-9 max-w-xs")}
              value={newCompetency}
              onChange={(e) => setNewCompetency(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCompetency(); } }}
              placeholder="e.g. Communication"
            />
            <Button type="button" variant="outline" size="sm" onClick={addCompetency}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add
            </Button>
          </div>
        )}
      </div>

      {/* Self-review Policy */}
      <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
        <div>
          <p className="text-sm font-medium">Require self-review before manager review</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            When on, managers cannot submit their review until the employee completes self-review.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSelfReviewRequired((v) => !v)}
          className="text-primary"
        >
          {selfReviewRequired
            ? <ToggleRight className="h-7 w-7" />
            : <ToggleLeft className="h-7 w-7 text-muted-foreground" />
          }
        </button>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={loading}>
          {loading ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add src/actions/settings.ts src/components/settings/performance-section.tsx
git commit -m "feat(settings): add 3-point and 10-point anchor label editors to PerformanceSection"
```

---

### Task 7: Wire `rating_scale` through `ReviewsClient` to `ReviewDialog`

**Files:**
- Modify: `src/components/reviews/reviews-client.tsx`

- [ ] **Step 1: Pass `rating_scale` to `ReviewDialog` from `activeCycle`**

Find:

```tsx
      {reviewDialog && (
        <ReviewDialog
          open
          onOpenChange={(open) => { if (!open) setReviewDialog(null); }}
          review={reviewDialog.review}
          mode={reviewDialog.mode}
          performanceSettings={performanceSettings}
        />
      )}
```

Replace with:

```tsx
      {reviewDialog && (
        <ReviewDialog
          open
          onOpenChange={(open) => { if (!open) setReviewDialog(null); }}
          review={reviewDialog.review}
          mode={reviewDialog.mode}
          performanceSettings={performanceSettings}
          rating_scale={activeCycle?.rating_scale ?? 5}
        />
      )}
```

- [ ] **Step 2: Check My Reviews tab**

The My Reviews tab shows `ReviewDialog` for employee self-review from `myReviews` (type `MyReviewWithCycle[]`). Search for any second `<ReviewDialog` in reviews-client.tsx:

```bash
grep -n "ReviewDialog" src/components/reviews/reviews-client.tsx
```

If a second `ReviewDialog` exists for the My Reviews tab, pass `rating_scale={review.cycle_rating_scale ?? 5}` where `review` is of type `MyReviewWithCycle`.

- [ ] **Step 3: Full production build**

```bash
npm run build 2>&1 | tail -20
```

Expected: all static pages generate successfully, zero TypeScript or import errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/reviews/reviews-client.tsx
git commit -m "feat(reviews): wire rating_scale from activeCycle to ReviewDialog"
```

---

### Task 8: Final push to GitHub

- [ ] **Step 1: Verify all commits are on main**

```bash
git log --oneline -8
```

Expected: see commits from Tasks 2–7 all on `main`.

- [ ] **Step 2: Push**

```bash
git push origin main
```

Expected: `main -> main` with no rejected pushes.
