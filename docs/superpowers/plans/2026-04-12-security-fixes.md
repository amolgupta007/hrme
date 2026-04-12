# Security & Auth Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all critical, high, and selected medium severity security/auth issues found in the JambaHR codebase audit.

**Architecture:** Surgical edits only — no refactoring, no new abstractions. Each fix is the minimal change to close the vulnerability. The pattern throughout: add `getCurrentUser()` + role/ownership check at the top of unguarded functions, fix the GET-mutation anti-pattern in the offer flow, add Zod to the one unvalidated action, add feature-flag checks to two action files, and add error toasts to two client components.

**Tech Stack:** Next.js 14 Server Actions, TypeScript, `getCurrentUser()` / `isAdmin()` / `isManagerOrAbove()` from `@/lib/current-user`, `hasFeature()` from `@/config/plans`, Zod, Sonner toasts.

---

## Files Modified

| File | Change |
|------|--------|
| `src/actions/hire.ts` | C1: add `offer_token` in `createOffer`; H1: explicit columns in `getPublicJobs`; H5: add `isAdmin` to `updateApplicationStage`, `rejectApplication`, `scheduleInterview`, `updateInterviewStatus`, `submitInterviewFeedback`; H6: add Zod to `submitApplication` |
| `src/app/offers/[token]/page.tsx` | C2: remove GET-param mutation; convert buttons to a `<form>` with Server Action |
| `src/actions/profile.ts` | C3: add ownership check in `updateMyProfile` |
| `src/actions/departments.ts` | H2: add `isAdmin` guard + import `getCurrentUser` |
| `src/actions/objectives.ts` | H3: add `isManagerOrAbove` to `approveObjectives` / `rejectObjectives` |
| `src/actions/reviews.ts` | H4: add `isAdmin` to `updateCycleStatus`; add ownership to `submitSelfReview`; add `isManagerOrAbove` to `submitManagerReview` |
| `src/actions/training.ts` | H7: add `hasFeature` plan check to mutation actions |
| `src/actions/grievances.ts` | H7: add `grievancesEnabled` check to `submitGrievance`, `listGrievances`, `updateGrievanceStatus` |
| `src/components/attendance/attendance-client.tsx` | H8: add error toast in `handleFilterEmployee` |
| `src/components/payroll/payroll-client.tsx` | H8: add error toast in `handleExpandRun` |

---

## Task 1: C1 — Add `offer_token` in `createOffer`

**Files:**
- Modify: `src/actions/hire.ts` (around line 834)

The `createOffer` insert never sets `offer_token`, so `sendOffer` builds URLs like `/offers/undefined`. Fix: generate a UUID server-side and include it in the insert payload.

- [ ] **Step 1: Edit `createOffer` to generate a token**

In `src/actions/hire.ts`, find the `.insert({` block inside `createOffer` (around line 836). Add `offer_token: crypto.randomUUID(),` to the insert object:

```typescript
  const { data, error } = await supabase
    .from("offers")
    .insert({
      org_id: user.orgId,
      application_id: input.application_id,
      ctc: input.ctc,
      joining_date: input.joining_date,
      role_title: input.role_title,
      department_id: input.department_id || null,
      reporting_manager_id: input.reporting_manager_id || null,
      additional_terms: input.additional_terms || null,
      status: "draft",
      offer_token: crypto.randomUUID(),
    })
    .select("id")
    .single();
```

- [ ] **Step 2: Commit**

```bash
git add src/actions/hire.ts
git commit -m "fix: generate offer_token in createOffer"
```

---

## Task 2: H1 — Remove `created_by` from public jobs API

**Files:**
- Modify: `src/actions/hire.ts` (around line 413)

`getPublicJobs` uses `.select("*")` which leaks the internal `created_by` employee UUID to the public `/careers/` page.

- [ ] **Step 1: Replace wildcard select with explicit columns**

Find the `.select("*")` inside `getPublicJobs` and replace:

```typescript
  const { data: jobs, error } = await supabase
    .from("jobs")
    .select("id, org_id, title, description, employment_type, location_type, location, salary_min, salary_max, show_salary, status, custom_questions, created_at")
    .eq("org_id", (org as any).id)
    .eq("status", "active")
    .order("created_at", { ascending: false });
```

- [ ] **Step 2: Commit**

```bash
git add src/actions/hire.ts
git commit -m "fix: exclude created_by from public jobs API"
```

---

