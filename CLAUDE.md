# CLAUDE.md — JambaHR Project Guide

## What is this project?

JambaHR is an all-in-one HR management SaaS platform for small and medium businesses (10–500 employees) who don't want to hire a dedicated HR professional. It handles employee directory, leave management, performance reviews, training & compliance, document storage, and payroll — all through a single web portal.

**Target customer**: Business owners / decision-makers at companies with 10–500 employees.
**Two user types**: Admins (company owners/HR) who configure and manage, and Employees who self-serve (apply for leave, view docs, do reviews).

---

## Tech Stack

| Layer | Tool | Purpose |
|-------|------|---------|
| Framework | Next.js 14 (App Router) | Full-stack React with RSC and Server Actions |
| Language | TypeScript (strict) | Type safety throughout |
| Styling | Tailwind CSS 3.4 + tailwindcss-animate | Utility-first CSS with custom design tokens |
| UI Components | Radix UI + CVA + tailwind-merge | Accessible primitives with variant system |
| Auth | Clerk (with Organizations) | Multi-tenant auth, roles, invitations |
| Database | Supabase (Postgres) | Data storage + Row Level Security for multi-tenancy |
| Payments | Razorpay | Subscription billing (per-employee pricing, INR) |
| Email | Resend + React Email | Transactional emails (leave approvals, status notifications) |
| Analytics | PostHog | Product analytics and feature flags |
| Errors | Sentry | Error tracking and performance monitoring |
| Hosting | Vercel | Deployment + edge functions |
| DNS | Cloudflare | DNS + DDoS protection |
| Monitoring | UptimeRobot | Uptime checks |
| Domain | Namecheap | Domain registration |

### Important version notes
- Next.js is pinned to 14.2.x — do NOT upgrade to 15/16 without migration
- eslint-config-next is pinned to 14.2.15 to match ESLint 8
- The `geist` font package must be installed separately (`npm install geist`)
- Supabase CLI does NOT support global npm install on Windows — use the SQL Editor in the Supabase Dashboard instead
- `@react-email/render` and `@react-email/components` must be listed in `serverComponentsExternalPackages` in `next.config.js` — otherwise Vercel build crashes

---

## Project Structure

