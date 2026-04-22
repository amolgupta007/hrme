# Cycle ↔ Objectives Scoping — Design Spec

**Date:** 2026-04-22  
**Status:** Approved

---

## Goal

Scope which objective periods appear inside a review cycle, so managers only see the relevant objectives for each employee when conducting a review — not all approved objectives the employee has ever had.

---

## Problem Today

`listCycleReviews` calls `getApprovedObjectivesForEmployees` with no period filter. This returns every approved objective set the employee has — Q1, Q2, yearly, everything — regardless of which review cycle is being conducted.

---

## Architecture

### Schema change

```sql
ALTER TABLE review_cycles
  ADD COLUMN objective_period_labels TEXT[] NOT NULL DEFAULT '{}';
```

Run via Supabase SQL Editor. No new tables. Existing cycles default to `{}` → no objectives shown in reviews until an admin links at least one period.

### Data contract

- `objective_period_labels = []` → review dialog shows no objectives (empty state, not fallback to all)
- `objective_period_labels = ["Q1 2026", "Q2 2026"]` → review dialog shows only approved objectives whose `period_label` is one of those values

### New server action

`listObjectivePeriodLabels()` in `src/actions/objectives.ts`:
- Fetches all distinct `period_label` values from the `objectives` table for the org
- All statuses included (so admin can link a period before objectives are approved)
- Returns `string[]` sorted alphabetically

### Updated server action

`getApprovedObjectivesForEmployees(orgId, employeeIds, periodLabels?: string[])`:
- If `periodLabels` is provided and empty → return `[]` immediately (no DB query)
- If `periodLabels` is non-empty → add `.in("period_label", periodLabels)` filter on top of existing `status = "approved"` filter
- If `periodLabels` is omitted (undefined) → existing behavior (no period filter) — for backwards-compatible callers

### Reviews action changes (`src/actions/reviews.ts`)

`ReviewCycleWithStats` gains:
```typescript
objective_period_labels: string[];
```

`cycleSchema` gains:
```typescript
objective_period_labels: z.array(z.string()).default([]),
```

`createReviewCycle` insert includes `objective_period_labels`.

`listReviewCycles` maps `(r.objective_period_labels as string[]) ?? []`.

`listCycleReviews`:
1. Fetches the cycle row to read `objective_period_labels`
2. Passes it to `getApprovedObjectivesForEmployees(orgId, employeeIds, cycle.objective_period_labels)`

---

## UI Layer

### `CreateCycleDialog` changes

A multi-select period picker is added to the dialog, positioned below the Description field.

On dialog open: calls `listObjectivePeriodLabels()` to populate available periods. If the org has no objectives yet, the picker is hidden (no section rendered).

Picker layout (same scrollable checkbox pattern as the employee picker in `CreateObjectiveDialog`):

```
Objective periods  (2 selected)               Select all
┌──────────────────────────────────────────────────────┐
│ ☑  Q1 2026                                           │
│ ☑  Q2 2026                                           │
│ ☐  Yearly 2026                                       │
└──────────────────────────────────────────────────────┘
No periods selected — objectives won't appear in reviews.
```

- "Select all" button selects all available periods
- If 0 selected: hint text "No periods selected — objectives won't appear in reviews for this cycle."
- State: `selectedPeriods: string[]`, reset to `[]` on dialog open

`createReviewCycle` call gains `objective_period_labels: selectedPeriods`.

---

## Data Flow

```
Admin creates review cycle "Mid-Year 2026"
  → picks periods: ["Q1 2026", "Q2 2026"]
  → createReviewCycle({ ..., objective_period_labels: ["Q1 2026", "Q2 2026"] })

Manager opens a review for Alice in "Mid-Year 2026"
  → listCycleReviews reads cycle.objective_period_labels = ["Q1 2026", "Q2 2026"]
  → getApprovedObjectivesForEmployees(orgId, [alice_id], ["Q1 2026", "Q2 2026"])
  → returns only Alice's approved Q1 and Q2 2026 objective sets
  → review dialog shows those objectives under the Objectives section
```

---

## Files

| File | Change |
|------|--------|
| Supabase SQL Editor | `ALTER TABLE review_cycles ADD COLUMN objective_period_labels TEXT[] NOT NULL DEFAULT '{}'` |
| `src/actions/objectives.ts` | Add `listObjectivePeriodLabels()`; update `getApprovedObjectivesForEmployees` signature to accept optional `periodLabels` |
| `src/actions/reviews.ts` | Add `objective_period_labels` to `cycleSchema`, `ReviewCycleWithStats`, `createReviewCycle`, `listReviewCycles`, `listCycleReviews` |
| `src/components/reviews/create-cycle-dialog.tsx` | Add period multi-select picker; call `listObjectivePeriodLabels()` on open; pass `objective_period_labels` |

No changes to `review-dialog.tsx`, `reviews-client.tsx`, or any objectives UI.

---

## Error Handling

- `listObjectivePeriodLabels` returns `[]` on error → picker hidden, cycle saves with no periods
- `getApprovedObjectivesForEmployees` with empty `periodLabels` short-circuits before DB query
- If Supabase `in()` call with period labels fails → review loads with `objectives: []` (graceful degradation)

---

## What Is NOT In Scope

- Editing period links on an existing cycle (edit cycle dialog not in scope — create only)
- Showing a summary of linked periods on the cycle list/card UI
- Filtering objectives by period anywhere other than the review dialog
