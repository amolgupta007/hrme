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
| `salary_structures` | employee_id, ctc, basic_monthly, hra_monthly, special_allowance_monthly, gross_monthly, net_monthly, state, is_metro |
| `payroll_runs` | month (YYYY-MM), status (draft/processed/paid), working_days |
| `payroll_entries` | gross_salary, employee_pf, professional_tax, tds, lop_days, lop_deduction, bonus, net_pay |
| `jobs` | title, employment_type, location_type, salary_min/max, status (draft/active/paused/closed), custom_questions (JSONB) |
| `candidates` | name, email, phone, resume_url, linkedin_url, source, tags (JSONB) |
| `applications` | job_id, candidate_id, stage (applied/screening/interview_1/interview_2/final_round/offer/hired) |
| `interview_schedules` | application_id, interviewer_id, scheduled_at, interview_type (video/phone/in_person), status |
| `interview_feedback` | schedule_id, interviewer_id, technical/communication/culture_fit/overall rating, recommendation; unique(schedule_id, interviewer_id) |
| `offers` | application_id, ctc, joining_date, status (draft/sent/accepted/declined), offer_token (unique UUID) |
| `grievances` | employee_id (null if anonymous), type, severity (low/medium/high/urgent), is_anonymous, tracking_token (unique), status (open/in_review/resolved/closed) |
| `attendance_records` | employee_id, date, clock_in_at, clock_out_at, total_minutes, source (`web`/`device`/`auto_close`), auto_closed (bool), ip_address, device_id |

### Tables added post-initial-migration (via SQL Editor — NOT in 001_initial_schema.sql)
`objectives`, `announcements`, `document_acknowledgments`, `salary_structures`, `payroll_runs`, `payroll_entries`, `jobs`, `candidates`, `applications`, `interview_schedules`, `interview_feedback`, `offers`, `grievances`, `attendance_records`
Also: `reviews.objectives_id` added via ALTER TABLE; `attendance_records.auto_closed` (BOOLEAN, default false) and `'auto_close'` value in `attendance_records_source_check` were added 2026-05-08 to support the auto-clockout cron

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

---

## Grievances Module (`/dashboard/grievances`)

Feature-flagged via `organizations.settings.grievances_enabled`. Three tabs:
- **Submit**: Any user. Issues `GRV-XXXXXX` tracking token.
- **Track**: Any user. Enter token to see status + admin notes.
- **Inbox**: Admins see all grievances. Others see own non-anonymous submissions only.

Anonymous submissions: `employee_id = null`, never recoverable. Only managers/employees (not admins) see own submissions in "My Submissions" — RBAC exception vs other modules.

The "My Submissions" tab is **always visible** for non-admins (renders empty state when no submissions). Empty state explicitly tells the user that anonymous submissions only appear via Track Status token lookup.

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
- `getSalaryStructures` is **admin-guarded** — non-admins receive `Unauthorized`. Use `getMyCompensation()` for employee-facing reads.

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

---

## Demo Org — test1

15-person org for Amol Gupta (`amolgupta007@gmail.com`). Departments: Engineering, Marketing, Sales, Operations, HR. Full seed data across all modules including payroll (Maharashtra/metro, ₹12–36 LPA by role) and JambaHire (4 jobs, 10 candidates, full pipeline, 3 interviews, 2 offers).

Seed scripts: `scripts/seed-payroll-demo.sql`, `scripts/seed-jambahire-demo.sql`
