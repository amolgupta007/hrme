# JambaHire Fixes — Spec
**Date:** 2026-04-14
**Status:** Approved, ready for implementation

---

## Overview

Two-phase fix pass on the JambaHire ATS module. Phase 1 resolves blocking bugs, removes dead code, and polishes UX. Phase 2 adds four missing capabilities that are gaps in the core hiring workflow.

**Scope:** `src/actions/hire.ts`, `src/app/offers/[token]/page.tsx`, `src/app/hire/page.tsx`, `src/components/hire/hire-nav.tsx`, `src/components/hire/jobs-client.tsx`, `src/components/hire/candidates-client.tsx`, `src/components/hire/job-detail-client.tsx`, `src/components/hire/interviews-client.tsx`, `src/components/hire/offers-client.tsx`, `src/components/hire/feedback-dialog.tsx`, `src/components/hire/schedule-interview-dialog.tsx`, `src/app/hire/candidates/page.tsx`, `src/app/hire/interviews/page.tsx`, `src/app/hire/offers/page.tsx`

No new tables. No schema changes.

---

## Phase 1 — Blocking Bugs

### Bug 1: Offer accept/decline links broken

**File:** `src/app/offers/[token]/page.tsx`

The page is a server component that receives `searchParams`. Email CTAs point to `/offers/[token]?response=accepted` and `/offers/[token]?response=declined`. The page currently renders the offer UI and ignores `searchParams.response` entirely — `respondToOffer()` is never called.

**Fix:**
- At the top of the server component, check `searchParams.response`
- If `"accepted"` or `"declined"`, call `respondToOffer(token, response)` server-side
- Render a confirmation screen instead of the offer form:
  - Accepted: green checkmark, "You've accepted the offer. The hiring team has been notified."
  - Declined: neutral, "You've declined the offer. The hiring team has been notified."
  - Error (already responded / expired): show the error message returned by the action
- If `searchParams.response` is absent, render the existing offer detail page as-is

---

### Bug 2: sendOffer silently swallows email failures

**File:** `src/actions/hire.ts` → `sendOffer()`

The action saves the offer to the DB then calls Resend inside a try/catch that returns `{ success: true }` regardless of whether the email sent. The caller shows a success toast even when the candidate never receives the email.

**Fix:**
- If Resend throws, return `{ success: false, error: "Offer saved but email failed to send. Share this link with the candidate directly: /offers/[token]" }` where `[token]` is the generated UUID
- The UI (offers-client.tsx) already handles `result.error` via `toast.error` — no client changes needed beyond this

---

### Bug 3: Application source always "direct"

**File:** `src/actions/hire.ts` → `submitApplication()`

Source is hardcoded to `"direct"` — the `source` field from the careers page URL (`?source=linkedin`, etc.) is never read.

**Fix:**
- The apply form lives in `src/components/hire/careers-page-client.tsx`. Add a hidden `<input name="source">` field populated from the URL's `source` query param (read via `useSearchParams()` or passed from the parent server component)
- In `submitApplication()` in `hire.ts`, read `formData.get("source")`, validate it is one of `direct | referral | linkedin | naukri | indeed | other`, fall back to `"direct"` if absent or invalid

---

### Bug 4: getOfferByToken missing department name

**File:** `src/actions/hire.ts` → `getOfferByToken()`

The Supabase select joins `applications → candidates` and `applications → jobs` but does not join `departments`. The offer letter template tries to display department name but gets `null`.

**Fix:**
- Extend the `jobs` sub-select to include `departments(name)`
- Update the return type / `OfferWithDetails` type to include `department_name: string | null`
- Update `offer-letter.tsx` (email template) and `offers/[token]/page.tsx` to use `offer.jobs.departments?.name ?? "—"`

---

## Phase 1 — Dead Code Removal

### Dead 1: isAdmin prop on HireNav

**File:** `src/components/hire/hire-nav.tsx`

`HireNav` accepts an `isAdmin` prop in its interface but never uses it inside the component. All call sites pass it unnecessarily.

**Fix:** Remove the prop from the interface, remove the destructure, remove it from all call sites in hire layout/pages.

---

### Dead 2: SOURCE_LABELS dead entries

**File:** `src/components/hire/candidates-client.tsx`

`SOURCE_LABELS` maps 6 values but `submitApplication` always writes `"direct"` (Bug 3 above). After Bug 3 is fixed, all 6 values become reachable — so this is fixed as a side effect of Bug 3. If Bug 3 is not fixed first, prune to just `{ direct: "Direct" }`.

