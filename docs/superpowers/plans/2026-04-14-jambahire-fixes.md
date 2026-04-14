# JambaHire Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four blocking bugs, remove dead code, polish UX in Phase 1; add four missing features in Phase 2.

**Architecture:** All server mutations live in `src/actions/hire.ts`. UI components in `src/components/hire/`. No new tables or schema changes. Phase 1 tasks are independent and can each be committed separately. Phase 2 tasks are also independent of each other.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase (admin client), Tailwind CSS, Radix UI Dialog, Sonner toasts, lucide-react icons.

---

## File Map

| File | Tasks |
|------|-------|
| `src/actions/hire.ts` | 1, 2, 3, 4, 8, 9, 10, 11 |
| `src/app/offers/[token]/page.tsx` | 1 |
| `src/components/emails/offer-letter.tsx` | 1 |
| `src/app/careers/[slug]/page.tsx` | 3 |
| `src/components/hire/careers-page-client.tsx` | 3 |
| `src/components/hire/hire-nav.tsx` | 5 |
| `src/app/hire/layout.tsx` | 5 |
| `src/app/hire/candidates/page.tsx` | 5 |
| `src/app/hire/interviews/page.tsx` | 5 |
| `src/app/hire/offers/page.tsx` | 5 |
| `src/app/hire/page.tsx` | 5 |
| `src/components/hire/jobs-client.tsx` | 6 |
| `src/components/hire/feedback-dialog.tsx` | 7 |
| `src/components/hire/job-detail-client.tsx` | 8 |
| `src/components/hire/candidates-client.tsx` | 9 |
| `src/components/hire/add-candidate-dialog.tsx` | 9 (new file) |
| `src/components/hire/offers-client.tsx` | 10 |
| `src/components/hire/interviews-client.tsx` | 11 |

---

## PHASE 1

---

### Task 1: Fix offer email accept/decline links

**Context:** The offer email template sends CTAs to `/offers/[token]?response=accept` and `?response=decline`. The `/offers/[token]` server component page never reads `searchParams` — so clicking email CTAs just shows the offer page with buttons again. Fix requires: (a) normalise the email URL params to `accepted`/`declined`, (b) read `searchParams.response` in the page and auto-respond.

**Files:**
- Modify: `src/components/emails/offer-letter.tsx`
- Modify: `src/app/offers/[token]/page.tsx`

- [ ] **Step 1: Fix email button URLs**

In `src/components/emails/offer-letter.tsx`, change the two Button `href` props (lines ~57–60):

```tsx
<Button style={acceptButtonStyle} href={`${offerUrl}?response=accepted`}>
  Accept Offer
</Button>
<Button style={declineButtonStyle} href={`${offerUrl}?response=declined`}>
  Decline Offer
</Button>
```

- [ ] **Step 2: Add searchParams handling to offer page**

Replace the `Props` interface and the beginning of `OfferResponsePage` in `src/app/offers/[token]/page.tsx`:

```tsx
interface Props {
  params: { token: string };
  searchParams: { response?: string };
}

export default async function OfferResponsePage({ params, searchParams }: Props) {
  // Handle email CTA click — auto-respond if ?response=accepted|declined
  const responseParam = searchParams.response;
  if (responseParam === "accepted" || responseParam === "declined") {
    const respondResult = await respondToOffer(params.token, responseParam);
    // If error (already responded, expired, not found) fall through to render
    // the page normally — getOfferByToken below will return the current state
    if (!respondResult.success && respondResult.error === "Offer not found") {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border p-8 text-center">
            <XCircle className="mx-auto h-12 w-12 text-red-400 mb-4" />
            <h1 className="text-xl font-bold mb-2">Offer Not Found</h1>
            <p className="text-sm text-gray-500">This offer link is invalid or has expired.</p>
          </div>
        </div>
      );
    }
  }

  const result = await getOfferByToken(params.token);
  // ... rest of the existing component unchanged
```

- [ ] **Step 3: Verify build passes**

