# Bug Report / Feedback Feature — Design Spec

**Date**: 2026-05-12
**Status**: Approved (decisions locked 2026-05-12)
**Author**: Claude (per founder brief)

## Goal

A single in-app surface for **any role** (owner / admin / manager / employee) to send bug reports, feature requests, or freeform feedback. Reports persist in Supabase, the founder (`amol@jambahr.com`) gets emailed on every submission, and a `/superadmin/feedback` triage view lets the founder update status / priority / admin notes.

## Decisions (locked)

| # | Question | Decision |
|---|---|---|
| 1 | Role names to snapshot | `owner \| admin \| manager \| employee` (from `src/types/index.ts`) |
| 2 | Email channel | Resend, sender `FOUNDER_EMAIL_FROM` (`amol@jambahr.com`). New template `feedback-received.tsx`. |
| 3 | Cross-org super-admin | **Env-var pattern**, matches existing `/superadmin/social` (`SUPERADMIN_SECRET` cookie auth). No DB formalization yet. |
| 4 | Org-admin visibility | **Superadmin-only** triage. Org owners/admins do not get a per-org feedback inbox in v1. |
| 5 | Anonymous feedback | **Not supported.** Anonymous use-case is already covered by the grievances module. |
| 6 | Screenshot storage | **New Supabase Storage bucket `feedback-screenshots`** (public-read). |
| 7 | Sidebar nav | **Dropdown-only.** No sidebar entry. "My Submissions" page reachable via post-submit toast link and the dropdown menu. |

## Placement

**Primary**: `<UserButton.Action>` inside the existing Clerk `<UserButton>` in `src/components/layout/sidebar.tsx` (lines 159–174 already host custom `MenuItems`/`Link` entries — proven extension point).

**Secondary**: keyboard shortcut **`Cmd/Ctrl + /`** opens the same modal. Hint shown inline in the dropdown ("Send feedback · ⌘/").

Rejected: floating FAB (clutter), sidebar nav item (already 16 entries), settings-only (buried).

## Data model

Table: **`feedback_reports`**

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | `gen_random_uuid()` |
| `org_id` | UUID NOT NULL | FK → `organizations(id)`, CASCADE delete |
| `reporter_user_id` | TEXT NOT NULL | Clerk user id |
| `reporter_employee_id` | UUID | FK → `employees(id)`, SET NULL on delete |
| `reporter_role` | TEXT NOT NULL | snapshot at submit: `owner\|admin\|manager\|employee` |
| `type` | TEXT NOT NULL | CHECK `bug\|feature_request\|feedback\|other` |
| `title` | TEXT NOT NULL | 1–120 chars |
| `description` | TEXT NOT NULL | 1–2000 chars |
| `severity` | TEXT | CHECK `low\|medium\|high\|critical`; reporter-set, only for `type='bug'` |
| `screenshot_url` | TEXT | public URL from `feedback-screenshots` bucket |
| `page_url` | TEXT | auto-captured client-side via `usePathname()` |
| `user_agent` | TEXT | auto-captured client-side via `navigator.userAgent` |
| `status` | TEXT NOT NULL DEFAULT `new` | CHECK `new\|triaged\|in_progress\|resolved\|wontfix` |
| `priority` | TEXT | CHECK `low\|medium\|high\|critical`; admin-set during triage |
| `admin_notes` | TEXT | superadmin-only |
| `resolved_at` | TIMESTAMPTZ | |
| `resolved_by` | TEXT | Clerk user id of resolver |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT `now()` | |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT `now()` | via `update_updated_at_column()` trigger |

Indexes: `(org_id, status)`, `(org_id, reporter_user_id)`, `(created_at DESC)`.

### Migration SQL

```sql
-- supabase/migrations/011_feedback_reports.sql

CREATE TABLE feedback_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  reporter_user_id TEXT NOT NULL,
  reporter_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  reporter_role TEXT NOT NULL CHECK (reporter_role IN ('owner','admin','manager','employee')),
  type TEXT NOT NULL CHECK (type IN ('bug','feature_request','feedback','other')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 2000),
  severity TEXT CHECK (severity IN ('low','medium','high','critical')),
  screenshot_url TEXT,
  page_url TEXT,
  user_agent TEXT,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','triaged','in_progress','resolved','wontfix')),
  priority TEXT CHECK (priority IN ('low','medium','high','critical')),
  admin_notes TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX feedback_reports_org_status_idx ON feedback_reports (org_id, status);
CREATE INDEX feedback_reports_reporter_idx  ON feedback_reports (org_id, reporter_user_id);
CREATE INDEX feedback_reports_created_idx   ON feedback_reports (created_at DESC);

CREATE TRIGGER feedback_reports_updated_at
  BEFORE UPDATE ON feedback_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE feedback_reports ENABLE ROW LEVEL SECURITY;

-- Reporters see their own rows in their org
CREATE POLICY feedback_reporter_select_own ON feedback_reports
  FOR SELECT
  USING (
    org_id = (auth.jwt() -> 'org' ->> 'id')::uuid
    AND reporter_user_id = auth.jwt() ->> 'sub'
  );

-- (No org-admin SELECT policy: superadmin-only triage in v1.)

CREATE POLICY feedback_insert_own_org ON feedback_reports
  FOR INSERT
  WITH CHECK (
    org_id = (auth.jwt() -> 'org' ->> 'id')::uuid
    AND reporter_user_id = auth.jwt() ->> 'sub'
  );
-- No UPDATE / DELETE policies: service-role only.
```

Bucket (one-off via SQL Editor or dashboard):
```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('feedback-screenshots','feedback-screenshots', true);
```