```
hr-portal/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # Root layout (Clerk, fonts, PostHog, Sonner, Sentry, favicon)
│   │   ├── page.tsx                  # Marketing landing page (public)
│   │   ├── globals.css               # Design tokens (HSL CSS variables, light + dark)
│   │   ├── global-error.tsx          # Sentry React render error boundary
│   │   ├── (auth)/                   # Auth routes (public)
│   │   │   ├── sign-in/[[...sign-in]]/page.tsx
│   │   │   └── sign-up/[[...sign-up]]/page.tsx
│   │   ├── (marketing)/              # Future marketing pages
│   │   ├── onboarding/page.tsx       # Post-signup org creation wizard
│   │   ├── api/webhooks/
│   │   │   ├── clerk/route.ts        # Syncs Clerk user/org events → Supabase
│   │   │   ├── stripe/route.ts       # Legacy Stripe handler (kept, unused)
│   │   │   └── razorpay/route.ts     # Razorpay subscription lifecycle webhook
│   │   └── dashboard/                # Protected app (requires auth)
│   │       ├── layout.tsx            # Sidebar + Header shell (passes role + plan)
│   │       ├── page.tsx              # Dashboard home (live stats, recent leaves, deadlines)
│   │       ├── employees/page.tsx    # Employee directory with CRUD
│   │       ├── leaves/page.tsx       # Leave management
│   │       ├── documents/page.tsx    # Document hub (Growth+ plan gate)
│   │       ├── reviews/page.tsx      # Performance reviews (Growth+ plan gate)
│   │       ├── training/page.tsx     # Training & compliance (Growth+ plan gate)
│   │       ├── objectives/page.tsx   # OKR objectives (Growth+ plan gate)
│   │       ├── announcements/page.tsx# Company-wide announcements
│   │       ├── directory/page.tsx    # Org chart tree view
│   │       ├── profile/page.tsx      # Employee self-profile
│   │       ├── payroll/page.tsx      # Payroll (Business+ plan gate)
│   │       └── settings/page.tsx     # Org settings, billing, policies
│   ├── actions/                      # Server Actions (all mutations)
│   │   ├── employees.ts             # list, add, update, delete, getDepartments
│   │   ├── leaves.ts                # request, approve, reject, cancel, balances, policies + email notifications
│   │   ├── documents.ts             # list, upload, delete, signed URLs, acknowledgeDocument
│   │   ├── reviews.ts               # cycles CRUD, self/manager review submit
│   │   ├── objectives.ts            # OKR CRUD, submit, approve, reject
│   │   ├── training.ts              # courses CRUD, enroll, progress, completion
│   │   ├── settings.ts              # org profile, departments, leave policies
│   │   ├── billing.ts               # Razorpay subscription creation, cancellation
│   │   ├── dashboard.ts             # live stats, recent leaves, deadlines, review cycles
│   │   ├── announcements.ts         # list, create, update, delete, pin/unpin, markRead
│   │   └── notifications.ts         # getPendingCounts() for sidebar badges
│   ├── components/
│   │   ├── ui/                       # Reusable primitives
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   └── badge.tsx
│   │   ├── layout/
│   │   │   ├── sidebar.tsx           # Collapsible nav, role-filtered + plan-locked items, badges
│   │   │   ├── header.tsx            # Top bar with search + notifications
│   │   │   ├── upgrade-gate.tsx      # Full-page upgrade prompt for locked plan features
│   │   │   └── posthog-provider.tsx
│   │   ├── dashboard/
│   │   │   ├── employees-client.tsx  # Employee page (Add button hidden for employees)
│   │   │   ├── employee-table.tsx    # Data table (actions hidden for non-admins)
│   │   │   └── employee-form.tsx     # Add/edit modal
│   │   ├── leaves/                   # Leave request form, table, approval workflow
│   │   ├── documents/                # Upload dialog, document list, acknowledgment button
│   │   ├── reviews/                  # Cycle list, review dialog (create cycle hidden for employees)
│   │   ├── objectives/               # Create/approve dialogs, objectives list
│   │   ├── training/                 # Course dialog, enroll dialog, progress dialog, compliance tab
│   │   ├── announcements/            # Announcement list, create/edit dialog, pin controls
│   │   ├── settings/                 # Org profile, departments, leave policies, billing section
│   │   ├── forms/                    # Shared form components
│   │   └── emails/
│   │       ├── leave-request.tsx     # React Email template — new leave request (to managers)
│   │       └── leave-status.tsx      # React Email template — approved/rejected notification (to employee)
│   ├── config/
│   │   ├── navigation.ts            # Sidebar nav items with requiredRole + requiredPlan, APP_NAME
│   │   └── plans.ts                 # OrgPlan type, PLAN_FEATURES map, hasFeature(), PLAN_UNLOCK_HIGHLIGHTS
│   ├── hooks/
│   │   ├── index.ts
│   │   └── use-employee.ts          # Client hook for current employee + org context
│   ├── lib/
│   │   ├── utils.ts                  # cn(), formatDate(), formatCurrency(), getInitials()
│   │   ├── razorpay.ts              # Razorpay client + PLANS config (starter/growth/business)
│   │   ├── current-user.ts          # getCurrentUser() → { orgId, clerkUserId, role, employeeId, plan }
│   │   ├── resend.ts                # Resend email client + FROM_EMAIL constant
│   │   └── supabase/
│   │       ├── client.ts
│   │       ├── server.ts
│   │       └── index.ts
│   ├── middleware.ts                 # Clerk route protection
│   └── types/
│       ├── database.types.ts
│       └── index.ts                  # Row types, UserRole, ROLE_HIERARCHY, hasPermission(), ActionResult, NavItem
├── supabase/
│   ├── config.toml
│   └── migrations/
│       └── 001_initial_schema.sql    # Full schema: 12 tables, indexes, RLS, triggers
├── public/
│   ├── Jamba.png                     # App logo — used as favicon and Razorpay checkout logo
│   └── pitchdeck.html                # 12-page HTML pitch deck (open in Chrome → Print → Save as PDF)
├── .env.example
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.js
├── postcss.config.js
├── vercel.json
├── .eslintrc.json
├── .prettierrc
└── .gitignore
```

---

## Database Schema (Supabase Postgres)

