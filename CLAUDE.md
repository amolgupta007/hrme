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

### Tables added post-initial-migration (via SQL Editor — NOT in 001_initial_schema.sql)
`objectives`, `announcements`, `document_acknowledgments`, `salary_structures`, `payroll_runs`, `payroll_entries`, `jobs`, `candidates`, `applications`, `interview_schedules`, `interview_feedback`, `offers`, `grievances`
Also: `reviews.objectives_id` added via ALTER TABLE

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
Public: `/`, `/sign-in(.*)`, `/sign-up(.*)`, `/api/webhooks(.*)`, `/blog(.*)`, `/careers(.*)`, `/offers(.*)`

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

**Public pages** (no auth): `/careers/[org-slug]`, `/offers/[token]`, `/hire/jobs/[id]/apply`

All actions in `src/actions/hire.ts`.

---

## Grievances Module (`/dashboard/grievances`)

Feature-flagged via `organizations.settings.grievances_enabled`. Three tabs:
- **Submit**: Any user. Issues `GRV-XXXXXX` tracking token.
- **Track**: Any user. Enter token to see status + admin notes.
- **Inbox**: Admins see all grievances. Others see own non-anonymous submissions only.

Anonymous submissions: `employee_id = null`, never recoverable. Only managers/employees (not admins) see own submissions in "My Submissions" — RBAC exception vs other modules.

---

## Payroll Module (`/dashboard/payroll`) — Business+

- `src/lib/ctc.ts` — CTC breakdown: PF caps, PT per state (10 states), TDS slabs FY 2025-26, Rebate u/s 87A
- Salary structure config per employee → auto-computes components
- Monthly run: draft → process → mark paid. LOP from approved unpaid leaves.
- Printable payslip (browser Print → PDF). Employee self-service "My Payslips" tab.

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

| Route | Schedule | Purpose |
|-------|----------|---------|
| `/api/cron/doc-reminders` | `0 9 * * 1` (Mon 9am IST) | Email employees with unacknowledged required docs |
| `/api/cron/onboarding-nudges` | `30 3 * * *` (9:30am IST) | Day 1/3/5/7 nudge emails for new orgs |

Both require `Authorization: Bearer CRON_SECRET` header. `CRON_SECRET` env var must be set in Vercel.

---

## Pending Work

### ❌ Not yet built
- **Training deadline reminder cron** — Vercel Cron for overdue training alerts (same pattern as doc-reminders)
- **Blog SEO articles** — more posts in `src/content/blog/` (ESI, gratuity, HR software comparison)
- **Marketing** — SoftwareSuggest, Capterra, G2, Techjockey listings; LinkedIn company page; Google Ads
- **Phase 4 AI** (Business tier): semantic search (pgvector), smart review summaries, attrition risk
- **JambaHire**: onboarding workflows (post-hire)
- **Training LMS Auto-Sync** (shown as Coming Soon): Coursera, LinkedIn Learning, TalentLMS

### ❌ Infrastructure
- Background jobs (Trigger.dev or Inngest) for training reminders, compliance alerts

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
34. **RBAC fallback**: No employee record → defaults to `admin` role in `getCurrentUser()`.

---

## Demo Org — test1

15-person org for Amol Gupta (`amolgupta007@gmail.com`). Departments: Engineering, Marketing, Sales, Operations, HR. Full seed data across all modules including payroll (Maharashtra/metro, ₹12–36 LPA by role) and JambaHire (4 jobs, 10 candidates, full pipeline, 3 interviews, 2 offers).

Seed scripts: `scripts/seed-payroll-demo.sql`, `scripts/seed-jambahire-demo.sql`