**Note:** Fix Bug 3 first; then SOURCE_LABELS is automatically correct. No standalone change needed.

---

### Dead 3: Unused getCurrentUser() in candidates page

**File:** `src/app/hire/candidates/page.tsx`

`getCurrentUser()` is called and destructured but the result is never used — the page passes no user data to `CandidatesClient`.

**Fix:** Remove the `getCurrentUser()` call and its import if it's the only consumer in that file.

---

### Dead 4: `as any` in interviews and offers pages

**Files:** `src/app/hire/interviews/page.tsx`, `src/app/hire/offers/page.tsx`

Supabase query results are cast with `as any` to avoid TypeScript errors because the Hire tables are missing from `database.types.ts`. Rather than adding full Supabase type generation (requires CLI), define local inline types matching the shape returned by the queries, and remove the `as any` casts.

**Fix:** Add a `// TODO: replace with generated types when db:generate is run` comment and define minimal local types for the join shapes. Remove all `as any`.

---

### Dead 5: "Coming Soon" analytics banner

**File:** `src/app/hire/page.tsx`

The dashboard page has a banner/card advertising funnel analytics as "coming soon." There is no analytics implementation and no timeline.

**Fix:** Remove the "coming soon" copy. Replace with a simple stat card showing total active jobs count and total candidates in pipeline — both are already available from existing actions (`listJobs`, `listCandidates`). This gives the page real data instead of a placeholder.

---

## Phase 1 — UX Fixes

### UX 1: Job action buttons have no loading state

**File:** `src/components/hire/jobs-client.tsx`

The Publish / Pause / Close buttons call server actions but have no `disabled` state or spinner during the call. Users can double-click and fire duplicate requests.

**Fix:** Add a `pendingJobId` state (or `pendingAction: { jobId, action } | null`). Set it before the action call, clear it after. Disable the button and show a `Loader2` spinner while pending.

---

### UX 2: Dropdown stays open on outside click

**File:** `src/components/hire/jobs-client.tsx`

The row action dropdown uses `openMenuId` state toggled by a button click, but clicking anywhere outside the menu does not close it. It stays open until an action is taken.

**Fix:** Add a `useEffect` with a `mousedown` listener on `document` that sets `openMenuId(null)` when a click occurs outside the menu ref. Alternatively, migrate the dropdown to Radix `DropdownMenu` which handles this natively. Prefer the Radix migration since Radix is already used in the project.

---

### UX 3: Feedback dialog silent rating defaults

**File:** `src/components/hire/feedback-dialog.tsx`

Rating fields (technical, communication, culture fit, overall) default to `3` but show no visual indication that a value is selected. The user sees what appears to be an empty form.

**Fix:**
- Change defaults from `3` to `0` (unrated)
- Show rating as visually selected from the start only if the user has explicitly chosen a value
- Disable the submit button until all four rating fields are non-zero
- Add a "Not yet rated" label under each empty rating row

---

## Phase 2 — Feature Gaps

### Feature 1: Resume and custom answers in job detail view

**File:** `src/components/hire/job-detail-client.tsx`

The candidate detail panel in the job pipeline does not show `resume_url` or `custom_answers` from the application, even though both exist in the data.

**Fix:**
- If `application.resume_url` is present, render a "View Resume" button that opens the URL in a new tab
- If `application.custom_answers` is a non-empty JSONB array, render each item as a Q&A pair below the resume link:
  ```
  Q: [question text]
  A: [answer text]
  ```
- If both are absent, render nothing (no empty section)

No server action changes needed — the data is already fetched.

---

### Feature 2: Manual candidate creation

**Files:** `src/components/hire/candidates-client.tsx`, `src/actions/hire.ts`

There is no way to add a candidate outside the public job application flow. Recruiter-sourced candidates, walk-ins, and referrals cannot be entered.

**New server action: `createCandidate(data)`**
- Fields: `name` (required), `email` (required), `phone`, `source` (enum, default `"direct"`), optional `job_id` + `stage` to create an application immediately
- Inserts into `candidates` and optionally `applications`
- Returns `ActionResult<{ candidateId: string }>`
- Auth guard: `isManagerOrAbove`