13 tables, all with `org_id` for multi-tenant isolation via RLS:

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `organizations` | Tenant root | clerk_org_id, plan, stripe_customer_id (reused for Razorpay sub ID), max_employees |
| `employees` | Team directory | first_name, last_name, email, role, department_id, status, employment_type, clerk_user_id |
| `departments` | Org structure | name, head_id (FK → employees) |
| `leave_policies` | Leave type config | type (paid/sick/casual/etc), days_per_year, carry_forward |
| `leave_balances` | Per-employee per-year | total_days, used_days, carried_forward_days |
| `leave_requests` | Time-off requests | start_date, end_date, days, status (pending/approved/rejected/cancelled) |
| `documents` | File metadata | category, file_url, is_company_wide, requires_acknowledgment |
| `document_acknowledgments` | Who has acknowledged which doc | document_id, employee_id, acknowledged_at — added via SQL Editor |
| `review_cycles` | Review period config | status (draft/active/completed), start_date, end_date |
| `reviews` | Individual reviews | self_rating, manager_rating, goals (JSONB), objectives_id, status |
| `training_courses` | Course library | category (ethics/compliance/safety/skills/onboarding/custom), is_mandatory, due_date |
| `training_enrollments` | Employee ↔ Course | status (assigned/in_progress/completed/overdue), progress_percent, certificate_url |
| `holidays` | Company holidays | date, is_optional |
| `objectives` | OKR objective sets | employee_id, manager_id, period_type, period_label, status (draft/submitted/approved/rejected), items (JSONB) |
| `announcements` | Company-wide notices | title, body, category, is_pinned, created_by (FK → employees) |
| `salary_structures` | Per-employee CTC config | employee_id, ctc, basic_monthly, hra_monthly, special_allowance_monthly, gross_monthly, net_monthly, state, is_metro |
| `payroll_runs` | Monthly payroll execution | month (YYYY-MM), status (draft/processed/paid), working_days, total_gross, total_net |
| `payroll_entries` | Per-employee per-run computed values | gross_salary, employee_pf, professional_tax, tds, lop_days, lop_deduction, bonus, net_pay |

### Multi-tenancy approach
- Every table has `org_id` column with FK to `organizations`
- RLS is enabled on ALL tables
- Admin Supabase client (`SUPABASE_SERVICE_ROLE_KEY`) bypasses RLS — used in all server actions
- **NOTE**: `stripe_customer_id` and `stripe_subscription_id` columns on `organizations` are reused for Razorpay (no schema change needed)

### Tables added post-initial-migration (via SQL Editor)
- `objectives` — full table with JSONB items, status enum, period fields
- `announcements` — title, body, category, is_pinned, created_by
- `document_acknowledgments` — document_id, employee_id, acknowledged_at; unique constraint on (document_id, employee_id)
- `reviews.objectives_id` — ALTER TABLE ADD COLUMN

### Auto-updated timestamps
Triggers on `organizations`, `employees`, `leave_requests` automatically update `updated_at`.

---

## Authentication & Authorization

### Clerk setup
- **Organizations enabled** — every user must belong to an org
- **Organization slugs enabled** — clean URLs
- **Production instance** — configured on `jambahr.com`
- Roles: `owner`, `admin`, `manager`, `employee` — defined in `src/types/index.ts`
- `ROLE_HIERARCHY` and `hasPermission()` helper for role-based access control

### Route protection (middleware.ts)
- Public routes: `/`, `/sign-in(.*)`, `/sign-up(.*)`, `/api/webhooks(.*)`
- All other routes require authentication via Clerk

### Webhook sync (Clerk → Supabase)
- `POST /api/webhooks/clerk` — verified working on production
- Subscribed events: `organization.created`, `organization.updated`, `user.created`, `user.updated`
- Webhook endpoint: `https://jambahr.com/api/webhooks/clerk`

### Role-Based Access Control (RBAC)

**`src/lib/current-user.ts`** — central helper:
- `getCurrentUser()` → `{ orgId, clerkUserId, role, employeeId, plan }`
- `isAdmin(role)` → true for `owner` | `admin`
- `isManagerOrAbove(role)` → true for `owner` | `admin` | `manager`

**Sidebar filtering** — nav items filtered by `requiredRole`:
- Employees: see Dashboard, Directory, Leaves, Announcements, Objectives, Training, Documents (if plan allows)
- Managers: above + Employees page, Reviews
- Admins: everything including Settings, Payroll

**Server action guards** (security layer):
| Action | Required Role |
|--------|--------------|
| addEmployee, updateEmployee, terminateEmployee | admin |
| uploadDocument, deleteDocument | admin |
| approveLeave, rejectLeave | manager+ |
| createReviewCycle, deleteReviewCycle | admin |
| createCourse, updateCourse, deleteCourse, enrollEmployees, unenrollEmployee | admin |
| updateOrgProfile, addLeavePolicy, updateLeavePolicy, deleteLeavePolicy | admin |
| createAnnouncement, updateAnnouncement, deleteAnnouncement, pinAnnouncement | admin |

