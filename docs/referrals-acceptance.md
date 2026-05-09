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

## F. Coarse status mapping

As `admin`, change the application's `stage` in `/hire/jobs/<id>` (drag candidate to `interview_1`, then `offer`, then `hired`).

Note: today the admin moving stages does NOT auto-update `candidate_referrals.status` — that's a future enhancement (the action would call `applicationStageToReferralStatus` from `src/lib/referrals/status.ts`). For acceptance now, manually update the status in the DB:

```sql
UPDATE candidate_referrals SET status='interview' WHERE id='<row id>';
```

Then sign in as the original referrer and load `/dashboard/refer/my-referrals` — the row should show "Progressing" pill (the COARSE label, never "interview").

Spot-check: open the Network tab on `/dashboard/refer/my-referrals` and inspect the response. It MUST contain only `{id, candidate_name, candidate_email, job_id, job_title, coarse_status, created_at, updated_at}`. No `status` (fine-grained), no `application_id`, no salary, no other applicant data.

## G. Admin inbox (`/hire/referrals`)

Sign in as `admin`:

1. JambaHire nav now shows "Referrals" tab (alongside Jobs/Candidates/etc).
2. Click → `/hire/referrals` lists every referral in the org.
3. Click "View" → `/hire/referrals/<id>` detail page with all candidate fields, referrer name, note, application link if applied.
4. Sign in as `manager` and try `/hire/referrals` directly → redirect to `/dashboard` (PR1 admin-only gate).

## H. Withdraw flow

As referrer, before the candidate hits `interview` status:
- (UI for withdraw is admin-only in this PR; referrer-side withdraw button is a future enhancement.)
- Test from server-action POST or admin: `withdrawReferral(id)` → status becomes `withdrawn`.

After interview/offer/hired, referrer cannot withdraw. Admin can always withdraw except for `hired`.

## I. Sign-off

- [ ] A — sidebar visibility
- [ ] B — employee submit + email send
- [ ] C — self-referral block
- [ ] D — duplicate block
- [ ] E — public apply flow
- [ ] F — coarse status only on referrer side
- [ ] G — admin inbox
- [ ] H — withdraw

Signed off by: ______________ on ______________.
