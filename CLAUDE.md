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
| Payments | Stripe | Subscription billing (per-employee pricing) |
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
│   │   ├── layout.tsx                # Root layout (Clerk, fonts, PostHog, Sonner)
│   │   ├── page.tsx                  # Marketing landing page (public)
│   │   ├── globals.css               # Design tokens (HSL CSS variables, light + dark)
│   │   ├── (auth)/                   # Auth routes (public)
│   │   │   ├── sign-in/[[...sign-in]]/page.tsx
│   │   │   └── sign-up/[[...sign-up]]/page.tsx
│   │   ├── (marketing)/              # Future marketing pages
│   │   ├── onboarding/page.tsx       # Post-signup org creation wizard
│   │   ├── api/webhooks/
│   │   │   ├── clerk/route.ts        # Syncs Clerk user/org events → Supabase
│   │   │   └── stripe/route.ts       # Manages subscription lifecycle
│   │   └── dashboard/                # Protected app (requires auth)
│   │       ├── layout.tsx            # Sidebar + Header shell
│   │       ├── page.tsx              # Dashboard home (stats, quick actions, setup checklist)
│   │       ├── employees/page.tsx    # Employee directory with CRUD
│   │       ├── leaves/page.tsx       # Leave management (placeholder)
│   │       ├── documents/page.tsx    # Document hub (placeholder)
│   │       ├── reviews/page.tsx      # Performance reviews (placeholder)
│   │       ├── training/page.tsx     # Training & compliance (placeholder)
│   │       ├── payroll/page.tsx      # Payroll (placeholder — Phase 3)
│   │       └── settings/page.tsx     # Org settings, billing, policies (placeholder)
│   ├── actions/                      # Server Actions (all mutations)
│   │   └── employees.ts             # list, add, update, delete, getDepartments
│   ├── components/
│   │   ├── ui/                       # Reusable primitives
│   │   │   ├── button.tsx            # CVA button with variants
│   │   │   ├── card.tsx              # Card compound component
│   │   │   └── badge.tsx             # Status badge with variants
│   │   ├── layout/
│   │   │   ├── sidebar.tsx           # Collapsible nav sidebar with Clerk UserButton
│   │   │   ├── header.tsx            # Top bar with search + notifications
│   │   │   └── posthog-provider.tsx  # Analytics provider wrapper
│   │   ├── dashboard/
│   │   │   ├── employees-client.tsx  # Employee page client wrapper (search, modal state)
│   │   │   ├── employee-table.tsx    # Data table with actions dropdown
│   │   │   └── employee-form.tsx     # Add/edit modal form with validation
│   │   ├── forms/                    # Shared form components (empty — build as needed)
│   │   └── emails/
│   │       └── leave-request.tsx     # React Email template for leave approvals
│   ├── config/
│   │   └── navigation.ts            # Sidebar nav items, app constants
│   ├── hooks/
│   │   ├── index.ts                  # Barrel export
│   │   └── use-employee.ts          # Client hook for current employee + org context
│   ├── lib/
│   │   ├── utils.ts                  # cn(), formatDate(), formatCurrency(), getInitials()
│   │   ├── stripe.ts                # Stripe client + PLANS config (starter/growth/business)
│   │   ├── resend.ts                # Resend email client
│   │   └── supabase/
│   │       ├── client.ts            # Browser Supabase client (for client components)
│   │       ├── server.ts            # Server Supabase client + Admin client (bypasses RLS)
│   │       └── index.ts             # Barrel export
│   ├── middleware.ts                 # Clerk route protection (public: /, /sign-in, /sign-up, /api/webhooks)
│   └── types/
│       ├── database.types.ts         # Supabase DB types (placeholder — matches migration schema)
│       └── index.ts                  # Row type shortcuts, UserRole, ROLE_HIERARCHY, ActionResult
├── supabase/
│   ├── config.toml                   # Supabase project config
│   └── migrations/
│       └── 001_initial_schema.sql    # Full schema: 12 tables, indexes, RLS, triggers
├── scripts/                          # Seed scripts (empty — build as needed)
├── public/                           # Static assets
├── .env.example                      # All required environment variables
├── package.json
├── tsconfig.json                     # Strict mode, path aliases (@/*)
├── tailwind.config.ts                # Custom theme with design tokens
├── next.config.js
├── postcss.config.js
├── vercel.json                       # Vercel deployment config (bom1 region)
├── .eslintrc.json
├── .prettierrc
└── .gitignore
```

---

## Database Schema (Supabase Postgres)

12 tables, all with `org_id` for multi-tenant isolation via RLS:

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `organizations` | Tenant root | clerk_org_id, plan, stripe_customer_id, max_employees |
| `employees` | Team directory | first_name, last_name, email, role, department_id, status, employment_type |
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
- RLS policies check `clerk_org_id` from Clerk JWT claims
- Admin Supabase client (`SUPABASE_SERVICE_ROLE_KEY`) bypasses RLS — used in server actions and webhooks
- **IMPORTANT**: The pgvector extension line was removed from the migration (not available on free Supabase). Use `pgvector` only in Phase 4 if needed.

### Auto-updated timestamps
Triggers on `organizations`, `employees`, `leave_requests` automatically update `updated_at`.

---

## Authentication & Authorization

### Clerk setup
- **Organizations enabled** — every user must belong to an org (Membership required)
- **Organization slugs enabled** — clean URLs
- **Auto-create first org** — enabled for streamlined onboarding
- **Limited membership**: 5 (free tier default, increase as needed)
- Roles: `owner`, `admin`, `manager`, `employee` — defined in `src/types/index.ts`
- `ROLE_HIERARCHY` and `hasPermission()` helper for role-based access control

### Route protection (middleware.ts)
- Public routes: `/`, `/sign-in(.*)`, `/sign-up(.*)`, `/api/webhooks(.*)`
- All other routes require authentication via Clerk

### Webhook sync (Clerk → Supabase)
- `POST /api/webhooks/clerk` handles: `organization.created`, `organization.updated`, `user.created`, `user.updated`
- **Configured** on Clerk dev instance pointing to `https://hrme-nine.vercel.app/api/webhooks/clerk`
- Verified working — org creation via Clerk triggers Supabase row creation

