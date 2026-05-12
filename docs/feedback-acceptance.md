# Feedback Module — Acceptance Checklist

Manual verification for the in-app bug-report / feature-request / feedback feature shipped 2026-05-12 (`a096ae2` → `104a4f6`). Run after Vercel deploy.

## Prereqs

- Migration `011_feedback_reports.sql` applied in Supabase (project `imjwqktxzahhnfmfbtfc`).
- Supabase storage bucket `feedback-screenshots` exists, `public: true`. One-off SQL:
  ```sql
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('feedback-screenshots', 'feedback-screenshots', true)
  ON CONFLICT (id) DO NOTHING;
  ```
- Vercel env: `SUPERADMIN_SECRET` (or `SUPERADMIN_SESSION_TOKEN`) set in Production + Preview.
- Resend `RESEND_API_KEY` set (already in use elsewhere).
- Test users: 1 `owner`, 1 `admin`, 1 `manager`, 1 `employee` — same org.
- Mailbox `amol@jambahr.com` accessible (founder email destination).

## A. Dropdown visibility

Sign in as each role. Click the avatar at the bottom-left of the sidebar.

| Role | "My Feedback" link | "Send feedback" action |
|---|---|---|
| owner | yes | yes |
| admin | yes | yes |
| manager | yes | yes |
| employee | yes | yes |

The dropdown items appear directly below "My Profile". Neither shows up in the sidebar nav (intentional — dropdown-only per spec decision #7).

## B. Submit flow (each role)

For each test user, run this once:

1. Click avatar → **Send feedback** → dialog opens centered, dimmed backdrop.
2. Select type **Bug** → severity selector appears. Switch to **Feature** → severity disappears.
3. Fill title (≤120) and description (≤2000). Character counters update under each field.
4. **Without screenshot first**: click *Send feedback*. Toast: "Thanks — we got it. Track it under My Feedback."
5. Verify Supabase row:
   ```sql
   SELECT id, type, severity, title, status, page_url, user_agent, screenshot_url
   FROM feedback_reports
   ORDER BY created_at DESC LIMIT 1;
   ```
   Expected: `status='new'`, `severity` null for non-bug or set to your choice for bug, `screenshot_url` null, `page_url` matches where you opened the dialog, `user_agent` populated.
6. Check `amol@jambahr.com` — founder alert email arrives within ~30s. Subject `[Feedback] {emoji} {title}` or `[URGENT] [Feedback] …` when type=bug + severity=critical.

## C. Screenshot upload

1. Open dialog, attach a PNG/JPG ≤5MB, submit. Expected: success toast.
2. Verify row `screenshot_url` is populated and the URL loads in browser (public bucket).
3. Try a >5MB file. Expected: client-side toast "Screenshot must be 5MB or smaller", no upload, no row inserted.
4. Try a non-image file (e.g. PDF). Expected: server-side rejection from `uploadFeedbackScreenshot` ("PNG or JPG only"), no row.

## D. Keyboard shortcut

| Where | Action | Expected |
|---|---|---|
| `/dashboard` body (not focused on input) | Press `Cmd+/` (Mac) or `Ctrl+/` (Win) | Dialog opens |
| `/dashboard/employees` | Press `Cmd+/` | Dialog opens |
| Inside a `<textarea>` (e.g. announcements composer) | Press `Cmd+/` | No-op (lets `/` type in field) |
| Inside a `<textarea>` | Press `Shift+Cmd+/` | Dialog opens (override) |
| `/` (marketing landing) | Press `Cmd+/` | No-op (trigger not mounted on public pages) |
| `/sign-in` | Press `Cmd+/` | No-op |

## E. Rate limiting

Submit 5 feedback rows from one user inside a 15-minute window. The 6th submit attempt:

- Click *Send feedback* → Toast: "Too many reports — please wait a few minutes."
- No new row in `feedback_reports`.
- If a screenshot was uploaded as part of the rejected attempt, it is deleted from the bucket (orphan-cleanup).

Also verify upload rate limit:

- After 5 rows exist for the user, open the dialog and attach a screenshot. The upload action also rejects.

## F. My Feedback page

Sign in as a reporter who has at least 2 submissions.

1. Click avatar → **My Feedback** → lands on `/dashboard/feedback`.
2. Table renders: type icon, title, status badge, time-ago.
3. Empty state ("No reports yet…") appears for users with zero submissions.
4. Admin notes (after triage in section G) render inline under the title.

Only own rows are visible. A user from a different org sees only their org's rows.

## G. Superadmin triage flow

1. Sign in at `/superadmin/login` with the `SUPERADMIN_SECRET`.
2. Dashboard at `/superadmin/dashboard` shows a **Feedback** card with **New** and **Triaged** counts (live counts via `countFeedback`).
3. Click **Open inbox →** → `/superadmin/feedback` list page.
4. Apply each filter (Status / Type / Severity) — URL updates, list narrows correctly.
5. Click a row → `/superadmin/feedback/[id]` detail page renders:
   - Reporter name, email, role-at-submit, org name/slug
   - Submitted timestamp in IST
   - Full description (whitespace preserved)
   - Screenshot preview (if any)
   - User-agent
6. Set status=`triaged`, priority=`high`, admin_notes="Looking at this." → Save. Toast "Saved".
7. List page now shows the row with status `triaged`.
8. Detail page → status=`resolved`, save. Verify:
   ```sql
   SELECT id, status, resolved_at, resolved_by
   FROM feedback_reports
   WHERE id = '<the row id>';
   ```
   Expected: `resolved_at` populated, `resolved_by='superadmin'`.
9. Set status back to `triaged` → save. Verify `resolved_at` and `resolved_by` are NULL again.

## H. Reporter sees admin response

After step G.6 above, sign back in as the reporter who submitted the row.

- Visit `/dashboard/feedback`.
- The row shows the admin note inline under the title.

## I. Negative cases

| Case | Expected |
|---|---|
| Non-superadmin hits `/superadmin/feedback` | Redirect to `/superadmin/login` |
| Non-superadmin calls `listAllFeedback` / `updateFeedbackTriage` directly | Returns `{ success: false, error: "Unauthorized" }` |
| Reporter tries to access another user's feedback row via `getMyFeedback(id)` | Returns `{ success: false, error: "Not found" }` |
| `submitFeedback` called with `screenshotPath` outside caller's `orgId/` prefix | Returns `{ success: false, error: "Invalid screenshot path" }`, no row created |
| Feedback row's org gets deleted | Cascade delete removes the feedback row (`ON DELETE CASCADE` on `org_id`) |

## J. Cleanup

After acceptance run, delete the smoke rows:

```sql
DELETE FROM feedback_reports
WHERE title ILIKE '%acceptance%'
   OR title ILIKE '%smoke test%'
RETURNING id;
```

If you uploaded screenshots in the test rows, they remain in `feedback-screenshots` storage. List + remove via Supabase Dashboard → Storage → feedback-screenshots → filter by `${test-org-id}/` prefix.

## Sign-off

- [ ] Sections A–I pass for at least one user per role
- [ ] Founder email delivery confirmed (subject formatting, URGENT prefix on critical bugs)
- [ ] Rate limiting actually blocks at 5/15min
- [ ] Cmd/Ctrl+/ shortcut works in all locations described
- [ ] Reporter sees admin notes back after triage
- [ ] Superadmin filters narrow the list correctly
- [ ] Cleanup query removed test rows