**UI guards** (UX layer — buttons/dialogs hidden for lower roles):
- Employees page: Add/Edit/Terminate hidden for non-admins
- Leaves: employees only see their own requests; Approve/Reject hidden
- Documents: Upload + Delete hidden for non-admins; Acknowledge button shown for employees on required-ack docs
- Reviews: New Cycle + cycle management hidden for non-admins
- Announcements: Create/Edit/Delete/Pin hidden for non-admins; employees see read-only list

---

## Plan-Based Feature Gating

### Config — `src/config/plans.ts`

```typescript
export type OrgPlan = "starter" | "growth" | "business";
export type PlanFeature = "documents" | "reviews" | "objectives" | "training" | "payroll" |
  "analytics" | "api" | "ai_assistant" | "ai_reviews" | "ai_attrition" | "semantic_search" |
  "hiring_jd" | "ats" | "interview_scheduling" | "offer_letters" | "onboarding_workflows";

export function hasFeature(plan: OrgPlan, feature: PlanFeature): boolean
```

### Feature tier mapping
| Feature | Starter | Growth | Business |
|---------|---------|--------|----------|
| Employee Directory | ✅ | ✅ | ✅ |
| Leave Management | ✅ | ✅ | ✅ |
| Announcements | ✅ | ✅ | ✅ |
| Documents | ❌ | ✅ | ✅ |
| Reviews | ❌ | ✅ | ✅ |
| Objectives / OKR | ❌ | ✅ | ✅ |
| Training & Compliance | ❌ | ✅ | ✅ |
| Hiring JD Generator | ❌ | ✅ | ✅ |
| Payroll | ❌ | ❌ | ✅ |
| Analytics | ❌ | ❌ | ✅ |
| API Access | ❌ | ❌ | ✅ |
| AI Assistant / Reviews / Attrition | ❌ | ❌ | ✅ |
| Semantic Search (pgvector) | ❌ | ❌ | ✅ |
| Full Hiring Suite (ATS, Interviews, Offers, Onboarding) | ❌ | ❌ | ✅ |

### How gating works
1. `getCurrentUser()` now returns `plan` (from `organizations.plan`)
2. Each locked page checks `hasFeature(plan, feature)` at the top; returns `<UpgradeGate>` if locked
3. Sidebar shows a `Lock` icon on items that require a higher plan (`PLAN_RANK` comparison)
4. `UpgradeGate` component (`src/components/layout/upgrade-gate.tsx`) shows feature highlights and links to `/dashboard/settings#billing`

---

## Email Notifications — Resend

### Leave request flow
- `requestLeave()` → sends email to all org managers/admins with leave details (non-blocking)
- `approveLeave()` / `rejectLeave()` → sends status email to the requesting employee
- Template files:
  - `src/components/emails/leave-request.tsx` — notification to approvers
  - `src/components/emails/leave-status.tsx` — approved/rejected notification to employee

### Setup requirement
- `RESEND_API_KEY` must be set in Vercel (not yet set)
- `FROM_EMAIL` constant in `src/lib/resend.ts` — update to a verified Resend sender domain

---

## Error Tracking — Sentry

- `sentry.client.config.ts` / `sentry.server.config.ts` / `sentry.edge.config.ts` — SDK init
- `src/app/global-error.tsx` — catches React render errors, calls `Sentry.captureException()`
- Env var: `NEXT_PUBLIC_SENTRY_DSN` (note: must be `NEXT_PUBLIC_` prefix for client-side capture)
- Sentry deprecation warnings in build output are cosmetic — no functional impact

---

## Document Acknowledgment

- `documents.requires_acknowledgment` flag on upload
- `document_acknowledgments` table: tracks which employees have acknowledged which docs
- `acknowledgeDocument(documentId)` server action: upserts to acknowledgment table
- UI: "Acknowledge" button on unacknowledged required docs; green "Acknowledged" badge after
- Admins see "X acknowledged" count per document
- Sidebar badge: counts only **unacknowledged** required docs for the current user

---

## Announcements Module

- `/dashboard/announcements` — company-wide notices
- Admins: create, edit, delete, pin/unpin announcements
- Employees: read-only list with pin indicators
- `announcements` table: title, body, category (general/policy/event/urgent), is_pinned, created_by
- Pinned announcements appear at top of list
- Sidebar badge: count of unread announcements (tracked in session/local state)