---

## Key Architecture Patterns

### Server Actions for mutations
All data mutations use Next.js Server Actions in `src/actions/`. Pattern:
```typescript
"use server";
import { auth } from "@clerk/nextjs/server";
import { createAdminSupabase } from "@/lib/supabase/server";

async function getOrgId() {
  const { orgId } = auth();
  // Resolve Clerk org → internal Supabase org UUID
}

export async function doSomething(data): Promise<ActionResult<T>> {
  const org = await getOrgId();
  if (!org) return { success: false, error: "Not authenticated" };
  // Validate with Zod, then CRUD via admin Supabase client
}
```

### ActionResult pattern
All server actions return `ActionResult<T>`:
```typescript
type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };
```

### Client components
Client-side pages follow this pattern:
- Server component page (`page.tsx`) renders a client wrapper
- Client wrapper manages state (search, modals, loading)
- Calls server actions for data fetching and mutations
- Uses `sonner` toast for success/error feedback

### Design tokens
All colors are HSL CSS variables in `globals.css`. Use `hsl(var(--primary))` pattern.
Primary color: teal (`172 50% 36%`). Accent: warm orange (`32 95% 52%`).
Light and dark themes are both defined.

---

## Current Status — What's Done vs Pending

### ✅ COMPLETED

**Infrastructure & Config**
- [x] Full project scaffolding (Next.js 14, TypeScript, Tailwind)
- [x] Tailwind config with custom design tokens (light + dark themes)
- [x] ESLint, Prettier, TypeScript strict mode configured
- [x] Path aliases (`@/*` → `./src/*`)
- [x] Vercel config (bom1 region for India proximity)

**Auth**
- [x] Clerk integration with ClerkProvider in root layout
- [x] Sign-in / sign-up pages
- [x] Middleware for route protection
- [x] Clerk Organizations enabled and configured

**Database**
- [x] Full Supabase migration (12 tables, indexes, RLS policies, triggers)
- [x] Migration successfully run on Supabase project `imjwqktxzahhnfmfbtfc`
- [x] NOTE: `pgvector` extension line must be removed/commented out before running migration