RLS is **advisory** — actual enforcement is in server actions via the admin Supabase client, consistent with the rest of the codebase.

## Routes + UI

### Trigger
`src/components/feedback/report-feedback-trigger.tsx`
- Mounted once in `src/app/dashboard/layout.tsx`.
- Owns dialog open-state via React context.
- Global `Cmd/Ctrl+/` listener.

### Modal — `src/components/feedback/feedback-dialog.tsx`
Fields:
- **Type** (radio chips): Bug / Feature / Feedback / Other
- **Severity** (select, conditional on `type === 'bug'`): Low / Medium / High / Critical
- **Title** (input, 120-char limit, character counter)
- **Description** (textarea, 2000-char limit, character counter)
- **Screenshot** (optional, drag-drop, png/jpg, ≤5MB)
- Footer note: "Auto-captured: page URL, browser, your role."

Submit → `submitFeedback(formData)` server action → toast success → close.

### Dropdown entry — `src/components/layout/sidebar.tsx`
Add to existing `<UserButton.MenuItems>`:
```tsx
<UserButton.Action
  label="Send feedback"
  labelIcon={<Bug className="h-4 w-4" />}
  onClick={openFeedbackDialog}
/>
```

### My Submissions — `/dashboard/feedback`
- Table: Type icon · Title · Status badge · Created
- Click row → modal showing full description + admin response if any
- Empty state: "No reports yet. Help us improve — send your first one."

### Superadmin triage — `/superadmin/feedback`
- List with filters: status, type, severity, org
- Auth: existing `SUPERADMIN_SECRET` cookie pattern
- Detail page `/superadmin/feedback/[id]`:
  - Reporter info (name from `employees`, email, org slug, role-at-submit)
  - Full description + screenshot preview
  - `page_url`, `user_agent` for debug context
  - Edit: status, priority, admin_notes
  - Save → revalidate list

## Delivery

**Supabase row + Resend email to `amol@jambahr.com` on every submission.**
- Sender: `FOUNDER_EMAIL_FROM`
- Subject: `[Feedback] {emoji} {title}`; prefix with `[URGENT]` if `severity='critical'`
- Body: type, severity, title, first 500 chars of description, reporter (employee name / email / org slug / role-at-submit), link to `https://jambahr.com/superadmin/feedback/{id}`
- New React Email template: `src/components/emails/feedback-received.tsx`
- Failures are best-effort; wrapped in try/catch, do not block the insert.

## Rate limiting

In `submitFeedback`:
- Indexed count of rows where `reporter_user_id = X AND created_at >= now() - interval '15 minutes'`
- If count ≥ 5 → `{ success: false, error: "Too many reports — please wait a few minutes." }`
- Client-side: button disabled while in-flight

No Redis needed for v1; revisit if abuse materializes.

## Server actions — `src/actions/feedback.ts`

| Function | Caller | Notes |
|---|---|---|
| `submitFeedback(formData)` | any auth'd user | Zod validate → rate-limit check → upload screenshot → insert row → send email (best-effort) → `revalidatePath("/dashboard/feedback")` |
| `listMyFeedback()` | any auth'd user | Returns rows where `reporter_user_id = current user`, current org |
| `getMyFeedback(id)` | any auth'd user | Same guard as above |
| `uploadFeedbackScreenshot(file)` | helper inside `submitFeedback` | Upload to `feedback-screenshots`, return public URL |
| `listAllFeedback(filters)` | superadmin | Cookie auth check first; service-role query across orgs |
| `getFeedbackForSuperadmin(id)` | superadmin | Joins `employees` + `organizations` for display |
| `updateFeedbackTriage(id, { status, priority, admin_notes })` | superadmin | Sets `resolved_at` / `resolved_by` if `status = 'resolved'` |

## Commit breakdown (3 independently shippable)

**Commit 1 — `feat(feedback): migration + server actions + founder email`**
- `supabase/migrations/011_feedback_reports.sql`
- One-off SQL: create `feedback-screenshots` storage bucket (documented in commit body)
- `src/actions/feedback.ts`
- `src/components/emails/feedback-received.tsx`

**Commit 2 — `feat(feedback): dropdown trigger + My Submissions page`**
- `src/components/feedback/feedback-dialog.tsx`
- `src/components/feedback/report-feedback-trigger.tsx` (Cmd+/ + context)
- Mount trigger in `src/app/dashboard/layout.tsx`
- `<UserButton.Action>` entry in `src/components/layout/sidebar.tsx`
- `src/app/dashboard/feedback/page.tsx` + `feedback-client.tsx`

**Commit 3 — `feat(feedback): superadmin triage`**
- `src/app/superadmin/feedback/page.tsx`
- `src/app/superadmin/feedback/[id]/page.tsx`
- Nav entry in existing superadmin shell
- CLAUDE.md update (new "Feedback Module" section + Known Issues if any)

## Out of scope (v1)

- Public roadmap / changelog page
- Upvoting on feature requests
- Status-change email to reporter when resolved (could add in v1.1 — table has `resolved_at` ready)
- Org-admin per-org feedback inbox
- Anonymous submissions
- Cmd+/ collision detection with browser bindings (will validate during implementation)
- Discord / Slack / GitHub Issues delivery

## Open implementation questions (for writing-plans phase)

- Cmd+/ vs ⌘? — handle both via `metaKey || ctrlKey`.
- Screenshot virus-scan: skip for v1, public bucket + only-superadmin-views the file means low blast radius.
- Should we surface the reporter's `employee_id` in the email or look it up at view time? — look up at view time (employee email/name can change).