---

## Billing — Razorpay

### How it works
1. User clicks Upgrade in `/dashboard/settings` → billing section
2. `createSubscription(planKey)` server action creates a Razorpay subscription via API
3. Returns `subscriptionId` + `keyId` to frontend
4. Frontend loads Razorpay checkout JS and opens modal with `subscription_id`
5. On payment success, Razorpay fires webhook → `POST /api/webhooks/razorpay`
6. Webhook verifies HMAC signature, updates `organizations.plan` and `max_employees` in Supabase

### Webhook events handled
- `subscription.activated` → update org plan + max_employees
- `subscription.charged` → no-op (subscription remains active)
- `subscription.cancelled` / `subscription.completed` → downgrade to starter
- `subscription.paused` → log warning
- `payment.failed` → log error (TODO: send Resend email)

### Plans config (`src/lib/razorpay.ts`)
| Plan | Price | Max Employees |
|------|-------|---------------|
| Starter | Free | 10 |
| Growth | ₹500/employee/month | 200 |
| Business | ₹800/employee/month | 500 |

---

## Demo Org — test1

A 15-person demo org is seeded in Supabase for the `test1` organization (Amol Gupta — amolgupta007@gmail.com).

**Departments**: Engineering, Marketing, Sales, Operations, HR
**Employees**: 15 people across all departments with various roles (owner, admin, manager, employee)
**Seed data includes**:
- Leave requests across multiple employees (pending, approved, rejected states)
- Documents uploaded (company policies, contracts, offer letters)
- Review cycles with self-assessments and manager reviews
- Objectives (draft, submitted, approved states)
- Training courses with enrollments at various progress levels
- Announcements (pinned and regular)
- Leave balances per employee

Use this org to demo all JambaHR features end-to-end.

---

## Pitch Deck

`public/pitchdeck.html` — 12-page styled pitch deck covering:
1. Cover / tagline
2. Problem statement
3. JambaHR solution overview
4. Module showcase
5. Tech stack and why
6. Architecture diagram
7. Security and RBAC
8. Database design
9. Pricing model
10. Market opportunity
11. Product roadmap
12. Closing / CTA

**To generate PDF**: Open in Chrome → Ctrl+P → Destination: Save as PDF → Layout: Landscape → Save

---

## Key Architecture Patterns

### Server Actions for mutations
All data mutations use Next.js Server Actions in `src/actions/`. Pattern:
```typescript
"use server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";

export async function doSomething(data): Promise<ActionResult<T>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };
  // Validate with Zod, then CRUD via admin Supabase client
}
```

### ActionResult pattern
```typescript
type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };
```

### Client components
- Server page (`page.tsx`) fetches data + role + plan, passes all to client wrapper
- Client wrapper hides/shows UI based on role prop
- Plan gating happens in the server page before any data fetching
- Uses `sonner` toast for feedback

### Design tokens
Primary color: teal (`172 50% 36%`). Accent: warm orange (`32 95% 52%`).

---

## Current Status — What's Done vs Pending

### ✅ COMPLETED

**Infrastructure & Config**
- [x] Full project scaffolding (Next.js 14, TypeScript, Tailwind)
- [x] ESLint, Prettier, TypeScript strict mode
- [x] Vercel deployment (bom1 region)
- [x] Custom domain: `jambahr.com` (Namecheap → Cloudflare → Vercel)
- [x] Clerk production instance configured on `jambahr.com`
- [x] Jamba.png logo — favicon + Razorpay checkout logo

**Auth**
- [x] Clerk integration with Organizations
- [x] Sign-in / sign-up pages
- [x] Middleware for route protection
- [x] Clerk webhook verified working (org auto-created in Supabase on signup)

**Database**
- [x] Full Supabase migration (12 tables, indexes, RLS, triggers)
- [x] `objectives` table added manually via SQL Editor
- [x] `reviews.objectives_id` column added via ALTER TABLE
- [x] `announcements` table added via SQL Editor
- [x] `document_acknowledgments` table added via SQL Editor

**App Shell**
- [x] Marketing landing page
- [x] Dashboard layout with collapsible sidebar + role-filtered + plan-locked nav
- [x] Onboarding wizard
- [x] Dashboard home with live stats, recent leaves, upcoming deadlines, active review cycles

