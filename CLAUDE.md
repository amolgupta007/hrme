# CLAUDE.md — JambaHR Project Guide

## What is this project?

JambaHR is an all-in-one HR management SaaS platform for small and medium businesses (10–500 employees). Handles employee directory, leave management, performance reviews, training & compliance, document storage, payroll, and ATS — all through a single web portal.

**Target customer**: Business owners / decision-makers at companies with 10–500 employees.
**Two user types**: Admins (company owners/HR) and Employees (self-serve).

---

## Tech Stack

| Layer | Tool |
|-------|------|
| Framework | Next.js 14 (App Router), TypeScript strict |
| Styling | Tailwind CSS 3.4 + Radix UI + CVA + tailwind-merge |
| Auth | Clerk (with Organizations) |
| Database | Supabase (Postgres + RLS) |
| Payments | Razorpay (INR, per-employee pricing) |
| Email | Resend + React Email |
| Analytics / Errors | PostHog + Sentry |
| Hosting | Vercel (bom1 region), Cloudflare DNS |

### Critical version pins
- Next.js **14.2.x** — do NOT upgrade to 15/16
- `eslint-config-next` pinned to **14.2.15** (matches ESLint 8)
- `@react-email/render` + `@react-email/components` must be in `serverComponentsExternalPackages` in `next.config.js` — Vercel build crashes otherwise
- `@anthropic-ai/sdk` (^0.80.0) — AI JD generation in JambaHire
- `gray-matter`, `remark`, `remark-html`, `remark-gfm` — blog markdown system
- `tailwindcss-typography` — required for blog `prose` classes
- Supabase CLI does NOT support global npm install on Windows — use the SQL Editor in the Supabase Dashboard instead

---

## Project Structure

```
hr-portal/src/
├── app/
│   ├── layout.tsx / globals.css / global-error.tsx
│   ├── page.tsx                    # Marketing landing page
│   ├── (auth)/sign-in, sign-up
│   ├── onboarding/page.tsx
│   ├── blog/[slug]/page.tsx        # SSG markdown blog
│   ├── careers/[slug]/page.tsx     # Public job listings (no auth)
│   ├── offers/[token]/page.tsx     # Candidate accept/decline (no auth)
│   ├── hire/                       # JambaHire ATS (Business tier, layout + 6 pages)
│   ├── api/webhooks/clerk|razorpay|stripe
│   ├── api/cron/doc-reminders|onboarding-nudges
│   └── dashboard/                  # All protected pages
│       ├── layout.tsx (sidebar + header)
│       ├── employees, leaves, documents, reviews, training
│       ├── objectives, announcements, directory, profile
│       ├── payroll, attendance, grievances, settings
├── actions/                        # ALL mutations as Server Actions
│   employees, leaves, documents, reviews, objectives, training
│   settings, billing, dashboard, announcements, notifications
│   attendance, grievances, hire
├── components/
│   ├── ui/                         # button, card, badge
│   ├── layout/                     # sidebar, header, upgrade-gate, posthog-provider
│   ├── dashboard/ leaves/ documents/ reviews/ objectives/ training/
│   ├── announcements/ attendance/ grievances/ settings/
│   ├── hire/                       # 12 files (hire-nav, jobs, candidates, pipeline, interviews, offers, etc.)
│   └── emails/                     # React Email templates (leave-request, leave-status, offer-letter,
│                                   #   founder-alert, welcome, onboarding-nudge, upgrade-push, doc-reminder, payment-failed)
├── config/navigation.ts, plans.ts
├── lib/
│   ├── utils.ts                    # cn(), formatDate(), formatCurrency(), getInitials()
│   ├── current-user.ts             # getCurrentUser() → { orgId, clerkUserId, role, employeeId, plan, jambaHireEnabled, attendanceEnabled, grievancesEnabled }
│   ├── razorpay.ts / resend.ts / blog.ts / calendar.ts
│   └── supabase/client.ts, server.ts, index.ts
├── content/blog/                   # Markdown posts (title, excerpt, date, author, category, readTime)
├── middleware.ts
└── types/database.types.ts, index.ts
supabase/migrations/001_initial_schema.sql
scripts/seed-payroll-demo.sql, seed-jambahire-demo.sql, fix-salary-structures-columns.sql
public/Jamba.png (favicon + Razorpay logo), pitchdeck.html
```

---

## Database Schema (Supabase Postgres)

All tables have `org_id` (FK → organizations) for multi-tenant RLS isolation.