## Task 3: C2 — Convert offer accept/decline from GET mutation to POST

**Files:**
- Modify: `src/app/offers/[token]/page.tsx`

Currently the page reads `searchParams.response` and calls `respondToOffer` during SSR (a GET request). Email clients/link previewers can silently accept offers. Fix: remove the GET mutation logic and replace the `<a href>` buttons with a `<form>` submitting a Server Action.

- [ ] **Step 1: Create an inline Server Action for responding to offers**

Replace the entire file content of `src/app/offers/[token]/page.tsx` with:

```typescript
import { getOfferByToken, respondToOffer } from "@/actions/hire";
import { CheckCircle2, XCircle, Building2 } from "lucide-react";
import { redirect } from "next/navigation";

interface Props {
  params: { token: string };
}

async function handleOfferResponse(token: string, decision: "accepted" | "declined") {
  "use server";
  await respondToOffer(token, decision);
  redirect(`/offers/${token}`);
}

export default async function OfferResponsePage({ params }: Props) {
  const result = await getOfferByToken(params.token);

  if (!result.success) {
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

  const { offer, orgName } = result.data;
  const alreadyResponded = offer.status === "accepted" || offer.status === "declined";

  const acceptAction = handleOfferResponse.bind(null, params.token, "accepted");
  const declineAction = handleOfferResponse.bind(null, params.token, "declined");

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 bg-white rounded-full px-4 py-2 shadow-sm border mb-4">
            <Building2 className="h-4 w-4 text-indigo-600" />
            <span className="text-sm font-semibold text-indigo-700">{orgName}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Offer Letter</h1>
        </div>

        {/* Offer Card */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 space-y-5">
          <div className="border-b pb-4">
            <p className="text-sm text-gray-500">Congratulations,</p>
            <p className="text-xl font-bold mt-1">{offer.candidate_name}</p>
          </div>

          <p className="text-sm text-gray-600">
            We are pleased to extend this offer for the position of{" "}
            <strong className="text-gray-900">{offer.role_title}</strong> at{" "}
            <strong className="text-gray-900">{orgName}</strong>.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-indigo-50 px-4 py-3">
              <p className="text-xs text-indigo-600 font-medium">Annual CTC</p>
              <p className="text-lg font-bold text-indigo-700 mt-0.5">
                ₹{(offer.ctc / 100000).toFixed(2)} LPA
              </p>
              <p className="text-xs text-indigo-500">₹{offer.ctc.toLocaleString("en-IN")}/year</p>
            </div>
            <div className="rounded-xl bg-purple-50 px-4 py-3">
              <p className="text-xs text-purple-600 font-medium">Joining Date</p>
              <p className="text-base font-bold text-purple-700 mt-0.5">
                {new Date(offer.joining_date).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>

          {offer.department_name && (
            <div className="text-sm">
              <span className="text-gray-500">Department: </span>
              <span className="font-medium">{offer.department_name}</span>
            </div>
          )}

          {offer.reporting_manager_name && (
            <div className="text-sm">
              <span className="text-gray-500">Reporting Manager: </span>
              <span className="font-medium">{offer.reporting_manager_name}</span>
            </div>
          )}

          {offer.additional_terms && (
            <div className="rounded-xl bg-gray-50 px-4 py-3">
              <p className="text-xs font-medium text-gray-500 mb-1">Additional Terms</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{offer.additional_terms}</p>
            </div>
          )}
        </div>

        {/* Response Section */}
        {alreadyResponded ? (
          <div className={`rounded-2xl border p-6 text-center ${
            offer.status === "accepted"
              ? "bg-green-50 border-green-200"
              : "bg-gray-50 border-gray-200"
          }`}>
            {offer.status === "accepted" ? (
              <>
                <CheckCircle2 className="mx-auto h-10 w-10 text-green-500 mb-3" />
                <h2 className="text-lg font-bold text-green-800">Offer Accepted!</h2>
                <p className="text-sm text-green-600 mt-1">
                  You&apos;ve accepted the offer. {orgName} will be in touch with next steps.
                </p>
              </>
            ) : (
              <>
                <XCircle className="mx-auto h-10 w-10 text-gray-400 mb-3" />
                <h2 className="text-lg font-bold text-gray-700">Offer Declined</h2>
                <p className="text-sm text-gray-500 mt-1">
                  You&apos;ve declined this offer. Thank you for considering {orgName}.
                </p>
              </>
            )}
          </div>
        ) : offer.status === "expired" ? (
          <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-6 text-center">
            <p className="text-sm font-medium text-yellow-800">This offer has expired.</p>
            <p className="text-xs text-yellow-600 mt-1">Please contact {orgName} if you have questions.</p>
          </div>
        ) : offer.status === "sent" ? (
          <div className="bg-white rounded-2xl shadow-sm border p-6 space-y-4">
            <p className="text-sm text-gray-600 text-center">Please respond to this offer:</p>
            <div className="flex gap-3">
              <form action={acceptAction} className="flex-1">
                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold py-3 text-sm transition-colors"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Accept Offer
                </button>
              </form>
              <form action={declineAction} className="flex-1">
                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 text-sm transition-colors"
                >
                  <XCircle className="h-4 w-4" />
                  Decline
                </button>
              </form>
            </div>
          </div>
        ) : null}

        <p className="text-center text-xs text-gray-400">
          Powered by JambaHire · {orgName}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/offers/[token]/page.tsx
git commit -m "fix: convert offer accept/decline from GET mutation to POST form action"
```