**RBAC — Role-Based Access Control**
- [x] `getCurrentUser()` shared helper — returns `{ orgId, clerkUserId, role, employeeId, plan }`
- [x] Sidebar filters nav items by role
- [x] Server action guards on all admin/manager-only mutations
- [x] UI hides admin controls for employees

**Plan-Based Feature Gating**
- [x] `src/config/plans.ts` — OrgPlan, PlanFeature, PLAN_FEATURES, hasFeature()
- [x] `src/components/layout/upgrade-gate.tsx` — full-page upgrade prompt
- [x] Sidebar lock icon on plan-restricted nav items
- [x] Documents, Reviews, Objectives, Training — gated at Growth tier
- [x] Payroll — gated at Business tier
- [x] Future AI/Hiring features defined in PLAN_FEATURES for business tier

**Employee CRUD**
- [x] Full CRUD with role guards (admin only for mutations)
- [x] Soft delete, employee count limit, reporting manager field

**Directory**
- [x] Org chart tree view with collapsible branches (`/dashboard/directory`)

**Leave Management** (`/dashboard/leaves`)
- [x] Request, approve, reject, cancel flow
- [x] Leave balance cards per policy
- [x] Employees see own requests only; managers see all
- [x] Approve/Reject buttons hidden for employees
- [x] Email notification to managers on new request (Resend — requires RESEND_API_KEY)
- [x] Email notification to employee on approve/reject (Resend — requires RESEND_API_KEY)

**Document Management** (`/dashboard/documents`) — Growth+
- [x] Supabase Storage, drag-and-drop upload, signed URLs
- [x] Categories, company-wide toggle, acknowledgment flag
- [x] Upload/Delete hidden for non-admins
- [x] Employee acknowledgment flow (Acknowledge button → green badge)
- [x] Admin sees acknowledgment count per document
- [x] Sidebar badge counts only unacknowledged required docs for current user

**Announcements** (`/dashboard/announcements`)
- [x] Create, edit, delete, pin/unpin (admin only)
- [x] Employees see read-only list with pinned items at top
- [x] Categories: general, policy, event, urgent

**Settings** (`/dashboard/settings`)
- [x] Org profile, department CRUD, leave policy CRUD
- [x] Billing section with Razorpay upgrade flow

**Sidebar Notification Badges**
- [x] Pending leaves, unacknowledged docs, pending objective approvals

**Performance Reviews** (`/dashboard/reviews`) — Growth+
- [x] Review cycle CRUD (admin only)
- [x] Self-assessment + manager review
- [x] Objectives evaluation embedded in review dialog

**Objectives / OKR** (`/dashboard/objectives`) — Growth+
- [x] Draft → submitted → approved/rejected flow
- [x] Manager approval dialog
- [x] Linked to review cycles

**Training & Compliance** (`/dashboard/training`) — Growth+
- [x] Course library, enrollment, self-attestation completion
- [x] Compliance tab with overdue alerts
- [x] LMS Auto-Sync coming soon banner

**Billing — Razorpay**
- [x] `src/lib/razorpay.ts` — client + PLANS config
- [x] `src/actions/billing.ts` — createSubscription, cancelSubscription
- [x] `src/app/api/webhooks/razorpay/route.ts` — HMAC-verified webhook handler
- [x] Billing section UI with plan cards + Razorpay checkout modal
- [x] Webhook endpoint configured in Razorpay dashboard

**Error Tracking — Sentry**
- [x] Sentry SDK integrated (client + server + edge configs)
- [x] `global-error.tsx` added for React render error capture
- [x] Env var: `NEXT_PUBLIC_SENTRY_DSN` (must use `NEXT_PUBLIC_` prefix)

**Email Templates**
- [x] `leave-request.tsx` — new leave request notification to managers
- [x] `leave-status.tsx` — approved/rejected notification to employee
- [x] `payment-failed.tsx` — payment failure / subscription paused alert to org admins
- [x] `doc-reminder.tsx` — weekly unacknowledged document reminder to employees
- [x] `next.config.js` — react-email packages added to `serverComponentsExternalPackages`

**Payroll & Compensation** (`/dashboard/payroll`) — Business+
- [x] `src/lib/ctc.ts` — CTC breakdown engine: PF caps, PT per state (10 states), new tax regime TDS slabs (FY 2025-26), Rebate u/s 87A
- [x] Salary structure config per employee (CTC → auto-computes all components)
- [x] Live CTC breakdown preview card in salary dialog
- [x] Monthly payroll run: draft → process → mark paid flow
- [x] LOP auto-calculated from approved unpaid leaves for the month
- [x] Per-entry adjustment: bonus + LOP days override
- [x] Printable payslip dialog (earnings + deductions table, Print → PDF via browser)
- [x] Employee self-service: My Payslips tab
- [x] 3 new DB tables: `salary_structures`, `payroll_runs`, `payroll_entries`

