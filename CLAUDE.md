# CLAUDE.md — JambaHR Project Guide

## What is this project?

JambaHR is an all-in-one HR management SaaS platform for small and medium businesses (10–500 employees). Handles employee directory, leave management, performance reviews, training & compliance, document storage, payroll, and ATS — all through a single web portal.

**Target customer**: Business owners / decision-makers at companies with 10–500 employees.
**Two user types**: Admins (company owners/HR) and Employees (self-serve).

---

## Feature Specs (PRDs)

Feature specs live in `/docs/prds/`. Always read the relevant PRD before planning a feature, and flag any divergence between the PRD's assumed data model and the actual schema. The PRD describes the target; inspect the real codebase and reconcile.

Mobile PRDs live in `/docs/prds/mobile/` and are future-state specs; always inspect `apps/web` and the real schema for divergence before implementing. Known divergence record: `docs/prds/mobile/01A-MIGRATION-PLAN.md` §1 (notably: there is NO Clerk-JWT→Supabase RLS path — mobile uses the BFF approach per its Decision Record).

---

## Tech Stack

| Layer | Tool |
|-------|------|
| Framework | Next.js 14 (App Router), TypeScript strict |
| Styling | Tailwind CSS 3.4 + Radix UI + CVA + tailwind-merge |
| Auth | Clerk (user identity / sessions / phone-OTP only — **Clerk Organizations decoupled** 2026-06-18; multi-tenancy lives in Supabase `organizations` + `employees`) |
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

**Monorepo since 2026-07-05 (Mobile PRD-01 Phase B):** Turborepo + npm workspaces. The Next.js app moved to **`apps/web`** (Vercel Root Directory = `apps/web`). `docs/`, `supabase/` (migrations), and `CLAUDE.md` stay at the repo root. `.env.local` lives in **`apps/web/.env.local`**. `apps/mobile` (Expo) landed in Phase C (2026-07-05).

```
jambahr/  (repo root)
├── apps/web/             # the entire Next.js app — src/, public/, tests/, scripts/,
│                         #   eslint-rules/, next.config.js, vercel.json (18 crons), sentry configs
├── apps/mobile/          # Expo SDK 57 + expo-router + NativeWind shell (Phase C, 2026-07-05):
│                         #   Clerk sign-in → BFF /api/mobile/* (Bearer + X-Org-Id) — NO direct
│                         #   Supabase from mobile, ever. Tokens from @jambahr/config/tokens.
├── packages/shared/      # @jambahr/shared — pure types/schemas/compute (web + mobile):
│                         #   attendance compute (week-off, lateness, daily-attendance, pair-punches,
│                         #   shift-time, attribute-date, ot, overtime-types, late-penalty-bands),
│                         #   payroll (ctc, line-items, late-penalty), phone, plans, format, types
├── packages/supabase/    # @jambahr/supabase — generated Database types (db:generate writes here)
├── packages/config/      # @jambahr/config — tsconfig base
├── turbo.json / package.json (workspaces) / .github/workflows/ci.yml (lint+test+typecheck gate)
```

**Extraction shims:** every module moved to `packages/*` left a one-line `export * from "@jambahr/…"` shim at its old `apps/web/src/...` path, so `@/lib/...`/`@/types/...`/`@/config/plans` imports still work. New code may import `@jambahr/shared/...` directly. `cn()` stays web-only in `@/lib/utils`.

Layout of `apps/web/src/` (paths below are relative to `apps/web/`):

