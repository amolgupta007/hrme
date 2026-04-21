# Objectives & Reviews Overhaul — Design Spec
**Date:** 2026-04-21
**Status:** Approved

---

## Overview

A full overhaul of the Objectives and Reviews modules covering four areas:
1. **Objectives UX** — rich empty state with templates, auto-distribute weights, weighted achievement score, proper delete dialog
2. **Reviews UX** — role-filtered list (privacy fix), My Reviews tab, cycle starter templates, urgency badges
3. **Security fixes** — ownership checks on objectives mutations, reviewer assignment check on manager review, shared utility extraction
4. **Performance Settings** — new Settings accordion section for rating label customisation, org competencies, and review policy

---

## Area 1 — Objectives UX

### 1.1 Rich Empty State with Template Picker

When the "My Objectives" tab has no data, replace the current minimal empty state with a template picker showing 4 generic templates. Clicking a template opens `CreateObjectiveDialog` pre-filled with that template's items. The user can edit everything before saving — templates are a starting point, not auto-created records.

**Templates** (defined in `src/config/objective-templates.ts` as static TypeScript constants):

| Template | Items |
|----------|-------|
| Revenue & Growth | Achieve revenue target, Grow customer base, Improve win rate |
| Learning & Development | Complete key certification, Build new skill, Share knowledge with team |
| Process Improvement | Reduce process cycle time, Automate manual task, Improve documentation quality |
| Customer Success | Improve customer satisfaction score, Reduce churn, Improve response SLA |

Each item has a title, description, success criteria placeholder, and equal weight (auto-distributed across items).

The template picker is shown **only when the list is empty**. Once the user has objectives, the normal empty state for tabs other than "mine" continues unchanged.

### 1.2 Auto-Distribute Weights

Add an "Auto-distribute" button inside `CreateObjectiveDialog` next to the weight indicator bar. Clicking it evenly distributes 100% across all objective items (e.g. 3 items → 34/33/33, 4 items → 25/25/25/25). Odd remainders go to the first item. This does not block manual editing — user can adjust after auto-distributing.

### 1.3 Weighted Achievement Score on Cards

When an approved `ObjectiveSet` has at least one `manager_rating` filled in on its items, compute a weighted average score and display it on the `ObjectiveCard` header alongside the status badge:

```
score = sum(item.weight * item.manager_rating) / sum(item.weight for rated items)
```

Displayed as `3.8/5` in a small neutral badge. Only shown when `status === "approved"` and at least one item has a `manager_rating`.

### 1.4 Proper Delete Confirmation Dialog

Replace the `window.confirm()` call in `ObjectiveCard.handleDelete` with a Radix UI `Dialog` confirmation modal. The dialog shows the period label and asks for confirmation. Pattern matches the existing `ApproveDialog` component.

---

## Area 2 — Reviews UX

### 2.1 Role-Filtered Review List

`listCycleReviews()` currently returns all reviews for a cycle regardless of the caller's role. Update it to accept a role filter:

- `employee` → `WHERE employee_id = user.employeeId`
- `manager` → `WHERE reviewer_id = user.employeeId`
- `admin` / `owner` → no filter (all reviews)

The server page passes `role` and `employeeId` from `getCurrentUser()` down to the action. The client receives only the rows the user is authorised to see — no client-side filtering.

### 2.2 My Reviews Tab for Employees

Add a new server action `listMyReviews()` that returns all reviews belonging to the calling employee across all cycles, ordered by `created_at DESC`. Each row includes the cycle name and dates (joined from `review_cycles`).

In `ReviewsClient`, employees (non-manager, non-admin) land on a **"My Reviews"** tab that shows their personal review history. Admins and managers continue to land on the **Cycles** tab (current behaviour). The tab is determined server-side based on role.

### 2.3 Cycle Starter Templates

When the admin clicks "New Cycle", the `CreateCycleDialog` shows a **"Start from template"** section above the blank form with 3 presets:

**Templates** (defined in `src/config/review-cycle-templates.ts`):

| Template | Name | Dates |
|----------|------|-------|
| Annual Review | `Annual Review {year}` | Jan 1 – Dec 31, current year |
| Mid-Year Check-in | `Mid-Year Check-in {year}` | Jan 1 – Jun 30, current year |
| Quarterly Pulse | `Q{n} {year} Pulse` | First/last day of current quarter |

Clicking a preset fills name, description, start\_date, and end\_date. Employee selection remains manual — user must still pick who is included. Templates are dismissible (user can ignore and fill from scratch).

### 2.4 Urgency Signals on Cycle Cards

On the cycle card grid, active cycles display an urgency badge in addition to the status badge:

- End date ≤ 7 days away and cycle is active → amber `Closing soon` badge
- End date is in the past and cycle is active with `completed_reviews < total_reviews` → red `Overdue` badge

Badge logic runs client-side using `new Date()` comparisons against `cycle.end_date`.

---

## Area 3 — Security Fixes

### 3.1 Ownership Checks on Objective Mutations

Three server actions currently only check `org_id`, not `employee_id`. All three must be fixed:

**`deleteObjectiveSet(objectiveId)`**
Before deleting, fetch the row and verify `employee_id` matches the calling user's employee ID. Return `{ success: false, error: "Not authorised" }` if it doesn't.

**`updateObjectiveSet(id, formData)`**
Same check — fetch the row, verify `employee_id`, reject if mismatch.

**`submitObjectives(objectiveId)`**
Same check — fetch the row, verify `employee_id`, reject if mismatch.

