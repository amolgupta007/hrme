# JambaHire Access Fix — Acceptance Checklist

Manual verification for PR1 (commits `aed5497` → `58683e5`). Run after deploying to a JambaHire-enabled org.

## Prereqs

- Org with `organizations.settings.jambahire_enabled = true`.
- Test users covering all four roles: `owner`, `admin`, `manager`, `employee`.
- At least one `manager` and one `employee` who is ALSO an interviewer (assigned to a row in `interview_schedules`).
- At least one `manager` who is NOT an interviewer.

## A. Admin pages — `/hire/*`

For each test user, navigate to each path. Expected outcomes:

| Path | owner / admin | manager | employee | anon |
|---|---|---|---|---|
| `/hire` | 200, sees module grid | redirects to `/dashboard` | redirects to `/dashboard` | redirects to `/sign-in` |
| `/hire/jobs` | 200 | redirect | redirect | redirect to `/sign-in` |
| `/hire/jobs/<id>` | 200 | redirect | redirect | redirect to `/sign-in` |
| `/hire/candidates` | 200 | redirect | redirect | redirect to `/sign-in` |
| `/hire/pipeline` | 200 | redirect | redirect | redirect to `/sign-in` |
| `/hire/interviews` | 200 (full org list) | redirect | redirect | redirect to `/sign-in` |
| `/hire/offers` | 200 | redirect | redirect | redirect to `/sign-in` |

Visual: the JambaHire pill in the global header is hidden for managers/employees.
Visual: the "Open JambaHire" link in `/dashboard/settings` Products section is hidden for managers/employees.

## B. Server actions — direct POST

Sign in as a `manager` or `employee` and POST to each read action. Easiest path: open browser devtools on `/dashboard`, run a `fetch` against the Server Action endpoint with a manually-crafted form payload. (If unfamiliar with Server Action curling, skip B and rely on the layout gate; the action layer is defense-in-depth.)

| Action | Expected for manager / employee | Expected for admin |
|---|---|---|
| `listJobs` | `{success:false, error:"Unauthorized"}` | `{success:true, data:[...]}` |
| `getJob` | `{success:false, error:"Unauthorized"}` | `{success:true, data:{...}}` |
| `listCandidates` | `{success:false, error:"Unauthorized"}` | `{success:true, data:[...]}` |
| `listApplications` | `{success:false, error:"Unauthorized"}` | `{success:true, data:[...]}` |
| `listAllApplications` | `{success:false, error:"Unauthorized"}` | `{success:true, data:[...]}` |
| `listInterviews` | `{success:false, error:"Unauthorized"}` | `{success:true, data:[...]}` |
| `listOffers` | `{success:false, error:"Unauthorized"}` | `{success:true, data:[...]}` |

## C. Public surfaces — must stay open

| Path / action | Expected (anon) |
|---|---|
| `GET /careers/<org-slug>` | 200, lists active jobs |
| `getPublicJobs(orgSlug)` server action | `{success:true, data:{org, jobs}}` (only `status='active'`) |
| `GET /offers/<token>` | 200, candidate accept/decline |
| `getOfferByToken(token)` | `{success:true, data:{offer, orgName}}` |
| `submitApplication(jobId, ...)` | `{success:true, ...}` |

## D. Interviewer carve-out — `/dashboard/my-interviews`

Sign in as `manager-who-is-interviewer` and `employee-who-is-interviewer`:

- `/dashboard/my-interviews` → 200.
- Page lists ONLY interviews where `interview_schedules.interviewer_id = my employee_id`.
- "Upcoming" section shows future interviews with a yellow "Upcoming" pill.
- "Past" section shows past interviews with a "Submit feedback" button (or "Feedback in" pill if already submitted).
- Click "Submit feedback" → modal opens. Fill all 4 ratings + recommendation + notes → Submit → toast "Feedback submitted". Refresh page → status now shows "Feedback in".
- Submit a second time → upserts (no duplicate row created).

Sign in as `manager-NOT-interviewer` and `employee-NOT-interviewer`:

- `/dashboard/my-interviews` → 200, shows "No upcoming interviews scheduled for you." and "No past interviews yet."

Sign in as `admin`:

- `/dashboard/my-interviews` → 200, shows only the admin's own assigned interviews (NOT the org-wide list).
- `/hire/interviews` → 200, full org list (unchanged).

Privacy spot-checks on `/dashboard/my-interviews`:

- Page does NOT render: salary, offer details, other candidates' info for the same role, or other interviewers' feedback.
- Inspecting network responses: `MyInterview` type contains only `{schedule_id, scheduled_at, type, status, duration_minutes, candidate_name, job_title, feedback_submitted}`.

## E. RLS sanity (optional, requires Supabase SQL Editor)

Run in the SQL Editor:

```sql
SELECT schemaname, tablename, policyname, cmd
  FROM pg_policies
 WHERE tablename IN (
   'jobs','candidates','applications',
   'interview_schedules','interview_feedback','offers'
 )
 ORDER BY tablename, policyname;
```

Expect to see admin policies on all six tables, plus `jobs_public_read_active`, `interview_schedules_interviewer_read`, `interview_feedback_interviewer_own`. RLS is currently advisory (service-role bypasses); these policies activate the moment Clerk JWT integration ships.

## F. Sign-off

- [ ] A — admin pages
- [ ] B — server actions (or skipped with note)
- [ ] C — public surfaces
- [ ] D — interviewer carve-out
- [ ] E — RLS sanity (optional)

Signed off by: ______________ on ______________.
