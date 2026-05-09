# Referrals Module — Acceptance Checklist

Manual verification for PR2 (`11179db` → final). Run after migration and env-var setup.

## Prereqs

- Migration `010_candidate_referrals.sql` run in Supabase SQL Editor.
- Vercel env: `JAMBAHIRE_REFERRALS_ENABLED=true` (Production + Preview).
- Org with `jambahire_enabled=true` and at least one `active` job.
- Test users: 1 `admin`, 1 `manager`, 1 `employee`, 1 `manager-who-is-also-interviewer`.
- Mailbox you can read for the candidate-facing invite email.

## A. Sidebar visibility

| User | Sidebar | Expected |
|---|---|---|
| admin | "Refer" entry visible? | yes |
| manager | "Refer" entry visible? | yes |
| employee | "Refer" entry visible? | yes |
| any (when `JAMBAHIRE_REFERRALS_ENABLED=false`) | "Refer" entry visible? | no |
| any (when org has `jambahire_enabled=false`) | "Refer" entry visible? | no |

The "Referrals" tab inside `/hire/*` is visible only to admins (admin layout already gates `/hire/*`).

## B. Employee submit flow

Sign in as `employee`:

1. Click "Refer" in sidebar → lands on `/dashboard/refer` landing.
2. Click "Browse open roles" → `/dashboard/refer/jobs` lists active jobs only.
3. Click a job → `/dashboard/refer/jobs/<id>` form.
4. Fill name + email + (optional rest) + note → Submit.
5. Toast: "Referral submitted — we'll email them the apply link". Redirect to `/dashboard/refer/my-referrals`.
6. New row appears with status pill "Submitted".

Verify in Supabase: `SELECT * FROM candidate_referrals ORDER BY created_at DESC LIMIT 1;` — row has `status='pending_apply'`, valid `tracking_token`, correct `referrer_clerk_user_id`.

Verify in Resend dashboard: invite email sent to candidate from `noreply@jambahr.com` with subject `<Referrer> referred you for <Job> at <Org>`.

## C. Self-referral block

Sign in as `employee`. Try to refer yourself (use your own employee email).
- Expected: toast error "Self-referrals are not allowed". No row inserted.

## D. Duplicate referral block

Refer the same `candidate@example.com` for the same job a second time (different referrer or same).
- Expected: toast error "This candidate has already been referred for this role". No second row.
- After the first row is set to `withdrawn` or `rejected` (admin moves it), referring again is allowed.

## E. Public apply flow (`/apply/r/[token]`)

Open the invite email (or copy the `tracking_token` from Supabase and visit `/apply/r/<token>`).

1. Page renders with pre-filled name + email + (any URLs that were on the referral).
2. Header reads "<Referrer> referred you" + role + org name.
3. Submit → green success card "You're in. We've received your application."
4. Verify in Supabase: `applications` row created with `stage='applied'`, linked via `candidate_referrals.application_id`, `candidate_referrals.status='applied'`, `submitted_at` set.
5. Try the same token again → "This link has already been used".
6. Move the underlying job to `status='paused'` and try a fresh token → "This role is no longer accepting applications".

## F. Coarse status mapping (auto-sync — v2)

As `admin`, drag the application through stages in `/hire/pipeline` (or `/hire/jobs/<id>`):
1. Move from `applied` → `interview_1`. Reload `/dashboard/refer/my-referrals` as the referrer → row shows "Progressing".
2. Move to `offer`. Reload → still "Progressing".
3. Move to `hired`. Reload → "Hired".
4. From a fresh referral, click "Reject" with a reason. Referrer view → "Closed — no match".

Bulk move (`bulkUpdateApplicationStage`) also syncs — verify by selecting multiple referred candidates in the pipeline and dragging the column. All linked referrals update.

Spot-check: open the Network tab on `/dashboard/refer/my-referrals` and inspect the response. It MUST contain only `{id, candidate_name, candidate_email, job_id, job_title, coarse_status, created_at, updated_at}`. No `status` (fine-grained), no `application_id`, no salary, no other applicant data.

The fine→coarse map is enforced by `src/lib/referrals/status.ts::toCoarse`. Auto-sync from application stage uses `applicationStageToReferralStatus` in the same file, called from `syncReferralFromApplicationStage` (`src/lib/referrals/sync.ts`).

## G. Admin inbox (`/hire/referrals`)

Sign in as `admin`:

1. JambaHire nav now shows "Referrals" tab (alongside Jobs/Candidates/etc).
2. Click → `/hire/referrals` lists every referral in the org.
3. Click "View" → `/hire/referrals/<id>` detail page with all candidate fields, referrer name, note, application link if applied.
4. Sign in as `manager` and try `/hire/referrals` directly → redirect to `/dashboard` (PR1 admin-only gate).

## H. Withdraw flow (UI — v2)

Sign in as the original referrer and open `/dashboard/refer/my-referrals`:

1. For a row in "Submitted" or "Being reviewed" → "Withdraw" link visible.
2. Click → confirmation modal "Withdraw referral? You're about to withdraw the referral for <name>…".
3. Confirm → toast "Referral withdrawn". Row updates: pill flips to "Closed — no match".
4. For a row in "Progressing" / "Hired" / "Closed" → no Withdraw link rendered (admins only past that point).

Admin side: the same `withdrawReferral` is callable from server context for any row except `hired`. Admin UI button to withdraw from `/hire/referrals/<id>` is still a future enhancement.

## I. Admin notification email (v2)

When an employee submits a referral via `/dashboard/refer/jobs/<id>`:

1. Inspect Resend's send log. Two emails should fire:
   - To the candidate, from `noreply@jambahr.com`, subject `<Referrer> referred you for <Job> at <Org>`.
   - To every admin/owner of the org (looked up via `employees.role IN ('owner','admin')` and `status != 'terminated'`), from `support@jambahr.com`, subject `New referral: <Candidate> for <Job>`.
2. The admin email body shows candidate name, email, job, referrer name, and the optional note. Has a "Review in inbox →" button → `https://jambahr.com/hire/referrals`.
3. Edge cases: org with zero admins → no admin email sent (function early-returns). RESEND_API_KEY missing → both emails skipped (function early-returns; row insert still succeeds).

## J. Sign-off

- [ ] A — sidebar visibility
- [ ] B — employee submit + email send
- [ ] C — self-referral block
- [ ] D — duplicate block
- [ ] E — public apply flow
- [ ] F — coarse status auto-sync
- [ ] G — admin inbox
- [ ] H — referrer-side withdraw UI
- [ ] I — admin notification email

Signed off by: ______________ on ______________.