**Cron Jobs**
- [x] `src/app/api/cron/doc-reminders/route.ts` — weekly doc acknowledgment reminders
- [x] `vercel.json` cron: every Monday 9am (`0 9 * * 1`)
- [x] `CRON_SECRET` set in Vercel env vars

**Razorpay Webhook — Email Alerts**
- [x] `payment.failed` → sends payment failure email to all org admins
- [x] `subscription.paused` → sends paused alert to all org admins

**Demo Org**
- [x] 15-person seed org (test1) created via Supabase SQL Editor
- [x] Departments, employees, leaves, documents, reviews, objectives, training, announcements all seeded

**Pitch Deck**
- [x] `public/pitchdeck.html` — 12-page HTML pitch deck

### ⚠️ PARTIALLY DONE — NEEDS ATTENTION

**Environment Variables (Vercel)**
- [x] NEXT_PUBLIC_SUPABASE_URL
- [x] NEXT_PUBLIC_SUPABASE_ANON_KEY
- [x] SUPABASE_SERVICE_ROLE_KEY
- [x] NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY (production)
- [x] CLERK_SECRET_KEY (production)
- [x] CLERK_WEBHOOK_SECRET (production)
- [x] NEXT_PUBLIC_RAZORPAY_KEY_ID
- [x] RAZORPAY_KEY_SECRET
- [x] RAZORPAY_GROWTH_PLAN_ID
- [x] RAZORPAY_BUSINESS_PLAN_ID
- [x] RAZORPAY_WEBHOOK_SECRET
- [x] NEXT_PUBLIC_SENTRY_DSN (set + verified working)
- [x] RESEND_API_KEY (set + jambahr.com sender domain verified in Resend)
- [x] NEXT_PUBLIC_POSTHOG_KEY (set + NEXT_PUBLIC_POSTHOG_HOST set + verified working)
- [x] CRON_SECRET (set — used by /api/cron/doc-reminders)

### ❌ NOT YET BUILT — Pending

**Phase 3 — Future**
- [ ] Payroll & compensation (salary, payslips, tax helpers)
- [ ] Attendance (clock in/out, overtime)

**Phase 4 — AI Features (Business tier)**
- [ ] AI-powered job description generator
- [ ] Semantic search (pgvector)
- [ ] Smart review summaries
- [ ] Attrition risk indicators

**Hiring Suite (Business tier)**
- [ ] ATS (applicant tracking)
- [ ] Interview scheduling
- [ ] Offer letters
- [ ] Onboarding workflows

**Training — LMS Auto-Sync (shown as Coming Soon)**
- [ ] Webhook receivers for Coursera, LinkedIn Learning, TalentLMS, Docebo, Google Classroom

### ❌ NOT YET DONE — Infrastructure

- [ ] Set up UptimeRobot monitoring
- [ ] Background jobs (Trigger.dev or Inngest) for training reminders, compliance alerts, payment failure emails

---

## Development Commands

```bash
npm run dev           # Start dev server (http://localhost:3000)
npm run build         # Production build
npm run lint          # ESLint check
npm run db:generate   # Regenerate Supabase types (needs CLI)
npm run db:push       # Push migrations (needs CLI)
```

---

## Coding Conventions

### Server actions pattern
- Always `"use server"` at top
- Always call `getCurrentUser()` from `@/lib/current-user` for auth + role + plan
- Always check `isAdmin()` / `isManagerOrAbove()` before mutations
- Always validate with Zod before DB operations
- Always return `ActionResult<T>`
- Always `revalidatePath()` after mutations
- Use `createAdminSupabase()` (bypasses RLS)

### Plan gating pattern (page level)
```typescript
const userCtx = await getCurrentUser();
const plan = userCtx?.plan ?? "starter";
if (!hasFeature(plan, "feature-name")) {
  return <UpgradeGate feature="Feature Name" requiredPlan="growth" currentPlan={plan} />;
}
// proceed with data fetching only after gate passes
```

### Component pattern
- Server page → fetch data + role + plan → pass to client wrapper
- Client wrapper receives `role: UserRole` prop, conditionally renders admin UI
- Use `hasPermission(role, "admin")` from `@/types` for UI guards
- Use `sonner` toast for feedback
- Use `lucide-react` for all icons