**App Shell**
- [x] Marketing landing page with hero, features grid, CTA, footer
- [x] Dashboard layout with collapsible sidebar + top header
- [x] Navigation config for all modules
- [x] Onboarding wizard (company name, industry, team size)
- [x] Dashboard home with stat cards, quick actions, setup checklist

**Employee CRUD**
- [x] Server actions: listEmployees, addEmployee, updateEmployee, deleteEmployee, getEmployee, listDepartments
- [x] Employee data table with search, status badges, role/dept/type columns
- [x] Add/edit modal form with client-side validation
- [x] Soft delete (marks as "terminated" instead of hard delete)
- [x] Employee count limit enforcement based on plan
- [x] Reporting Manager field (FK to employees.id) on add/edit form

**Directory**
- [x] Org chart tree view (`/dashboard/directory`)
- [x] Collapsible tree nodes — click chevron to collapse/expand branches

**Leave Management** (`/dashboard/leaves`)
- [x] Server actions: requestLeave, approveLeave, rejectLeave, cancelLeave, getLeaveBalances, listLeaveRequests
- [x] Employee leave request form with leave type, date range, reason
- [x] Manager approval/rejection workflow with comments
- [x] Leave balance display per employee per year
- [x] Leave policy configuration in Settings

**Document Management** (`/dashboard/documents`)
- [x] Supabase Storage bucket `documents` (private)
- [x] File upload with drag-and-drop (UploadDialog)
- [x] Categories: policy, contract, ID, tax, certificate, other
- [x] Company-wide vs employee-specific toggle
- [x] Requires-acknowledgment flag
- [x] Signed URL generation for secure downloads
- [x] Search + category filter tabs

**Settings** (`/dashboard/settings`)
- [x] Org profile editing (name)
- [x] Leave policies CRUD (type, days per year, carry-forward toggle)
- [x] Department management
- [x] Billing section with plan info and seat usage progress bar

**Sidebar Notification Badges**
- [x] Red dot/count on Leaves (pending requests), Documents (requires acknowledgment), Objectives (pending approvals)
- [x] `getPendingCounts()` in `src/actions/notifications.ts`
- [x] Sidebar shows pill count when expanded, dot on icon when collapsed

**Performance Reviews** (`/dashboard/reviews`)
- [x] Review cycle CRUD (draft → active → completed)
- [x] Per-employee review records auto-created when cycle is created
- [x] Reviewer assigned from `reporting_manager_id` (falls back to cycle creator)
- [x] Self-assessment: star rating (1–5), comments, ad-hoc goals with status
- [x] Manager review: rating + comments
- [x] View mode: side-by-side self vs manager ratings
- [x] Cycle progress bar (completed/total)

**Objectives / OKR** (`/dashboard/objectives`)
- [x] `objectives` table added (migration run manually in Supabase SQL Editor)
- [x] Employee creates quarterly/yearly objective sets with weighted items (must sum to 100%)
- [x] Status flow: draft → submitted → approved/rejected
- [x] Manager approval dialog with feedback
- [x] Rejected objectives show feedback + "Revise and resubmit" link
- [x] Objectives linked to reviews: employee evaluates each objective during self-review (status + progress % + comment)
- [x] Manager rates each objective during manager review (1–5 stars + comment)
- [x] Tabs: My Objectives | Pending Approvals | All Objectives (admin)
- [x] Sidebar badge for pending approvals (managers)

**Training & Compliance** (`/dashboard/training`)
- [x] Course library CRUD (title, category, duration, content URL, mandatory flag, due date)
- [x] Employee enrollment — admin assigns courses, prevents duplicate enrollment
- [x] Completion flow: self-attestation checkbox + certificate URL (required for mandatory courses)
- [x] Progress slider (0–95%) for in-progress tracking (separate from completion)
- [x] Compliance tab: stat cards, overdue alerts, per-course completion breakdown
- [x] "LMS Auto-Sync — Coming Soon" banner in Compliance tab
- [x] Tabs: My Training | Course Library (admin) | Compliance (admin)