```
src/
├── app/
│   ├── layout.tsx / globals.css / global-error.tsx
│   ├── page.tsx                    # Marketing landing page
│   ├── (auth)/sign-in, sign-up
│   ├── onboarding/page.tsx
│   ├── blog/[slug]/page.tsx        # SSG markdown blog
│   ├── careers/[slug]/page.tsx     # Public job listings (no auth)
│   ├── offers/[token]/page.tsx     # Candidate accept/decline (no auth)
│   ├── hire/                       # JambaHire ATS (Business tier, layout + 6 pages)
│   ├── insights/                   # Analytics module (Business tier, dark canvas, layout + 6 tabs)
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
│   ├── insights/                   # insights-nav, kpi-card, chart-card, charts (recharts wrappers), csv/print buttons
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

### Clerk — identity only (Organizations decoupled 2026-06-18)
- Production instance on `jambahr.com`. **Clerk Organizations are NO LONGER used** (dropped because per-org membership was capped at 20 with an expensive add-on tier). Clerk supplies `userId` + sessions + sign-in/up UI + `<UserButton>` + email auth + phone-OTP only. `auth().orgId` is never read anywhere.
- Roles: `owner` | `admin` | `manager` | `employee` (see `src/types/index.ts`)
- `ROLE_HIERARCHY` + `hasPermission()` in types

### Multi-tenancy & active-org model (Option 0 — `src/lib/auth/active-org.ts`)
- An org membership = a non-terminated `employees` row linking `clerk_user_id` → `org_id` + `role`. **One login can belong to many orgs.**
- Active org = the org named by the signed cookie `jambahr_active_org` **iff** the caller has a membership in it; otherwise the first membership by `employees.created_at ASC`. `resolveActiveOrg(memberships, cookieOrgId)` is the pure resolver. The cookie is only a hint — `getCurrentUser` re-validates it against real membership every request, so a tampered cookie can't reach a non-member org. Cookie is `httpOnly`/`secure`/`sameSite=lax`/1yr.
- `getMyOrgs()` + `switchActiveOrg(orgId)` (`src/actions/active-org.ts`) power the **top-left org switcher** (`src/components/layout/org-switcher.tsx`, mounted in `Header`) + "Create organization" dialog (`create-org-dialog.tsx`).
- `createOrganization({ name, ...legal })` (`src/actions/organizations.ts`) is the single org-creation path (onboarding + create-additional-org): inserts the org row with **no `clerk_org_id`**, seeds owner `employees` row + leave policies + holidays (from `src/config/onboarding-seed.ts`) + onboarding steps, records legal acceptance, fires founder+welcome emails best-effort, sets the active cookie. The old client-side Clerk `createOrganization` + `syncOrgToSupabase` are gone.
- **Invitations are our own Resend emails** (`AccountSetupEmail`), not Clerk org invitations. Admin adds an email/phone employee → Resend "set up your account" email → on first sign-in `getCurrentUser`'s email/phone auto-link backfills `clerk_user_id` onto the row (this is how an invitee "joins"). Phone-only employees are provisioned directly (`provisionPhoneOnlyUser` now makes **no** Clerk org-membership call — that was the quota bug). All `createOrganizationInvitation`/`revokeOrganizationInvitation` removed.
- Clerk webhook (`api/webhooks/clerk/route.ts`) now handles **only** `user.created` (log) + `user.updated` (name/avatar sync). All `organization.*` / `organizationMembership.*` cases removed.
- `organizations.clerk_org_id` column is **vestigial** (kept, unused; drop later). No table queries resolve tenancy by it anymore — every action resolves the internal org id via `getCurrentUser()`.

### Mobile BFF (`/api/mobile/*`) — Phase C, shipped 2026-07-06
- Mobile (`apps/mobile`) authenticates with `@clerk/clerk-expo` (same Clerk instance) and calls
  `/api/mobile/*` route handlers with `Authorization: Bearer <session token>`; clerkMiddleware
  verifies it. Routes are in the middleware public matcher (they 401 JSON themselves — no
  sign-in redirect for API clients).
- Active org: `X-Org-Id` header instead of the `jambahr_active_org` cookie. `getCurrentUser`
  accepts `{ orgIdHint }` — validated against real memberships by `resolveActiveOrg`, same
  tamper-safety as the cookie. No hint/invalid hint → first membership.
- Contract types live in `@jambahr/shared/auth/types` (`MobileMeResponse` etc.) — the thin
  auth interface from PRD-01; web route and mobile client both import them.
- Rule: mobile NEVER gets a Supabase client. All mobile data = new `/api/mobile/*` endpoints
  reusing the existing server-action guards.
- **Mobile app structure** (`apps/mobile/src/`, Expo Router root is `src/app/`, NOT `app/`):
  `src/app/_layout.tsx` (Sentry + ClerkProvider + SessionProvider), `src/app/index.tsx` (auth gate +
  role router), `src/app/(auth)/sign-in.tsx`, `src/app/(staff)/…` (Home/Attendance/Leave/Payslips/Profile),
  `src/app/(admin)/…` (Home/Approvals/People/Reports/Profile), `src/lib/api.ts` (BFF fetch,
  Bearer + X-Org-Id), `src/lib/session.tsx` (`/api/mobile/me` context), `src/lib/sentry.ts`
  (Sentry init, DSN-gated). Design tokens come from `@jambahr/config/tokens` (single source,
  drift-tested against the web theme in `apps/web/tests/design-tokens/`). Full dev-loop /
  env-var docs: `apps/mobile/README.md`.
- **Mobile gotchas** (cost real debugging time in Tasks 3–7 — do not "fix" these without reading
  the history first):
  - **Expo Go on iOS is frozen at SDK 54** (App Store review stall since ~May 2026; see
    expo.dev/changelog/expo-go-and-app-store-may-2026). The working device loop today is
    **Android**: sideload the Expo Go 57 APK from expo.dev/go. iPhone testing waits on the
    Apple Developer org enrollment (D-U-N-S initiated 2026-07-05, pending) → then EAS
    development builds / `eas go` via TestFlight.
  - Root `npm run dev` starts **only** the web app (`turbo dev --filter=web`). Metro is
    separate: `npm run dev:mobile` from root, or `npx expo start` from `apps/mobile`. Running
    two Metros against one project causes a port clash + Expo Go confusion.
  - `npx expo start --clear` is required after any babel/metro/tailwind config change — Metro's
    transform cache serves stale resolutions otherwise.
  - `apps/mobile/metro.config.js` has a **load-bearing** `resolveRequest` pinning
    `react-native-css-interop` to a single instance (npm can't hoist it past the web app's
    React 18; two copies silently no-op NativeWind styles on device). **Do not modify this
    file** without understanding why it's there.
  - `apps/mobile/eslint.config.js` is a **manual port** of `eslint-config-expo/flat/default.js`
    (the stock config's `require('eslint/config')` resolves the monorepo root's ESLint 8 and
    crashes). Re-sync it by hand if upstream `eslint-config-expo` changes.
  - The Clerk **dev** instance had `force_organization_selection: true`, which held mobile
    sessions in `pending` (`isSignedIn` stays false — sign-in appears to silently bounce back).
    PATCHed off on the dev instance 2026-07-06. **Check the production Clerk instance for the
    same setting before pointing the mobile app at prod** — custom native auth flows don't
    auto-handle Clerk session tasks the way the web `<SignIn>` components do.
  - Phone-OTP sign-in does not deliver SMS on the dev Clerk instance (MSG91 webhook is wired to
    the production instance only). Use email-code as the dev sign-in factor.
  - Windows Firewall must allow Node.js on private networks or a phone can't reach Metro (8081)
    or the BFF (3000). `npx expo start --tunnel` is the fallback.

### Mobile Phase D (Staff MVP) — PLANNED, awaiting go-ahead (2026-07-06)
- **Decision record: `docs/prds/mobile/02A-PHASE-D-DECISIONS.md`** (read before implementing
  any Phase D work) · Slice-1 task plan: `docs/superpowers/plans/2026-07-06-mobile-phase-d-slice1-attendance-home.md`
  · Specs: `docs/prds/mobile/02-PRD-Staff-MVP.md` + `PRD-addendum-mobile-data-layer.md` (binding).
- Slices: **D1** attendance + home (punch, offline queue, month calendar, EAS Android dev
  build) → **D2** leave (incl. half-day — mobile-first, no web UI for it) + payslips (native
  render, no PDF) + profile → **D3** push (new PRD), FlashList sweep, payslip PDF.
- Locked decisions (detail in 02A): mobile punches go through **`attendance_punch_events`
  (`source:'mobile'`) + `recomputeAttendanceDay`**, never web's direct `attendance_records`
  write; idempotency via new `client_event_id` column; mobile GPS punches **bypass zone
  filtering**; month calendar = new pure `computeMonthCalendar` in `packages/shared`; leave
  balances are **derived by aggregation** (`leave_balances` table is written by nothing — the
  dashboard widget reading it is a known bug); regularization v1 = **pending punch events**
  approved via the existing web punch-review flow (no new table); all mobile data via composed
  `/api/mobile/*` BFF endpoints (one per screen), DTOs in `packages/shared/src/mobile/`;
  TanStack Query + MMKV per the addendum (**MMKV/FlashList need a dev build, not Expo Go**).
- Known web gaps found during Phase D investigation (fix candidates): `cancelLeave` lacks an
  ownership check; `requestLeave` lacks server-side overlap/balance validation; web `clockIn`
  direct-write contends with the ADMS rollup upsert (last writer wins).

### Route protection (`middleware.ts`)
Public: `/`, `/sign-in(.*)`, `/sign-up(.*)`, `/api/webhooks(.*)`, `/api/cron(.*)`, `/blog(.*)`, `/careers(.*)`, `/offers(.*)`, `/apply/r(.*)`, `/pricing`, `/api/attendance/punch`, `/sitemap.xml`, `/robots.txt`, `/privacy`, `/terms`

> `/api/cron(.*)` is exempted from Clerk so Vercel-Cron requests reach the route handlers — each handler still enforces `Bearer ${CRON_SECRET}`. Before this exemption (added 2026-05-09), Clerk silently rewrote cron requests to `/_not-found` and ALL crons failed silently. `/apply/r(.*)` is exempted to support the public referral apply flow.

### RBAC — `src/lib/current-user.ts`
- `getCurrentUser()` → `{ orgId, clerkUserId, role, employeeId, plan, jambaHireEnabled, attendanceEnabled, grievancesEnabled }`
- `isAdmin(role)` → owner | admin
- `isManagerOrAbove(role)` → owner | admin | manager
- Resolution: loads ALL `employees` rows for the `clerk_user_id` (joined to organizations), resolves the active org via the cookie, returns that org's role. If zero memberships exist it runs the email→phone auto-link once, then returns **`null`** (signed-in but org-less → dashboard layout redirects to `/onboarding`). The old synthetic-`admin` fallback was removed (2026-06-18) — a missing employee row no longer silently grants admin.

### Dual reporting managers (shipped 2026-07-16)
Employees support TWO reporting managers (`employees.reporting_manager_2_id`, migration `101`), with permanently equal powers — not temporary delegation. Relationship helpers live in `src/lib/managers.ts` (`managerIdsOf`, `isManagerOfEmployee`, `getDirectReportIds`) — always use them rather than re-deriving the relationship. Either manager sees the employee's pending objectives (list/count widened; approve/reject guards were already org-wide role-gated and stayed unchanged) and can submit the shared manager review (`reviews.manager_review_submitted_by` audits who actually submitted). Manager scope for attendance/punch approvals = department-head members ∪ direct reports (`getManagerScopedEmployeeIds`). Leave request emails route to the employee's manager(s)-of-record + owner/admins, falling back to the all-manager blast when no manager is set.

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
| requestLeave (for someone else) | self always; manager for direct reports; admin for anyone (org-membership of target verified) |

**RBAC hardening (2026-07-16/17, commits `a5705fa`..`078224c`):** `/dashboard/settings` redirects non-admins before fetching anything (matches sidebar `requiredRole: "admin"`); `getOrgProfile` is admin-only; `bootstrapDefaultShiftIfMissing` is no longer exported from the `"use server"` file (was a browser-callable cross-tenant write); reporting-manager dropdowns list only manager/admin/owner roles; **`updateEmployee` preserves `role='owner'` on the target row** — the edit dialog has no Owner option and previously demoted any edited owner to admin (de-owned 4 live orgs before being caught; all restored). Ownership changes only via the Transfer Ownership flow. Employee/Directory search is null-safe on `email` (phone-only staff crashed both pages).

### Transfer ownership (shipped 2026-06-19)
- **`ownership_transfers` table** added by migration `069_ownership_transfers.sql`. Columns: `org_id`, `from_employee_id`, `to_email`, `to_phone`, `to_employee_id`, `token` (UNIQUE), `status` (`pending`/`accepted`/`cancelled`/`expired`), `expires_at` (14 days), `created_placeholder` (bool — true when initiate created a brand-new placeholder employee row; gates cleanup). Partial UNIQUE index on `(org_id) WHERE status = 'pending'` enforces one pending transfer per org. Migration **applied to live DB 2026-06-19** (version `20260619104834`).
- **Owner-only initiate** (`isOwner` guard in `src/types/index.ts`): Settings → "Transfer ownership" section calls `initiateOwnershipTransfer({ email?, phone?, name? })` (`src/actions/ownership.ts`). Blocks self-transfer and double-pending. Finds or creates a placeholder `employees` row for the invitee (role `'admin'`, status `'active'`) if no matching member exists; sends `OwnershipTransferEmail` via `NOREPLY_EMAIL_FROM`. `cancelOwnershipTransfer` and `resendOwnershipTransfer` are also owner-only; cancel cleans up the placeholder it created, resend re-sends the email reusing the **same** token (does NOT regenerate it).
- **Claim page** at `/transfer/[token]` — **auth-protected** (NOT public; absent from middleware public matcher). Clerk auto-link makes the invitee an org member first (existing `getCurrentUser` email/phone backfill). Invitee calls `getOwnershipTransferByToken(token)` to render the T&C acceptance UI, then `acceptOwnershipTransfer(token)` or `declineOwnershipTransfer(token)`.
- **Claim actions are Clerk-identity scoped, not active-org scoped**: `auth()` email/phone + token are the sole identity check (`identityMatches` in `src/lib/ownership/transitions.ts`) — a tampered active-org cookie cannot widen access.
- **`acceptOwnershipTransfer`** atomically: flips invitee `employees.role` to `'owner'`; flips current-owner `employees.role` to `'admin'`; sets transfer `status = 'accepted'`; re-stamps org legal (`terms_accepted_at`, `privacy_policy_accepted_at`, `policy_version_accepted = LATEST_POLICY_VERSION`); sends `OwnershipTransferredEmail` to both parties.
- **v1 limitation**: while a transfer is pending, the new-owner placeholder is a real `employees` row (status `'active'`, role `'admin'`) so it appears in the employee directory and counts toward headcount / the `max_employees` seat limit until accept/cancel/decline/expire (one row per pending transfer; cleaned up automatically on resolve).
- **Placeholder cleanup**: on cancel, decline, or expiry — if the transfer's `created_placeholder` flag is true AND the invitee's `employees` row still has no `clerk_user_id` linked, that placeholder row is deleted to avoid orphan rows. Gating on `created_placeholder` (not a role/`clerk_user_id` heuristic) prevents deleting a real reused admin who simply hasn't signed in yet.
- **Expiry cron** `/api/cron/ownership-transfer-expiry` (`30 4 * * *` UTC = 10:00 IST): flips `pending` transfers past `expires_at` to `expired` and cleans up unlinked placeholder employees.
- Pure guards (`canAccept`, `canCancel`, `identityMatches`, `isExpired`) in `src/lib/ownership/transitions.ts`. All mutations in `src/actions/ownership.ts`.

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

### Indeed Integration (feat/indeed-integration, pending go-live)

Jobs board connector allowing JambaHR to post open roles to Indeed and receive applicants inbound. Ships inert behind `INDEED_LIVE=true` — **Indeed must approve JambaHR as an ATS partner before the live client is activated**.

**Schema**: migration `068_indeed_job_sync.sql` adds five columns to `jobs`: `indeed_enabled`, `indeed_job_id`, `indeed_status` (CHECK `pending`/`posted`/`expired`/`error`, nullable), `indeed_synced_at`, `indeed_sync_error`. Migration **applied to live DB 2026-06-19** (version `20260619015705`).

**Boundary module** (`src/lib/indeed/`): `types.ts` (Zod schemas + TypeScript types), `signature.ts` (HMAC-SHA1 verify), `job-mapper.ts` (job row → Indeed posting payload), `application-mapper.ts` (Indeed webhook payload → `MappedApplication`), `oauth.ts` (client credentials token fetch), `client.ts` (real HTTP client), `sandbox.ts` (no-network stub), `index.ts` (factory), `sync.ts` (push/expire), `ingest.ts` (webhook → DB).

**Client factory**: `getIndeedClient()` (`src/lib/indeed/index.ts`) returns the sandbox unless `INDEED_LIVE=true` AND `INDEED_CLIENT_ID` AND `INDEED_CLIENT_SECRET` are all set.

**Env vars**: `INDEED_LIVE`, `INDEED_CLIENT_ID`, `INDEED_CLIENT_SECRET`, `INDEED_APPLY_SHARED_SECRET`.

**Outbound**: per-job "Post to Indeed" toggle (`toggleIndeedPosting`) writes `indeed_enabled`; `pushJobToIndeed` (`src/lib/indeed/sync.ts`) runs via `waitUntil` on job create/update/status-change. An active+enabled job is upserted (`indeed_status='posted'`); disabling the toggle or pausing/closing a previously-posted job expires it via `client.expireJob` → `indeed_status='expired'`. Reconcile cron `/api/cron/indeed-sync-reconcile` (`45 4 * * *` UTC) re-pushes `indeed_enabled` jobs that are `error`/`pending`/never-synced.

**Inbound**: `/api/webhooks/indeed` verifies `X-Indeed-Signature` (HMAC-SHA1, `INDEED_APPLY_SHARED_SECRET`) → `webhook_events` dedup → `ingestIndeedApplication`. Applicants land as `candidates.source='indeed'` + `applications.stage='applied'`, entering the normal pipeline. Résumés are stored in the `documents` Supabase bucket.

**Dev helper**: `simulateIndeedApplication(jobId)` (sandbox only) fires a signed sample payload at the local webhook route — lets you exercise the full inbound path without a real Indeed account.

**Tests**: `tests/indeed/signature.test.ts`, `tests/indeed/job-mapper.test.ts`, `tests/indeed/application-mapper.test.ts` (all pure unit, no network/DB).

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

### Phase 1 — Shifts + Week-Off (PRD 01, shipped 2026-06-07)

- **Shift Master** at Settings → Attendance → Shift Master. Each shift has name,
  start/end (auto-detects overnight), total_hours (auto-computed from
  start/end minus break), break/grace/half-day-threshold minutes, OT-eligible,
  default flag, active flag. At most one default per org. Case-insensitive
  unique on `(org_id, lower(name))`.
- **Shift Assignments** at Settings → Attendance → Shift Assignments. Admin
  assigns a shift to one or more employees, or to a whole department, for a date
  range (blank to-date = ongoing). Latest `date_from <= today` wins at resolve
  time (no conflict detection in Phase 1).
- **Week-Off Policy** at Settings → Attendance → Week-Off Policy. Org-level only
  in Phase 1. 5-day week = pick 2 off days; 6-day = pick 1.
- **Overnight attribution** is hard-coded to start-date in Phase 1
  (configurable per-org in Phase 2). `attendance_records.attributed_date` mirrors
  the `date` column when a shift is assigned and overnight clock-ins map to the
  prior IST date.
- **`clockIn`** writes `shift_id` + `attributed_date` when an active assignment
  exists; otherwise behaves as before (today IST).
- **Auto-clockout cron** prefers the row's assigned shift hours; falls back to
  `organizations.settings.attendance.standard_workday_hours`.
- **`WorkingHoursCard`** moved from `/dashboard/attendance` to
  `Settings → Attendance` (Phase 1 consolidation per PRD §8).

**Phase 1 gotchas:**
- Migrations 029–032 are idempotent and applied via Supabase MCP. Migration 028
  number was taken by the orphan `assistant_insights` (Phase 5 revert); we
  start at 029.
- The original `UNIQUE (org_id, employee_id, date)` constraint on
  `attendance_records` is preserved. Overnight shifts uphold uniqueness because
  `date = attributed_date = shift start date`.
- `clockOut` still matches by **today's IST date**. Clocking out next morning
  for an overnight shift is a Phase 2 follow-up (the lookup must widen to
  `attributed_date = yesterday`).
- All Phase 1 mutations are **admin-only**. Manager-scoped assignment lands in
  Phase 2 with the roster grid.
- The "Settings → Attendance" CollapsibleSection only renders when
  `attendanceEnabled && isAdmin`. Non-admins see no shift configuration UI.
- `bootstrapDefaultShiftIfMissing()` runs inside `listShifts` and seeds a
  "General" shift from the org's existing `standard_workday_hours`. Safe to
  call repeatedly — only inserts when zero shifts exist.
- Shift master and week-off-policy RLS policies use the Clerk-JWT pattern
  (`auth.jwt() ->> 'org_id'` + `org_role IN ('org:owner','org:admin')`),
  matching `009_jambahire_rls.sql` and `018_payroll_schema_capture.sql`.
  Service-role bypasses today (CLAUDE.md gotcha #5).

### Phase 2 — Roster + Overtime + Week-off overrides (PRD 01, shipped 2026-06-08)

- **Weekly roster grid** at `/dashboard/attendance` → Roster tab. Drag-shift-into-cell using @dnd-kit (reuses JambaHire pipeline pattern). Manager+ visible; admins see all employees, managers see only own department (via `departments.head_id`).
- **`shift_assignments.type ∈ {fixed, rotational}`** (migration 037). Rotational chips render as tentative (lighter colour + `?`). Drag-to-fix or `setAssignmentType(id, "fixed")` promotes.
- **`getRosterGrid({ from, to })`** returns `{ days, rows, shifts }`. Each `RosterCell` has `assignment_id`, `shift_id`, `shift_name`, `type`.
- **`assignShiftToCell({ employee_id, shift_id, date })`** writes a single-day assignment (`date_from = date_to = date`). Manager-scope enforced via `getManagerScopedEmployeeIds(orgId, managerId)`.
- **Conflict detection** is SOFT — `detectAssignmentConflicts` returns a `Conflict[]` for `double_assigned / week_off / inactive_shift`, surfaced as `toast.warning`. Server does NOT block; admin/manager can override.
- **Overtime**: new `ot_records` table (migration 038), new `'overtime'` category on `payroll_line_items` (migration 039).
- **OT master toggle** at `organizations.settings.attendance.overtime.enabled` (default `false`). Gates: `computeAndRecordOvertime`, `pushOvertimeToPayroll`, Overtime tab visibility, Compute + Push buttons. Approve/Reject still work when disabled (drain pending queue).
- **OT compute**: per-day = `worked_minutes - shift_total_minutes` (positive only). Weekly = `total_worked_minutes - threshold_hours × 60`. Uses `attendance_records.shift_id → shifts.total_hours` from Phase 1.
- **OT approval flow**: `pending → approved | rejected → pushed` after admin clicks "Push to payroll". `payroll_line_item_id` back-pointer on `ot_records` is the idempotency guard.
- **`pushOvertimeToPayroll(month)`**: hourly rate = `gross_monthly / (working_days × shift.total_hours)`. Amount (₹) = `OT minutes / 60 × hourly rate × multiplier`. Inserts `payroll_line_items` row (category `'overtime'`, taxable=true), then calls `recomputeEntryFromLineItems(entryId)` for TDS reroll. (Helper extracted into `src/lib/payroll/recompute-entry.ts` so both `payroll.ts` and `overtime.ts` import it.)
- **Per-employee week-off override** (migration 040, `employee_week_off_override` table, UNIQUE on employee_id). Override fully REPLACES org policy for that employee (not a merge).
- **Per-department week-off override** (migration `100`, 2026-07-04, `department_week_off_override` table, UNIQUE on department_id; mirrors the employee table incl. `alt_saturday_rule`). **Precedence: employee override > department override > org policy** via `resolveEffectiveWeekOff(policy, deptOverride?, empOverride?)` in `src/lib/attendance/week-off.ts`. Both overrides are now actually consumed: the roster conflict check resolves each employee's effective week-off — `/dashboard/attendance/page.tsx` builds a `weekOffByEmployee` map (loads `listAllWeekOffOverrides` + `listAllDepartmentWeekOffOverrides`, resolves per employee via `department_id`) → `AttendanceClient` → `RosterGrid` (was previously ignoring even the employee override). Settings UI: one "Week-off overrides" card (`week-off-override-list.tsx`) with an Employee/Department scope toggle in the dialog + separate By-department / By-employee sub-lists. Actions `get/upsert/delete/listAllDepartmentWeekOffOverride(s)` in `src/actions/week-off.ts`.
- **`isWeekOff(date, policy, override?)`** v2 — back-compatible third arg; uses override if given, else policy.
- **Alternate-Saturday support** (migration 041, `week_off_policy.alt_saturday_rule TEXT CHECK IN ('none', 'odd_off', 'even_off')`). `odd_off` = 1st + 3rd Saturdays off; `even_off` = 2nd + 4th. Saturday only; doesn't affect other days. **Migration 099 (2026-07-04) adds the same `alt_saturday_rule` column to `employee_week_off_override`** — migration 041 only added it to `week_off_policy`, but `upsertEmployeeWeekOffOverride` + the override read paths (`src/actions/week-off.ts`) always wrote/selected it, so *every* add/read of a per-employee override failed with Postgres `42703` until 099. A per-employee override fully replaces the org policy, so it carries its own alt-Saturday rule.
- **`isAltSaturdayOff(date, rule)`** — pure helper. nth-Saturday-of-month via `Math.floor((dom - 1) / 7) + 1`.

**Phase 2 gotchas:**
- Manager scope = `departments.head_id` model — NO `employees.manager_id` column added.
- Roster grid is **weekly only** in Phase 2. Monthly view is Phase 3.
- Cell-to-cell drag NOT supported — only palette → cell.
- Reprocessing a payroll run does NOT pull in NEW OT after process — push OT BEFORE running payroll, or run payroll, then push, which triggers `recomputeEntryFromLineItems`.
- `payroll_line_items.category` Zod schema in `addPayrollLineItem` deliberately does NOT include `'overtime'` — admins cannot manually create OT line items via the regular UI. Only `pushOvertimeToPayroll` produces them.
- `LineItemCategory` TS type in `src/lib/payroll/line-items.ts` was bumped to include `'overtime'` (was stale after migration 039).
- `DEFAULT_OT_SETTINGS` was originally exported from a `"use server"` file (`src/actions/overtime.ts`) — Next.js rejects non-async exports from "use server" files. Extracted to `src/lib/attendance/overtime-types.ts`.
- Override precedence: `override ?? policy` — override fully replaces, no field-by-field merge. If override has empty `off_days`, employee has zero off days that week.
- `weekly` threshold mode in `computeAndRecordOvertime` treats the entire `from..to` range as a single bucket per employee — caller is expected to pass a 7-day Mon-Sun window. Multi-week ranges in a single call don't ISO-week-group; that's Phase 2.x polish.
- Bulk-approve of mixed-status records: `approveOvertime` skips records not in `pending` or `rejected` status. Only counts those it actually updated.
- Conflict-detection helper only inspects the CURRENT week's assignments from `initial.rows` — long-range assignments spanning week boundaries won't surface in the roster client warn (server-side `assignShiftToCell` is still authoritative).
- `OvertimeSettings` and `DEFAULT_OT_SETTINGS` live in `src/lib/attendance/overtime-types.ts`, not in `src/actions/overtime.ts`. Import accordingly from client components.

---

## Late-Punch Policy Module (Settings → Attendance) — shipped 2026-06-16

Optional, per-org rule: employees who clock in late more than N days in an IST calendar month become bonus-ineligible that month; notified via email + WhatsApp. Off by default (`late_policies.enabled`). Whole feature dark when disabled. Spec/plan/operator doc: `docs/superpowers/specs/2026-06-16-late-punch-policy-design.md`, `docs/superpowers/plans/2026-06-16-late-punch-policy.md`, `docs/late-punch-policy.md`.

**Lateness** (computed at clock-in inside `clockIn` via `waitUntil`, non-blocking): late ⇔ `clock_in_at` IST > `shift.start_time + grace_minutes`; falls back to the rule's `fallback_cutoff_time` when the employee has no shift; **overnight shifts NOT evaluated in v1**. Writes `attendance_records.{is_late, late_minutes, late_policy_id}`. Pure helper `computeLateness` in `src/lib/attendance/lateness.ts`.

**Monthly flagging**: when the count of `is_late` rows in the IST month reaches `threshold_days`, upsert `late_policy_flags` (`status='flagged'`, unique on `(org_id, employee_id, month)`). Never re-flags an `overridden` month.

**Consequence (bonus block)**: `addPayrollLineItem` rejects `category='bonus'` for a flagged employee in the run's month unless `override:true`. Admin overrides via the Payroll "Bonus-ineligible · N late days" badge (reason required) → `overrideLateFlag` flips `status` to `overridden`. Only `bonus` is blocked; allowances/reimbursements/overtime/other and tax math are unaffected.

**Targeting**: covered employees = (members of targeted departments) ∪ (targeted employees), via `late_policy_targets`; empty = nobody. Helper `resolveCoveredEmployeeIds` in `src/lib/attendance/late-policy-targets.ts`. UI is a nested department+employee multi-select.

**Notifications** (`src/lib/attendance/late-policy-dispatch.ts` — plain module, NOT a server action; best-effort, idempotent claim-then-send keyed on `late_punch_notifications` unique `(attendance_record_id, kind, channel)`): kinds `late` / `warn` (at `warn_at`, below threshold) / `threshold`. Email always available (Resend, `FROM_EMAIL`); WhatsApp only when the org has an active provider AND `employees.whatsapp_opt_in=true` AND a phone. Which kinds fire is decided by `planNotificationKinds` (`src/lib/attendance/late-policy-notify.ts`). Email templates: `late-punch-alert.tsx`, `bonus-ineligible-alert.tsx`.

**WhatsApp — per-org BYO adapter registry** (`src/lib/whatsapp/`): `resolveProvider(cfg)` returns an `aisensy` / `wati` / `centralized` adapter; `omni` and `meta` return null (Omni adapter deferred until its API is confirmed). Per-org config in `org_whatsapp_credentials` (API key AES-256-GCM encrypted, reusing `RAZORPAYX_CRED_ENCRYPTION_KEY`). Centralized fallback via env: `WHATSAPP_CENTRALIZED_{PROVIDER,API_KEY,ENDPOINT,TPL_LATE,TPL_INELIGIBLE,TPL_WARN}`. Three Meta-approved **Utility** templates required: `late_punch_alert`, `bonus_ineligible_alert`, `late_warning`. No provider configured → email-only, no errors. Actions in `src/actions/whatsapp-credentials.ts` (`getWhatsAppCredentials` exposes only `hasApiKey`, never the secret; `sendTestWhatsApp`).

**Config UI**: Settings → Attendance → "Late Policy" card + "WhatsApp provider" card (admin + `attendanceEnabled` only). Policy actions in `src/actions/late-policy.ts` (`getLatePolicy`, `upsertLatePolicy`, `getLateFlagsForMonth`, `overrideLateFlag`). Profile gains a WhatsApp opt-in consent toggle (`employees.whatsapp_opt_in`).

**Migrations 061–065** (applied to live HRme DB via MCP): `late_policies` + `late_policy_targets` (061), `late_policy_flags` (062), `late_punch_notifications` (063), `org_whatsapp_credentials` (064), `attendance_records.{is_late,late_minutes,late_policy_id}` + `employees.{whatsapp_opt_in,whatsapp_opt_in_at}` (065). RLS uses the Clerk-JWT pattern; service-role bypasses by design.

**Cron**: `/api/cron/late-policy-reconcile` (daily — see Cron Jobs table).

**v1 limitations**: overnight shifts not evaluated; calendar-month period only; bonus-block consequence only (no penalty deductions); single org-wide rule (targeting selects who it covers); Omni WhatsApp adapter pending.

## Multi-Location Attendance (Biometric Zones) — shipped 2026-06-25

Biometric devices across multiple sites push fingerprint punches to JambaHR; punches pool into one daily attendance record scoped to the employee's **zone**. Operator/dev doc: `docs/multi-location-attendance.md`. Spec: `docs/prds/multi-location-attendance.md`.

**Data flow:** device → **ADMS push** `POST /iclock/cdata?SN=<serial>&table=ATTLOG` (`src/app/iclock/[...seg]/route.ts`, public, no Clerk) → `ingestAttlog` (`src/lib/attendance/adms-ingest.ts`) parses tab-separated ATTLOG, resolves **org by serial** + **employee by PIN** (`employees.device_code`), writes `attendance_punch_events` (source `'adms'`, IST→UTC) → `recomputeAttendanceDay` runs `resolveEmployeeZoneLocationIds` (`src/lib/attendance/resolve-zone.ts`) + the pure `computeDailyAttendance` (`src/lib/attendance/daily-attendance.ts`) → upserts the daily `attendance_records` rollup. Direction (in/out) is **derived** (min=first-in, max=last-out), never trusted from the device.

**Zones:** `attendance_zones` + `attendance_zone_locations` + effective-dated `employee_zone_assignments`. An employee's punches count only from devices in their zone; out-of-zone punches are excluded (counted in `out_of_zone_count`). **Unassigned employee → null zone → pool ALL locations** (no-zone fallback, no regression). Actions in `src/actions/attendance-zones.ts`.

**Admin UI:** Settings → Attendance → **Biometric Devices** (`biometric-devices-section.tsx`): locations CRUD, device registration (`register-device-dialog.tsx`) with copy-paste ADMS setup + live Connected/Waiting status + "Not connecting?" troubleshooter, employee PIN mapping, **Attendance Zones** (`attendance-zones-card.tsx`), **Device security** (`ingest-security-card.tsx`). Attendance page → **"Locations" tab** (`daily-attendance-tab.tsx`, admin): per-day first-in/last-out **with location**, hours, punch count, out-of-zone flag, status badge, recalculate, review-queue filter. Actions: `attendance-devices.ts`, `attendance-daily.ts`.

**Security:** only registered **+ `is_active`** serials accepted. Optional per-org **ingest token** in the path `/iclock/<token>/<verb>` (`parseIclockPath` in `src/lib/attendance/iclock-path.ts`, `resolveOrgByIngestToken`); token/serial org-mismatch rejected; per-org `device_ingest_require_token` (in `organizations.settings`) rejects plain serial pushes (default off). Token + require-toggle in the Device security card.

**Migrations:** `076` locations, `077` devices, `078` attendance_punch_events (+`uq_punch_events_dedupe`), `082` devices.last_seen/last_punch, `083` zones, `084` attendance_records multi-loc fields. (Mine were renumbered 079–081 → 082–084 to dodge the contractor 079/080 already on main.)

**Device config (ADMS):** Menu → Comm → Cloud Server (ADMS): Server `jambahr.com`, Port `443`, HTTPS **ON** (prod), Enable Domain Name ON. The device PIN/User ID = `employees.device_code`. **Enable Domain Name must be ON *before* typing a hostname** — with it OFF the field silently keeps the old IP. Settings only apply after a device reboot.

**eSSL device support (shipped 2026-07-17, Medialoop go-live):** eSSL units (ZKTeco OEM) speak an `.aspx` verb dialect and batch their command acks — both handled natively (gotchas #97/#98). TLS-incapable units run via the on-prem Caddy relay (gotcha #99); TLS-capable units (MB140) connect direct. First-connect debugging order: device gateway/DNS (wired config hijacks WiFi routing, #99) → Vercel `/iclock` logs by serial → relay. Live fleet: TMP Boat Club `UFS2260202795` (direct HTTPS), Medialoop `NYU7261204139` (via relay).

**User provisioning (push employees → devices)** — shipped on `feat/adms-user-provisioning`. The reverse direction of ingest: JambaHR pushes employee user records (PIN + Name, **no fingerprints**) onto devices via the ADMS command channel. A `device_commands` queue (migration `085`) holds `pending` `upsert_user`/`delete_user` commands; `GET /iclock/getrequest` drains a batch (builds `C:<seq>:DATA UPDATE USERINFO …`, flips to `sent`), the device acks via `POST /iclock/devicecmd` (`ID=<seq>&Return=0` → `confirmed`/`failed`). Pure wire format in `src/lib/attendance/adms-commands.ts`; dedup in `device-command-diff.ts`; best-effort enqueue in `device-provisioning.ts`. Triggers: new-device register **backfills** all PIN'd employees; terminate **deletes** from all devices; Settings → Biometric Devices → **"Sync all users to devices"** (`syncAllUsersToDevices` / `retryFailedCommands` / `getProvisioningStatus` in `attendance-devices.ts`). `employees.device_code` (PIN) is **unique per org** (partial index `uq_employees_org_device_code`, migration `085`); settable per-employee or via the CSV importer's `device_code` column. Operator doc §4.5 in `docs/multi-location-attendance.md`.

## Document Templating / Offer Letters (`/dashboard/documents/*`) — Business+ — Phase 1 built 2026-07-04 (branch `feat/document-templating`)

Clause-based offer-letter / NDA / policy templates → issue to many employees with per-person `{{variables}}` → employee **e-acknowledges** (typed-name, NOT a certified signature) via a secure token link → immutable signed PDF + append-only `signed_records` audit (owner/admin only). Spec: `docs/prds/documents-feature.md`. Plan+reconciliation: `docs/planning/documents-feature-plan.md`.

- **Feature gate:** `document_templating` in `plans.ts` (Business tier). Sidebar "Offer Letters" (admin + Business, `FileSignature`). Public ack route `/documents/ack/[token]` added to `middleware.ts` public matcher.
- **Group-scoped, reconciled to real tenancy** (Clerk decoupled; group = superadmin overlay `company_groups`/`org_group_memberships`, migration 091): every table carries `org_id` + **nullable `group_id`** (stamped from `getOrgGroupId`). `resolveDocScope` (`src/lib/documents/scope.ts`) spans the group when grouped, else single-org; the **issuing entity** dropdown = group members (multi-entity issuance only lights up for grouped orgs — same model as attendance). Isolation is app-layer (service-role + `.eq(org_id)`/scope filter + `isAdmin`); RLS advisory (gotcha #5).
- **PDF:** `@react-pdf/renderer` (pure-Node, added to `serverComponentsExternalPackages`). Clauses are markdown → rendered via a subset parser (`src/lib/documents/markdown.ts`; react-pdf has no HTML engine) shared by the on-screen `MarkdownView` and the PDF. Draft `${orgId}/doc-drafts/${issuedId}.pdf` (mutable, upsert), signed `${orgId}/doc-signed/${issuedId}.pdf` (`upsert:false`, immutable) — both in the existing private `documents` bucket; new `getSignedDocUrl` helper (`storage.ts`).
- **Pluggable signature** (`src/lib/documents/signature/`): `SignatureProvider.finalize()`; P1 = `TypedAckProvider`. Phase 2 Aadhaar eSign (Digio/Leegality) drops in via the `signed_records.esign_*` columns — **no schema change**. DSC = kept-but-unplanned enum.
- **AI first draft** (`generate-clauses.ts`): copies the `screening/score.ts` idiom (prompt→`extractJson`→Zod→retry once), model `claude-sonnet-4-6`, `groupName` filled server-side. Always lands as an **editable draft, never auto-active** (activation validates every `{{token}}` against `document_variables`).
- **Acknowledgement flow** copies `signAgreement` (`contractor-agreements.ts`): `randomBytes(32).base64url` token, 30-day lazy-expire, IP/UA from `next/headers`. Fixed statement (`acknowledgement.ts`) frozen per signed record. Actions in `src/actions/documents-templating.ts` (public: `getIssuedDocumentForAck`/`acknowledgeIssuedDocument`/`declineIssuedDocument`).
- **Migrations 095-098 applied to live HRme DB** via MCP: 095 templates/clauses/library/variables, 096 issued_documents, 097 signed_records (append-only, no UPDATE/DELETE policy), 098 seeds 11 Indian-context system clauses. 3 help articles + 5 route-registry entries added (help-loader count 56→59).
- **v1 limits:** typed-ack only (no certified eSign); employees scoped to the active org (only the issuing *entity* varies across a group); never manually e2e'd in browser. `npm run build` green, `tests/documents/*` + assistant integrity green.

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

### PRD 02 Phase 1 — Configurable ratios + line items + email payslips (shipped 2026-06-07)

- **Configurable salary-structure ratios** at Settings → Payroll: Basic %, HRA % metro, HRA % non-metro, Gratuity %. PF rate + cap, PT slabs, tax slabs, standard deduction, 87A rebate stay statutory.
- **`salary_structure_config` is append-only by `(org_id, effective_from)`** — re-saving the same effective_from upserts. `getActiveRatioConfig` reads the latest with `effective_from <= today`.
- **Existing salary structures DO NOT auto-recompute** when org config changes. Admin must click "Recompute all" or re-upsert each affected employee. PRD §7.1 mandates this — past payslips immutable.
- **`payroll_line_items`** replaces the single `payroll_entries.bonus` integer for new entries. Categories: bonus / allowance / reimbursement / other. `taxable: boolean` per row. Sums into `payroll_entries.total_line_items` (denormalised) and folds into TDS via `computeAdditionalTaxOnBonus` for taxable items.
- **`payroll_runs.structure_config_snapshot`** JSONB is frozen at process time. NULL for pre-PRD-02 runs (treat as default hard-coded ratios).
- **Payslip email** via React Email template (`payslip.tsx`). Trigger: (a) auto on `markPayrollPaid` via `waitUntil` — best-effort, never blocks; (b) on-demand "Send payslips" button. Status tracked in `payslip_deliveries` table per (entry, channel).
- **No PDF attachment in Phase 1** — email body is HTML inline. CTA links to in-app view where employees can browser-print to PDF.
- **`computeCTCBreakdown(ctc, state, isMetro, includeHra, taxRegime, additionalDeductions, config?)`** — new optional `config: RatioConfig` arg. `DEFAULT_RATIO_CONFIG = { basic_pct: 40, hra_pct_metro: 50, hra_pct_non_metro: 40, gratuity_pct: 4.81 }` matches historical hard-codes.
- **Reprocess of a draft run DROPS its line items** via `ON DELETE CASCADE`. Add line items only AFTER process, before paid. Phase 1 limitation; Phase 1.5 could preserve them.
- **Settings → Payroll CollapsibleSection** only renders when plan has `payroll` feature AND user is admin.

**Phase 1 gotchas:**
- Migrations 033–036 are idempotent and applied via Supabase MCP.
- `payroll_runs.structure_config_snapshot` NULL means pre-PRD-02 — treat as `DEFAULT_RATIO_CONFIG` if you read back.
- `payroll_line_items.taxable=false` items add to `net_pay` but NOT to taxable income — reimbursements don't get TDS.
- `markPayrollPaid` fires `sendPayslipEmail` via `waitUntil`. If `RESEND_API_KEY` is missing, the function logs and continues — `markPayrollPaid` still succeeds.
- `payslip_deliveries` is `UNIQUE (payroll_entry_id, channel)` — re-sending a payslip updates the existing row via upsert (so the "sent_at" reflects the LATEST send).
- All RLS policies use Clerk-JWT pattern (same as Attendance Phase 1).
- COMMENT ON COLUMN statements can't use `||` string concatenation when applied via Supabase's `apply_migration` MCP — collapse to single-string literals.
- Drift warning in `salary-structure-dialog` may false-positive when a future-dated config sits at `history[0]`. Acceptable for Phase 1 (advisory only).
- **`RAZORPAYX_CRED_ENCRYPTION_KEY` (Phase 2 prep)**: base64-encoded 32-byte AES-256 key used to encrypt RazorpayX API secrets + employee bank account numbers (Phase 2 in progress). MUST NOT change after data exists — rotation requires re-encrypting every row (Phase 3 envelope-encryption upgrade handles this). Missing/wrong key = AES auth-tag failure on decrypt = total disbursement outage. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Local: paste into `.env.local`. Production: Vercel env var. See `src/lib/crypto/aes-gcm.ts`.

### PRD 02 Phase 2 — RazorpayX disbursement (shipped 2026-06-08)

- **Customer-brings-own-RazorpayX model.** Each org signs up for their OWN RazorpayX account, completes KYC, gives JambaHR encrypted API credentials. Money flows from their RazorpayX wallet directly to their employees — JambaHR never holds funds.
- **AES-256-GCM encryption-at-rest** for all sensitive payroll data. Key in `RAZORPAYX_CRED_ENCRYPTION_KEY` env var (32-byte base64). Used for: RazorpayX API secrets, RazorpayX webhook secrets, employee bank account numbers + IFSC.
- **`razorpayx_credentials` (042)** — one row per org. Encrypted `key_secret_encrypted` + `webhook_secret_encrypted`. `account_id` is the RazorpayX merchant identifier — webhook handler uses it for per-org lookup.
- **`employee_bank_accounts` (043)** — encrypted `account_number_encrypted` + `ifsc_encrypted`. Visible-only fields: `account_number_last4` + `ifsc_first4`. SHA-256 `account_number_hash` for dedupe + cache key. RazorpayX Contact/Fund Account IDs persisted after `syncBeneficiary`.
- **`penny_drop_results` (044)** — 30-day cache per (org, account_hash) for ₹1 + name-match RazorpayX validation. Penny-drop costs ~₹2-3 per call; cache aggressively.
- **`disbursement_batches` (045)** — one batch per Pay Now attempt. Status: `preflight → awaiting_approval → approved → processing → completed | partial_failed | cancelled`. Idempotency key per batch.
- **`disbursement_items` (046)** — one row per (batch, employee). Status: `pending → queued → processing → paid | failed | cancelled | reversed`. Per-item RazorpayX `payout_id` and fee_paise tracked.
- **`disbursement_audit_log` (047)** — DPDP audit trail for every initiate/approve/cancel/retry/webhook_status_change/preflight_run.
- **`payroll_runs.status` extended (048)** — adds `disbursing` and `disbursement_failed` to the existing draft/processed/paid enum.
- **HTTP client at `src/lib/razorpayx.ts`** — typed wrappers around the RazorpayX REST API. No SDK; uses Node `fetch` with HTTP Basic auth. Bulk payout endpoint is `/payouts_batches` (TODO comment in code: verify against current RazorpayX docs at integration time; falls back to per-item `createPayout` loop if the endpoint changes).
- **Beneficiary lifecycle**: `syncBeneficiary` creates RazorpayX Contact + Fund Account, fired via `waitUntil` after every `upsertMyBankAccount` / `upsertEmployeeBankAccount`. Bulk re-sync available from Settings → RazorpayX → "Re-sync all beneficiaries".
- **Maker-checker** enforced server-side in `approveDisbursement`. Default: a different admin must approve than the maker. Toggleable per-org via `razorpayx_credentials.single_person_approval_allowed`.
- **Wallet shortfall** — `runPreflight` returns shortfall amount; `initiateDisbursement` hard-blocks unless `override_wallet_shortfall: true`. (Phase 2.5: wire actual RazorpayX balance endpoint; currently `getWalletBalance` returns null and the shortfall gate is effectively bypassed — RazorpayX will reject the payout call with `insufficient_balance` if the wallet is short.)
- **Webhook at `/api/webhooks/razorpayx`**: per-org HMAC verification via `account_id` lookup → decrypt that org's webhook_secret → HMAC-SHA256 compare with `timingSafeEqual`. Reuses shared `webhook_events` table for dedupe.
- **`reconcileBatchAndRunStatus`** at `src/lib/payroll/disbursement-reconcile.ts` — shared helper used by both the webhook route AND `approveDisbursement`/`retryFailedPayouts`. Aggregates item statuses → updates batch.status + payroll_runs.status atomically.
- **Existing manual "Mark Paid"** stays available for non-RazorpayX customers. UI shows Pay Now button only when credentials exist.

**Phase 2 gotchas:**
- `RAZORPAYX_CRED_ENCRYPTION_KEY` **must NOT change** after data exists — rotating it requires re-encrypting every row (Phase 3 envelope-encryption upgrade handles this). Missing/wrong key = AES auth-tag failure on decrypt = total disbursement outage.
- `account_number` (RazorpayX virtual account) is stored in `razorpayx_credentials` as plaintext — it's NOT a secret (it's the destination wallet number, like an IBAN). The `account_number` ON `employee_bank_accounts` IS encrypted (it's the employee's bank account).
- `getWalletBalance()` in `disbursement.ts` is a placeholder returning `null`. RazorpayX balance endpoint should be confirmed at integration time and wired in Phase 2.5.
- Bulk payout endpoint `/payouts_batches` is the canonical mid-2026 path per `src/lib/razorpayx.ts`. If it 404s, `approveDisbursement` falls back to a per-item `createPayout` loop with derived idempotency keys.
- Maker-checker is the DEFAULT. Single-person mode (one admin both initiating and approving) requires the org admin to explicitly toggle `single_person_approval_allowed=true` in Settings → Payroll → RazorpayX.
- Penny-drop verification uses a 30-day cache. Bank-account changes invalidate the cache because the `account_number_hash` changes. Admin can force re-verify per row in the pre-flight dialog.
- Beneficiary sync resets to `pending` on every bank-account upsert. This is intentional — the encrypted ciphertext changes on every save (fresh IV) so we cannot reliably diff inputs. Re-sync queues automatically via `waitUntil`.
- `disbursement_items.razorpayx_payout_id` is the back-pointer used by the webhook to find the right item. The webhook also falls back to looking up by `reference_id` (which is set to the item's UUID at payout-time).
- DPDP compliance: bank account number stored encrypted + hashed. UI shows last-4 only. Every read of decrypted bank data is logged via `disbursement_audit_log` (action='bank_account_read') in the disbursement engine path.
- After P2's `.env.local` overwrite incident, `VOYAGE_API_KEY` is missing — restore it before re-running `npm run embed:help` to index the 6 new RazorpayX articles.

---

## JambaGeo Module (`/geo`) — Business+

Feature-flagged via `organizations.settings.jambageo_enabled`. Lightweight lead CRM + field-staff tracking. Phase 1 (web-only) shipped 2026-06-09.

### Phase 1 — Web manager surface + backend foundation (PRD 03, shipped 2026-06-09)

- **Backend**: migrations 051–057 add 6 tables. Three Phase-1 web-writable
  (`geofences`, `leads`, `lead_visits`); three mobile-only writers
  (`duty_sessions`, `location_pings`, `geo_consents`) so PRD 04 can wire
  writers later without migrations.
- **Mapbox** via `react-map-gl` + `@mapbox/mapbox-gl-draw`. One env var:
  `NEXT_PUBLIC_MAPBOX_TOKEN` (URL-restricted in Mapbox console).
- **Lead stages** are a fixed CHECK enum
  (`new / contacted / visited / negotiation / converted / lost`). No
  configurable stages in Phase 1.
- **Kanban drag** writes a system-authored `lead_visits` row
  (`system=true`, `notes='Stage: X → Y'`, immutable). Doubles as audit log
  — no separate `lead_stage_transitions` table.
- **Visit outcomes** in `{in_progress, converted, pending, follow_up, lost}`.
  `converted` / `lost` auto-flip `leads.stage`. Others leave stage alone.
- **Manager scope** via `getManagerScopedEmployeeIds` (Attendance Phase 2
  helper, `departments.head_id` model). Manager sees own-dept leads +
  unassigned pool. Employee sees `assigned_to = me` only.
- **Live Map** Phase 1 empty state. Polls `listActiveSessions()` every 30s
  client-side; real pins arrive when PRD 04 mobile app ships.
- **Crons**:
  - `/api/cron/jambageo-followup-reminders` (30 3 \* \* \* UTC = 9:00 IST):
    emails staff with `leads.follow_up_date = today`.
  - `/api/cron/jambageo-retention-sweep` (0 19 \* \* \* UTC = 12:30 IST):
    drops `location_pings` older than per-employee
    `geo_consents.retention_days`, fall-back to
    `organizations.settings.jambageo.default_retention_days` (default 90).
    Phase 1 no-op (no pings yet).
- **AI assistant**: 7 help articles + route-registry entries. Re-embed via
  `npm run embed:help`.
- **Demo seed**: `scripts/seed-jambageo-demo.sql` for `test1` org.

**Phase 1 gotchas:**
- Mapbox GL JS components must be loaded via `dynamic(..., { ssr: false })`
  — Mapbox depends on `window`. SSR will crash without this.
- `next.config.js` does NOT need mapbox-gl in `serverComponentsExternalPackages`
  because the package is never imported server-side (only dynamic-import'd
  in client components).
- Phase 1 has zero rows in `duty_sessions` / `location_pings` / `geo_consents`.
  The retention-sweep cron is a no-op but wired now so DPDP retention is
  enforced from the moment Phase 2 mobile lands.
- The "system" boolean on `lead_visits` guards kanban-drag rows from delete +
  edit. Server rejects edits/deletes when `system = true`.
- Lead-stage updates from kanban are idempotent — dragging to the same column
  is a server no-op (no system row written).
- Mobile-writer server actions (`startSession`, `endSession`, `ingestPings`,
  `recordConsent`, `revokeConsent`) are exported as `TODO(PRD 04)` stubs that
  return `{ success: false, error: '…' }` until Phase 2 wires them.
- Plan + org-toggle compound: sidebar entry hides unless BOTH
  `hasFeature(plan, 'jambageo')` (Business only) AND
  `organizations.settings.jambageo_enabled = true`.

### Phase 1.x — Module critique passes + geocoding (shipped 2026-06-10)

Six-pass `$impeccable critique /geo` plus a geocoding feature wave. Module-level total projected ~37/40 ("Excellent").

- **Shared chrome**: `src/components/geo/geo-page-header.tsx` (h1 + lede + optional rightSlot) used by every `/geo/*` page. Single source of truth for the typographic scale and spacing rhythm.
- **Lead detail destination pattern**: `<LeadDetailShell>` hosts dialog state for Edit / LogVisit / Schedule-followup / Terminal-stage / AddGeofence — every entry point (card buttons, page-level CTA, mobile sticky bar, keyboard shortcuts) opens the same dialog instance. `<LeadPageNav>` is `md:sticky md:top-14` and reads `?from=` to swap the back-target (`reports` → "Back to Reports", `my-leads` → "Back to My Leads"). `<StageStepper>` for inline stage flip with terminal-stage capture (`<TerminalStageDialog>`). `<LeadMobileActions>` for sticky-bottom Log-visit/Call/WhatsApp CTAs (`md:hidden`). `<LeadShortcuts>` for `j/k/e/v/Esc/?` keyboard bindings with input-focus guard.
- **Stage color vocabulary**: `src/lib/geo/stage-colors.ts` resolves stages → CSS vars at runtime (`getComputedStyle` on `--success`/`--destructive`/`--warning`/`--primary`/`--muted-foreground`). FunnelChart reads from it via `MutationObserver` on `<html>` class so dark-mode toggles re-color. Chip variants use `stageBadgeVariant()` from `src/lib/geo/stages.ts`. Single source — do not hardcode hex anywhere new.
- **Mapbox geocoding**: `src/lib/geo/geocode.ts::geocodeAddress(addr)` is the IN-biased forward geocoder (`country=IN` + India-centered proximity, 5s timeout, returns null on failure). Auto-fires in `createLead` / `updateLead` when address is set and `lat`/`lng` aren't explicitly provided. `geocodeLead(id)` is the manual re-geocode for the detail-page link. `geocodeGeofenceAddress` is the admin-only endpoint for the geofence dialog's Find button. See gotcha #81.
- **Geofence creation — 3 paths** all converge on `createGeofence` or `createGeofenceFromLead`:
  1. **From address** — `<AddGeofenceButton>` → `<AddGeofenceDialog preset={{ type: "address" }}>` → type → Find → preview place_name + coords → name/type/radius → Save
  2. **From a lead** — `<PickLeadForGeofenceButton>` → `<PickLeadForGeofenceDialog>` (searchable picker with "Geocoded"/"No location" badges) → `<AddGeofenceDialog preset={{ type: "lead", leadId, leadName, leadCompany }}>`. Resolves lead's stored `lat`/`lng` first, falls back to on-demand geocode of the lead's address.
  3. **Drop pin** — visible "Drop pin" overlay button at the bottom-right of the map (programmatically activates `draw_point` mode) OR the built-in Mapbox draw icons at top-right → existing `pendingCreate` sidebar flow. See gotcha #79.
- **Lead detail "Create geofence here"** — admin button on the info card opens `<AddGeofenceDialog preset="lead">` with the current lead pre-filled. Visible whenever the lead has coords OR a usable address.
- **`getLeadSiblings(currentId)`** is the prev/next action for `/geo/leads/[id]` (slim `{id,name}` projection vs `listLeads({})`'s full row + JOIN). Same scope semantics. Used by `<LeadPageNav>` for prev/next, propagates `?from=` suffix into both URLs.
- **Reports filter**: URL-driven `?range=7d|30d|quarter|all` via `<ReportsRangeFilter>`. Default (`30d`) intentionally NOT written to URL — shareable URLs stay clean. Helper + constants live in `src/lib/geo/report-range.ts` (non-`"use client"`) — see gotcha #78.
- **Live Map polling**: self-rescheduling `setTimeout` with exponential backoff (30s → doubles on failure → 5min cap → resets on success). Replaced `setInterval(_, 30_000)` flat-rate hammering. Lives in `src/components/geo/live-map.tsx`.
- **Responsive map heights**: canonical formula `min-h-[400px] h-[60vh] max-h-[600px]`. Applied to `live-map.tsx`, `geofences/client.tsx`, `live-map/page.tsx`.
- **A11y**: skip-to-content link in `src/app/geo/layout.tsx` (`sr-only focus:not-sr-only` chip → `#geo-main` on `<main>` with `tabIndex={-1}`). Mobile section nav uses `<Sheet side="left">` hamburger pattern on `< md` (replaced the previous scrollable chip row which hid 2-of-5 nav items off-screen on phones).
- **AssistantLauncher mounted on `/geo/layout.tsx`** (mirrors `/dashboard/layout.tsx` gating: `NEXT_PUBLIC_ASSISTANT_ENABLED` + `canUseAssistant`).
- **Kanban + scrollbars polish**: `.scroll-thin` utility in globals.css applied to the kanban horizontal-scroll row and the GeoHeader mobile nav (6px muted thumb vs OS-default 16px). Edge-fade mask on the kanban container. Trimmed kanban LeadCard: no stage chip (column owns it), no WhatsApp pivot (lives on detail + mobile bar), tighter padding — 3 visible rows max.
- **New help articles**: `geo_close_lead`, `geo_next_followup`, `geo_keyboard_shortcuts`, `geo_contact_lead` (restored). Stage-name corrections in `geo_overview`, `geo_kanban_drag`, `geo_create_lead`. See AI Assistant section for the corpus size + post-merge `embed:help` requirement.

---

## Insights Module (`/insights`) — Business+ Analytics

The "Advanced analytics dashboard" the Business tier had always promised (`analytics` feature key in `plans.ts`). Shipped in 4 phases, 2026-06-12. Owner/admin only.

**Route group**: `/insights/*` with its own layout — deliberately distinct **dark slate canvas** (`bg-slate-950`, violet ambient glow), independent of the light dashboard theme. Gating in `src/app/insights/layout.tsx`: no user → `/sign-in`; non-admin → `/dashboard`; plan without `analytics` → `/dashboard/settings#billing`.

**Six tabs** (sticky glass `InsightsNav`): Overview (`/insights`), Workforce, Leave & Attendance (`/insights/leave`), Payroll (`/insights/payroll`), Hiring, Performance.

**Entry points**: violet "Insights" pill in the dashboard header (owner/admin + analytics plan, left of JambaGeo) and a violet gradient "Org Insights" banner under the admin stat cards (`showInsightsCard` flag in `getDashboardData`).

**Data layer** (`src/actions/insights.ts`): one action per tab, all guarded by `requireInsightsAccess()` (auth + isAdmin + analytics feature). Aggregation strategy is two-tier:
- **JS aggregation** over org-scoped rows for small tables (employees, leave_requests, reviews, applications, transitions, ot_records, payroll_entries ≤ ~6k rows) — fine at 10–500 employee SMB scale.
- **Postgres RPC** for `attendance_records` (~180k rows/yr at 500 emp): migration `059_insights_attendance_rollup.sql` adds `insights_attendance_monthly(p_org_id, p_from, p_to)`. Plain `LANGUAGE sql STABLE` (no SECURITY DEFINER — service-role caller bypasses RLS per gotcha #5).

**Module-gated tabs degrade, never hide**: Payroll tab without the payroll feature → upgrade card; Hiring without `jambahire_enabled` → enable hint (`data: null` from the action); attendance section when the org has attendance off → enable hint; when migration 059 isn't applied the RPC error renders a "run migration 059" provision hint (`attendance.available=false`) instead of crashing.

**Charts**: Recharts wrappers in `src/components/insights/charts.tsx` (TrendArea, TrendLine, SimpleBars, StackedBars w/ `grouped` mode, JoinLeaveBars, Donut, Sparkline), themed via `src/lib/insights/chart-theme.ts` (single source — palette, tooltip style, `formatINRCompact` L/Cr formatter). Every chart has a designed empty state. The hiring funnel is a hand-rolled CSS gradient funnel (recharts is weak there). `KpiCard` delta chips know metric semantics via `goodWhenUp` (rising attrition/cost = rose, rising headcount = emerald).

**Phase 4 features**: CSV export button on every `ChartCard` (`exportRows`/`exportName` props → client-side Blob download with UTF-8 BOM); "Print report" button + `@media print` rules in globals.css that flatten the dark canvas to a white report (`#insights-root` + `.insight-card` + `.print-hide` hooks); period-over-period deltas on Overview (headcount % YoY, attrition ±pt vs prior 12m, payroll % MoM, leave % vs prior 12m).

**Multi-org combined view** (shipped 2026-06-18): an owner/admin who owns/admins ≥2 orgs can combine analytics across them via the `?orgs=` multi-select (`OrgScopeSelect`) in the Insights nav — shown only when the caller has ≥2 eligible orgs (`getMyOrgs` filtered to owner/admin in `insights/layout.tsx`). URL-driven (shareable/bookmarkable); default with no `?orgs=` is active-org-only, so single-org users are visually unchanged. Security: `requireInsightsAccess(orgIds)` validates every requested id against the caller's owner/admin set via `resolveScopedOrgIds` (`src/lib/insights/org-scope.ts`) — a tampered `?orgs=` can never widen scope. Each action returns combined fields **plus** a flat `byOrg: ByOrg<…>` breakdown (`groupByOrg` in `src/lib/insights/by-org.ts`); pages render it under combined KPIs via `PerOrgSplit` (renders nothing for one org). Module-gated tabs (payroll/hiring + the attendance section) roll up only the orgs that have the feature and surface the rest as `excludedOrgs` notes; attendance loops the per-org RPC (migration 059) and merges. **Insights-only** — every other module stays strictly single-tenant (active org).

**Known caveats**:
- **No `terminated_at` column exists** — exit dates proxy from `updated_at` of `status='terminated'` rows (terminating is almost always the last write). Headcount trend / attrition / leavers are approximations; a dedicated column is the precision upgrade.
- Migration 059 must be applied via the Supabase SQL Editor (Windows, gotcha #4).
- `/insights/*` pages are NOT in the AI-assistant route registry (the integrity test only covers `/dashboard/*`); help articles for the module are a future nice-to-have.

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
| `/api/cron/jambageo-followup-reminders` | `30 3 * * *` | 9:00am | Email staff with `leads.follow_up_date = today` (one digest per recipient) |
| `/api/cron/jambageo-retention-sweep` | `0 19 * * *` | 12:30am | Delete `location_pings` older than per-employee retention (Phase 1 no-op; ready for Phase 2 mobile pings) |
| `/api/cron/late-policy-reconcile` | `0 20 * * *` | 1:30am | Recompute current-IST-month late-day counts for enabled late policies; upsert missed `late_policy_flags` (never re-flags `overridden`). Safety net for the inline clock-in flagging. |
| `/api/cron/ownership-transfer-expiry` | `30 4 * * *` | 10:00am | Flip `ownership_transfers` rows past `expires_at` from `pending` to `expired`; clean up unlinked placeholder employees (clerk_user_id null + role 'admin'). |

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
# From the repo root (all via turbo):
npm run dev                                   # turbo dev (web on :3000)
npm run build / test / lint / typecheck
npx turbo build --filter=web                  # scope to one workspace
npx turbo typecheck --filter=@jambahr/shared  # packages are strictly typechecked
                                              # (apps/web typecheck is advisory — ~454 known
                                              #  Supabase never-type errors, gotcha #3)
npx turbo dev|typecheck|lint --filter=mobile  # mobile (Expo) — strictly typechecked, CI-gated

# From apps/web (app-specific scripts):
npm run db:generate   # Regenerate Supabase types → packages/supabase/src/database.types.ts
npm run db:push       # Push migrations (needs CLI; supabase/ stays at repo root)
npm run embed:help    # tsx --env-file=.env.local (env lives in apps/web/.env.local)
```

Mobile env lives in `apps/mobile/.env` (untracked; var **names** documented in
`apps/mobile/README.md` — never commit real values or an `.env.example`).

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
62. **AI SDK v6 is `streamText` with a provider model object, not a plain string**: `streamText({ model: anthropic("claude-sonnet-4-6"), ... })` — passing a bare string fails type check. The assistant calls Anthropic **directly** via `@ai-sdk/anthropic` (model object reads `ANTHROPIC_API_KEY`). It does **NOT** use the Vercel AI Gateway anymore — `gateway("anthropic/...")` was removed 2026-06-27 because Vercel now paywalls AI-Gateway BYOK behind paid gateway credits, which 403'd every chat request (`GatewayInternalServerError: BYOK is available only with paid credits`). `AI_GATEWAY_API_KEY` is now vestigial for the assistant. If re-adding the gateway, the team must hold gateway credits. The client uses `useChat` from `@ai-sdk/react@3` which does NOT have `input` / `handleSubmit` / `isLoading` — manage input state yourself and call `sendMessage({ text })`. Route returns `result.toUIMessageStreamResponse()` (not `toDataStreamResponse()`).
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
75. **JambaGeo Mapbox SSR**: Mapbox GL JS imports `window`. All map components MUST be loaded via `dynamic(() => import('@/components/geo/...'), { ssr: false })`. Direct SSR import will crash the page. See `src/app/geo/geofences/page.tsx` / `live-map/page.tsx`.
76. **JambaGeo system visit rows are immutable**: `lead_visits.system = true` rows are kanban-drag audit entries. `updateLeadVisit` / `deleteLeadVisit` reject them with "System rows are immutable" / "System rows cannot be deleted". To "undo" a stage move, drag the card back — that writes a new system row, preserving the audit trail.
77. **JambaGeo retention sweep is Phase-1 no-op**: `/api/cron/jambageo-retention-sweep` ships in Phase 1 even though `location_pings` is empty. This is intentional: when mobile lands in Phase 2, DPDP retention is enforced from day one without a separate migration/deploy.
78. **Pure helpers imported from "use client" files crash server components at runtime**: A Server Component importing a non-component utility (function/constant) from a file with `"use client"` directive works in dev but throws at request time in prod. Split pure logic to a non-`"use client"` `.ts` module. See `src/lib/geo/report-range.ts` (constants + `resolveRangeFrom`) as the canonical pattern; the client filter file and the server page both import from there.
79. **Mapbox draw control / `addControl()` needs an `onLoad` gate**: Calling `map.addControl()` before the `<Map>`'s `load` event silently no-ops, and refs don't trigger re-renders so the effect never retries. Use `<Map onLoad={() => setMapReady(true)}>` + depend on the state in the `useEffect` that wires the draw control. See `src/components/geo/geofence-map.tsx`.
80. **GitHub PR squash race**: When a PR is open against branch tip A and more commits are pushed without refreshing the PR HEAD, the merge can resolve against the stale ref — commits silently never land on `main`. Verify after merge with `git merge-base --is-ancestor <commit> main`. PR #6 in this repo hit it once (2026-06-10); `4f9cb87` (the assistant linkage commit) had to be cherry-picked manually.
81. **Lead address auto-geocoded on save**: `createLead` / `updateLead` (and the explicit `geocodeLead(id)`) call `geocodeAddress` via Mapbox v5 when address is present and `lat`/`lng` aren't explicitly set. Best-effort, 5s timeout, silent failure. Uses the same `NEXT_PUBLIC_MAPBOX_TOKEN`. Mapbox free tier covers 100k/mo — well past SMB volume.
82. **`GeoPageHeader` is the canonical h1+lede for every `/geo/*` page**: Don't inline `<header><h1>` blocks on new pages — use `<GeoPageHeader title="..." lede="..." rightSlot={...} />`. Owns the typographic scale (text-2xl semibold tracking-tight + max-w-prose lede + mb-6) so every destination page stays in rhythm. See `src/components/geo/geo-page-header.tsx`.
83. **Function props from Server Components to Client Components crash at REQUEST time, not build time**: `next build` passes, then the page 500s ("Functions cannot be passed directly to Client Components"). Hit on 2026-06-12 when `/insights/leave` and `/insights/payroll` passed `formatValue={fn}` to recharts wrappers. Fix pattern: pass a serializable token (`format="inr" | "timeOfDay" | "percent" | "plain"`) and resolve the formatter inside the client component — see `makeFormatter()` in `src/components/insights/charts.tsx`. Audit any new server page that hands props to `"use client"` chart/dialog components.
84. **Late-policy WhatsApp is per-org BYO + email fallback**: WhatsApp sends nothing until an org configures an active provider in `org_whatsapp_credentials` (or sets the `WHATSAPP_CENTRALIZED_*` env vars for the centralized adapter) AND the 3 Utility templates are Meta-approved AND the employee has `whatsapp_opt_in=true` + a phone. Otherwise the late policy runs **email-only with no errors**. The `omni` provider is a deferred stub — `resolveProvider` returns null for it.
85. **Late-policy secret/PII helpers must stay OUT of `"use server"`**: `loadProviderConfig` (returns a decrypted WhatsApp key) lives in `src/lib/whatsapp/load-config.ts` and `dispatchLateNotifications` (sends + handles employee PII) lives in `src/lib/attendance/late-policy-dispatch.ts` — both plain modules. Any `export` from a `"use server"` file becomes a browser-callable RPC, so moving these into `src/actions/` would expose the secret/PII. (Caught in pre-merge code review; mirrors the `disbursement-reconcile.ts` precedent.)
86. **Lateness skips overnight shifts in v1**: `computeLateness` returns `evaluated:false` for `is_overnight` shifts (and when there's no shift AND no `fallback_cutoff_time`). Those punches are never marked late. Boundary-wrap handling is deferred.
87. **Bonus block reads `late_policy_flags`; override is a separate action**: `addPayrollLineItem` blocks `category='bonus'` for a `status='flagged'` employee in the run's `month` unless `override:true`. The normal admin path is the Payroll badge → `overrideLateFlag` (flips to `overridden`); the `override` arg on the line item is the secondary escape hatch. Only `bonus` is blocked.
88. **Late-policy counting is IST calendar-month**: the clock-in path counts `is_late` rows with `date` in `[YYYY-MM-01, recordDate]`; the reconcile cron bounds `[YYYY-MM-01, YYYY-MM-31]`. One policy per org (DB-unique on `org_id`); flags unique on `(org_id, employee_id, month)`.
89. **ADMS ATTLOG timestamps are device-local IST, not UTC**: `adms-ingest` parses `YYYY-MM-DD HH:MM:SS` as `Asia/Kolkata` → UTC. The node-zklib *pull* path (port 4370) returns UTC instead — different — but pull is NOT the production path (it needs an on-prem agent; Vercel can't reach a LAN device). Push/ADMS is canonical. See `docs/multi-location-attendance.md`.
90. **Device HTTPS must match the server**: ON for production (`jambahr.com` has a cert), OFF for a local plain-HTTP dev server. A device with HTTPS on pointed at HTTP sends **zero bytes** (TLS handshake fails) — looks like a dead integration. Also: ADMS devices **resend all stored logs on reboot** → idempotency via `uq_punch_events_dedupe`; recompute is safe to re-run.
91. **`attendance_records.source` CHECK only allows `web`/`device`/`auto_close`**: the multi-loc rollup writes `'device'`; the punch-event log (`attendance_punch_events`) uses `'adms'`. Don't write `'adms'` to `attendance_records` — it violates the constraint.
92. **`next build` exit 127 with no error = `.next` contention**, not your code. Multiple `next dev` servers on the same project share one `.next` dir and corrupt the production build. Stop ALL dev servers + `rm -rf .next`, then build. (Cost a long debugging detour on 2026-06-25.)
93. **Multi-loc attendance is org-by-serial by default** (serials aren't secret). For stronger auth use the per-org ingest token path `/iclock/<token>/<verb>` + the `device_ingest_require_token` org setting. Unregistered or `is_active=false` serials are always dropped.
94. **`getrequest` returns provisioning commands, not just `OK`** (migration `085`). `GET /iclock/getrequest` drains `pending` `device_commands` for the polling serial → builds ADMS lines → flips to `sent`; `POST /iclock/devicecmd` records the ack. Dispatch is **best-effort** — any failure falls through to `ok("OK\n")` so a device never stalls and punch ingestion is never affected (mirrors the audit-write swallow #52). Only registered + `is_active` devices get commands.
95. **`employees.device_code` (PIN) is unique per org** — partial index `uq_employees_org_device_code` (migration `085`). Pre-check for collisions before applying the index. The CSV importer (`bulkImportEmployees`) dedups within-file + against existing rows and surfaces a friendly error on the unique-index violation; per-employee PIN edits do the same.
96. **Provisioning never pushes fingerprint templates** — only the user record (PIN + Name; Name is 24-char-max, tab/newline-stripped, `sanitizeName` in `adms-commands.ts`; PIN must be numeric, `isValidPin`). Biometric enrollment stays physical at the device. Pure/secret rules: `adms-commands.ts`, `device-command-diff.ts`, `device-provisioning.ts` are plain modules (NOT `"use server"`) per gotcha #85.
97. **eSSL firmware speaks an `.aspx` ADMS dialect**: verbs arrive as `/iclock/getrequest.aspx` / `cdata.aspx` (ZKTeco-branded units send bare verbs). `parseIclockPath` strips the suffix (fix `dcbc0e7`, 2026-07-17). Pre-fix symptom: device shows "Connected" (liveness bumps via the catch-all OK) but commands never dispatch and punches are acknowledged-then-dropped. Debug any device's real wire behavior via Vercel runtime logs (`query=/iclock`, filter by SN).
98. **eSSL batches devicecmd acks**: one POST with many `ID=<seq>&Return=<code>` lines (ZKTeco sends one per POST). `recordAck` uses `parseDeviceCmdAcks` (multi-line; fix `076b421`). Pre-fix symptom: commands stuck at `sent` forever despite the device having executed them.
99. **eSSL devices prefer wired over WiFi and this eSSL model can't do TLS**: with an Ethernet cable plugged in, cloud traffic routes over Ethernet regardless of WiFi health — a static LAN config with Gateway `0.0.0.0` (or missing DNS) silently kills all push. Check gateway/DNS FIRST when a registered device never connects. Separately, the Medialoop eSSL unit (`NYU7261204139`) conclusively cannot complete TLS to Vercel (verified 2026-07-17 with healthy DHCP config) → it runs permanently via the Caddy HTTP→HTTPS relay (`/superadmin/runbooks/biometric-relay`; ready-to-run zip pattern: caddy.exe + `:8080 reverse_proxy https://jambahr.com { header_up Host jambahr.com }` + scheduled-task installer). MB140-class devices do TLS fine and connect direct.
100. **Device PINs may be transmitted zero-padded**: the Medialoop eSSL sends PINs exactly as enrolled (`016`), matching zero-padded `employees.device_code`. Ingest matches `device_code` by exact string — after any new device model's first punch, verify the PIN form in `attendance_punch_events` before assuming matches work.
101. **Leave-request scoping is enforced server-side in `requestLeave`** (2026-07-17): the target employee must belong to the caller's org, and non-admins may only file for themselves (managers also for direct reports via `managerIdsOf`). The leaves page scopes the request-for dropdown the same way. The balance cards on `/dashboard/leaves` show the VIEWER's own usage (`listLeavePolicies` filters by the caller's `employeeId`) — before `078224c` they summed the whole org, so anyone's approved leave appeared to drain everyone's balance.

---

## AI Assistant (`/dashboard/*` floating button) — Phase 1 shipped 2026-05-18

Read-only, plan-tier-gated chat assistant. Floating button on dashboard, side-panel chat, role-aware suggested prompts. Tool-augmented: `app_help_search` / `app_help_get_steps` / `app_help_get_route` deliver step-by-step how-to answers with "Take me there →" deep-links; `docs_search` / `docs_get_chunk` / `docs_list_recent` answer from the org's company-wide documents (Phase 2). Backed by 25 markdown help articles + tenant doc chunks indexed into pgvector via Voyage `voyage-3-large` embeddings. Full plan in `docs/planning/ai-hr-assistant-plan.md`; phase plans under `docs/superpowers/plans/`.

**Phase progression:**
- **Phase 0** (shipped 2026-05-18) — foundation: stub route, UI shell, plan-tier helpers, migration 022 (4 conversation tables).
- **Phase 1** (shipped 2026-05-18) — how-to assistant: pgvector + `app_help_chunks`, Voyage embeddings, `app_help_*` tools, 25 articles, persistence + rate limit (30/hr), org-level `assistant_enabled` flag.
- **Phase 2** (shipped 2026-05-20) — tenant document Q&A: `doc_chunks` table + `match_doc_chunks` RPC, text extraction (unpdf + mammoth), ingestion on upload via `waitUntil` + backfill script + reconcile cron, `docs_search`/`docs_get_chunk`/`docs_list_recent` tools (company-wide-only, org-scoped, ack-aware), prompt-injection `<source>` directive, doc citations + acknowledgment banner, per-org `assistant_tenant_docs_enabled` toggle.
- **Phase 3** (PARKED — see `docs/planning/ai-hr-assistant-phase-3-parked.md`) — structured data tools (`data_employees_find`, `data_leaves_balance`, etc., all role-scoped via `reporting_manager_id`). Per-org `assistant_tenant_data_enabled` toggle (still stubbed "coming soon" in settings). Build only when required.
- **Phase 4** (shipped 2026-05-21) — conversation history (list/search/load/delete, per-user), per-message 👍/👎 feedback (ordinal-keyed), founder analytics at `/superadmin/assistant`, monthly INR budget caps (402 enforcement + soft/hard alerts), PII-redaction retention cron. Plus quick-win: system prompt personalised with real org + employee name.
- **Phase 5** (built then reverted 2026-06-06) — proactive insights. Code shipped to main 2026-05-25 (`437c98b`), then reverted in `bc8b862` per user feedback ("don't like it"). Live Supabase `assistant_insights` table left in place (empty, idle — drop later if desired). Planning + design docs preserved as historical reference under `docs/superpowers/`. See `docs/superpowers/plans/2026-06-06-ai-hr-assistant-phase-5-rollback.md` for the rollback record. **No write tools, ever** (OQ-9).

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

**Migrations**: 022 (Phase 0 — conversations/messages/tool_calls/feedback), 023 (Phase 1 — pgvector + `app_help_chunks`), 024 (Phase 1 — `match_help_chunks` RPC), 025 (Phase 2 — `doc_chunks` + `documents.index_status/indexed_at/index_error`), 026 (Phase 2 — `match_doc_chunks` org-scoped RPC), 027 (Phase 4 — `assistant_budget` + `assistant_messages.created_at` index).

**Article corpus is at 55** (as of 2026-06-10). The route-registry integrity test in `tests/assistant/help-loader.test.ts` enforces symmetry between `src/lib/assistant/help/articles/` files and `src/lib/assistant/route-registry.ts` entries — bump the `toBe(N)` count when adding articles, and add a `route_registry.ts` entry whose key matches the article's `id` frontmatter. **After merging any article add/edit, run `npm run embed:help` on production** to rebuild `app_help_chunks` via Voyage; otherwise the assistant serves the stale corpus indefinitely.

**Crons**: `/api/cron/assistant-doc-reindex` (daily 6:00 UTC — Phase 2 doc reconcile), `/api/cron/assistant-redact` (daily 7:00 UTC — Phase 4 PII redaction + 90d delete).

**Per-org scope toggles** (`organizations.settings`): `assistant_enabled` (master, Phase 1), `assistant_tenant_docs_enabled` (Phase 2 — gates `docs_*` tools), `assistant_tenant_data_enabled` (Phase 3 — not yet wired). All default false; admin opts in per scope from Settings → AI Assistant.

**Doc ingestion scripts**: `npm run backfill:docs` (index existing company-wide docs), reconcile cron `/api/cron/assistant-doc-reindex` (daily 6am UTC, retries null/failed/pending). Upload-time ingest is the primary path (`waitUntil`).

**Env vars required**: `ANTHROPIC_API_KEY` (the chat model — `src/app/api/assistant/chat/route.ts` calls Anthropic directly via `@ai-sdk/anthropic`, NOT the Vercel AI Gateway; see gotcha #62 for why the gateway was dropped 2026-06-27), `VOYAGE_API_KEY` (server-only, RAG embeddings), `NEXT_PUBLIC_ASSISTANT_ENABLED=true` (client-side master switch). `AI_GATEWAY_API_KEY` is now vestigial.

**To enable for an org**: `update organizations set settings = settings || '{"assistant_enabled": true}'::jsonb where clerk_org_id = '...';`

**To rebuild the help index after editing articles**: `npm run embed:help` (wipes + rebuilds `app_help_chunks` via Voyage; ~30s for 25 articles).

**Migration 022** adds four tables: `assistant_conversations`, `assistant_messages`, `assistant_tool_calls`, `assistant_feedback`. RLS on all four (advisory — service-role bypasses per gotcha #5).

---

## Demo Org — test1

15-person org for Amol Gupta (`amolgupta007@gmail.com`). Departments: Engineering, Marketing, Sales, Operations, HR. Full seed data across all modules including payroll (Maharashtra/metro, ₹12–36 LPA by role), JambaHire (4 jobs, 10 candidates, full pipeline, 3 interviews, 2 offers), and JambaGeo (4 geofences, 12 leads across all 6 stages, 2 sample visits).

Seed scripts: `scripts/seed-payroll-demo.sql`, `scripts/seed-jambahire-demo.sql`, `scripts/seed-jambageo-demo.sql`