---

## Task 4: C3 — Add ownership check in `updateMyProfile`

**Files:**
- Modify: `src/actions/profile.ts` (around line 120)

`updateMyProfile` accepts an `employeeId` param but never verifies it belongs to the calling user. Any authenticated employee can overwrite another's PAN, Aadhar, etc. Fix: switch from `currentUser()` (Clerk) to `getCurrentUser()` (our helper that returns `employeeId`) and assert ownership.

- [ ] **Step 1: Replace auth check with ownership assertion**

The current imports in profile.ts include `currentUser` from `@clerk/nextjs/server`. We need to also import `getCurrentUser` from `@/lib/current-user`.

First add the import at the top of `src/actions/profile.ts` (it may already have it — if so, skip adding):

```typescript
import { getCurrentUser } from "@/lib/current-user";
```

Then replace the `updateMyProfile` function's auth section (lines 120-128) from:

```typescript
export async function updateMyProfile(
  employeeId: string,
  formData: z.infer<typeof profileSchema>
): Promise<ActionResult<void>> {
  const user = await currentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const orgId = await getOrgId();
  if (!orgId) return { success: false, error: "Organization not found" };
```

To:

```typescript
export async function updateMyProfile(
  employeeId: string,
  formData: z.infer<typeof profileSchema>
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (user.employeeId !== employeeId) return { success: false, error: "Forbidden" };
```

Then update the `.eq("org_id", orgId)` at line 157 to `.eq("org_id", user.orgId)`:

```typescript
  const { error } = await supabase
    .from("employees")
    .update({
      first_name: d.firstName,
      last_name: d.lastName,
      designation: d.designation || null,
      personal_email: d.personalEmail || null,
      phone: d.phone || null,
      gender: d.gender || null,
      pronouns: d.pronouns || null,
      marital_status: d.maritalStatus || null,
      country: d.country || null,
      date_of_birth: d.dateOfBirth || null,
      pan_number: d.panNumber || null,
      aadhar_number: d.aadharNumber || null,
      communication_address: d.communicationAddress ?? null,
      permanent_address: d.permanentAddress ?? null,
    })
    .eq("id", employeeId)
    .eq("org_id", user.orgId);
```

- [ ] **Step 2: Commit**

```bash
git add src/actions/profile.ts
git commit -m "fix: add ownership check in updateMyProfile to prevent IDOR"
```

---

## Task 5: H2 — Add `isAdmin` guard to department mutations

**Files:**
- Modify: `src/actions/departments.ts`

`addDepartment`, `updateDepartment`, `deleteDepartment` only check auth but not role. Any employee can restructure the org. Fix: import `getCurrentUser` + `isAdmin`, replace the bare `getOrgId()` call with a role-checked pattern.

- [ ] **Step 1: Add import**

At the top of `src/actions/departments.ts`, add to the existing imports:

```typescript
import { getCurrentUser, isAdmin } from "@/lib/current-user";
```

- [ ] **Step 2: Guard `addDepartment`**

Replace the auth section of `addDepartment` (lines 48-50):

```typescript
// BEFORE:
  const orgId = await getOrgId();
  if (!orgId) return { success: false, error: "Not authenticated" };
```

```typescript
// AFTER:
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can manage departments" };
  const orgId = user.orgId;
```

- [ ] **Step 3: Guard `updateDepartment`**

Replace the auth section of `updateDepartment` (lines 78-80):