**Deployment**
- [x] Deployed to Vercel at `https://hrme-nine.vercel.app`
- [x] Clerk webhook configured (dev instance → Vercel URL)
- [x] Auth redirects: sign-in → /dashboard, sign-up → /onboarding
- [x] `typescript: { ignoreBuildErrors: true }` in next.config.js (Supabase v2 type inference workaround)

**API Webhooks**
- [x] Clerk webhook handler (org + user sync) — verified working
- [x] Stripe webhook handler (subscription lifecycle)

**UI Components**
- [x] Button (CVA variants: default, destructive, outline, secondary, ghost, link)
- [x] Card (compound: Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter)
- [x] Badge (variants: default, secondary, destructive, success, warning, outline)

**Email Templates**
- [x] Leave request approval email (React Email)

**Utilities**
- [x] cn(), formatDate(), timeAgo(), formatCurrency(), getInitials(), slugify(), capitalize()
- [x] Supabase browser + server + admin clients
- [x] Stripe client with PLANS config
- [x] Resend client
- [x] PostHog provider
- [x] useEmployee hook for client-side context

### ⚠️ PARTIALLY DONE — NEEDS ATTENTION

**Environment Variables (.env.local)**
- [x] NEXT_PUBLIC_SUPABASE_URL — set (`https://imjwqktxzahhnfmfbtfc.supabase.co`)
- [x] NEXT_PUBLIC_SUPABASE_ANON_KEY — set
- [x] SUPABASE_SERVICE_ROLE_KEY — set
- [x] NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY — set
- [x] CLERK_SECRET_KEY — set
- [x] CLERK_WEBHOOK_SECRET — set (Clerk dev instance)
- [ ] STRIPE_SECRET_KEY — not set yet
- [ ] STRIPE_WEBHOOK_SECRET — not set yet
- [ ] STRIPE_*_PRICE_ID — not set yet (create products in Stripe first)
- [ ] RESEND_API_KEY — not set yet
- [ ] SENTRY_DSN — not set yet
- [ ] NEXT_PUBLIC_POSTHOG_KEY — not set yet (app works without it)

### ❌ NOT YET BUILT — Pending

**Near-term**
- [ ] Connect dashboard stats to live Supabase data (active employee count, pending leaves, training %, compliance alerts)
- [ ] Leave email notifications (Resend + leave-request.tsx template already exists)
- [ ] Document acknowledgment tracking (employee acknowledges receipt)
- [ ] Announcements / company-wide notices

**Phase 3 — Future**
- [ ] Payroll & compensation
  - [ ] Salary structure configuration
  - [ ] Payslip generation (PDF)
  - [ ] Bonus and incentive tracking
  - [ ] Tax calculation helpers
- [ ] Attendance (clock in/out, overtime)

**Phase 4 — AI Features (future)**
- [ ] AI-powered job description generator
- [ ] Semantic search across policies and documents (pgvector)
- [ ] Smart review summaries
- [ ] Attrition risk indicators

**Training — LMS Auto-Sync (planned, shown as Coming Soon in app)**
- [ ] Webhook receivers for Coursera, LinkedIn Learning, TalentLMS, Docebo, Google Classroom
- [ ] Auto-update `training_enrollments.status` and `progress_percent` on completion event

### ❌ NOT YET DONE — Infrastructure & DevOps

- [ ] Connect custom domain (Namecheap → Cloudflare DNS → Vercel)
- [ ] Switch Clerk to production instance (requires custom domain first)
- [ ] Configure Stripe webhook endpoint (needs deployed URL)
- [ ] Set up Sentry error tracking
- [ ] Set up UptimeRobot monitoring
- [ ] Set up PostHog analytics
- [ ] Background jobs (Trigger.dev or Inngest) for:
  - [ ] Leave approval email notifications
  - [ ] Training deadline reminders
  - [ ] Compliance alerts
  - [ ] Payroll calculations

---

## Development Commands

```bash
npm run dev           # Start dev server (http://localhost:3000)
npm run build         # Production build
npm run lint          # ESLint check
npm run db:generate   # Regenerate Supabase types (needs CLI)
npm run db:push       # Push migrations (needs CLI)
npm run stripe:listen # Forward Stripe webhooks to localhost
```

