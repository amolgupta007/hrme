# CLAUDE.md — HRFlow Project Guide

## What is this project?

HRFlow is an all-in-one HR management SaaS platform for small and medium businesses (10–500 employees) who don't want to hire a dedicated HR professional. It handles employee directory, leave management, performance reviews, training & compliance, document storage, and payroll — all through a single web portal.

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
| `reviews` | Individual reviews | self_rating, manager_rating, goals (JSONB), status |
| `training_courses` | Course library | category (ethics/compliance/safety/etc), is_mandatory, due_date |
| `training_enrollments` | Employee ↔ Course | status, progress_percent, certificate_url |
| `holidays` | Company holidays | date, is_optional |

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
- NOT yet configured in Clerk dashboard — needs webhook endpoint URL after deployment

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

**Employee CRUD (code written, pending integration test)**
- [x] Server actions: listEmployees, addEmployee, updateEmployee, deleteEmployee, getEmployee, listDepartments
- [x] Employee data table with search, status badges, role/dept/type columns
- [x] Add/edit modal form with client-side validation
- [x] Soft delete (marks as "terminated" instead of hard delete)
- [x] Employee count limit enforcement based on plan

**API Webhooks**
- [x] Clerk webhook handler (org + user sync)
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
- [ ] SUPABASE_SERVICE_ROLE_KEY — **MUST SET** (Supabase Dashboard → Settings → API → service_role key). Required for employee CRUD to work.
- [x] NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY — set
- [x] CLERK_SECRET_KEY — set
- [ ] CLERK_WEBHOOK_SECRET — set after deployment (Clerk Dashboard → Webhooks)
- [ ] STRIPE_SECRET_KEY — not set yet
- [ ] STRIPE_WEBHOOK_SECRET — not set yet
- [ ] STRIPE_*_PRICE_ID — not set yet (create products in Stripe first)
- [ ] RESEND_API_KEY — not set yet
- [ ] SENTRY_DSN — not set yet
- [ ] NEXT_PUBLIC_POSTHOG_KEY — not set yet (app works without it)

**Employee CRUD integration**
- [x] Code is written and ready
- [ ] Requires `SUPABASE_SERVICE_ROLE_KEY` in .env.local to function
- [ ] Requires a manual row in `organizations` table matching Clerk org ID
- [ ] To create org row: Supabase Table Editor → organizations → Insert Row:
  - `clerk_org_id`: (find in Clerk Dashboard → Organizations → click your org → copy ID)
  - `name`: your company name
  - `slug`: your-company-slug
  - `plan`: starter
  - `max_employees`: 10
  - `settings`: `{}`
- [ ] After org row exists + service role key set, test: navigate to /dashboard/employees → Add Employee

### ❌ NOT YET BUILT — Pending Modules

**Phase 1 — Build next**
- [ ] Leave management module
  - [ ] Leave request form (employee side)
  - [ ] Leave approval workflow (manager/admin side)
  - [ ] Leave balance display
  - [ ] Team calendar view
  - [ ] Leave policy configuration (settings page)
  - [ ] Server actions: requestLeave, approveLeave, rejectLeave, getLeaveBalances
  - [ ] Email notification on leave request (use Resend + leave-request.tsx template)
- [ ] Document management
  - [ ] File upload (use Supabase Storage or Uploadthing)
  - [ ] Document categorization (policy, contract, ID, tax, certificate)
  - [ ] Company-wide vs employee-specific documents
  - [ ] Document acknowledgment tracking
- [ ] Settings page
  - [ ] Organization profile editing
  - [ ] Department CRUD
  - [ ] Leave policy CRUD
  - [ ] Billing management (Stripe Customer Portal redirect)
- [ ] Connect dashboard stats to live Supabase data
  - [ ] Total active employees count
  - [ ] Pending leave requests count
  - [ ] Training completion percentage
  - [ ] Compliance alerts count

**Phase 2 — After Phase 1 is stable**
- [ ] Performance reviews module
  - [ ] Review cycle CRUD
  - [ ] Self-assessment forms
  - [ ] Manager assessment forms
  - [ ] Goal setting and tracking
  - [ ] Review history and ratings
- [ ] Training & compliance module
  - [ ] Course CRUD
  - [ ] Employee enrollment and assignment
  - [ ] Progress tracking
  - [ ] Completion certificates
  - [ ] Compliance deadline alerts (background job)
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

### ❌ NOT YET DONE — Infrastructure & DevOps

- [ ] Deploy to Vercel
- [ ] Connect custom domain (Namecheap → Cloudflare DNS → Vercel)
- [ ] Configure Clerk webhook endpoint (needs deployed URL)
- [ ] Configure Stripe webhook endpoint (needs deployed URL)
- [ ] Set up Sentry error tracking
- [ ] Set up UptimeRobot monitoring
- [ ] Set up PostHog analytics
- [ ] Supabase Storage bucket for employee documents
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
| Growth | $5/employee/month | 200 | + Reviews, Training, Compliance |
| Business | $8/employee/month | 500 | + Payroll, Analytics, API, Priority support |

Configured in `src/lib/stripe.ts` as the `PLANS` object.

---

## Immediate Next Steps (in priority order)

1. **Set SUPABASE_SERVICE_ROLE_KEY** in `.env.local` (Supabase → Settings → API)
2. **Insert organization row** in Supabase matching your Clerk org ID
3. **Test Employee CRUD** — add, edit, search, terminate an employee
4. **Build Leave Management** — the first revenue-justifying feature
5. **Build Department CRUD** in Settings (needed for employee department dropdowns)
6. **Connect dashboard stats** to live data
7. **Deploy to Vercel** and configure webhooks
8. **Set up Stripe** billing with the 3 plan tiers

---

## Known Issues / Gotchas

1. **pgvector extension**: Remove the `CREATE EXTENSION IF NOT EXISTS "pgvector"` line from migration before running. Free Supabase tier doesn't have it.
2. **Next.js version**: Pinned to 14.2.x. npm may try to resolve to 16.x if using `^14.2.0`. Explicitly install `next@14.2.23`.
3. **eslint-config-next**: Must match Next.js major version. Pinned to `14.2.15`.
4. **Supabase CLI on Windows**: Global install fails. Use `npx supabase` or the Supabase Dashboard SQL Editor.
5. **Clerk org → Supabase sync**: Until the Clerk webhook is configured with a deployed URL, you must manually create the organization row in Supabase.
6. **RLS bypass**: Server actions use the admin Supabase client (service role key) which bypasses RLS. This is intentional since Clerk JWT → Supabase RLS integration requires extra config. For production, consider setting up Supabase custom JWT verification with Clerk tokens.
7. **`postinstall` script**: `package.json` has `"postinstall": "prisma generate || true"` — this is a no-op leftover. Can be removed safely.