```typescript
// BEFORE:
  const orgId = await getOrgId();
  if (!orgId) return { success: false, error: "Not authenticated" };
```

```typescript
// AFTER:
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can manage departments" };
  const orgId = user.orgId;
```

- [ ] **Step 4: Guard `deleteDepartment`**

Replace the auth section of `deleteDepartment` (lines 100-101):

```typescript
// BEFORE:
  const orgId = await getOrgId();
  if (!orgId) return { success: false, error: "Not authenticated" };
```

```typescript
// AFTER:
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can manage departments" };
  const orgId = user.orgId;
```

- [ ] **Step 5: Commit**

```bash
git add src/actions/departments.ts
git commit -m "fix: restrict department CRUD to admins only"
```

---

## Task 6: H3 — Add role guard to objective approval/rejection

**Files:**
- Modify: `src/actions/objectives.ts` (lines 313-357)

`approveObjectives` and `rejectObjectives` use `getOrgContext()` which only checks auth, not role. Any employee can approve/reject any objective. Fix: replace with `getCurrentUser()` and require `isManagerOrAbove`.

- [ ] **Step 1: Verify imports in objectives.ts**

Check the top of `src/actions/objectives.ts`. It should already import `getCurrentUser` and `isManagerOrAbove` (or `isAdmin`). If `isManagerOrAbove` is missing, add it:

```typescript
import { getCurrentUser, isAdmin, isManagerOrAbove } from "@/lib/current-user";
```

- [ ] **Step 2: Guard `approveObjectives`**

Replace the auth check in `approveObjectives` (lines 317-318):

```typescript
// BEFORE:
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };
```

```typescript
// AFTER:
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isManagerOrAbove(user.role)) return { success: false, error: "Only managers can approve objectives" };
```

Then update all references from `ctx.orgId` to `user.orgId` in that function.

- [ ] **Step 3: Guard `rejectObjectives`**

Replace the auth check in `rejectObjectives` (lines 341-342):

```typescript
// BEFORE:
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };
```

```typescript
// AFTER:
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isManagerOrAbove(user.role)) return { success: false, error: "Only managers can reject objectives" };
```

Then update all references from `ctx.orgId` to `user.orgId` in that function.

- [ ] **Step 4: Commit**

```bash
git add src/actions/objectives.ts
git commit -m "fix: require manager role for objective approval/rejection"
```

---

## Task 7: H4 — Add auth guards to review actions

**Files:**
- Modify: `src/actions/reviews.ts` (lines 195-358)

Three issues:
1. `updateCycleStatus` — admin-only but no role check
2. `submitSelfReview` — no ownership check (any user can submit for any employee)
3. `submitManagerReview` — no role check (any user can submit manager review)

- [ ] **Step 1: Verify imports in reviews.ts**

Ensure the top of `src/actions/reviews.ts` has:

```typescript
import { getCurrentUser, isAdmin, isManagerOrAbove } from "@/lib/current-user";
```

- [ ] **Step 2: Guard `updateCycleStatus`**

Replace the auth check (lines 199-200):

```typescript
// BEFORE:
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };
```

```typescript
// AFTER:
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can update cycle status" };
```

Then update `ctx.orgId` → `user.orgId` in that function.

- [ ] **Step 3: Add ownership check to `submitSelfReview`**

Replace the auth section of `submitSelfReview` (lines 299-300). We need to fetch the review first to verify ownership:

```typescript
// BEFORE:
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const validated = selfReviewSchema.safeParse(data);
  if (!validated.success) {
    return { success: false, error: validated.error.errors[0]?.message ?? "Validation failed" };
  }

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("reviews")
    .update({
      self_rating: validated.data.self_rating,
      self_comments: validated.data.self_comments,
      goals: validated.data.goals,
      status: "manager_review",
    })
    .eq("id", reviewId)
    .eq("org_id", ctx.orgId);
```

```typescript
// AFTER:
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const validated = selfReviewSchema.safeParse(data);
  if (!validated.success) {
    return { success: false, error: validated.error.errors[0]?.message ?? "Validation failed" };
  }

  const supabase = createAdminSupabase();

  // Verify this review belongs to the calling employee
  const { data: review } = await supabase
    .from("reviews")
    .select("employee_id")
    .eq("id", reviewId)
    .eq("org_id", user.orgId)
    .single();
  if (!review || (review as any).employee_id !== user.employeeId) {
    return { success: false, error: "You can only submit your own self-review" };
  }

  const { error } = await supabase
    .from("reviews")
    .update({
      self_rating: validated.data.self_rating,
      self_comments: validated.data.self_comments,
      goals: validated.data.goals,
      status: "manager_review",
    })
    .eq("id", reviewId)
    .eq("org_id", user.orgId);
```