```bash
cd C:/Users/amolg/Downloads/hr-portal && npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors related to these files.

- [ ] **Step 4: Commit**

```bash
git add src/components/emails/offer-letter.tsx src/app/offers/[token]/page.tsx
git commit -m "fix: handle offer email accept/decline query params in offers page"
```

---

### Task 2: Fix sendOffer silently swallowing email failures

**Context:** In `src/actions/hire.ts`, `sendOffer()` (line ~893) has a try/catch around the Resend email call. On failure it logs to console and does nothing — the `supabase.update({ status: "sent" })` runs unconditionally outside the try block, marking the offer as sent even when the email was never delivered. Fix: move the status update inside the try block; on catch, return an error with a fallback offer URL.

**Files:**
- Modify: `src/actions/hire.ts` (lines 893–958, `sendOffer` function)

- [ ] **Step 1: Rewrite the sendOffer function body**

Replace the entire try/catch + status update section (from the `try {` through to the end of the function body) with:

```ts
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://jambahr.com";
  const offerUrl = `${appUrl}/offers/${(offer as any).offer_token}`;

  try {
    const { resend, FROM_EMAIL } = await import("@/lib/resend");
    const { render } = await import("@react-email/render");
    const { OfferLetterEmail } = await import("@/components/emails/offer-letter");

    const html = await render(
      OfferLetterEmail({
        candidateName: (candidate as any)?.name ?? "Candidate",
        orgName: (org as any)?.name ?? "Company",
        roleTitle: (offer as any).role_title,
        ctc: (offer as any).ctc,
        joiningDate: (offer as any).joining_date,
        additionalTerms: (offer as any).additional_terms ?? undefined,
        offerUrl,
      })
    );

    await resend.emails.send({
      from: FROM_EMAIL,
      to: (candidate as any)?.email ?? "",
      subject: `Your offer letter from ${(org as any)?.name ?? "us"}`,
      html,
    });

    await supabase
      .from("offers")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", offerId)
      .eq("org_id", user.orgId);

    revalidatePath("/hire/offers");
    return { success: true, data: undefined };
  } catch (emailErr) {
    console.error("Offer email failed:", emailErr);
    return {
      success: false,
      error: `Offer saved but email failed to send. Share this link with the candidate directly: ${offerUrl}`,
    };
  }
```

Note: remove the `revalidatePath` and `return { success: true }` that currently appear after the catch block — they are now inside the try block above.

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/actions/hire.ts
git commit -m "fix: surface sendOffer email failures instead of swallowing them"
```

---

### Task 3: Fix application source always "direct"

**Context:** `submitApplication()` in `hire.ts` hardcodes `source: "direct"` in the candidate upsert payload. Candidates arriving from LinkedIn, Naukri, or referrals are all recorded as "direct". Fix: accept `source` as an optional param in `submitApplication`, validate it against the enum, and pass it from the careers page (which can read `?source=` from the URL).

**Files:**
- Modify: `src/actions/hire.ts` (lines 471–550, `submitApplication` function)
- Modify: `src/app/careers/[slug]/page.tsx`
- Modify: `src/components/hire/careers-page-client.tsx`

- [ ] **Step 1: Add source to submitApplication signature**

In `src/actions/hire.ts`, update the `submitApplication` function signature and the candidate payload:

Change the `data` parameter type (around line 472) to add `source?`:

```ts
export async function submitApplication(
  jobId: string,
  data: {
    name: string;
    email: string;
    phone?: string;
    linkedin_url?: string;
    resume_url?: string;
    work_samples?: string[];
    cover_note?: string;
    answers?: { question: string; answer: string }[];
    source?: string;
  }
): Promise<ActionResult<void>> {
```

Change the `candidatePayload` source line (around line 512) from:

```ts
    source: "direct",
```

to:

```ts
    source: ["direct", "referral", "linkedin", "naukri", "indeed", "other"].includes(data.source ?? "")
      ? data.source!
      : "direct",
```

- [ ] **Step 2: Pass searchParams.source from careers page**

Replace `src/app/careers/[slug]/page.tsx` with:

```tsx
import { notFound } from "next/navigation";
import { getPublicJobs } from "@/actions/hire";
import { CareersPageClient } from "@/components/hire/careers-page-client";

export default async function CareersPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { source?: string };
}) {
  const result = await getPublicJobs(params.slug);
  if (!result.success) notFound();
  return (
    <CareersPageClient
      org={result.data.org}
      jobs={result.data.jobs}
      defaultSource={searchParams.source}
    />
  );
}
```

- [ ] **Step 3: Accept and use source in CareersPageClient**

In `src/components/hire/careers-page-client.tsx`:

Update the `Props` interface (line ~26) to add `defaultSource`:

```tsx
interface Props {
  org: { name: string; slug: string };
  jobs: Job[];
  defaultSource?: string;
}
```

Update the component signature (line ~29):

```tsx
export function CareersPageClient({ org, jobs, defaultSource }: Props) {
```

In `handleSubmit`, pass source to `submitApplication` (in the object at line ~189):

```tsx
      const result = await submitApplication(job.id, {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        linkedin_url: linkedin.trim() || undefined,
        resume_url: resumeUrl,
        work_samples: workSamples.length > 0 ? workSamples : undefined,
        cover_note: coverNote.trim() || undefined,
        answers: job.custom_questions.map((q, i) => ({
          question: q.question,
          answer: answers[i] ?? "",
        })),
        source: defaultSource,
      });
```

- [ ] **Step 4: Verify build**

```bash
npm run build 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/actions/hire.ts src/app/careers/[slug]/page.tsx src/components/hire/careers-page-client.tsx
git commit -m "fix: read application source from URL param instead of hardcoding 'direct'"
```

---

### Task 4: Fix getOfferByToken missing department name

**Context:** `getOfferByToken()` in `hire.ts` (line ~960) fetches the job title but doesn't join departments. The offer letter page shows `{offer.department_name}` conditionally, but it's always `null` because it's never populated from the DB. Fix: join `departments` in the job query and populate `department_name`.

**Files:**
- Modify: `src/actions/hire.ts` (lines 960–998, `getOfferByToken` function)

- [ ] **Step 1: Update the job query to join departments**

In `getOfferByToken`, change the jobs query inside the `Promise.all` from:

```ts
    supabase.from("jobs").select("title").eq("id", (app as any)?.job_id).single(),
```

to:

```ts
    supabase.from("jobs").select("title, department_id, departments(name)").eq("id", (app as any)?.job_id).single(),
```

- [ ] **Step 2: Populate department_name in the return value**

Change the return object's offer department_name from:

```ts
        department_name: null,
```

to:

```ts
        department_name: ((job as any)?.departments as { name: string } | null)?.name ?? null,
```

- [ ] **Step 3: Verify build**

```bash
npm run build 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/actions/hire.ts
git commit -m "fix: populate department_name in getOfferByToken via departments join"
```

---

### Task 5: Dead code removal

**Context:** Five pieces of dead code to remove: (1) unused `isAdmin` prop on `HireNav`; (2) unused `getCurrentUser()` in candidates page; (3) `as any` casts in interviews and offers pages; (4) "Coming Soon" banner on hire overview page.

**Files:**
- Modify: `src/components/hire/hire-nav.tsx`
- Modify: `src/app/hire/layout.tsx`
- Modify: `src/app/hire/candidates/page.tsx`
- Modify: `src/app/hire/interviews/page.tsx`
- Modify: `src/app/hire/offers/page.tsx`
- Modify: `src/app/hire/page.tsx`

- [ ] **Step 1: Remove isAdmin from HireNav**

In `src/components/hire/hire-nav.tsx`:

Remove the interface:
```tsx
interface HireNavProps {
  isAdmin: boolean;
}
```
Replace with:
```tsx
interface HireNavProps {}
```

Change the component signature from:
```tsx
export function HireNav({ isAdmin }: HireNavProps) {
```
to:
```tsx
export function HireNav({}: HireNavProps) {
```

Or simply:
```tsx
export function HireNav() {
```
(and remove the interface entirely)

- [ ] **Step 2: Remove isAdmin from HireNav call site**

In `src/app/hire/layout.tsx`, change:
```tsx
      <HireNav isAdmin={isAdmin(user.role)} />
```
to:
```tsx
      <HireNav />
```

- [ ] **Step 3: Remove unused getCurrentUser from candidates page**

In `src/app/hire/candidates/page.tsx`, replace:
```tsx
export default async function CandidatesPage() {
  const [candidatesResult, user] = await Promise.all([listCandidates(), getCurrentUser()]);
  const candidates = candidatesResult.success ? candidatesResult.data : [];

  return <CandidatesClient candidates={candidates} />;
}
```
with:
```tsx
export default async function CandidatesPage() {
  const candidatesResult = await listCandidates();
  const candidates = candidatesResult.success ? candidatesResult.data : [];

  return <CandidatesClient candidates={candidates} />;
}
```

Also remove the `import { getCurrentUser } from "@/lib/current-user";` line if it's only used for this call.

- [ ] **Step 4: Fix as any in interviews page**

In `src/app/hire/interviews/page.tsx`, the `employees as any` cast exists because `listEmployees()` returns `Employee[]` from `@/types` but `InterviewsClient` expects `{ id: string; first_name: string; last_name: string }[]`. These are compatible shapes. Add a local type cast instead of `as any`:

Change:
```tsx
      employees={employees as any}
```
to:
```tsx
      employees={employees as { id: string; first_name: string; last_name: string }[]}
```

- [ ] **Step 5: Fix as any in offers page**

In `src/app/hire/offers/page.tsx`, same pattern:

Change:
```tsx
      employees={employees as any}
```
to:
```tsx
      employees={employees as { id: string; first_name: string; last_name: string }[]}
```

- [ ] **Step 6: Remove Coming Soon banner**

In `src/app/hire/page.tsx`, remove the entire "Coming soon banner" section — the `<div>` with `rounded-xl border border-dashed border-indigo-200` at the bottom of the return. The module cards grid above it is the correct landing content.

- [ ] **Step 7: Verify build**

```bash
npm run build 2>&1 | tail -20
```

Expected: no errors, no unused variable warnings.

- [ ] **Step 8: Commit**

```bash
git add src/components/hire/hire-nav.tsx src/app/hire/layout.tsx src/app/hire/candidates/page.tsx src/app/hire/interviews/page.tsx src/app/hire/offers/page.tsx src/app/hire/page.tsx
git commit -m "chore: remove dead code (isAdmin prop, unused imports, coming soon banner)"
```

---

### Task 6: Job action loading states + dropdown outside-click dismiss

**Context:** In `jobs-client.tsx`, Publish/Pause/Close/Delete buttons have no loading state — users can double-click. The dropdown menu (`openMenuId` state) never closes on outside click. Fix: add `pendingAction` state for button loading, add a `useEffect` click-outside handler.

**Files:**
- Modify: `src/components/hire/jobs-client.tsx`

- [ ] **Step 1: Add pendingAction state and Loader2 import**

At the top of `JobsClient`, add `Loader2` to the lucide imports and add state:

```tsx
import { Plus, MapPin, Briefcase, Users, MoreHorizontal, Pencil, Trash2, Play, Pause, Eye, Linkedin, Loader2 } from "lucide-react";
```

Add after the `openMenuId` state declaration:

```tsx
  const [pendingAction, setPendingAction] = useState<{ jobId: string; action: string } | null>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
```

Add `import React from "react";` if not already present (or use `useRef` from the existing `useState` import line: `import { useState, useRef, useEffect, useRef } from "react";`).

- [ ] **Step 2: Add useEffect for outside-click dismiss**

Add `useEffect` to the react import and add this effect inside `JobsClient`:

```tsx
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    }
    if (openMenuId) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openMenuId]);
```

- [ ] **Step 3: Add loading state to handleStatusChange**

Replace the existing `handleStatusChange`:

```tsx
  async function handleStatusChange(id: string, status: JobStatus) {
    setPendingAction({ jobId: id, action: status });
    const result = await updateJobStatus(id, status);
    setPendingAction(null);
    if (result.success) {
      toast.success(`Job marked as ${status}`);
      router.refresh();
    } else {
      toast.error(result.error);
    }
    setOpenMenuId(null);
  }
```

- [ ] **Step 4: Add loading state to handleDelete**

Replace the existing `handleDelete`:

```tsx
  async function handleDelete(id: string) {
    if (!confirm("Delete this job? All applications will also be deleted.")) return;
    setPendingAction({ jobId: id, action: "delete" });
    const result = await deleteJob(id);
    setPendingAction(null);
    if (result.success) {
      toast.success("Job deleted");
      router.refresh();
    } else {
      toast.error(result.error);
    }
    setOpenMenuId(null);
  }
```

- [ ] **Step 5: Attach menuRef and disable buttons during pending**

Wrap the dropdown container `<div className="relative">` with the ref:

```tsx
                    <div className="relative" ref={menuRef}>
```

For each action button inside the dropdown, add `disabled={pendingAction?.jobId === job.id}` and show a spinner when pending. Example for the Pause button:

```tsx
                          {job.status === "active" && (
                            <button
                              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted w-full text-left disabled:opacity-50"
                              disabled={pendingAction?.jobId === job.id}
                              onClick={() => handleStatusChange(job.id, "paused")}
                            >
                              {pendingAction?.jobId === job.id && pendingAction.action === "paused"
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <Pause className="h-3.5 w-3.5" />}
                              Pause
                            </button>
                          )}
```

Apply the same `disabled` + spinner pattern to Activate, Close, and Delete buttons.

- [ ] **Step 6: Verify build**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Step 7: Commit**

```bash
git add src/components/hire/jobs-client.tsx
git commit -m "fix: add loading states to job action buttons and outside-click dismiss for dropdown"
```

---

### Task 7: Feedback dialog — fix silent rating defaults

**Context:** `feedback-dialog.tsx` initializes ratings to `0` (unrated) which correctly renders stars as empty. But in `handleSubmit`, `technical || 3`, `communication || 3`, `cultureFit || 3` silently substitute 3 when the user hasn't rated those fields — submitting partial feedback without knowing. The fix: require all four ratings before enabling submit.

**Files:**
- Modify: `src/components/hire/feedback-dialog.tsx`

- [ ] **Step 1: Remove the silent || 3 fallbacks in handleSubmit**

Find the `submitInterviewFeedback` call inside `handleSubmit` and change:

```tsx
      const result = await submitInterviewFeedback({
        schedule_id: interview.id,
        technical_rating: technical || 3,
        communication_rating: communication || 3,
        culture_fit_rating: cultureFit || 3,
        overall_rating: overall,
        recommendation: recommendation as any,
        notes,
      });
```

to:

```tsx
      const result = await submitInterviewFeedback({
        schedule_id: interview.id,
        technical_rating: technical,
        communication_rating: communication,
        culture_fit_rating: cultureFit,
        overall_rating: overall,
        recommendation: recommendation as any,
        notes,
      });
```

- [ ] **Step 2: Add validation for all ratings**

In `handleSubmit`, add validation before the existing `if (!recommendation)` check:

```tsx
  async function handleSubmit() {
    if (!technical) return toast.error("Rate technical skills");
    if (!communication) return toast.error("Rate communication");
    if (!cultureFit) return toast.error("Rate culture fit");
    if (!recommendation) return toast.error("Select a recommendation");
    if (!overall) return toast.error("Give an overall rating");
    // ... rest unchanged
```

- [ ] **Step 3: Disable submit button until all fields complete**

Update the submit Button's `disabled` prop:

```tsx
            <Button
              onClick={handleSubmit}
              disabled={saving || !technical || !communication || !cultureFit || !overall || !recommendation}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
```

- [ ] **Step 4: Verify build**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
git add src/components/hire/feedback-dialog.tsx
git commit -m "fix: require all four ratings in feedback dialog, remove silent 3/5 defaults"
```

---

## PHASE 2

---

### Task 8: Resume and custom Q&A in job detail view

**Context:** `Application` type and `listApplications()` don't include `resume_url` (from candidates table) or `answers` (from applications table). The `job-detail-client.tsx` currently only shows `cover_note`. Fix: extend the type, update the query, and render in the UI.

**Files:**
- Modify: `src/actions/hire.ts` (Application type, lines 55–68; listApplications, lines 283–311)
- Modify: `src/components/hire/job-detail-client.tsx`

- [ ] **Step 1: Add resume_url and answers to the Application type**

In `src/actions/hire.ts`, find the `Application` type (line ~55) and add two fields:

```ts
export type Application = {
  id: string;
  org_id: string;
  job_id: string;
  job_title: string;
  candidate_id: string;
  candidate_name: string;
  candidate_email: string;
  stage: ApplicationStage;
  rejection_reason: string | null;
  cover_note: string | null;
  applied_at: string;
  resume_url: string | null;
  answers: { question: string; answer: string }[] | null;
};
```

- [ ] **Step 2: Update listApplications to include resume_url from candidates**

In `listApplications()` (line ~283), change the candidates select from:

```ts
    supabase.from("candidates").select("id, name, email").eq("org_id", user.orgId),
```

to:

```ts
    supabase.from("candidates").select("id, name, email, resume_url").eq("org_id", user.orgId),
```

In the return data map, add `resume_url` and `answers`:

```ts
      return {
        ...a,
        job_title: (job as any)?.title ?? "",
        candidate_name: cand?.name ?? "Unknown",
        candidate_email: cand?.email ?? "",
        resume_url: (cand as any)?.resume_url ?? null,
        answers: (a as any).answers ?? null,
      };
```

- [ ] **Step 3: Render resume link and Q&A in job-detail-client.tsx**

In `src/components/hire/job-detail-client.tsx`, find the section after `{app.cover_note && ...}` inside the active applications map and add:

```tsx
                  {app.cover_note && (
                    <p className="mt-2 text-xs text-muted-foreground border-t border-border pt-2">{app.cover_note}</p>
                  )}

                  {(app.resume_url || (app.answers && app.answers.filter(a => a.question !== "__work_samples__").length > 0)) && (
                    <div className="mt-2 border-t border-border pt-2 space-y-2">
                      {app.resume_url && (
                        <a
                          href={app.resume_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                        >
                          View Resume
                        </a>
                      )}
                      {app.answers &&
                        app.answers
                          .filter((a) => a.question !== "__work_samples__")
                          .map((a, i) => (
                            <div key={i}>
                              <p className="text-xs font-medium text-muted-foreground">{a.question}</p>
                              <p className="text-xs text-foreground mt-0.5">{a.answer}</p>
                            </div>
                          ))}
                    </div>
                  )}
```

Add the `ExternalLink` import to lucide-react imports if used, or just use the plain `<a>` tag as shown above (no icon needed).

- [ ] **Step 4: Verify build**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
git add src/actions/hire.ts src/components/hire/job-detail-client.tsx
git commit -m "feat: show resume link and custom question answers in job detail view"
```

---

### Task 9: Manual candidate creation

**Context:** No way to add a candidate without a job application. Recruiters need to enter candidates from referrals, direct sourcing, etc. Add `createCandidate()` server action, a new `AddCandidateDialog` component, and a button in the candidates client.

**Files:**
- Modify: `src/actions/hire.ts` (new action)
- Create: `src/components/hire/add-candidate-dialog.tsx`
- Modify: `src/components/hire/candidates-client.tsx`

- [ ] **Step 1: Add createCandidate server action to hire.ts**

After `listCandidates()` in `src/actions/hire.ts`, add:

```ts
export async function createCandidate(input: {
  name: string;
  email: string;
  phone?: string;
  linkedin_url?: string;
  source?: string;
}): Promise<ActionResult<{ id: string }>> {
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isManagerOrAbove(user.role)) return { success: false, error: "Unauthorized" };

  const supabase = createAdminSupabase();

  const source = ["direct", "referral", "linkedin", "naukri", "indeed", "other"].includes(input.source ?? "")
    ? input.source!
    : "direct";

  const { data, error } = await supabase
    .from("candidates")
    .insert({
      org_id: user.orgId,
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone?.trim() || null,
      linkedin_url: input.linkedin_url?.trim() || null,
      source,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { success: false, error: "A candidate with this email already exists" };
    return { success: false, error: error.message };
  }

  revalidatePath("/hire/candidates");
  return { success: true, data: { id: (data as any).id } };
}
```

Note: `isManagerOrAbove` is imported from `@/lib/current-user` — check existing imports at the top of `hire.ts` and add if missing.

- [ ] **Step 2: Create AddCandidateDialog component**

Create `src/components/hire/add-candidate-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createCandidate } from "@/actions/hire";

const SOURCE_OPTIONS = [
  { value: "direct", label: "Direct" },
  { value: "referral", label: "Referral" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "naukri", label: "Naukri" },
  { value: "indeed", label: "Indeed" },
  { value: "other", label: "Other" },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AddCandidateDialog({ open, onClose }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [source, setSource] = useState("direct");
  const [saving, setSaving] = useState(false);

  const inputCls = "mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400";

  async function handleSave() {
    if (!name.trim()) return toast.error("Name is required");
    if (!email.trim()) return toast.error("Email is required");

    setSaving(true);
    const result = await createCandidate({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      linkedin_url: linkedin.trim() || undefined,
      source,
    });
    setSaving(false);

    if (result.success) {
      toast.success("Candidate added");
      router.refresh();
      onClose();
    } else {
      toast.error(result.error);
    }
  }

  function handleClose() {
    setName(""); setEmail(""); setPhone(""); setLinkedin(""); setSource("direct");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Candidate</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <label className="text-sm font-medium">Full Name *</label>
            <input className={inputCls} placeholder="e.g. Priya Sharma" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">Email *</label>
            <input type="email" className={inputCls} placeholder="priya@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Phone</label>
              <input className={inputCls} placeholder="+91 98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Source</label>
              <select className={inputCls} value={source} onChange={(e) => setSource(e.target.value)}>
                {SOURCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">LinkedIn URL</label>
            <input className={inputCls} placeholder="https://linkedin.com/in/priya" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              {saving ? "Adding…" : "Add Candidate"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Add "Add Candidate" button to CandidatesClient**

In `src/components/hire/candidates-client.tsx`:

Add imports (merge into existing lucide import line):

```tsx
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddCandidateDialog } from "./add-candidate-dialog";
```

Add state inside `CandidatesClient` (after existing `useState` declarations):

```tsx
  const [addOpen, setAddOpen] = useState(false);
```

Note: no `useRouter` needed — `AddCandidateDialog` calls `router.refresh()` internally.

Add the "Add Candidate" button to the header. Find the `<div>` containing the search input and add a button alongside it:

```tsx
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Candidates</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{candidates.length} total</p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
          <Plus className="h-4 w-4 mr-1.5" /> Add Candidate
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          className="w-full rounded-lg border border-input bg-background pl-9 pr-4 py-2 text-sm"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
```

Note: read the current header structure in `candidates-client.tsx` and wrap it in the flex row above if one doesn't already exist.

Add dialog at the bottom of the return:

```tsx
      <AddCandidateDialog open={addOpen} onClose={() => setAddOpen(false)} />
```

- [ ] **Step 4: Check isManagerOrAbove import in hire.ts**

```bash
grep -n "isManagerOrAbove" C:/Users/amolg/Downloads/hr-portal/src/actions/hire.ts | head -5
```

If not found, add to the import line at the top of hire.ts:
```ts
import { getCurrentUser, isAdmin, isManagerOrAbove } from "@/lib/current-user";
```

- [ ] **Step 5: Verify build**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Step 6: Commit**

```bash
git add src/actions/hire.ts src/components/hire/add-candidate-dialog.tsx src/components/hire/candidates-client.tsx
git commit -m "feat: add manual candidate creation with AddCandidateDialog"
```

---

### Task 10: Offer edit and delete

**Context:** Draft and sent offers have no edit or delete path. Add `updateOffer()` and `deleteOffer()` actions, and wire edit (prefill the existing inline form) and delete (confirm + call action) to the offer row dropdown.

**Files:**
- Modify: `src/actions/hire.ts` (two new actions)
- Modify: `src/components/hire/offers-client.tsx`

- [ ] **Step 1: Add updateOffer server action**

After `createOffer()` in `src/actions/hire.ts`, add:

```ts
export async function updateOffer(
  offerId: string,
  input: {
    role_title: string;
    ctc: number;
    joining_date: string;
    department_id?: string;
    reporting_manager_id?: string;
    additional_terms?: string;
  }
): Promise<ActionResult<void>> {
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can edit offers" };

  const supabase = createAdminSupabase();
  const { data: existing, error: fetchErr } = await supabase
    .from("offers")
    .select("status")
    .eq("id", offerId)
    .eq("org_id", user.orgId)
    .single();

  if (fetchErr || !existing) return { success: false, error: "Offer not found" };
  if (!["draft", "sent"].includes((existing as any).status)) {
    return { success: false, error: "Cannot edit an offer that has been accepted or declined" };
  }

  const { error } = await supabase
    .from("offers")
    .update({
      role_title: input.role_title,
      ctc: input.ctc,
      joining_date: input.joining_date,
      department_id: input.department_id || null,
      reporting_manager_id: input.reporting_manager_id || null,
      additional_terms: input.additional_terms || null,
    })
    .eq("id", offerId)
    .eq("org_id", user.orgId);

  if (error) return { success: false, error: error.message };
  revalidatePath("/hire/offers");
  return { success: true, data: undefined };
}
```

- [ ] **Step 2: Add deleteOffer server action**

After `updateOffer()`, add:

```ts
export async function deleteOffer(offerId: string): Promise<ActionResult<void>> {
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can delete offers" };

  const supabase = createAdminSupabase();
  const { data: existing, error: fetchErr } = await supabase
    .from("offers")
    .select("status")
    .eq("id", offerId)
    .eq("org_id", user.orgId)
    .single();

  if (fetchErr || !existing) return { success: false, error: "Offer not found" };
  if (["accepted", "declined"].includes((existing as any).status)) {
    return { success: false, error: "Cannot delete an offer that has already been responded to" };
  }

  const { error } = await supabase
    .from("offers")
    .delete()
    .eq("id", offerId)
    .eq("org_id", user.orgId);

  if (error) return { success: false, error: error.message };
  revalidatePath("/hire/offers");
  return { success: true, data: undefined };
}
```

- [ ] **Step 3: Update Offer type to expose id reliably**

Verify the `Offer` type (line ~646) includes `id: string`. It should already — confirm via:

```bash
grep -A 5 "^export type Offer" C:/Users/amolg/Downloads/hr-portal/src/actions/hire.ts | head -10
```

If `id` is missing from the type, add it.

- [ ] **Step 4: Wire edit and delete to offers-client.tsx**

In `src/components/hire/offers-client.tsx`:

Add imports:
```tsx
import { createOffer, sendOffer, updateOffer, deleteOffer } from "@/actions/hire";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
```

Add state:
```tsx
  const [editingOffer, setEditingOffer] = useState<Offer | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
```

Add `handleEdit` function that prefills the existing `form` and opens the create panel:
```tsx
  function handleEdit(offer: Offer) {
    setForm({
      application_id: offer.application_id,
      role_title: offer.role_title,
      ctc: String(offer.ctc),
      joining_date: offer.joining_date,
      department_id: offer.department_id ?? "",
      reporting_manager_id: offer.reporting_manager_id ?? "",
      additional_terms: offer.additional_terms ?? "",
    });
    setEditingOffer(offer);
    setCreateOpen(true);
    setOpenMenuId(null);
  }
```

Add `handleDelete` function:
```tsx
  async function handleDelete(offerId: string) {
    if (!confirm("Delete this offer? This cannot be undone.")) return;
    setDeletingId(offerId);
    const result = await deleteOffer(offerId);
    setDeletingId(null);
    if (result.success) {
      toast.success("Offer deleted");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }
```

Update `handleCreate` to call `updateOffer` when editing:
```tsx
  async function handleCreate() {
    if (!form.application_id) return toast.error("Select a candidate");
    if (!form.role_title.trim()) return toast.error("Enter role title");
    if (!form.ctc || isNaN(Number(form.ctc))) return toast.error("Enter valid CTC");
    if (!form.joining_date) return toast.error("Select joining date");

    setSaving(true);
    let result: ActionResult<any>;

    if (editingOffer) {
      result = await updateOffer(editingOffer.id, {
        role_title: form.role_title.trim(),
        ctc: Number(form.ctc),
        joining_date: form.joining_date,
        department_id: form.department_id || undefined,
        reporting_manager_id: form.reporting_manager_id || undefined,
        additional_terms: form.additional_terms || undefined,
      });
    } else {
      result = await createOffer({
        application_id: form.application_id,
        role_title: form.role_title.trim(),
        ctc: Number(form.ctc),
        joining_date: form.joining_date,
        department_id: form.department_id || undefined,
        reporting_manager_id: form.reporting_manager_id || undefined,
        additional_terms: form.additional_terms || undefined,
      });
    }

    setSaving(false);
    if (result.success) {
      toast.success(editingOffer ? "Offer updated" : "Offer created");
      setCreateOpen(false);
      setEditingOffer(null);
      setForm({ application_id: "", role_title: "", ctc: "", joining_date: "", department_id: "", reporting_manager_id: "", additional_terms: "" });
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }
```

Add a MoreHorizontal action menu to each offer row alongside the Send button (for draft/sent offers only). Find the `{isAdmin && offer.status === "draft" && ...}` section and replace with:

```tsx
                {isAdmin && (offer.status === "draft" || offer.status === "sent") && (
                  <div className="flex items-center gap-2 pt-1">
                    {offer.status === "draft" && (
                      <button
                        onClick={() => handleSend(offer.id)}
                        disabled={sending === offer.id}
                        className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                      >
                        <Send className="h-3 w-3" />
                        {sending === offer.id ? "Sending…" : "Send Offer"}
                      </button>
                    )}
                    <button
                      onClick={() => handleEdit(offer)}
                      className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                    <button
                      onClick={() => handleDelete(offer.id)}
                      disabled={deletingId === offer.id}
                      className="flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                    >
                      <Trash2 className="h-3 w-3" />
                      {deletingId === offer.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                )}
```

Update the dialog title to show "Edit Offer" when editing:
```tsx
            <h2 className="text-lg font-bold">{editingOffer ? "Edit Offer" : "Create Offer Letter"}</h2>
```

Also update the candidate select to be disabled when editing (can't change candidate on an existing offer):
```tsx
            <div>
              <label className="text-sm font-medium">Candidate *</label>
              <select
                className={inputCls}
                value={form.application_id}
                onChange={(e) => setField("application_id", e.target.value)}
                disabled={!!editingOffer}
              >
```

- [ ] **Step 5: Add ActionResult import to offers-client if needed**

```bash
grep "ActionResult" C:/Users/amolg/Downloads/hr-portal/src/components/hire/offers-client.tsx
```

If not found, add to the hire import line:
```tsx
import { createOffer, sendOffer, updateOffer, deleteOffer } from "@/actions/hire";
import type { Offer, Application, ActionResult } from "@/actions/hire";
```

Note: `ActionResult` is exported from `@/types`, not `@/actions/hire`. Use the local `result` variable typed as `Awaited<ReturnType<typeof updateOffer>>` or just let TypeScript infer it.

- [ ] **Step 6: Verify build**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Step 7: Commit**

```bash
git add src/actions/hire.ts src/components/hire/offers-client.tsx
git commit -m "feat: add offer edit and delete actions"
```

---

### Task 11: Interview rescheduling

**Context:** `updateInterviewStatus` only changes the status field. There is no way to change `scheduled_at`, interview type, or meeting link. Add `rescheduleInterview()` action and a "Reschedule" button on each interview row that reuses the `ScheduleInterviewDialog` structure.

**Files:**
- Modify: `src/actions/hire.ts` (new action)
- Modify: `src/components/hire/interviews-client.tsx`

- [ ] **Step 1: Add rescheduleInterview server action**

After `updateInterviewStatus()` in `src/actions/hire.ts`, add:

```ts
export async function rescheduleInterview(
  scheduleId: string,
  input: {
    scheduled_at: string;
    interview_type?: "video" | "phone" | "in_person";
    meeting_link?: string;
  }
): Promise<ActionResult<void>> {
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isManagerOrAbove(user.role)) return { success: false, error: "Unauthorized" };

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("interview_schedules")
    .update({
      scheduled_at: input.scheduled_at,
      ...(input.interview_type && { interview_type: input.interview_type }),
      ...(input.meeting_link !== undefined && { meeting_link: input.meeting_link || null }),
    })
    .eq("id", scheduleId)
    .eq("org_id", user.orgId);

  if (error) return { success: false, error: error.message };
  revalidatePath("/hire/interviews");
  return { success: true, data: undefined };
}
```

- [ ] **Step 2: Add reschedule state and handler to InterviewsClient**

In `src/components/hire/interviews-client.tsx`:

Add import:
```tsx
import { updateInterviewStatus, rescheduleInterview } from "@/actions/hire";
import { CalendarDays as CalendarEdit } from "lucide-react";
```

Add state:
```tsx
  const [rescheduling, setRescheduling] = useState<InterviewSchedule | null>(null);
  const [rescheduleData, setRescheduleData] = useState({ scheduled_at: "", interview_type: "video" as "video" | "phone" | "in_person", meeting_link: "" });
  const [rescheduleSaving, setRescheduleSaving] = useState(false);
```

Add handler:
```tsx
  async function handleReschedule() {
    if (!rescheduling || !rescheduleData.scheduled_at) return toast.error("Select a date and time");
    setRescheduleSaving(true);
    const result = await rescheduleInterview(rescheduling.id, {
      scheduled_at: new Date(rescheduleData.scheduled_at).toISOString(),
      interview_type: rescheduleData.interview_type,
      meeting_link: rescheduleData.meeting_link || undefined,
    });
    setRescheduleSaving(false);
    if (result.success) {
      toast.success("Interview rescheduled");
      setRescheduling(null);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }
```

- [ ] **Step 3: Add Reschedule button and inline reschedule form to interview row**

In the actions section of each interview card (where Mark Done / No Show / Cancel buttons are), add a Reschedule button for scheduled interviews:

```tsx
                  {interview.status === "scheduled" && isAdmin && (
                    <>
                      {/* ... existing Mark Done, No Show, Cancel buttons ... */}
                      <button
                        onClick={() => {
                          setRescheduling(interview);
                          setRescheduleData({
                            scheduled_at: interview.scheduled_at.slice(0, 16), // datetime-local format
                            interview_type: interview.interview_type as "video" | "phone" | "in_person",
                            meeting_link: interview.meeting_link ?? "",
                          });
                        }}
                        className="flex items-center gap-1 rounded-md border border-indigo-200 px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-400"
                      >
                        Reschedule
                      </button>
                    </>
                  )}
```

Add inline reschedule form that appears below the card when `rescheduling?.id === interview.id`:

```tsx
                {rescheduling?.id === interview.id && (
                  <div className="border-t border-border pt-3 space-y-3">
                    <p className="text-xs font-semibold">Reschedule Interview</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium">New Date & Time *</label>
                        <input
                          type="datetime-local"
                          className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          value={rescheduleData.scheduled_at}
                          onChange={(e) => setRescheduleData((d) => ({ ...d, scheduled_at: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium">Type</label>
                        <select
                          className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          value={rescheduleData.interview_type}
                          onChange={(e) => setRescheduleData((d) => ({ ...d, interview_type: e.target.value as "video" | "phone" | "in_person" }))}
                        >
                          <option value="video">Video</option>
                          <option value="phone">Phone</option>
                          <option value="in_person">In Person</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium">Meeting Link</label>
                      <input
                        className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                        placeholder="https://meet.google.com/..."
                        value={rescheduleData.meeting_link}
                        onChange={(e) => setRescheduleData((d) => ({ ...d, meeting_link: e.target.value }))}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleReschedule}
                        disabled={rescheduleSaving}
                        className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                      >
                        {rescheduleSaving ? "Saving…" : "Confirm Reschedule"}
                      </button>
                      <button
                        onClick={() => setRescheduling(null)}
                        className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
```

- [ ] **Step 4: Verify build**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
git add src/actions/hire.ts src/components/hire/interviews-client.tsx
git commit -m "feat: add interview rescheduling with inline form"
```

---

### Task 12: Final build check and push

- [ ] **Step 1: Clean build**

```bash
cd C:/Users/amolg/Downloads/hr-portal && npm run build 2>&1 | tail -30
```

Expected: `✓ Compiled successfully` with no TypeScript errors.

- [ ] **Step 2: Lint check**

```bash
npm run lint 2>&1 | tail -20
```

Expected: no errors (warnings are OK).

- [ ] **Step 3: Push to main**

```bash
git push origin main
```