### Styling
- Tailwind utility classes only — no custom CSS except in globals.css
- Use `cn()` from `@/lib/utils`
- CSS variables for colors: `bg-primary`, `text-muted-foreground`, etc.

---

## Pricing Model

| Tier | Price | Max Employees | Features |
|------|-------|---------------|----------|
| Starter | Free | 10 | Directory, Leave, Announcements |
| Growth | ₹500/employee/month | 200 | + Documents, Reviews, Objectives, Training, Hiring JD |
| Business | ₹800/employee/month | 500 | + Payroll, Analytics, API, Full AI Suite, Full Hiring Suite |

Configured in `src/lib/razorpay.ts` (billing) and `src/config/plans.ts` (feature flags).

---

## Immediate Next Steps (in priority order)

1. **UptimeRobot** — add `https://jambahr.com` monitor
2. **Training deadline reminders** — add a second Vercel Cron for overdue training alerts (pattern same as doc-reminders cron)
3. **Payroll for demo org** — seed salary structures for test1 employees to demo the full payroll flow

---

## Known Issues / Gotchas

1. **pgvector extension**: Removed from migration — not available on free Supabase tier.
2. **Next.js version**: Pinned to 14.2.x. Do not upgrade without migration plan.
3. **eslint-config-next**: Pinned to `14.2.15` to match ESLint 8.
4. **Supabase CLI on Windows**: Global install fails. Use Supabase Dashboard SQL Editor for all migrations.
5. **TypeScript build errors**: `typescript: { ignoreBuildErrors: true }` in `next.config.js`. Root cause: Supabase v2 type inference returns `never` for partial selects.
6. **RLS bypass**: Server actions use admin Supabase client (service role key). Intentional — Clerk JWT → Supabase RLS not configured.
7. **New tables added post-migration**: `objectives`, `announcements`, `document_acknowledgments` tables added manually via SQL Editor. `reviews.objectives_id` added via ALTER TABLE.
8. **Supabase trigger function**: `update_updated_at_column()` must be created separately before running triggers (SQL Editor splits on semicolons).
9. **Razorpay `stripe_*` columns**: `organizations.stripe_customer_id` and `stripe_subscription_id` are reused for Razorpay subscription IDs — no schema change was made.
10. **Razorpay checkout script**: Loaded dynamically in `billing-section.tsx` via `loadRazorpayScript()` to avoid SSR issues.
11. **RBAC fallback**: If a user has no employee record (e.g. org creator before onboarding), `getCurrentUser()` defaults their role to `"admin"` so they retain full access.
12. **Employee page visibility**: The Employees page requires `manager` role or above in sidebar nav. Route itself is not hard-blocked — add middleware protection if needed.
13. **react-email packages**: Must be in `serverComponentsExternalPackages` in `next.config.js`. If removed, Vercel build crashes when `leaves.ts` is imported.
14. **Sentry DSN env var name**: Must be `NEXT_PUBLIC_SENTRY_DSN` (with `NEXT_PUBLIC_` prefix) for client-side error capture. A plain `SENTRY_DSN` will only work server-side.
15. **Supabase JSON carriage returns**: When inserting JSONB via SQL Editor, avoid pasting JSON string literals directly — use `jsonb_build_array(jsonb_build_object(...))` syntax to prevent `0x0d` carriage return parse errors.
16. **Training course categories**: Only `ethics`, `compliance`, `safety`, `skills`, `onboarding`, `custom` are valid — check constraint will reject others.
17. **Training enrollment status**: Only `assigned`, `in_progress`, `completed`, `overdue` are valid — `not_started` is not a valid value.
18. **Vercel Cron auth**: `/api/cron/doc-reminders` verifies `Authorization: Bearer CRON_SECRET`. The `CRON_SECRET` env var must be set in Vercel or the cron will return 401.
19. **CTC breakdown rounding**: `computeCTCBreakdown` rounds to nearest rupee. Small rounding differences (₹1-2) between annual and monthly figures are expected due to integer rounding.
20. **Payroll LOP**: Only leaves with policy type `unpaid` are counted as LOP. Paid/sick/casual leaves don't trigger LOP deduction — admin can manually add LOP days per entry.
21. **`salary_structures` unique constraint**: One salary structure per employee per org. Updating runs an upsert — the effective_from date tracks when the structure was last revised.