- [ ] **Step 4: Guard `submitManagerReview`**

Replace the auth check of `submitManagerReview` (lines 334-335):

```typescript
// BEFORE:
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };
```

```typescript
// AFTER:
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isManagerOrAbove(user.role)) return { success: false, error: "Only managers can submit manager reviews" };
```

Then update `ctx.orgId` → `user.orgId` in that function.

- [ ] **Step 5: Commit**

```bash
git add src/actions/reviews.ts
git commit -m "fix: add role and ownership checks to review actions"
```

---

## Task 8: H5 — Add `isAdmin` guard to hire pipeline actions

**Files:**
- Modify: `src/actions/hire.ts` (lines 342-777)

`updateApplicationStage`, `rejectApplication`, `scheduleInterview`, `updateInterviewStatus`, and `submitInterviewFeedback` all authenticate but don't check role. Any org member can manipulate the ATS pipeline.

- [ ] **Step 1: Guard `updateApplicationStage`**

After the existing auth check (line 347), add:

```typescript
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can move application stages" };
```

- [ ] **Step 2: Guard `rejectApplication`**

After the existing auth check (line 365), add:

```typescript
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can reject applications" };
```

- [ ] **Step 3: Guard `scheduleInterview`**

After the existing auth check (line 699), add:

```typescript
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can schedule interviews" };
```

- [ ] **Step 4: Guard `updateInterviewStatus`**

After the existing auth check (line 729), add:

```typescript
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can update interview status" };
```

- [ ] **Step 5: Guard `submitInterviewFeedback`**

`submitInterviewFeedback` is special — interviewers (non-admin employees) need to submit feedback for their assigned interviews. The guard should allow any authenticated org member, but verify the caller is the assigned interviewer:

After the existing auth check (line 753), add:

```typescript
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };
  // Verify caller is the assigned interviewer for this schedule
  const supabase = createAdminSupabase();
  const { data: schedule } = await supabase
    .from("interview_schedules")
    .select("interviewer_id")
    .eq("id", input.schedule_id)
    .eq("org_id", user.orgId)
    .single();
  if (!schedule) return { success: false, error: "Interview not found" };
  if (!isAdmin(user.role) && (schedule as any).interviewer_id !== user.employeeId) {
    return { success: false, error: "You can only submit feedback for interviews you conducted" };
  }
```

Note: The existing supabase client instantiation line (`const supabase = createAdminSupabase();`) that comes after the auth check should be removed since we're now creating it inside the guard. Make sure there's only one `createAdminSupabase()` call.

- [ ] **Step 6: Commit**

```bash
git add src/actions/hire.ts
git commit -m "fix: add isAdmin guards to hire pipeline actions"
```

---

## Task 9: H6 — Add Zod validation to `submitApplication`

**Files:**
- Modify: `src/actions/hire.ts` (lines 455-524)

`submitApplication` is the only action that skips Zod validation, accepting raw user input directly.

- [ ] **Step 1: Add schema and validation**

Before the `submitApplication` function definition (around line 454), add a schema:

```typescript
const applicationSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  email: z.string().email("Valid email required"),
  phone: z.string().max(20).optional(),
  linkedin_url: z.string().url("Invalid LinkedIn URL").optional().or(z.literal("")),
  resume_url: z.string().optional(),
  work_samples: z.array(z.string()).optional(),
  cover_note: z.string().max(2000).optional(),
  answers: z.array(z.object({
    question: z.string(),
    answer: z.string(),
  })).optional(),
});
```

Then at the top of the `submitApplication` function body, add validation before the DB calls:

```typescript
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
  }
): Promise<ActionResult<void>> {
  const validated = applicationSchema.safeParse(data);
  if (!validated.success) {
    return { success: false, error: validated.error.errors[0]?.message ?? "Validation failed" };
  }
  const d = validated.data;

  const supabase = createAdminSupabase();
  // ... rest of function uses d.name, d.email, etc. instead of data.name, data.email
```

Update all subsequent references from `data.name`, `data.email`, etc. to `d.name`, `d.email`, `d.phone`, `d.linkedin_url`, `d.resume_url`, `d.work_samples`, `d.cover_note`, `d.answers`.