**UI:**
- Add "Add Candidate" button next to the search bar in `candidates-client.tsx`
- Opens a modal (new `AddCandidateDialog` component in `src/components/hire/add-candidate-dialog.tsx`) with fields: Name, Email, Phone, Source (select), Attach to Job (optional select of active jobs), Stage (shown only if job selected, default `"applied"`)

---

### Feature 3: Offer edit and delete

**Files:** `src/components/hire/offers-client.tsx`, `src/actions/hire.ts`

Draft and sent offers cannot be corrected or removed.

**New server actions:**

`updateOffer(offerId, data)`:
- Fields: `ctc`, `joining_date`, `notes` (whatever the existing offer form has)
- Only allowed when `status = 'draft'` or `status = 'sent'`
- Returns `ActionResult`
- Auth guard: `isAdmin`

`deleteOffer(offerId)`:
- Draft offers: hard delete
- Sent offers: set `status = 'recalled'`, then hard delete (or just hard delete — no downstream references break)
- Returns `ActionResult`
- Auth guard: `isAdmin`

**UI:**
- Add "Edit" and "Delete" to the offer row action dropdown in `offers-client.tsx`
- Edit: set `form` state to the existing offer's values (reuse the existing `CreateOfferForm` + `setField` pattern already in the component) and scroll the inline form into view with the offer pre-populated
- Delete: show an inline `window.confirm` or a small confirmation state on the row before calling the action
- Both actions are hidden for `status = 'accepted'` or `status = 'declined'` (final states)

---

### Feature 4: Interview rescheduling

**Files:** `src/components/hire/interviews-client.tsx`, `src/actions/hire.ts`

`updateInterviewStatus` only changes status fields. There is no way to change `scheduled_at`, interview type, or meeting link after creation.

**New server action: `rescheduleInterview(scheduleId, data)`**
- Fields: `scheduled_at` (required), `interview_type` (optional), `meeting_link` (optional)
- Returns `ActionResult`
- Auth guard: `isManagerOrAbove`

**UI:**
- Add "Reschedule" to the interview row action dropdown in `interviews-client.tsx`
- Opens a simple modal (reuse the datetime picker pattern from `schedule-interview-dialog.tsx`) with: Date + Time picker, Interview type select, Meeting link input
- Prepopulate with current values
- On success, the interview row updates in place; calendar link buttons regenerate from the new `scheduled_at`

---

## Files Changed Summary

| File | Phase | Change |
|------|-------|--------|
| `src/app/offers/[token]/page.tsx` | 1 | Handle `searchParams.response`, call `respondToOffer()`, show confirmation |
| `src/actions/hire.ts` | 1+2 | Fix sendOffer error, fix source, fix getOfferByToken dept join, add createCandidate, updateOffer, deleteOffer, rescheduleInterview |
| `src/components/hire/careers-page-client.tsx` | 1 | Add hidden source field from URL params |
| `src/app/hire/page.tsx` | 1 | Replace "coming soon" with real stat cards |
| `src/app/hire/candidates/page.tsx` | 1 | Remove unused getCurrentUser() |
| `src/app/hire/interviews/page.tsx` | 1 | Remove as any, add local types |
| `src/app/hire/offers/page.tsx` | 1 | Remove as any, add local types |
| `src/components/hire/hire-nav.tsx` | 1 | Remove isAdmin prop |
| `src/components/hire/jobs-client.tsx` | 1 | Loading states, migrate dropdown to Radix DropdownMenu |
| `src/components/hire/feedback-dialog.tsx` | 1 | Fix silent defaults, add unrated state, block submit |
| `src/components/hire/job-detail-client.tsx` | 2 | Show resume link and custom Q&A answers |
| `src/components/hire/candidates-client.tsx` | 2 | Add "Add Candidate" button, wire AddCandidateDialog |
| `src/components/hire/offers-client.tsx` | 2 | Add edit/delete actions |
| `src/components/hire/interviews-client.tsx` | 2 | Add reschedule action |
| `src/components/hire/add-candidate-dialog.tsx` | 2 | New — manual candidate creation form |

---

## Out of Scope

- Offer expiry automation (cron job — deferred; no deadline set)
- Full Supabase type generation for Hire tables (requires Supabase CLI; deferred)
- LinkedIn share URL per-job deep link (LinkedIn API limitation)
- Mobile navigation for JambaHire (desktop-only tool by design)
- JambaHire sidebar entry (header button is intentional)
- Onboarding workflows post-hire
