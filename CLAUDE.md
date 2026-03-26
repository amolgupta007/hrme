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
| Email | Resend + React Email | Transactional emails (leave approvals, reminders) |
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

---

## Project Structure

```
hr-portal/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # Root layout (Clerk, fonts, PostHog, Sonner, favicon)
│   │   ├── page.tsx                  # Marketing landing page (public)
│   │   ├── globals.css               # Design tokens (HSL CSS variables, light + dark)
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
│   │       ├── layout.tsx            # Sidebar + Header shell (fetches role for RBAC)
│   │       ├── page.tsx              # Dashboard home (live stats, recent leaves, deadlines)
│   │       ├── employees/page.tsx    # Employee directory with CRUD
│   │       ├── leaves/page.tsx       # Leave management
│   │       ├── documents/page.tsx    # Document hub
│   │       ├── reviews/page.tsx      # Performance reviews
│   │       ├── training/page.tsx     # Training & compliance
│   │       ├── objectives/page.tsx   # OKR objectives
│   │       ├── directory/page.tsx    # Org chart tree view
│   │       ├── profile/page.tsx      # Employee self-profile
│   │       ├── payroll/page.tsx      # Payroll (placeholder — Phase 3)
│   │       └── settings/page.tsx     # Org settings, billing, policies
│   ├── actions/                      # Server Actions (all mutations)
│   │   ├── employees.ts             # list, add, update, delete, getDepartments
│   │   ├── leaves.ts                # request, approve, reject, cancel, balances, policies
│   │   ├── documents.ts             # list, upload, delete, signed URLs
│   │   ├── reviews.ts               # cycles CRUD, self/manager review submit
│   │   ├── objectives.ts            # OKR CRUD, submit, approve, reject
│   │   ├── training.ts              # courses CRUD, enroll, progress, completion
│   │   ├── settings.ts              # org profile, departments, leave policies
│   │   ├── billing.ts               # Razorpay subscription creation, cancellation
│   │   ├── dashboard.ts             # live stats, recent leaves, deadlines, review cycles
│   │   └── notifications.ts         # getPendingCounts() for sidebar badges
│   ├── components/
│   │   ├── ui/                       # Reusable primitives
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   └── badge.tsx
│   │   ├── layout/
│   │   │   ├── sidebar.tsx           # Collapsible nav, role-filtered items, badges
│   │   │   ├── header.tsx            # Top bar with search + notifications
│   │   │   └── posthog-provider.tsx
│   │   ├── dashboard/
│   │   │   ├── employees-client.tsx  # Employee page (Add button hidden for employees)
│   │   │   ├── employee-table.tsx    # Data table (actions hidden for non-admins)
│   │   │   └── employee-form.tsx     # Add/edit modal
│   │   ├── leaves/                   # Leave request form, table, approval workflow
│   │   ├── documents/                # Upload dialog, document list (upload hidden for employees)
│   │   ├── reviews/                  # Cycle list, review dialog (create cycle hidden for employees)
│   │   ├── objectives/               # Create/approve dialogs, objectives list
│   │   ├── training/                 # Course dialog, enroll dialog, progress dialog, compliance
│   │   ├── settings/                 # Org profile, departments, leave policies, billing section
│   │   ├── forms/                    # Shared form components
│   │   └── emails/
│   │       └── leave-request.tsx     # React Email template for leave approvals
│   ├── config/
│   │   └── navigation.ts            # Sidebar nav items with requiredRole, APP_NAME
│   ├── hooks/
│   │   ├── index.ts
│   │   └── use-employee.ts          # Client hook for current employee + org context
│   ├── lib/
│   │   ├── utils.ts                  # cn(), formatDate(), formatCurrency(), getInitials()
│   │   ├── razorpay.ts              # Razorpay client + PLANS config (starter/growth/business)
│   │   ├── current-user.ts          # getCurrentUser() → { orgId, clerkUserId, role, employeeId }
│   │   ├── resend.ts                # Resend email client
│   │   └── supabase/
│   │       ├── client.ts
│   │       ├── server.ts
│   │       └── index.ts
│   ├── middleware.ts                 # Clerk route protection
│   └── types/
│       ├── database.types.ts
│       └── index.ts                  # Row types, UserRole, ROLE_HIERARCHY, hasPermission(), ActionResult
├── supabase/
│   ├── config.toml
│   └── migrations/
│       └── 001_initial_schema.sql    # Full schema: 12 tables, indexes, RLS, triggers
├── public/
│   └── Jamba.png                     # App logo — used as favicon and Razorpay checkout logo
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

12 tables, all with `org_id` for multi-tenant isolation via RLS:

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `organizations` | Tenant root | clerk_org_id, plan, stripe_customer_id (reused for Razorpay sub ID), max_employees |
| `employees` | Team directory | first_name, last_name, email, role, department_id, status, employment_type, clerk_user_id |
| `departments` | Org structure | name, head_id (FK → employees) |
| `leave_policies` | Leave type config | type (paid/sick/casual/etc), days_per_year, carry_forward |
| `leave_balances` | Per-employee per-year | total_days, used_days, carried_forward_days |
| `leave_requests` | Time-off requests | start_date, end_date, days, status (pending/approved/rejected/cancelled) |
| `documents` | File metadata | category, file_url, is_company_wide, requires_acknowledgment |
| `review_cycles` | Review period config | status (draft/active/completed), start_date, end_date |
| `reviews` | Individual reviews | self_rating, manager_rating, goals (JSONB), objectives_id, status |
| `training_courses` | Course library | category (ethics/compliance/safety/etc), is_mandatory, due_date |
| `training_enrollments` | Employee ↔ Course | status, progress_percent, certificate_url |
| `holidays` | Company holidays | date, is_optional |
| `objectives` | OKR objective sets | employee_id, manager_id, period_type, period_label, status (draft/submitted/approved/rejected), items (JSONB) |

### Multi-tenancy approach
- Every table has `org_id` column with FK to `organizations`
- RLS is enabled on ALL tables
- Admin Supabase client (`SUPABASE_SERVICE_ROLE_KEY`) bypasses RLS — used in all server actions
- **NOTE**: `stripe_customer_id` and `stripe_subscription_id` columns on `organizations` are reused for Razorpay (no schema change needed)

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
- `getCurrentUser()` → `{ orgId, clerkUserId, role, employeeId }`
- `isAdmin(role)` → true for `owner` | `admin`
- `isManagerOrAbove(role)` → true for `owner` | `admin` | `manager`

**Sidebar filtering** — nav items filtered by `requiredRole`:
- Employees: see Dashboard, Directory, Leaves, Documents, Objectives, Training
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

**UI guards** (UX layer — buttons/dialogs hidden for lower roles):
- Employees page: Add/Edit/Terminate hidden for non-admins
- Leaves: employees only see their own requests; Approve/Reject hidden
- Documents: Upload + Delete hidden for non-admins
- Reviews: New Cycle + cycle management hidden for non-admins

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
- Server page (`page.tsx`) fetches data + role, passes both to client wrapper
- Client wrapper hides/shows UI based on role prop
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

**App Shell**
- [x] Marketing landing page
- [x] Dashboard layout with collapsible sidebar + role-filtered nav
- [x] Onboarding wizard
- [x] Dashboard home with live stats, recent leaves, upcoming deadlines, active review cycles

**RBAC — Role-Based Access Control**
- [x] `getCurrentUser()` shared helper (`src/lib/current-user.ts`)
- [x] Sidebar filters nav items by role
- [x] Server action guards on all admin/manager-only mutations
- [x] UI hides admin controls for employees (Add Employee, Upload, Approve Leave, New Cycle, etc.)
- [x] Employees only see their own leave requests

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

**Document Management** (`/dashboard/documents`)
- [x] Supabase Storage, drag-and-drop upload, signed URLs
- [x] Categories, company-wide toggle, acknowledgment flag
- [x] Upload/Delete hidden for non-admins

**Settings** (`/dashboard/settings`)
- [x] Org profile, department CRUD, leave policy CRUD
- [x] Billing section with Razorpay upgrade flow

**Sidebar Notification Badges**
- [x] Pending leaves, docs requiring acknowledgment, pending objective approvals

**Performance Reviews** (`/dashboard/reviews`)
- [x] Review cycle CRUD (admin only)
- [x] Self-assessment + manager review
- [x] Objectives evaluation embedded in review dialog

**Objectives / OKR** (`/dashboard/objectives`)
- [x] Draft → submitted → approved/rejected flow
- [x] Manager approval dialog
- [x] Linked to review cycles

**Training & Compliance** (`/dashboard/training`)
- [x] Course library, enrollment, self-attestation completion
- [x] Compliance tab with overdue alerts
- [x] LMS Auto-Sync coming soon banner

**Billing — Razorpay**
- [x] `src/lib/razorpay.ts` — client + PLANS config
- [x] `src/actions/billing.ts` — createSubscription, cancelSubscription
- [x] `src/app/api/webhooks/razorpay/route.ts` — HMAC-verified webhook handler
- [x] Billing section UI with plan cards + Razorpay checkout modal
- [x] Webhook endpoint configured in Razorpay dashboard

**API Webhooks**
- [x] Clerk webhook — org + user sync, verified working
- [x] Razorpay webhook — subscription lifecycle

**Email Templates**
- [x] Leave request approval email (React Email)

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
- [ ] RESEND_API_KEY — not set yet
- [ ] SENTRY_DSN — not set yet
- [ ] NEXT_PUBLIC_POSTHOG_KEY — not set yet

### ❌ NOT YET BUILT — Pending

**Near-term**
- [ ] Leave email notifications (Resend + leave-request.tsx template already exists)
- [ ] Document acknowledgment tracking (employee acknowledges receipt)
- [ ] Announcements / company-wide notices

**Phase 3 — Future**
- [ ] Payroll & compensation (salary, payslips, tax helpers)
- [ ] Attendance (clock in/out, overtime)

**Phase 4 — AI Features**
- [ ] AI-powered job description generator
- [ ] Semantic search (pgvector)
- [ ] Smart review summaries
- [ ] Attrition risk indicators

**Training — LMS Auto-Sync (shown as Coming Soon)**
- [ ] Webhook receivers for Coursera, LinkedIn Learning, TalentLMS, Docebo, Google Classroom

### ❌ NOT YET DONE — Infrastructure

- [ ] Set up Resend (enable leave email notifications)
- [ ] Set up Sentry error tracking
- [ ] Set up UptimeRobot monitoring
- [ ] Set up PostHog analytics
- [ ] Background jobs (Trigger.dev or Inngest) for email notifications, training reminders, compliance alerts

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
- Always call `getCurrentUser()` from `@/lib/current-user` for auth + role
- Always check `isAdmin()` / `isManagerOrAbove()` before mutations
- Always validate with Zod before DB operations
- Always return `ActionResult<T>`
- Always `revalidatePath()` after mutations
- Use `createAdminSupabase()` (bypasses RLS)

### Component pattern
- Server page → fetch data + role → pass to client wrapper
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
| Starter | Free | 10 | Directory, Leave, Basic docs |
| Growth | ₹500/employee/month | 200 | + Reviews, Training, Compliance |
| Business | ₹800/employee/month | 500 | + Payroll, Analytics, API, Priority support |

Configured in `src/lib/razorpay.ts` as the `PLANS` object.

---

## Immediate Next Steps (in priority order)

1. **Set up Resend** — enable leave approval email notifications (template already built)
2. **Document acknowledgment** — employee acknowledges receipt of company docs
3. **Set up Sentry + PostHog** — error tracking and analytics
4. **Announcements module** — company-wide notices
5. **Plan-based feature gating** — lock modules behind plan tier (Growth/Business)

---

## Known Issues / Gotchas

1. **pgvector extension**: Removed from migration — not available on free Supabase tier.
2. **Next.js version**: Pinned to 14.2.x. Do not upgrade without migration plan.
3. **eslint-config-next**: Pinned to `14.2.15` to match ESLint 8.
4. **Supabase CLI on Windows**: Global install fails. Use Supabase Dashboard SQL Editor for all migrations.
5. **TypeScript build errors**: `typescript: { ignoreBuildErrors: true }` in `next.config.js`. Root cause: Supabase v2 type inference returns `never` for partial selects.
6. **RLS bypass**: Server actions use admin Supabase client (service role key). Intentional — Clerk JWT → Supabase RLS not configured.
7. **New tables added post-migration**: `objectives` table added manually via SQL Editor. `reviews.objectives_id` added via ALTER TABLE.
8. **Supabase trigger function**: `update_updated_at_column()` must be created separately before running triggers (SQL Editor splits on semicolons).
9. **Razorpay `stripe_*` columns**: `organizations.stripe_customer_id` and `stripe_subscription_id` are reused for Razorpay subscription IDs — no schema change was made.
10. **Razorpay checkout script**: Loaded dynamically in `billing-section.tsx` via `loadRazorpayScript()` to avoid SSR issues.
11. **RBAC fallback**: If a user has no employee record (e.g. org creator before onboarding), `getCurrentUser()` defaults their role to `"admin"` so they retain full access.
12. **Employee page visibility**: The Employees page (`/dashboard/employees`) requires `manager` role or above in the sidebar nav. Employees cannot navigate to it, but the route itself is not hard-blocked — add middleware protection if needed.