- [ ] **Step 2: Commit**

```bash
git add src/actions/hire.ts
git commit -m "fix: add Zod validation to submitApplication"
```

---

## Task 10: H7 — Add feature flag checks to training and grievance actions

**Files:**
- Modify: `src/actions/training.ts`
- Modify: `src/actions/grievances.ts`

Both modules gate at page level only. Direct action calls bypass the plan/feature check.

- [ ] **Step 1: Add `hasFeature` check to training mutations**

In `src/actions/training.ts`, find where `getCurrentUser` is called in mutation actions (`createCourse`, `updateCourse`, `deleteCourse`, `enrollEmployees`). Add the import at the top if not present:

```typescript
import { hasFeature } from "@/config/plans";
```

After the `getCurrentUser()` + auth check in each of these four functions, add:

```typescript
  if (!hasFeature(user.plan, "training")) {
    return { success: false, error: "Training module requires Growth plan or above" };
  }
```

Example for `createCourse` (apply the same pattern to `updateCourse`, `deleteCourse`, `enrollEmployees`):

```typescript
export async function createCourse(formData: z.infer<typeof courseSchema>): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can create courses" };
  if (!hasFeature(user.plan, "training")) {
    return { success: false, error: "Training module requires Growth plan or above" };
  }
  // ... rest unchanged
```

- [ ] **Step 2: Add `grievancesEnabled` check to grievance actions**

In `src/actions/grievances.ts`, after the `getCurrentUser()` call in `submitGrievance`, `listGrievances`, `updateGrievanceStatus`, and `getGrievanceStats`, add:

```typescript
  if (!user.grievancesEnabled) {
    return { success: false, error: "Grievances module is not enabled for your organization" };
  }
```

Example for `submitGrievance`:

```typescript
export async function submitGrievance(
  input: z.infer<typeof submitSchema>
): Promise<ActionResult<{ tracking_token: string }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!user.grievancesEnabled) {
    return { success: false, error: "Grievances module is not enabled for your organization" };
  }
  // ... rest unchanged
```

- [ ] **Step 3: Commit**

```bash
git add src/actions/training.ts src/actions/grievances.ts
git commit -m "fix: add feature flag checks to training and grievance actions"
```

---

## Task 11: H8 — Add error toasts for silent failures

**Files:**
- Modify: `src/components/attendance/attendance-client.tsx` (line 90)
- Modify: `src/components/payroll/payroll-client.tsx` (line 112)

Both functions silently swallow action errors — users see no feedback when data fails to load.

- [ ] **Step 1: Fix `handleFilterEmployee` in attendance-client.tsx**

Find `handleFilterEmployee` (around line 83) and add the error branch:

```typescript
// BEFORE:
    if (result.success) setFilteredHistory(result.data);

// AFTER:
    if (result.success) setFilteredHistory(result.data);
    else toast.error(result.error);
```

- [ ] **Step 2: Fix `handleExpandRun` in payroll-client.tsx**

Find `handleExpandRun` (around line 103) and add the error branch:

```typescript
// BEFORE:
      if (result.success) setRunEntries((prev) => ({ ...prev, [runId]: result.data }));
      setLoadingEntries(null);

// AFTER:
      if (result.success) setRunEntries((prev) => ({ ...prev, [runId]: result.data }));
      else toast.error(result.error);
      setLoadingEntries(null);
```

- [ ] **Step 3: Commit**

```bash
git add src/components/attendance/attendance-client.tsx src/components/payroll/payroll-client.tsx
git commit -m "fix: surface action errors via toast in attendance and payroll clients"
```

---

## Self-Review

**Spec coverage check:**
- C1 offer token ✅ Task 1
- C2 GET mutation ✅ Task 3
- C3 IDOR profile ✅ Task 4
- H1 public jobs leak ✅ Task 2
- H2 department auth ✅ Task 5
- H3 objectives auth ✅ Task 6
- H4 reviews auth ✅ Task 7
- H5 hire pipeline auth ✅ Task 8
- H6 submitApplication Zod ✅ Task 9
- H7 feature flags ✅ Task 10
- H8 error toasts ✅ Task 11

**No placeholders found.** All steps include exact code.

**Type consistency:** All functions use `user.orgId` (from `getCurrentUser()`) consistently. `isAdmin`, `isManagerOrAbove` from `@/lib/current-user`. `hasFeature` from `@/config/plans`.