Admins do not bypass these checks — an admin editing someone else's objectives should use the approve/reject flow, not direct mutation. If admin editing is needed in the future, it should be an explicit separate action.

### 3.2 Reviewer Assignment Check on submitManagerReview

`submitManagerReview(reviewId, data)` currently checks only `isManagerOrAbove(role)`. Add a check that the `reviewer_id` on the review row matches `user.employeeId`. Return `{ success: false, error: "You are not the assigned reviewer for this review" }` if it doesn't.

### 3.3 Extract Shared getOrgContext()

The `getOrgContext()` async function is identically defined in both `src/actions/objectives.ts` and `src/actions/reviews.ts`. Move it to `src/lib/current-user.ts` and export it. Both action files import it from there. No behaviour change.

---

## Area 4 — Performance Settings Section

### 4.1 Data Model

Performance settings are stored in `organizations.settings` JSONB under a `performance` key. No DB migration required.

```json
{
  "performance": {
    "rating_labels": ["Poor", "Fair", "Good", "Great", "Excellent"],
    "competencies": ["Communication", "Delivery", "Collaboration", "Initiative"],
    "self_review_required": true
  }
}
```

**Defaults** (applied at read time when key is absent):
- `rating_labels`: `["Poor", "Fair", "Good", "Great", "Excellent"]`
- `competencies`: `[]` (empty — competency ratings are opt-in)
- `self_review_required`: `true`

A helper `getPerformanceSettings(orgSettings)` function in `src/lib/performance-settings.ts` merges org settings with defaults and is used wherever settings are consumed.

### 4.2 Settings Page Section

Add `PerformanceSection` to the Settings page accordion (alongside Org Profile, Departments, Leave Policies, etc.). Admin-only — non-admins see the section as read-only or it is hidden (consistent with other settings sections).

**Rating Labels sub-section:**
Five inline text inputs, one per rating level (1–5). Labels must be non-empty. Saved via `updatePerformanceSettings()` server action.

**Competencies sub-section:**
A list of up to 8 competency tags. Admin can add (text input + Add button), reorder (drag or up/down arrows), and remove. Displayed as pill tags. When the list is empty, competency ratings do not appear in the review dialog.

**Review Policy sub-section:**
A single toggle: "Require self-review before manager review can begin". When off, managers can submit their review at any time regardless of self-review status. Default: on.

### 4.3 Server Action

New `updatePerformanceSettings(data)` action in `src/actions/settings.ts`:
- Admin-only
- Validates: rating_labels is array of 5 non-empty strings, competencies is array of ≤8 non-empty strings, self_review_required is boolean
- Merges into `organizations.settings` JSONB: `settings = settings || '{"performance": ...}'::jsonb`
- Calls `revalidatePath("/dashboard/settings")`

### 4.4 Consuming Settings in Reviews

The `ReviewsPage` server component reads `org.settings.performance` and passes it to `ReviewsClient` as a `performanceSettings` prop. `ReviewsClient` passes it to `ReviewDialog`.

In `ReviewDialog`:
- Star rating labels use org's `rating_labels` array instead of the hardcoded `["", "Poor", "Fair", "Good", "Great", "Excellent"]`
- If `performanceSettings.competencies.length > 0`, a "Competency Ratings" section appears below the overall rating — one 1–5 star row per competency. Ratings are stored as a `competency_ratings` key inside the review's existing `goals` JSONB column: `goals = { ...existingGoals, competency_ratings: { "Communication": 4, "Delivery": 5 } }`. This reuses the existing flexible column rather than adding a new DB column. The `goals` array of ad-hoc goals and the `competency_ratings` object coexist as separate keys within the same JSONB value.

---

## Files Changed

### New Files
| File | Purpose |
|------|---------|
| `src/config/objective-templates.ts` | Static objective template data |
| `src/config/review-cycle-templates.ts` | Static cycle template data |
| `src/lib/performance-settings.ts` | Defaults merger + type for performance settings |
| `src/components/settings/performance-section.tsx` | Settings accordion section |

### Modified Files
| File | Changes |
|------|---------|
| `src/lib/current-user.ts` | Add exported `getOrgContext()` |
| `src/actions/objectives.ts` | Remove local `getOrgContext()`, add ownership checks to 3 actions |
| `src/actions/reviews.ts` | Remove local `getOrgContext()`, add reviewer check, add `listMyReviews()`, add role filter to `listCycleReviews()` |
| `src/components/objectives/objectives-client.tsx` | Template picker empty state, weighted score on cards, delete dialog |
| `src/components/objectives/create-objective-dialog.tsx` | Auto-distribute button, accept `template` prefill prop |
| `src/components/reviews/reviews-client.tsx` | My Reviews tab, role-aware view, urgency badges |
| `src/components/reviews/create-cycle-dialog.tsx` | Template picker section |
| `src/components/reviews/review-dialog.tsx` | Org rating labels, competency ratings section |
| `src/app/dashboard/reviews/page.tsx` | Pass `role`, `employeeId`, `performanceSettings` to client |
| `src/app/dashboard/objectives/page.tsx` | Pass `performanceSettings` to client |
| `src/app/dashboard/settings/page.tsx` | Fetch performance settings, pass to SettingsContent |
| `src/components/settings/settings-content.tsx` | Add PerformanceSection to accordion |

---

## Out of Scope

- Email notifications on review/objective events
- Review analytics dashboard (trends across cycles)
- 360-degree peer reviews
- Attendance-linked review triggers
- Saving custom objective templates per org