---

## Coding Conventions

### File naming
- Components: PascalCase (`EmployeeForm.tsx` or `employee-form.tsx` — project uses kebab-case)
- Server actions: camelCase functions in kebab-case files (`employees.ts` → `addEmployee()`)
- Types: PascalCase for types/interfaces, UPPER_SNAKE for constants

### Server actions pattern
- Always `"use server"` at top
- Always validate with Zod before DB operations
- Always check auth with `getOrgId()` helper
- Always return `ActionResult<T>`
- Always `revalidatePath()` after mutations
- Use `createAdminSupabase()` (bypasses RLS) since Clerk JWT → Supabase RLS integration is not configured

### Component pattern
- Server components by default (no `"use client"` unless needed)
- Client components only when: useState, useEffect, event handlers, browser APIs
- Use `sonner` toast for user feedback (toast.success / toast.error)
- Use `lucide-react` for all icons

### Styling
- Tailwind utility classes only — no custom CSS except in globals.css
- Use `cn()` from `@/lib/utils` for conditional classes
- Use CSS variables for colors: `bg-primary`, `text-muted-foreground`, etc.
- Follow the design token system in `globals.css`

### Form pattern
- Client-side validation first (inline, no library needed for simple forms)
- Server-side Zod validation in server actions
- Display errors below fields
- Loading state on submit button
- Toast on success/error

---

## Pricing Model

| Tier | Price | Max Employees | Features |
|------|-------|---------------|----------|
| Starter | Free | 10 | Directory, Leave, Basic docs |
| Growth | ₹500/employee/month | 200 | + Reviews, Training, Compliance |
| Business | ₹800/employee/month | 500 | + Payroll, Analytics, API, Priority support |

Configured in `src/lib/stripe.ts` as the `PLANS` object.

---

## Immediate Next Steps (in priority order)

1. **Connect dashboard stats** to live Supabase data (employee count, pending leaves, training %, compliance)
2. **Set up Stripe** — create products/prices, set env vars, test billing flow
3. **Custom domain** — point Namecheap domain via Cloudflare DNS to Vercel
4. **Switch Clerk to production instance** — requires custom domain first
5. **Set up Resend** — enable leave email notifications (template already built)
6. **Set up Sentry + PostHog** — error tracking and analytics

---

## Known Issues / Gotchas

1. **pgvector extension**: Removed from migration — not available on free Supabase tier. Use only in Phase 4.
2. **Next.js version**: Pinned to 14.2.x. Explicitly installed as `next@14.2.23`.
3. **eslint-config-next**: Pinned to `14.2.15` to match ESLint 8.
4. **Supabase CLI on Windows**: Global install fails. Use Supabase Dashboard SQL Editor for all migrations.
5. **TypeScript build errors**: `typescript: { ignoreBuildErrors: true }` added to `next.config.js`. Root cause: Supabase v2 `PostgrestVersion:12` type inference returns `never` for partial selects. Workaround: cast with `as { id: string }` or use `ignoreBuildErrors`. Proper fix: run `npm run db:generate` against live Supabase to regenerate types.
6. **ESLint no-unused-vars**: `@typescript-eslint/no-unused-vars` rule removed from `.eslintrc.json` (plugin not installed). Replaced with `no-unused-vars: "off"`.
7. **RLS bypass**: Server actions use admin Supabase client (service role key) which bypasses RLS. Intentional — Clerk JWT → Supabase RLS integration not configured.
8. **Clerk production instance**: Still on dev instance. Switch to production instance only after custom domain is configured (Clerk requires a verified domain for production).
9. **`postinstall` script**: Removed from `package.json` (was a no-op `prisma generate || true` leftover).
10. **New tables added post-migration**: `objectives` table was added manually via Supabase SQL Editor (not in the initial migration file). `reviews` table has an `objectives_id` column added via `ALTER TABLE`.
11. **Supabase trigger function**: `update_updated_at_column()` function may not exist if running fresh migrations — create it separately before using it in triggers (Supabase SQL Editor splits on semicolons, so create the function and the table in separate queries).
