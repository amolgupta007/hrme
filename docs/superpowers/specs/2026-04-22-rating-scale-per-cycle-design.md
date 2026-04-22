# Rating Scale Per Review Cycle — Design Spec

**Date:** 2026-04-22  
**Status:** Approved

---

## Goal

Allow admins to choose a 3-point, 5-point, or 10-point rating scale when creating a review cycle. The scale applies to all ratings in that cycle (overall self/manager rating and per-competency ratings). Labels for each scale are configured org-wide in Performance Settings.

---

## Architecture

### Schema change

Add `rating_scale` column to `review_cycles` table via SQL Editor:

```sql
ALTER TABLE review_cycles ADD COLUMN rating_scale INTEGER NOT NULL DEFAULT 5 CHECK (rating_scale IN (3, 5, 10));
```

No migration file change — applied directly in Supabase Dashboard SQL Editor.

### Performance Settings extension

`organizations.settings.performance` gains two new keys alongside the existing `rating_labels` (5-tuple):

| Key | Type | Default |
|-----|------|---------|
| `rating_labels_3` | `[string, string, string]` | `["Needs Improvement", "Meets Expectations", "Exceeds Expectations"]` |
| `rating_labels_5` | `[string, string, string, string, string]` | existing `rating_labels` values |
| `rating_labels_10_anchors` | `[string, string, string]` | `["Poor", "Average", "Excellent"]` (shown at positions 1, 5, 10) |

The existing `rating_labels` field is kept as-is for backward compatibility and maps to `rating_labels_5` on read. New saves write all three keys.

### Data flow

```
Cycle creation (admin picks scale 3/5/10)
  → stored in review_cycles.rating_scale
  → listCycleReviews returns cycle with rating_scale
  → ReviewCycleWithStats includes rating_scale
  → ReviewsClient passes rating_scale to ReviewDialog
  → ReviewDialog uses NumberRating with scale + labels from performanceSettings
```

---

## Components & Files

| File | Change |
|------|--------|
| `src/lib/performance-settings.ts` | Extend `PerformanceSettings` type; update `getPerformanceSettings()` to read/default all three label sets |
| `src/actions/reviews.ts` | Add `rating_scale` to `createCycleSchema`; include in `ReviewCycleWithStats`; pass through `listCycleReviews` |
| `src/components/reviews/create-cycle-dialog.tsx` | Add scale picker (3 toggle buttons); pass `rating_scale` to action |
| `src/components/reviews/review-dialog.tsx` | Replace `StarRating` with `NumberRating`; accept `rating_scale` prop; use appropriate label set |
| `src/components/settings/performance-section.tsx` | Add label editors for 3-point and 10-point anchor labels alongside existing 5-point editor |
| `src/actions/settings.ts` | Update `performanceSettingsSchema` to include the two new label fields |

---

## Detailed Behaviour

### Scale picker in CreateCycleDialog

Three pill/toggle buttons in a button group: `3-point · 5-point · 10-point`. Default: `5-point`. Placed below the cycle name field, above the date fields.

```
Scale   [ 3-point ]  [ 5-point ✓ ]  [ 10-point ]
```

### NumberRating component

Replaces `StarRating` everywhere in `review-dialog.tsx`.

**Props:**
```typescript
interface NumberRatingProps {
  value: number;           // 0 = unset
  onChange?: (v: number) => void;
  scale: 3 | 5 | 10;
  labels: string[];        // length 3 for scale=3/10-anchors, length 5 for scale=5
}
```

**Rendering:**
- Renders numbered chips 1–N in a flex-wrap row
- Selected chip: filled primary background
- Unselected: muted border
- **Scale 3:** shows label below selected chip (from `rating_labels_3`)
- **Scale 5:** shows label below selected chip (from `rating_labels_5`)
- **Scale 10:** shows anchor labels below chips at fixed positions 1, 5, 10 always visible (not just on select); other positions show nothing below

**10-point layout example:**
```
[ 1 ][ 2 ][ 3 ][ 4 ][ 5 ][ 6 ][ 7 ][ 8 ][ 9 ][ 10 ]
Poor                Average              Excellent
```

### PerformanceSettings type (updated)

```typescript
export type PerformanceSettings = {
  rating_labels: [string, string, string, string, string];       // kept for compat = rating_labels_5
  rating_labels_3: [string, string, string];
  rating_labels_10_anchors: [string, string, string];            // labels for positions 1, 5, 10
  competencies: string[];
  self_review_required: boolean;
};
```

`getPerformanceSettings()` reads `rating_labels_3` and `rating_labels_10_anchors` from `settings.performance`, falling back to defaults if absent.

### ReviewCycleWithStats type (updated)

```typescript
export type ReviewCycleWithStats = {
  // ...existing fields...
  rating_scale: 3 | 5 | 10;
};
```

`listReviewCycles` and `listCycleReviews` select `rating_scale` from the DB and include it in the returned type.

### ReviewDialog changes

- Accepts `rating_scale: 3 | 5 | 10` prop (passed from `ReviewsClient` via the cycle)
- Uses `NumberRating` instead of `StarRating` for: overall self rating, overall manager rating, per-competency ratings
- Passes appropriate label array based on scale:
  - scale=3 → `performanceSettings.rating_labels_3`
  - scale=5 → `performanceSettings.rating_labels` (existing 5-tuple)
  - scale=10 → `performanceSettings.rating_labels_10_anchors`
- Submit validation: `rating >= 1 && rating <= scale`

### PerformanceSection settings UI

Three sub-sections for rating labels (replacing the current single 5-column grid):

**3-Point Labels** — 3-column grid of inputs (Star 1 / Star 2 / Star 3)  
**5-Point Labels** — 5-column grid (existing)  
**10-Point Anchor Labels** — 3-column grid labelled "Position 1", "Position 5", "Position 10"

Save persists all three together.

### Passing rating_scale through ReviewsClient

`ReviewsClient` already receives `cycleReviews` which are associated with `activeCycle`. When opening `ReviewDialog`, pass `rating_scale={activeCycle.rating_scale ?? 5}` as a prop.

For the My Reviews tab (employee view), `MyReviewWithCycle` needs `rating_scale` added so the correct scale is shown when the employee opens their review.

---

## Error handling

- If `rating_scale` is missing from DB row (legacy cycles created before the column existed), default to `5`.
- If a label string is empty on save, block with toast: "All rating labels must be filled in".

---

## What is NOT in scope

- Changing the rating scale on an existing cycle after reviews have started
- Per-competency scales different from the cycle scale
- Fractional ratings (e.g. 4.5/10)
- Displaying historical reviews from before this feature was added differently

---

## SQL to run in Supabase Dashboard

```sql
ALTER TABLE review_cycles
  ADD COLUMN IF NOT EXISTS rating_scale INTEGER NOT NULL DEFAULT 5
  CHECK (rating_scale IN (3, 5, 10));
```