| Table | Key columns |
|-------|-------------|
| `organizations` | clerk_org_id, plan, stripe_customer_id (reused for Razorpay), max_employees, settings (JSONB) |
| `employees` | first_name, last_name, email, role, department_id, status, employment_type, clerk_user_id |
| `departments` | name, head_id (FK → employees) |
| `leave_policies` | type (paid/sick/casual/unpaid/etc), days_per_year, carry_forward |
| `leave_balances` | total_days, used_days, carried_forward_days |
| `leave_requests` | start_date, end_date, days, status (pending/approved/rejected/cancelled) |
| `documents` | category, file_url, is_company_wide, requires_acknowledgment |
| `document_acknowledgments` | document_id, employee_id, acknowledged_at |
| `review_cycles` | status (draft/active/completed), start_date, end_date |
| `reviews` | self_rating, manager_rating, goals (JSONB), objectives_id, status |
| `training_courses` | category (ethics/compliance/safety/skills/onboarding/custom), is_mandatory, due_date |
| `training_enrollments` | status (assigned/in_progress/completed/overdue), progress_percent |
| `holidays` | date, is_optional |
| `objectives` | employee_id, manager_id, period_type, period_label, status (draft/submitted/approved/rejected), items (JSONB) |
| `announcements` | title, body, category (general/policy/event/urgent), is_pinned, created_by |
| `salary_structures` | employee_id, ctc, basic_monthly, hra_monthly, special_allowance_monthly, gross_monthly, net_monthly, state, is_metro, include_hra, effective_from, **tax_regime** ('new'\|'old'), **additional_deductions_annual** (old-regime catch-all for 80C/80D/24), **computed_at** |
| `payroll_runs` | month (YYYY-MM), status (draft/processed/paid), working_days, processed_at, paid_at, **paid_by** (FK → employees) |
| `payroll_entries` | gross_salary, employee_pf, professional_tax, tds, lop_days, lop_deduction, bonus, net_pay, **annual_taxable_income** (P-002 FY snapshot), **months_in_fy** (P-002), **edited_by / edited_at / previous_net_pay** (audit trail) |
| `jobs` | title, employment_type, location_type, salary_min/max, status (draft/active/paused/closed), custom_questions (JSONB), **hiring_manager_id** (FK → employees, drives M5 manager-scoped permissions) |
| `candidates` | name, email, phone, resume_url, linkedin_url, source, tags (JSONB) |
| `applications` | job_id, candidate_id, stage (applied/screening/**shortlisted**/interview_1/interview_2/final_round/offer/hired/rejected), rejection_reason, **loi_status** (pending/accepted/declined/expired), loi_token (UNIQUE partial index), loi_sent_at, loi_responded_at, loi_expires_at |
| `interview_schedules` | application_id, interviewer_id, scheduled_at, interview_type (video/phone/in_person), status |
| `interview_feedback` | schedule_id, interviewer_id, technical/communication/culture_fit/overall rating, recommendation; unique(schedule_id, interviewer_id) |
| `offers` | application_id, ctc, joining_date, status (draft/sent/accepted/declined/expired/**revoked**), offer_token (unique UUID) |
| `candidate_stage_transitions` | application_id, from_stage, to_stage, direction (forward/backward/reject/undo/initial), actor_id, actor_type (admin/manager/system/candidate), comment, side_effects_status (JSONB per-action), undone_at, created_at — full audit log for every pipeline move |
| `grievances` | employee_id (null if anonymous), type, severity (low/medium/high/urgent), is_anonymous, tracking_token (unique), status (open/in_review/resolved/closed) |
| `attendance_records` | employee_id, date, clock_in_at, clock_out_at, total_minutes, source (`web`/`device`/`auto_close`), auto_closed (bool), ip_address, device_id |

### Tables added post-initial-migration (via SQL Editor — NOT in 001_initial_schema.sql)
`objectives`, `announcements`, `document_acknowledgments`, `jobs`, `candidates`, `applications`, `interview_schedules`, `interview_feedback`, `offers`, `grievances`, `attendance_records`, `feedback_reports`, **`candidate_stage_transitions`** (migration `013`, M2). The payroll tables (`salary_structures`, `payroll_runs`, `payroll_entries`) were originally created via SQL Editor but are now captured in migration `018` (schema + RLS) and extended by `019` (audit columns), `020` (tax regime), `021` (FY snapshot).
Also: `reviews.objectives_id` added via ALTER TABLE; `attendance_records.auto_closed` (BOOLEAN, default false) and `'auto_close'` value in `attendance_records_source_check` were added 2026-05-08 to support the auto-clockout cron.

**Pipeline overhaul migrations (M1–M5, shipped 2026-05-17)** — run in order:
- `012_application_stage_add_shortlisted.sql` — adds `shortlisted` to applications.stage CHECK
- `013_candidate_stage_transitions.sql` — full audit table + RLS
- `scripts/backfill-stage-transitions.sql` — one-shot, seeds `initial` row per existing application
- `014_application_loi_columns.sql` — `loi_*` columns on applications
- `015_jobs_hiring_manager.sql` — `hiring_manager_id` FK on jobs
- `017_offers_revoked_status.sql` — adds `'revoked'` to offers.status CHECK
(`016` was reserved for screener_id columns but deferred — see plan doc.)

**Payroll audit migrations (waves 1–6, shipped 2026-05-17)** — run in order:
- `018_payroll_schema_capture.sql` — first checked-in DDL for the 3 payroll tables (idempotent), RLS enabled, 4 missing indexes added, admin-CRUD + employee-self-read policies
- `019_payroll_audit_columns.sql` — `payroll_runs.paid_by`, `payroll_entries.{edited_by, edited_at, previous_net_pay}`, `salary_structures.computed_at`
- `020_tax_regime.sql` — `salary_structures.tax_regime` ('new'\|'old' CHECK, default 'new') + `additional_deductions_annual` (numeric, default 0)
- `021_payroll_entry_fy_snapshot.sql` — `payroll_entries.annual_taxable_income` + `months_in_fy` (both nullable; for mid-FY joiner TDS projection)

See `PAYROLL_AUDIT.md` for the per-finding closure log and `docs/payroll-overhaul.md` for the operator-facing summary.

### Multi-tenancy
- RLS enabled on ALL tables; admin Supabase client (`SUPABASE_SERVICE_ROLE_KEY`) bypasses RLS — used in all server actions
- `stripe_customer_id` / `stripe_subscription_id` columns reused for Razorpay (no schema change)

---

## Authentication & Authorization

### Clerk
- Production instance on `jambahr.com`; Organizations enabled; org slugs enabled
- Roles: `owner` | `admin` | `manager` | `employee` (see `src/types/index.ts`)
- `ROLE_HIERARCHY` + `hasPermission()` in types

### Route protection (`middleware.ts`)
Public: `/`, `/sign-in(.*)`, `/sign-up(.*)`, `/api/webhooks(.*)`, `/api/cron(.*)`, `/blog(.*)`, `/careers(.*)`, `/offers(.*)`, `/apply/r(.*)`, `/pricing`, `/api/attendance/punch`, `/sitemap.xml`, `/robots.txt`, `/privacy`, `/terms`

> `/api/cron(.*)` is exempted from Clerk so Vercel-Cron requests reach the route handlers — each handler still enforces `Bearer ${CRON_SECRET}`. Before this exemption (added 2026-05-09), Clerk silently rewrote cron requests to `/_not-found` and ALL crons failed silently. `/apply/r(.*)` is exempted to support the public referral apply flow.

### RBAC — `src/lib/current-user.ts`
- `getCurrentUser()` → `{ orgId, clerkUserId, role, employeeId, plan, jambaHireEnabled, attendanceEnabled, grievancesEnabled }`
- `isAdmin(role)` → owner | admin
- `isManagerOrAbove(role)` → owner | admin | manager
- Fallback: if no employee record, defaults to `admin` role (protects org creators pre-onboarding)

### Server action guards (security layer)
| Action | Required Role |
|--------|--------------|
| addEmployee, updateEmployee, terminateEmployee | admin |
| uploadDocument, deleteDocument | admin |
| approveLeave, rejectLeave | manager+ |
| createReviewCycle, deleteReviewCycle | admin |
| createCourse, updateCourse, deleteCourse, enrollEmployees | admin |
| updateOrgProfile, addLeavePolicy, updateLeavePolicy, deleteLeavePolicy | admin |
| createAnnouncement, updateAnnouncement, deleteAnnouncement, pinAnnouncement | admin |
| updateGrievanceStatus, getGrievanceStats, listGrievances (all) | admin |

---

## Plan-Based Feature Gating

**`src/config/plans.ts`**: `OrgPlan = "starter" | "growth" | "business"`, `hasFeature(plan, feature)`

| Feature | Starter | Growth | Business |
|---------|---------|--------|----------|
| Directory, Leave, Announcements | ✅ | ✅ | ✅ |
| Documents, Reviews, Objectives, Training, Hiring JD | ❌ | ✅ | ✅ |
| Payroll, Analytics, API, Full AI Suite, Full Hiring (ATS) | ❌ | ❌ | ✅ |

### How gating works
1. `getCurrentUser()` returns `plan`
2. Each locked page: `if (!hasFeature(plan, "feature")) return <UpgradeGate />`
3. Sidebar shows `Lock` icon on plan-restricted items
4. `UpgradeGate` links to `/dashboard/settings#billing`

---

## Email Notifications — Resend

**Sender constants** (always import from `src/lib/resend.ts`, never hardcode):
- `FROM_EMAIL` → `support@jambahr.com` (transactional: leaves, doc reminders, payment alerts)
- `FOUNDER_EMAIL_FROM` → `amol@jambahr.com` (founder alerts, welcome, nudges)
- `NOREPLY_EMAIL_FROM` → `noreply@jambahr.com` (offer letters, status notifications)

**Leave flow**: `requestLeave()` → email to all managers/admins. `approveLeave/rejectLeave()` → email to employee.

**Onboarding automation** (triggered by Clerk `organization.created` webhook):
- Seeds: Casual (8d), Sick (8d), Earned/PL (18d), Unpaid (0d) leave policies + 13 Indian holidays
- Sends: founder alert email + welcome email to new client

**Nudge cron** (daily 9:30am IST = `30 3 * * *` UTC): Day 1/3/5 nudge emails, Day 7 upgrade push

**Other**: Weekly doc acknowledgment reminders (Monday 9am IST), payment failure alerts

---

## Billing — Razorpay

Flow: User clicks Upgrade → `createSubscription(planKey)` → Razorpay checkout modal → webhook → update `organizations.plan`

**Webhook** (`/api/webhooks/razorpay`): HMAC-verified. `subscription.activated` → upgrade plan. `subscription.cancelled/completed` → downgrade to starter.

| Plan | Price | Max Employees |
|------|-------|---------------|
| Starter | Free | 10 |
| Growth | ₹500/employee/month | 200 |
| Business | ₹800/employee/month | 500 |

Configured in `src/lib/razorpay.ts` (billing) and `src/config/plans.ts` (feature flags).

---

## JambaHire — ATS Module (`/hire/*`)

Business-tier, toggled per-org via `organizations.settings.jambahire_enabled`. Redirects to settings if disabled.

**Features**: Job postings with custom questions, candidate directory, 7-stage Kanban pipeline (Applied → Screening → Interview 1 → Interview 2 → Final Round → Offer → Hired), bulk stage moves, funnel analytics, interview scheduling (video/phone/in-person), structured feedback (4 rating scales + recommendation), Google/Outlook/ICS calendar links, offer letters with accept/decline token flow, AI job description generator via `@anthropic-ai/sdk`.

**Public pages** (no auth): `/careers/[org-slug]`, `/offers/[token]`. (Note: an `/hire/jobs/[id]/apply` route was referenced in earlier docs but never built; the first tokenised public apply is planned for the referrals module.)

**Access gate** (`src/lib/jambahire-access.ts`):
- `requireJambaHireAccess()` → admin/owner only, gated on `organizations.settings.jambahire_enabled`. Used by the `/hire/*` layout, every admin page, and `getHireAdminContext()` inside `src/actions/hire.ts` for read actions.
- `requireInterviewerAccess(scheduleId?)` → admins always; non-admins only if they have at least one assigned interview (or `scheduleId` matches their `employee_id`).
- All `/hire/*` reads (`listJobs`, `getJob`, `listCandidates`, `listApplications`, `listAllApplications`, `listInterviews`, `listOffers`) call `getHireAdminContext` → return `Unauthorized` for managers/employees. Mutations keep their existing `isAdmin`/`isManagerOrAbove` guards.
- RLS migration `009_jambahire_rls.sql` adds defense-in-depth policies on `jobs / candidates / applications / interview_schedules / interview_feedback / offers`. Activates if/when Clerk-JWT-to-Supabase wiring lands; currently advisory (service-role bypasses RLS by design).

**Interviewer view** (`/dashboard/my-interviews`): any role with `interview_schedules.interviewer_id = me` sees a slim list of their interviews + a feedback modal. Powered by `listMyInterviews()` which projects to a tight `MyInterview` shape (no salary, no other candidates, no other interviewers' feedback). Sidebar entry hides via `featureFlag: "jambahire"`.

**Referrals module** (env-flagged on `JAMBAHIRE_REFERRALS_ENABLED=true`):
- Migration `010_candidate_referrals.sql` adds `candidate_referrals` (status enum: `pending_apply | applied | in_review | interview | offer | hired | rejected | withdrawn`) + RLS policies (referrer SELECT/INSERT-own, admin full).
- Employee surface at `/dashboard/refer/*`: landing → `jobs` (open roles) → `jobs/[id]` (referral form) → `my-referrals` (own history with COARSE status only).
- Admin inbox at `/hire/referrals` (locked behind `requireJambaHireAccess`).
- Public token-scoped apply at `/apply/r/[token]` — pre-fills name/email from the referral row, creates `applications` row + links back to referral on submit.
- Coarse status mapping (`src/lib/referrals/status.ts`) is the single source of truth — referrers NEVER see fine-grained `pipeline.stage`, salary, other candidates, or other interviewers' feedback. Map: `pending_apply → submitted`, `applied/in_review → being_reviewed`, `interview/offer → progressing`, `hired → closed_hired`, `rejected/withdrawn → closed_no_match`.
- Self-referral check: candidate email matched against referrer's employee email. Duplicate-active check via partial unique index on `(org_id, job_id, lower(candidate_email)) WHERE status NOT IN ('rejected','withdrawn')`.
- Email on submit: `ReferralInviteEmail` to candidate (from `NOREPLY_EMAIL`, replyTo `FROM_EMAIL`). `ReferralReceivedEmail` to every active org admin/owner (from `FROM_EMAIL`, looked up via `employees.role IN ('owner','admin') AND status != 'terminated'`).
- Application-stage sync (`src/lib/referrals/sync.ts`): `updateApplicationStage`, `bulkUpdateApplicationStage`, and `rejectApplication` all call into the sync helper after the application row updates. The helper updates the linked referral via `applicationStageToReferralStatus`, but skips rows already in `rejected`/`withdrawn`/`hired` so admin overrides win. Failures are swallowed — referral sync never blocks core hire ops.
- Referrer-side withdraw: `MyReferralRowActions` client component renders a "Withdraw" link on `/dashboard/refer/my-referrals` rows whose `coarse_status` is `submitted` or `being_reviewed`. Past those, only admins can withdraw (and `hired` is non-withdrawable for everyone).
- Tokens: 32-byte URL-safe random via `crypto.randomBytes(32).toString('base64url')`. Stored in `candidate_referrals.tracking_token` (UNIQUE).
- Sidebar entry "Refer" gated on `referrals` feature flag, which is `jambaHireEnabled && JAMBAHIRE_REFERRALS_ENABLED === 'true'` (env+org compound).

All actions in `src/actions/hire.ts`.

### Pipeline overhaul (M1–M5, shipped 2026-05-17)

**Plan + milestone log:** `docs/superpowers/plans/2026-05-16-jambahire-pipeline-drag-drop-and-transitions.md`.
**Operator doc:** `docs/jambahire-pipeline-overhaul.md`.

**Stage flow** (now 8 stages + rejected): `applied → screening → shortlisted → interview_1 → interview_2 → final_round → offer → hired`. `shortlisted` is the new gate; LOI fires on `screening → shortlisted`.

**New libs (single source of truth, server + client both import):**
- `src/lib/hire/stage-direction.ts` — `computeDirection(from, to)` returns `forward | backward | reject | undo | initial`
- `src/lib/hire/transitions.ts` — `planActionsForTransition(direction, from, to)` returns the action checklist for the Confirm-Send popup
- `src/lib/hire/permissions.ts` — `canMoveStage(from, to, ctx)` enforces admin-anywhere / manager-own-job-interview-only
- `src/lib/hire/gates.ts` — `checkOfferToHiredGates(offer)` enforces offer.status === 'accepted' AND today >= joining_date (IST, day-precision)

**New dialogs:**
- `src/components/hire/confirm-transition-dialog.tsx` — unified popup (forward/backward/reject), reason + per-action checkboxes, Send / Skip All / Cancel
- `src/components/hire/application-detail-dialog.tsx` — lazy-loads the timeline on candidate-name click
- `src/components/hire/application-timeline.tsx` — vertical chrono timeline component
- `src/components/hire/convert-to-employee-dialog.tsx` — opens on drag offer→hired (both gates pass), prefilled from offer
- `src/components/hire/offer-status-chip.tsx` — draft/sent/accepted/declined/expired/revoked chip with relative time

**Drag-drop:** `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`. Pointer (5px distance), Touch (200ms long-press), Keyboard sensors. Dropdown fallback kept on every card.

**New email templates** (all from `NOREPLY_EMAIL` with reply-to `FROM_EMAIL`; **never include `rejection_reason` text** per `memory/feedback_rejection_email_internal_reason.md`):
- `candidate-ack.tsx` (applied → screening)
- `interview-next-round.tsx` (interview transitions, takes `roundLabel` prop)
- `rejection-early.tsx`, `rejection-postinterview.tsx`, `rejection-postoffer.tsx` (stage-aware rejections)
- `loi-invite.tsx` (M4 — candidate accept/decline buttons → `/loi/[token]`)
- `manager-shortlist-notify.tsx` (M4 — fires on LOI accept, not on drag; currently goes to all org admins; M6 target = hiring_manager_id)
- `hire-onboarding-handoff.tsx` (M5 — welcome candidate as employee)
- `offer-revoked.tsx` (M5 — sorry-we-pulled-back, no internal reason)

**New public route:** `src/app/loi/[token]/page.tsx` (no Clerk; `/loi(.*)` added to middleware public matcher). Handles `?response=accept|decline` querystring for one-click email CTA.

**New cron:** `src/app/api/cron/loi-expiry/route.ts` — see Cron Jobs table below.

**Server action surface (in `src/actions/hire.ts`):**
- `updateApplicationStage(id, stage, opts?: { comment? })` returns `{ transitionId }`. Enforces canMoveStage + hard-blocks `hired → anything` + blocks backward-from-sent-offer + requires comment on backward.
- `bulkUpdateApplicationStage(ids[], stage, opts?: { comment? })` returns `{ transitionIds }`. Admin-only.
- `rejectApplication(id, reason)` returns `{ transitionId }`. Reason required.
- `dispatchStageTransitionSideEffects(transitionId, enabledKeys[])` — runs the user-confirmed subset, writes `side_effects_status` JSONB.
- `getApplicationTransitions(applicationId)` — hydrated with actor names in one round trip.
- `sendLOI(applicationId)` — generates token, sets pending, sends email.
- `respondToLOI(token, 'accept' | 'decline')` — public; on accept advances stage + notifies admins; on decline auto-rejects with reason "LOI declined".
- `convertOfferToHire(applicationId, payload)` — admin only, enforces both gates, creates employees row atomically, fires Clerk invite + welcome email.
- `revokeOffer(offerId, reason)` — admin only, sets status='revoked', sends offer-revoked email.
- `getHirePrefillData(applicationId)` — one-call hydration for the convert-to-employee wizard (offer + candidate + departments + potential managers).
- `listPotentialHiringManagers()` — powers the hiring-manager picker in the job dialog.

**Pipeline UX summary:**
- Forward drag with no actions → toast + done.
- Forward drag with email actions (e.g. applied → screening) → optimistic move, popup with checkboxes, Send / Skip All.
- Backward → prompt-first (no optimistic move) with required comment.
- Reject → prompt-first with required internal reason + email checkbox (internal reason NEVER in candidate email).
- `screening → shortlisted` → LOI flow (popup → sendLOI → card stays in Screening with amber `LOI pending` chip until candidate responds via public page).
- `offer → hired` → gate check → ConvertToEmployeeDialog wizard → employees row + Clerk invite + welcome email.
- `hired → anything` → hard-blocked.

**Permissions matrix (`canMoveStage`):**
| Role | Forward | Backward | Reject | Bulk |
|---|---|---|---|---|
| owner/admin | all | yes (reason required) | yes (reason required) | yes |
| manager | own-job only, screening↔shortlisted↔interview pipeline only | no | no | no |
| employee | none | no | no | no |

---

## Grievances Module (`/dashboard/grievances`)

Feature-flagged via `organizations.settings.grievances_enabled`. Three tabs:
- **Submit**: Any user. Issues `GRV-XXXXXX` tracking token.
- **Track**: Any user. Enter token to see status + admin notes.
- **Inbox**: Admins see all grievances. Others see own non-anonymous submissions only.

Anonymous submissions: `employee_id = null`, never recoverable. Only managers/employees (not admins) see own submissions in "My Submissions" — RBAC exception vs other modules.

The "My Submissions" tab is **always visible** for non-admins (renders empty state when no submissions). Empty state explicitly tells the user that anonymous submissions only appear via Track Status token lookup.

---

## Feedback Module (`/dashboard/feedback`)

Available to **all roles**. Users send bug reports, feature requests, or freeform feedback via a single dialog reachable from:
- the **avatar dropdown** (Clerk `<UserButton.Action>` mounted in `src/components/layout/sidebar.tsx`)
- the **`Cmd/Ctrl+/` keyboard shortcut** (listener in `src/components/feedback/report-feedback-trigger.tsx`)

The dialog auto-captures `page_url`, `user_agent`, and snapshots the reporter's role. Optional screenshot upload goes to public Supabase bucket `feedback-screenshots`.

On submit:
- Row inserted into `feedback_reports` (org-scoped)
- Best-effort founder alert email via `FOUNDER_EMAIL_FROM` (`amol@jambahr.com`), template `feedback-received.tsx`
- Rate-limited to 5 submissions per 15 minutes per user

Triage happens at **`/superadmin/feedback`** — founder-only, gated by `SUPERADMIN_SESSION_TOKEN`/`SUPERADMIN_SECRET` cookie via `isSuperadminAuthenticated()`. Org admins do NOT have a per-org feedback inbox in v1.

Lifecycle: `new → triaged → in_progress → resolved | wontfix`. Reporter sees `admin_notes` on their `/dashboard/feedback` row.

Anonymous submissions are explicitly **not** supported (use the grievances module for that flow).

---

## Attendance Module (`/dashboard/attendance`)

Feature-flagged via `organizations.settings.attendance_enabled`. Optional payroll integration via `attendance_payroll_enabled`.

- **Clock in / clock out** by an employee themselves (web). Each click writes a row in `attendance_records` (one row per `(employee_id, date)`).
- **Team Today** tab for managers (`isManagerOrAbove`) showing org-wide presence.
- **Working Hours setting** (admin-only card at top of page): `organizations.settings.attendance.standard_workday_hours` (1–16 hours, default 8). Edited inline via `updateAttendanceSettings`.
- **Auto Clock-Out cron** (`/api/cron/attendance-auto-clockout`) at `30 18 * * *` UTC = 00:00 IST. Closes any prior-IST-day shift where `clock_in_at IS NOT NULL AND clock_out_at IS NULL`:
  - `clock_out_at = min(clock_in_at + standard_workday_hours, end_of_date_IST)`
  - `auto_closed = true`, `source = 'auto_close'`
  - Skips orgs with `attendance_enabled = false`
  - Idempotent (re-checks `clock_out_at IS NULL` at update time)

---

## Payroll Module (`/dashboard/payroll`) — Business+

- `src/lib/ctc.ts` — CTC breakdown: PF caps, PT per state (10 states), TDS slabs FY 2025-26, Rebate u/s 87A
- Salary structure config per employee → auto-computes components
- Monthly run: draft → process → mark paid. LOP from approved unpaid leaves.
- Printable payslip (browser Print → PDF). Employee self-service "My Payslips" tab.
- **My Compensation tab** (employee-facing, always visible): reads the caller's salary_structure via `getMyCompensation` and renders CTC headline + full breakdown via `CTCBreakdownCard`. Empty state shown when admin hasn't configured the structure.
- `getSalaryStructures` is **admin-guarded** — non-admins receive `Unauthorized`. Use `getMyCompensation()` for employee-facing reads. `getPayrollRuns` + `getPayrollEntries` are also admin-only (P-006/P-007 wired 2026-05-17).

### Payroll audit overhaul (2026-05-17)
- **Regime toggle (P-003):** every salary structure picks `'new'` (default) or `'old'`. `additional_deductions_annual` is a single catch-all for old-regime 80C/80D/24/HRA-actual — admins compute externally and enter the annual total. Ignored in new regime.
- **Mid-FY joiner projection (P-002):** `processPayrollRun` calls `computeMonthsInFY(payMonth, date_of_joining)` per employee. Annual taxable = `(gross − PF) × monthsInFY − stdDed − extraDed`. Monthly TDS = `taxByRegime(annualTaxable) / monthsInFY`. Each entry snapshots `annual_taxable_income` + `months_in_fy` so admin bonus edits in `updatePayrollEntry` reuse the same divisor and base.
- **Bonus marginal tax (P-005):** `computeAdditionalTaxOnBonus(annualTaxable, bonus, regime)` returns `tax(annualTaxable + bonus) - tax(annualTaxable)`. Charged in full in the month the bonus is paid; idempotent on re-edit (bonus=0 collapses to 0).
- **PF cap (P-010):** `CTCBreakdown.pfCapped` is true when basic > ~₹15k/mo and the ₹1,800 statutory cap kicks in. UI footnote on the CTC card.
- **Audit trail (P-015/P-017/P-019):** `markPayrollPaid` records `paid_by`. `updatePayrollEntry` records `edited_by`, `edited_at`, `previous_net_pay`. `upsertSalaryStructure` writes `computed_at`.

---

## Social Agent (`/superadmin/social`) — Single-Tenant LinkedIn

Founder-only LinkedIn content automation for JambaHR's own company page. Lives under `/superadmin` (cookie-auth via `SUPERADMIN_SECRET`), not `/dashboard`. Disabled by default — set `SOCIAL_AGENT_ENABLED=true` in env to activate.

**Pipeline**: cron → Claude generates caption + image prompt → Cloudflare Flux Schnell renders image → upload to `social-media-images` Supabase Storage bucket → row inserted in `social_posts` with `status='pending_approval'` → email digest to `amol@jambahr.com` → founder reviews/edits in `/superadmin/social/<id>` → on approve, post pushed to Buffer queue → publish-check cron transitions `scheduled` → `published` (or `failed`).

**Tables** (migration `008_social_agent.sql`): `social_themes` (6 seeded topics, oldest-`last_used_at` rotation), `social_posts` (lifecycle: `pending_approval`/`approved`/`scheduled`/`publishing`/`published`/`failed`/`rejected`), `social_agent_runs` (forensics + theme rotation guard).

**Storage bucket**: `social-media-images` (public-read, JPEG, one image per post id).

**Buffer integration**: `src/lib/social/buffer.ts` calls Buffer GraphQL at `https://api.buffer.com/graphql` with `BUFFER_ACCESS_TOKEN`. Mutations: `createPost`, `deletePost`. Queries: `post`, `posts`. The Buffer MCP at `https://mcp.buffer.com/mcp` is a dev-time tool only — Vercel runtime uses the GraphQL endpoint directly.

**Buffer free-tier guard**: `approveAndSchedule` checks `getQueuedPostsCount` and rejects if ≥9 (cap is 10) to prevent silent failures.

**Caption rules** (Claude system prompt, `src/lib/social/anthropic.ts`): hook ≤80 chars, 600-1200 char body, 3-6 lowercase camelCase hashtags, JSON-mode output `{caption, hashtags, imagePrompt, imageAltText}`, one retry on parse failure.

**Approval modes**: `addToQueue` (Buffer fills next available slot) or `customScheduled` (datetime picker, IST default). Channel posting schedule: 14 slots/week, Asia/Kolkata. Default cadence: 3 generations/week (Mon/Wed/Fri).

**Env vars required**: `SOCIAL_AGENT_ENABLED`, `ANTHROPIC_API_KEY`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_TOKEN`, `BUFFER_ACCESS_TOKEN`, `BUFFER_ORG_ID`, `BUFFER_LINKEDIN_CHANNEL_ID`. Optional: `BUFFER_GRAPHQL_URL` override.

---

## Key Architecture Patterns

### Server Action pattern
```typescript
"use server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";

export async function doSomething(data): Promise<ActionResult<T>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };
  // Zod validate → CRUD via admin Supabase client → revalidatePath()
}
```

### ActionResult pattern
```typescript
type ActionResult<T = void> = { success: true; data: T } | { success: false; error: string };
```

### Plan gating pattern (page level)
```typescript
const user = await getCurrentUser();
if (!hasFeature(user?.plan ?? "starter", "feature-name")) {
  return <UpgradeGate feature="Feature Name" requiredPlan="growth" currentPlan={plan} />;
}
```

### Component pattern
- Server page → fetch data + role + plan → pass to client wrapper
- Client wrapper receives `role: UserRole` prop, conditionally renders admin UI
- Use `hasPermission(role, "admin")` from `@/types` for UI guards
- `sonner` for toasts, `lucide-react` for all icons

### Design tokens
Primary: teal `172 50% 36%`. Accent: warm orange `32 95% 52%`. Use CSS variables (`bg-primary`, `text-muted-foreground`). Tailwind utilities only — no custom CSS except `globals.css`.

---

## Cron Jobs (Vercel)

| Route | Schedule (UTC) | IST | Purpose |
|-------|----------------|-----|---------|
| `/api/cron/doc-reminders` | `0 9 * * 1` | Mon 2:30pm | Email employees with unacknowledged required docs |
| `/api/cron/training-reminders` | `0 9 * * 3` | Wed 2:30pm | Overdue training nudges |
| `/api/cron/onboarding-nudges` | `30 3 * * *` | 9:00am | Day 1/3/5/7 nudge emails for new orgs |
| `/api/cron/billing-grace-period` | `0 4 * * *` | 9:30am | Subscription grace-period downgrade sweep |
| `/api/cron/webhook-events-cleanup` | `0 5 * * 0` | Sun 10:30am | Drop `webhook_events` rows older than 30 days |
| `/api/cron/attendance-auto-clockout` | `30 18 * * *` | 12:00am | Close attendance shifts where employee forgot to clock out (uses per-org `standard_workday_hours`, capped at 23:59 of the same date; sets `auto_closed=true`, `source='auto_close'`) |
| `/api/cron/social-agent-generate` | `0 4 * * 1,3,5` | Mon/Wed/Fri 9:30am | Generate one LinkedIn draft via Claude + Cloudflare Flux. Gated on `SOCIAL_AGENT_ENABLED=true`. |
| `/api/cron/social-agent-publish-check` | `0 5 * * *` | 10:30am | Reconcile Buffer post statuses → DB; mark `published`/`failed` and email on failure. (Daily — Vercel Hobby plan limits crons to once-per-day; inline reconciliation on page-load is a future improvement.) |
| `/api/cron/loi-expiry` | `15 4 * * *` | 9:45am | M4 — flips JambaHire `applications.loi_status` from `pending` to `expired` where `loi_expires_at < now()`. No email sent on expiry (admin can resend from the card). |
| `/api/cron/assistant-insights` | `0 2 * * *` | 7:30am | Phase 5 — precompute proactive insights for every assistant-enabled org (runs all 11 rules, upserts top results + `__none__` sentinel into `assistant_insights` keyed on `(org_id, rule_key, computed_for)`). Same-day fallback in `getInsights()` covers orgs the cron hasn't reached yet. |

All cron routes require `Authorization: Bearer CRON_SECRET` header. `CRON_SECRET` env var must be set in Vercel.

---

## Pending Work

### ❌ Not yet built
- **Blog SEO articles** — more posts in `src/content/blog/` (ESI, gratuity, HR software comparison)
- **Marketing** — SoftwareSuggest, Capterra, G2, Techjockey listings; LinkedIn company page; Google Ads
- **Phase 4 AI** (Business tier): semantic search (pgvector), smart review summaries, attrition risk
- **JambaHire**: onboarding workflows (post-hire)
- **Training LMS Auto-Sync** (shown as Coming Soon): Coursera, LinkedIn Learning, TalentLMS
- **Per-org workday-hours per day-of-week** (e.g., Sat = 5h) — current attendance setting is a single value
- **Auto-closed attendance badge** on history rows in the UI (data is there via `auto_closed`, not yet rendered)
- **Email notification to employee on auto-closed shift** (intentionally deferred)

### ❌ Infrastructure
- Background jobs (Trigger.dev or Inngest) for compliance alerts

---

## Development Commands

```bash
npm run dev           # http://localhost:3000
npm run build
npm run lint
npm run db:generate   # Regenerate Supabase types (needs CLI)
npm run db:push       # Push migrations (needs CLI)
```

---

## Known Issues / Gotchas

1. **pgvector**: Removed from migration — not available on free Supabase tier.
2. **Next.js version**: Pinned to 14.2.x. Do not upgrade without migration plan.
3. **TypeScript build errors**: `typescript: { ignoreBuildErrors: true }` in `next.config.js`. Supabase v2 type inference returns `never` for partial selects.
4. **Supabase CLI on Windows**: Use Supabase Dashboard SQL Editor for all migrations.
5. **RLS bypass**: Server actions use admin Supabase client (service role key). Intentional — Clerk JWT → Supabase RLS not configured.
6. **New tables not in migration**: All post-initial tables (objectives, announcements, document_acknowledgments, payroll tables, JambaHire tables, grievances) must be created via SQL Editor.
7. **Supabase trigger function**: `update_updated_at_column()` must be created separately before triggers (SQL Editor splits on semicolons).
8. **Razorpay `stripe_*` columns**: `organizations.stripe_customer_id` / `stripe_subscription_id` reused for Razorpay — no schema change.
9. **Razorpay checkout script**: Loaded dynamically via `loadRazorpayScript()` in `billing-section.tsx` to avoid SSR issues.
10. **react-email packages**: Must be in `serverComponentsExternalPackages` in `next.config.js`. Removing crashes Vercel build.
11. **Sentry DSN**: Must be `NEXT_PUBLIC_SENTRY_DSN` (not plain `SENTRY_DSN`) for client-side capture.
12. **Supabase JSONB via SQL Editor**: Use `jsonb_build_array(jsonb_build_object(...))` — don't paste JSON string literals (causes `0x0d` carriage return parse errors).
13. **Training course categories**: Only `ethics`, `compliance`, `safety`, `skills`, `onboarding`, `custom` — check constraint rejects others.
14. **Training enrollment status**: Only `assigned`, `in_progress`, `completed`, `overdue` — `not_started` is invalid.
15. **CTC rounding**: `computeCTCBreakdown` rounds to nearest rupee. ₹1-2 differences between annual/monthly are expected.
16. **Payroll LOP**: Only `unpaid` leave type triggers LOP. Paid/sick/casual leaves don't — admin can manually add LOP days per entry.
17. **`salary_structures` missing columns**: Run `scripts/fix-salary-structures-columns.sql` if table was created before `include_hra`, `employer_pf_monthly`, `employer_gratuity_annual`, `updated_at` were added.
18. **`salary_structures` unique constraint**: One per employee per org — upsert updates existing row.
19. **JambaHire enable flag**: Toggled via `organizations.settings.jambahire_enabled`. Missing/false → redirect to settings. To seed: `UPDATE organizations SET settings = settings || '{"jambahire_enabled": true}'::jsonb WHERE clerk_org_id = '...'`.
20. **Offer token**: UUID generated server-side. `/offers/[token]` is unauthenticated — don't expose candidate PII beyond accept/decline needs.
21. **Blog posts require redeploy**: Read from `src/content/blog/` at build time via `fs`. New slugs 404 until redeployed.
22. **AI JD generation**: Requires `ANTHROPIC_API_KEY` in Vercel env vars. Fails silently if missing.
23. **Calendar ICS download**: `downloadICS()` uses `URL.createObjectURL` — client-side only, don't call from server components.
24. **Interview feedback upsert**: Unique on `(schedule_id, interviewer_id)` — submitting twice updates existing row.
25. **Onboarding nudge cron**: Uses ±12hr window around days 1/3/5/7 to handle cron drift.
26. **Default leave policies on signup**: Seeded in Clerk webhook. If webhook fires before org row exists in Supabase, manually run the SQL.
27. **LinkedIn share URL**: Points to org's careers page, not individual job — LinkedIn share dialog doesn't support deep-linking to specific jobs.
28. **`resend.ts` sender constants**: Import `FROM_EMAIL`, `FOUNDER_EMAIL_FROM`, or `NOREPLY_EMAIL_FROM`. Never hardcode addresses in action files.
29. **Grievances enable flag**: `organizations.settings.grievances_enabled`. To enable: `UPDATE organizations SET settings = settings || '{"grievances_enabled": true}'::jsonb WHERE clerk_org_id = '...'`.
30. **Grievances anonymous**: `is_anonymous = true` → `employee_id = null`. Cannot be de-anonymized. "My Submissions" filters by `employee_id` so anonymous entries never appear there.
31. **Grievances RBAC**: `manager` falls through to employee path — only sees own submissions. Different from other modules where managers have elevated access.
32. **Blog table rendering**: Tables wrapped in `.table-wrapper` via custom remark plugin. `border-radius` doesn't work with `border-collapse: collapse` — wrapper div carries the rounded border.
33. **Employee page visibility**: Sidebar requires `manager`+ role. Route itself is not middleware-blocked.
34. **RBAC fallback**: If lookup by `clerk_user_id` misses, `getCurrentUser()` retries by **email** within the same org (filters out terminated rows), back-fills `clerk_user_id` synchronously, and returns that role. Only if no employee row matches at all does it default to `admin` (org creator). This fixes the historical race where the dashboard rendered the admin sidebar to a freshly-invited employee until Clerk's `organizationMembership.created` webhook caught up. See `src/lib/current-user.ts`.
35. **Profile field-level errors**: `updateMyProfile` / `updateEmergencyContact` return `ProfileSaveResult` with optional `fieldErrors: Record<path, message>`. Emergency-contact keys are namespaced (`emergency.name`, etc.). The client renders red border + AlertCircle on each input that's in the map. Pattern reusable for other forms.
36. **Reviews `goals` JSONB shape**: Two formats coexist — legacy array `[{title,status}]` (from old self-review submits) and new object `{items, self_competency_ratings, manager_competency_ratings}`. Always pass through `normalizeGoalsData()` before reading or writing. `submitSelfReview` and `submitManagerReview` both write the unified object format and preserve the other side's competency ratings + ad-hoc goals (do NOT overwrite the entire `goals` column).
37. **Reviews list view-mode comments**: The dialog's `comments` state must initialize to `self_comments` in view mode (was previously `manager_comments`, which made it look like the self review was overwritten). The view dialog renders Self Comments and Manager Comments as two separate read-only blocks.
38. **Reviews stale data on cycle switch**: `reviews-client` refetches `listCycleReviews(activeCycleId)` via `useEffect` whenever the active cycle changes (and after successful dialog submit via `onSuccess`). Don't rely on the server-rendered `cycleReviews` prop for the cycle the user navigates to.
39. **Onboarding card visibility**: Hide the dashboard onboarding card only when `totalComplete === totalEnabled`. Do **not** hide on `allRequiredComplete` alone — orgs may configure 0 required steps (then `[].every()` is true), or have remaining optional steps.
40. **Attendance `auto_close` source value**: `attendance_records_source_check` originally only allowed `'web'` and `'device'`. The auto-clockout cron writes `'auto_close'` — drop and recreate the constraint to include it before the cron runs (see commit `6168d2c`).
41. **Attendance `auto_closed` column**: Add via `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS auto_closed BOOLEAN NOT NULL DEFAULT FALSE` before deploying the auto-clockout cron. Used by the cron to mark system-closed shifts; UI badge not yet implemented.
42. **Attendance auto-clockout timestamp policy**: `clock_out_at = min(clock_in_at + standard_workday_hours, end_of_clock_in_date_IST)`. Hours come from `organizations.settings.attendance.standard_workday_hours` (default 8). Total minutes recomputed accordingly. Does NOT use 23:59 wall-clock unless that is sooner than clock_in + N hours.
43. **Attendance settings JSONB path**: Working hours live at `organizations.settings.attendance.standard_workday_hours`. Read via `getAttendanceSettings()` (any authed user — used by cron and UI). Write via `updateAttendanceSettings({ standardWorkdayHours })` — admin-only, validates 1–16, rounds to one decimal.
44. **Employee dashboard cards**: For `role === "employee"`, `getDashboardData` populates `myActiveObjectives`, `myLatestReview`, `upcomingHolidays`. The page renders three personalised cards and hides the org-wide "Active Review Cycles" list. Stat cards remain role-aware (no Total Employees for employees).
45. **`feedback-screenshots` bucket**: Must be created via `INSERT INTO storage.buckets (id, name, public) VALUES ('feedback-screenshots', 'feedback-screenshots', true)` before deploying — not in migration 011 because storage DDL is environment-specific.
46. **Feedback dialog mounting**: `<ReportFeedbackTriggerRoot>` is mounted at the dashboard layout. It does NOT exist on public pages (`/`, `/sign-in`, `/blog`, `/careers`, `/offers`, `/apply/r`). Feedback can only be submitted from inside `/dashboard/*`.
47. **Feedback Cmd+/ inside form fields**: To avoid hijacking text-input shortcuts, the listener requires `Shift+Cmd/Ctrl+/` when focus is inside an `<input>` or `<textarea>`. Outside text fields, plain `Cmd/Ctrl+/` works.
48. **JambaHire rejection emails NEVER include the internal reason**: `applications.rejection_reason` + `candidate_stage_transitions.comment` are audit-only. The candidate-facing templates (`rejection-early.tsx`, `rejection-postinterview.tsx`, `rejection-postoffer.tsx`, `offer-revoked.tsx`) accept only `{ candidateName, orgName, roleTitle }` — do NOT thread `rejection_reason` through. See `memory/feedback_rejection_email_internal_reason.md`.
49. **LOI flow stages the card visually in Screening**: When admin drags `screening → shortlisted`, `sendLOI` writes the token + sets `loi_status='pending'` but the application's `stage` stays as `screening` until the candidate accepts via `/loi/[token]`. The pipeline UI renders the amber `LOI pending` chip and locks the drag handle. `respondToLOI` (public, candidate-actor audit) does the actual stage advance. Decline auto-routes to `rejected` with `rejection_reason='LOI declined'`.
50. **`offer → hired` is double-gated**: `checkOfferToHiredGates` in `src/lib/hire/gates.ts` is the single source of truth (server + client both import). Gate A = `offer.status === 'accepted'`. Gate B = `today >= offer.joining_date` (IST, day-precision). Bypass requires editing the offer's `joining_date`. The drag opens `ConvertToEmployeeDialog`; the wizard's submit calls `convertOfferToHire` which re-checks both gates server-side.
51. **`hired → anything` is hard-blocked**: To unmake a hire, terminate the employee from `/dashboard/employees`. Server returns an error; client also pre-checks. There's no "undo hire" path — the `employees` row + Clerk invite are real.
52. **Audit log writes are best-effort, never block**: `writeStageTransition` in `src/actions/hire.ts` swallows insert failures and logs a warning. The stage update itself succeeds even if the audit row fails (e.g. `candidate_stage_transitions` table missing). Per-action `side_effects_status` JSONB on each row records sent / skipped_by_user / failed for the M3 Confirm-Send popup.
53. **JambaHire pipeline overhaul (M1–M5) requires 6 migrations to run in order**: `012` → `013` → `scripts/backfill-stage-transitions.sql` → `014` → `015` → `017`. (`016` reserved-then-skipped.) Without `013`, every move silently logs an audit-write warning. Without `014`, LOI fields are missing and `sendLOI` errors. Without `015`, hiring-manager picker writes fail. Without `017`, `revokeOffer` errors on the CHECK constraint.
54. **Payroll RLS is now enabled but service role bypasses it**: migration `018` flipped `payroll_runs/payroll_entries/salary_structures` to RLS-on. All server actions use `createAdminSupabase()` (service role) which bypasses RLS by design — same pattern as JambaHire (gotcha #5). Policies are advisory; they activate the moment Clerk-JWT-to-Supabase wiring lands or the service-role key leaks.
55. **Payroll `tax_regime` defaults to `'new'`**: existing salary_structures got `'new'` via migration 020 default. Admin must explicitly switch to `'old'` per employee. `additional_deductions_annual` is the **only** old-regime deduction input — there are NO separate 80C/80D/24/HRA-actual fields (intentional MVP scope). Admin pre-computes total externally.
56. **Payroll TDS is regime-aware AND FY-aware**: `payroll_entries.tds` is NOT `salary_structures.tds_monthly` at process time. `processPayrollRun` recomputes per employee using `computeMonthsInFY(payMonth, date_of_joining)`. Mid-FY joiners get a lower TDS than the salary_structure preview suggests. The structure-level `tds_monthly` is config-time preview only.
57. **`updatePayrollEntry` reads `annual_taxable_income` + `months_in_fy` from the entry**: do NOT recompute these from gross×12. Legacy entries (processed pre-2026-05-17) have NULL in those columns — the action falls back to gross×12 inline derivation in that case. Once a run is re-processed, snapshots populate.
58. **`additional_deductions_annual` is silently ignored in new regime**: `computeCTCBreakdown` only subtracts it when `taxRegime === 'old'`. Admins can leave any value in the column without affecting new-regime tax. Field is conditionally shown in `salary-structure-dialog.tsx` only when the regime dropdown is `'old'`.
59. **Bonus tax goes into the same `tds` field, not separately**: `updatePayrollEntry` sets `tds = baseTdsMonthly + bonusTax`. There's no `bonus_tax` column — the deduction is folded into total TDS. Reprocessing the run resets `tds` back to base (admin must re-add bonus).
60. **AI Assistant feature gating**: Floating chat button on `/dashboard/*` gated on `NEXT_PUBLIC_ASSISTANT_ENABLED` (client env flag) AND `canUseAssistant()` in `src/lib/assistant/permissions.ts`. Plan-tier matrix: Starter locked, Growth 30 questions/month preview, Business unlimited (subject to monthly INR budget cap planned for Phase 4). Read before adding new entry points or tools.
61. **AI Assistant route registry must stay in sync**: Every new `/dashboard/*` page added from Phase 1 onward needs an entry in `src/lib/assistant/route-registry.ts` AND a markdown article in `src/lib/assistant/help/articles/` (directory created in Phase 1). Enforced by vitest integrity test (`tests/assistant/route-registry.integrity.test.ts`) + ESLint rule (added in Phase 1). Skipping these = stale how-to answers from the assistant.
62. **AI SDK v6 is `streamText` + `gateway()` wrapper, not a plain string**: `streamText({ model: gateway("anthropic/claude-sonnet-4-6"), ... })` — passing a bare string fails type check. AI Gateway resolves the model via `AI_GATEWAY_API_KEY`. The client uses `useChat` from `@ai-sdk/react@3` which does NOT have `input` / `handleSubmit` / `isLoading` — manage input state yourself and call `sendMessage({ text })`. Route returns `result.toUIMessageStreamResponse()` (not `toDataStreamResponse()`).
63. **AI SDK v6 `tool()` uses `inputSchema`, not `parameters`** and `convertToModelMessages` is async — `messages: await convertToModelMessages(body.messages)`. The `onFinish` callback usage fields are `inputTokens` / `outputTokens` (NOT v3/v4's `promptTokens`/`completionTokens`). Tool parts in `UIMessage.parts` arrive as `DynamicToolUIPart` when `useChat` doesn't pre-register tool types — use the SDK helpers `isToolUIPart(p)` + `getToolName(p)` instead of hand-rolled discriminators. State machine: `input-streaming → input-available → output-available | output-error | output-denied`.
64. **Help articles align with ROUTE_REGISTRY by id↔route_key**: every `.md` in `src/lib/assistant/help/articles/` has frontmatter `id` matching its filename AND `route_key` matching a key in `ROUTE_REGISTRY`. Loader throws on missing required fields. Numbered-step parser only catches `^\s*\d+\.\s+` — bullets, en-dashes, and nested lists are silently ignored. Run `npm run embed:help` after authoring or editing articles — it wipes and rebuilds `app_help_chunks` via Voyage. Re-run is monolithic (not incremental) — fine for ~25 articles; incremental indexing is a Phase 1.5 nice-to-have.
65. **`next build` cannot use `--rulesdir`** for the custom `no-orphan-dashboard-route` ESLint rule. `next.config.js` sets `eslint: { ignoreDuringBuilds: true }` to decouple lint from build. Lint enforcement happens via `npm run lint` (which uses `next lint --rulesdir eslint-rules`). CI must run `npm run lint` separately if you want lint to gate deploys.
66. **Anthropic rejects dots in tool names** — pattern `^[a-zA-Z0-9_-]{1,128}$`. ALL assistant tools use underscores: `app_help_search`, `docs_search`, etc. Never name a tool `foo.bar` — the Gateway call 500s with a cryptic `tools.0.custom.name` schema error.
67. **Document Q&A indexes company-wide docs ONLY** (v1). `ingestDocument` early-returns `unsupported` for any doc with `is_company_wide=false`. Personal docs (contracts, ID proofs, tax, payslips) are NEVER embedded. `docs_*` tools re-filter by `is_company_wide=true` AND `org_id` at query time — two layers.
68. **Doc ingestion is non-blocking via `waitUntil`** (`@vercel/functions`). `uploadDocument` fires `ingestDocument(id)` through `waitUntil` so the upload returns instantly while embedding runs in the background (survives function freeze). The daily `/api/cron/assistant-doc-reindex` cron is the safety net for failures. Scanned/image PDFs degrade to `index_status='unsupported'` (no OCR in v1) — never crash the upload.
69. **`unpdf` + `mammoth` must be in `serverComponentsExternalPackages`** (next.config.js) — pdf.js inside unpdf breaks if webpack tries to bundle it. Both are runtime `dependencies` (not devDeps), since extraction runs in the upload→ingest server path.
70. **After editing help articles OR re-indexing docs, run the right script**: `npm run embed:help` rebuilds `app_help_chunks`; `npm run backfill:docs` (re)indexes company-wide documents into `doc_chunks`. Both need `VOYAGE_API_KEY` in `.env.local`. Doc re-index is idempotent (wipes a doc's chunks before re-inserting).
71. **Assistant budget is an IST-month rollup, enforced as HTTP 402** (distinct from 429 rate-limit). `checkBudget()` gates BEFORE `streamText`; `recordUsage()` accrues `assistant_budget.cost_inr_paise` in `onFinish` (best-effort, never blocks the stream). Caps: ₹500 Growth / ₹2000 Business (`PLAN_BUDGET_PAISE` in `pricing.ts`), per-org override via `assistant_budget.hard_cap_inr_paise`. cap=0 (starter/unset) never blocks. Token→INR via `tokensToInrPaise` (USD rate card × 86 × 100). Soft alert at 80%, hard pause at 100% — each email fires exactly once (guarded by `soft_alert_sent_at`/`hard_paused_at`).
72. **Feedback is keyed by ORDINAL, not message id** — the streamed `UIMessage.id` (client) ≠ persisted `assistant_messages.id` (server). `submitFeedback({conversationId, assistantIndex, rating})` resolves the Nth assistant message in the conversation (ordered by created_at) to the real row id, then upserts `assistant_feedback` (unique on message_id+user_employee_id, so re-rating updates). `assistant-chat.tsx` computes `assistantIndex` in the message map.
73. **Conversation history loads via re-mount** — `assistant-panel.tsx` holds `conversationId` in state; selecting a past conversation sets it + `initialMessages` (text-only reconstruction) and `<AssistantChat key={conversationId}>` forces a clean re-mount. Tool chips/citations do NOT re-render for historical messages (text only) — acceptable for v1 viewing. History/get/delete are per-user, ownership-checked by `employeeId`.
74. **PII-redaction cron `/api/cron/assistant-redact`** (daily 7:00 UTC): redacts `assistant_messages.content` older than 14d (sets `pii_redacted=true`), deletes `assistant_conversations` (messages cascade) not updated in 90d. `redactPII()` is idempotent (its tokens `<EMAIL>`/`<PHONE>`/`<AMOUNT>`/`<NUMBER>` don't re-match). Batched at 500/run. Bearer `CRON_SECRET`.
75. **Insights are deterministic — no LLM, no INR budget**: Phase 5 insight rules query the Supabase admin client directly (same pattern as `getDashboardData`), NOT through the AI Gateway. They never accrue `assistant_budget` cost and never hit the 402 cap. The assistant's LLM chat and the insights engine share only the `assistant_enabled` flag + plan gate (growth/business/custom) — nothing else.
76. **Insight rules split `fetch` (impure I/O) from `evaluate` (pure)**: `fetch(supabase, ctx)` does all Supabase reads; `evaluate(data, ctx)` is a pure function returning one `Insight | null`. This is why `rules.test.ts` unit-tests every rule with in-memory fixtures and zero DB mocking — only `evaluate` is exercised. Always pass `ctx` even when a rule short-circuits before reading it (the type requires 2 args; tests must match).
77. **Insight dismissal is org-wide and day-scoped**: `dismissInsight(ruleKey)` updates `assistant_insights` rows matched on `(org_id, computed_for, rule_key)` — keyed on `rule_key`, never a row UUID. So any admin dismissing a card hides it for ALL org admins for that IST day; it reappears next day if the rule still fires. The client carries `ruleKey` only.
78. **`getInsights()` has a same-day fallback**: on the first admin dashboard load of the day, if no `assistant_insights` rows exist for today's IST `computed_for` (cron hasn't run), it computes inline via `runInsightsForOrg` + `persistInsights`. The `__none__` sentinel row (priority -1, excluded from display by `readTop`'s `.neq("rule_key","__none__")`) marks "computed, nothing to surface" so the fallback doesn't recompute on every subsequent load.

---

## AI Assistant (`/dashboard/*` floating button) — Phase 1 shipped 2026-05-18

Read-only, plan-tier-gated chat assistant. Floating button on dashboard, side-panel chat, role-aware suggested prompts. Tool-augmented: `app_help_search` / `app_help_get_steps` / `app_help_get_route` deliver step-by-step how-to answers with "Take me there →" deep-links; `docs_search` / `docs_get_chunk` / `docs_list_recent` answer from the org's company-wide documents (Phase 2). Backed by 25 markdown help articles + tenant doc chunks indexed into pgvector via Voyage `voyage-3-large` embeddings. Full plan in `docs/planning/ai-hr-assistant-plan.md`; phase plans under `docs/superpowers/plans/`.

**Phase progression:**
- **Phase 0** (shipped 2026-05-18) — foundation: stub route, UI shell, plan-tier helpers, migration 022 (4 conversation tables).
- **Phase 1** (shipped 2026-05-18) — how-to assistant: pgvector + `app_help_chunks`, Voyage embeddings, `app_help_*` tools, 25 articles, persistence + rate limit (30/hr), org-level `assistant_enabled` flag.
- **Phase 2** (shipped 2026-05-20) — tenant document Q&A: `doc_chunks` table + `match_doc_chunks` RPC, text extraction (unpdf + mammoth), ingestion on upload via `waitUntil` + backfill script + reconcile cron, `docs_search`/`docs_get_chunk`/`docs_list_recent` tools (company-wide-only, org-scoped, ack-aware), prompt-injection `<source>` directive, doc citations + acknowledgment banner, per-org `assistant_tenant_docs_enabled` toggle.
- **Phase 3** (PARKED — see `docs/planning/ai-hr-assistant-phase-3-parked.md`) — structured data tools (`data_employees_find`, `data_leaves_balance`, etc., all role-scoped via `reporting_manager_id`). Per-org `assistant_tenant_data_enabled` toggle (still stubbed "coming soon" in settings). Build only when required.
- **Phase 4** (shipped 2026-05-21) — conversation history (list/search/load/delete, per-user), per-message 👍/👎 feedback (ordinal-keyed), founder analytics at `/superadmin/assistant`, monthly INR budget caps (402 enforcement + soft/hard alerts), PII-redaction retention cron. Plus quick-win: system prompt personalised with real org + employee name.
- **Phase 5** (shipped 2026-05-25) — proactive insights only. Deterministic rule engine (no LLM, no INR budget) surfaces up to 3 prioritised HR alerts per org per day on the admin/owner dashboard. 11 rules across leave/compliance/people/ops. Daily cron precomputes; same-day fallback computes inline on first admin load. Per-card dismiss (org-wide, day-scoped) + refresh. **No write tools, ever** (OQ-9).

**Decision log (§7 of planning doc)**: 14 locked decisions. Notable:
- Read-only forever — no write tools, ever (OQ-9).
- Vercel AI Gateway with `anthropic/claude-sonnet-4-6` model strings (OQ-4).
- Voyage `voyage-3-large` embeddings (1024-dim) for RAG (OQ-3).
- Supabase Pro upgraded for pgvector (OQ-1) — done 2026-05-18.
- Floating button only — no Cmd+K, no sidebar entry (OQ-2).
- Business unlimited + Growth 30/mo preview + Starter locked (OQ-5).
- 14d raw → 76d PII-redacted → 90d hard-delete retention (OQ-8, Phase 4 cron).
- Hourly rate limit: 30 user-messages/hour, counted via `assistant_messages` join.
- Per-org `assistant_enabled` flag (`organizations.settings.assistant_enabled`) — admin opt-in. Combined with `NEXT_PUBLIC_ASSISTANT_ENABLED` client flag.
- shadcn CLI for new UI primitives (OQ-14).

**Migrations**: 022 (Phase 0 — conversations/messages/tool_calls/feedback), 023 (Phase 1 — pgvector + `app_help_chunks`), 024 (Phase 1 — `match_help_chunks` RPC), 025 (Phase 2 — `doc_chunks` + `documents.index_status/indexed_at/index_error`), 026 (Phase 2 — `match_doc_chunks` org-scoped RPC), 027 (Phase 4 — `assistant_budget` + `assistant_messages.created_at` index), 028 (Phase 5 — `assistant_insights` table + active-insights partial index + advisory RLS).

**Crons**: `/api/cron/assistant-doc-reindex` (daily 6:00 UTC — Phase 2 doc reconcile), `/api/cron/assistant-redact` (daily 7:00 UTC — Phase 4 PII redaction + 90d delete), `/api/cron/assistant-insights` (daily 2:00 UTC — Phase 5 precompute insights for all assistant-enabled orgs).

**Per-org scope toggles** (`organizations.settings`): `assistant_enabled` (master, Phase 1), `assistant_tenant_docs_enabled` (Phase 2 — gates `docs_*` tools), `assistant_tenant_data_enabled` (Phase 3 — not yet wired). All default false; admin opts in per scope from Settings → AI Assistant.

**Doc ingestion scripts**: `npm run backfill:docs` (index existing company-wide docs), reconcile cron `/api/cron/assistant-doc-reindex` (daily 6am UTC, retries null/failed/pending). Upload-time ingest is the primary path (`waitUntil`).

**Env vars required**: `AI_GATEWAY_API_KEY` (with Anthropic provider configured in Vercel AI Gateway, BYOK using existing `ANTHROPIC_API_KEY`), `VOYAGE_API_KEY` (server-only), `NEXT_PUBLIC_ASSISTANT_ENABLED=true` (client-side master switch).

**To enable for an org**: `update organizations set settings = settings || '{"assistant_enabled": true}'::jsonb where clerk_org_id = '...';`

**To rebuild the help index after editing articles**: `npm run embed:help` (wipes + rebuilds `app_help_chunks` via Voyage; ~30s for 25 articles).

**Migration 022** adds four tables: `assistant_conversations`, `assistant_messages`, `assistant_tool_calls`, `assistant_feedback`. RLS on all four (advisory — service-role bypasses per gotcha #5).

---

## Demo Org — test1

15-person org for Amol Gupta (`amolgupta007@gmail.com`). Departments: Engineering, Marketing, Sales, Operations, HR. Full seed data across all modules including payroll (Maharashtra/metro, ₹12–36 LPA by role) and JambaHire (4 jobs, 10 candidates, full pipeline, 3 interviews, 2 offers).

Seed scripts: `scripts/seed-payroll-demo.sql`, `scripts/seed-jambahire-demo.sql`
