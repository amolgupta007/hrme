# Mobile PRD-01 Phase A — Investigation Report & Monorepo Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** ✅ APPROVED by Amol 2026-07-05 — all §12 questions answered (see Decision Record). Ready for Phase B execution in a separate session.
**Date:** 2026-07-05

## Decision record (2026-07-05)

| Q | Decision |
|---|----------|
| Mobile data access | **Option A (BFF) approved.** PRD-01 acceptance criterion 3 amended per §3.4. |
| Typecheck gate | **Approved:** strict `typecheck` for `packages/*`; advisory (non-blocking) for `apps/web` while the Supabase `never` debt stands. |
| Vercel choreography | **Approved:** validation project → flip Root Directory → merge back-to-back. |
| Package naming | **Approved:** `@jambahr/shared` / `@jambahr/supabase` / `@jambahr/config`. |
| Mobile punch zone policy | **BYPASS (lenient).** Mobile GPS punches count regardless of zone assignment — see §5.2 gotcha 2 for the PRD-02 implementation consequence. |
| CI | **ADD.** Minimal GitHub Actions workflow lands in commit B2 (§11). |
**Goal:** Restructure `hr-portal` into a Turborepo monorepo (`apps/web` + `packages/*`) with zero functional change to the deployed web app, and document everything the Expo mobile app needs (auth model, shared-code inventory, attendance punch contract) so Phase B execution and the later mobile scaffold are mechanical.

**Architecture:** Pure `git mv` of the Next.js app into `apps/web` (history-preserving), npm workspaces + Turborepo at root, three package skeletons (`shared`, `supabase`, `config`), then small extraction commits that move pure modules into packages while leaving one-line re-export shims at the old paths so **zero consumer imports change**. Vercel cutover is a project-setting flip (Root Directory → `apps/web`) choreographed with the merge.

**Tech stack:** npm workspaces, Turborepo 2.x, Next.js 14.2.x (pinned — do not upgrade), TypeScript 5.5, Vitest 4.

## Global constraints (from PRD-01 + session rules)

- **Zero functional changes to the web app** in this PRD. Build wiring (workspaces, transpilePackages, shims) is in scope; behavior changes are not.
- Next.js stays pinned at **14.2.x**; `eslint-config-next` at **14.2.15** (CLAUDE.md version pins).
- `git mv` only — history must be preserved (moves in dedicated commits with **no content edits** in the same commit, so rename detection is 100%).
- Web must deploy identically from `apps/web` before any mobile work starts. **Approval gate there.**
- Never `git add -A` in this repo (many untracked tooling dirs: `.agents/`, `.codex/`, `.impeccable/`, `.superpowers/`, `sample-documents/`, etc.). Stage explicitly.
- Migrations to the live DB are applied via Supabase MCP / SQL Editor, not the CLI (Windows, gotcha #4). **This plan requires no DB change at all.**

---

## 1. Divergences between the PRDs and the real codebase (read first)

The PRDs are future-state specs. Four material divergences found; the codebase is the truth:

| # | PRD says | Codebase reality | Impact |
|---|----------|------------------|--------|
| D1 | "Clerk Organizations usage, how org_id reaches RLS via JWT… the same JWT template that injects `org_id` for Supabase RLS must work from mobile" (PRD-01 §2.2) | **Clerk Organizations were decoupled 2026-06-18.** There is no JWT template, no `org_id` claim, no Clerk→Supabase wiring. Tenancy = `employees` rows + signed `jambahr_active_org` cookie. All data access is service-role (RLS bypassed by design). | **Highest impact.** Mobile cannot replicate a JWT→RLS path that does not exist. See §3 for the two real options + recommendation. |
| D2 | PRD-01 acceptance criterion: "Supabase query of the signed-in employee's own record succeeds **under RLS**" | The advisory RLS policies (144 `auth.jwt()` references across 20+ migrations) were written for the **defunct Clerk-Organizations claim format** (`auth.jwt() ->> 'org_id'`, `org_role IN ('org:owner',…)`). Even if a Clerk JWT were wired to Supabase today, those claims are never minted — every policy would match nothing and all reads would return empty. | Criterion cannot be met as written. Propose amending to "…succeeds via an authenticated API call" (BFF, §3.4) or explicitly funding an RLS rebuild spike. |
| D3 | "CI must pass" (PRD-01 §2.1) | **No CI exists** — there is no `.github/` directory. The only automated gate is the Vercel build. | **DECIDED: add minimal CI.** A GitHub Actions workflow (lint + test + package typecheck) lands in commit B2; Vercel remains the build gate. |
| D4 | "`turbo typecheck` green across workspace" (PRD-01 §4) | `next.config.js` sets `typescript.ignoreBuildErrors: true` for a documented reason (gotcha #3: Supabase v2 type inference returns `never` on partial selects). A strict `tsc --noEmit` over `apps/web` is expected to be red today. | Phase B measures it (B2 step 4). If red: `typecheck` gates `packages/*` strictly; `apps/web` typecheck is added as a non-blocking task until the `never` debt is paid. Flagged for approval in §12. |

---

## 2. Current-state map (investigation task 1)

### 2.1 Repo shape (everything at root today)

```
hr-portal/
├── src/                  # app source: actions, app, components, config, content, lib, types,
│                         #   middleware.ts, instrumentation.ts
├── public/               # static assets (Jamba.png, Jamba-s.png, pics/, csv template, html)
├── tests/                # Vitest suites (15 subdirs + setup.ts)
├── scripts/              # tsx/node/sql maintenance scripts, own tsconfig extending ../tsconfig.json
├── eslint-rules/         # custom rule no-orphan-dashboard-route (wired via lint --rulesdir)
├── supabase/             # config.toml + 97 migrations (live DB is managed via MCP/SQL Editor)
├── docs/                 # PRDs, plans, operator docs
├── sample-documents/     # UNTRACKED source assets used by 2 scripts
├── next.config.js, tailwind.config.ts, postcss.config.js, tsconfig.json, .eslintrc.json,
│   vitest.config.ts, components.json, .prettierrc, vercel.json, .vercelignore,
│   sentry.client.config.ts, sentry.server.config.ts, sentry.edge.config.ts,
│   package.json, package-lock.json, CLAUDE.md, README.md, PRODUCT.md, PAYROLL_AUDIT.md
└── .claude/ .agents/ .codex/ .impeccable/ .superpowers/ .vercel/  # tooling dirs (stay at root)
```

Key config facts:

- **`package.json`** — name `hr-portal`, 70 deps + 20 devDeps. Scripts: `dev/build/start/lint` (lint = `next lint --rulesdir eslint-rules`), `db:generate/db:push/db:reset/db:seed`, `embed:help`, `backfill:docs`, `stripe:listen`, `convert-legal`, `test`, `test:watch`. Pre-existing rot: `db:seed` references `scripts/seed.ts` which **does not exist**; `db:generate` writes to `src/lib/database.types.ts` but the real file lives at `src/types/database.types.ts`.
- **`next.config.js`** — `ignoreBuildErrors`, `ignoreDuringBuilds`, `serverComponentsExternalPackages: [@react-email/render, @react-email/components, @anthropic-ai/sdk, sharp, unpdf, mammoth, @react-pdf/renderer]`, `outputFileTracingIncludes` → `./public/Jamba-s.png`, wrapped in `withSentryConfig` (uses `SENTRY_ORG`/`SENTRY_PROJECT`).
- **`tsconfig.json`** — alias `@/*` → `./src/*`. `vitest.config.ts` duplicates the alias via `path.resolve(__dirname, './src')`. `scripts/tsconfig.json` extends `../tsconfig.json` and includes `../src/components/emails/**`.
- **`vercel.json`** — `framework: nextjs`, `buildCommand: next build`, `regions: ["bom1"]`, **18 crons** (two carry baked-in query strings).
- **No `.github/` CI, no `.env.example`, no `.npmrc`/`.nvmrc`.**

### 2.2 `process.cwd()`-relative reads (must move WITH the app)

These resolve against the Next.js app root at runtime; they keep working after the move because both the readers and the content move together and Vercel sets cwd to the Root Directory:

| Reader | Reads |
|---|---|
| `src/lib/blog.ts` | `process.cwd()/src/content/blog` |
| `src/lib/legal.ts` | `process.cwd()/src/content/legal` |
| `src/lib/runbooks.ts` | `process.cwd()/src/content/runbooks` |
| `src/lib/assistant/help/index.ts` | `process.cwd()/src/lib/assistant/help/articles` |
| `src/lib/social/image-gen.ts` | `process.cwd()/public/Jamba-s.png` (paired with `outputFileTracingIncludes`) |

Scripts with cwd/relative paths: `scripts/convert-legal-docs.js` (reads `process.cwd()/sample-documents/policy` — breaks post-move unless run from repo root or path-fixed; see B7), `scripts/upload-employee-avatars.mjs` (`__dirname/../sample-documents/pics` — same), `embed:help`/`backfill:docs` (`tsx --env-file=.env.local` — `.env.local` must be copied into `apps/web`).

`src/instrumentation.ts` imports `../sentry.server.config` / `../sentry.edge.config` — the three root `sentry.*.config.ts` files must move into `apps/web/` alongside `src/` to preserve the relative import.

### 2.3 Env var inventory (names only)

**Client (`NEXT_PUBLIC_*`, 9):** `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `NEXT_PUBLIC_MAPBOX_TOKEN`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_ASSISTANT_ENABLED`, `NEXT_PUBLIC_SENTRY_DSN`.

**Server-only (from `src/` + `scripts/`):** `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `VOYAGE_API_KEY`, `SUPERADMIN_SECRET`, `SUPERADMIN_SESSION_TOKEN`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_{GROWTH,BUSINESS}_{MONTHLY,ANNUAL}_PLAN_ID` (4), `RAZORPAYX_CRED_ENCRYPTION_KEY`, `CLERK_WEBHOOK_SECRET`, `CLERK_SMS_WEBHOOK_SECRET`, `MSG91_AUTHKEY`, `MSG91_TEMPLATE_ID`, `MSG91_OTP_VAR_NAME`, `INDEED_LIVE`, `INDEED_CLIENT_ID`, `INDEED_CLIENT_SECRET`, `INDEED_APPLY_SHARED_SECRET`, `SOCIAL_AGENT_ENABLED`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_TOKEN`, `BUFFER_ACCESS_TOKEN`, `BUFFER_ORG_ID`, `BUFFER_LINKEDIN_CHANNEL_ID`, `BUFFER_GRAPHQL_URL`, `JAMBAHIRE_REFERRALS_ENABLED`, `WHATSAPP_CENTRALIZED_{PROVIDER,API_KEY,ENDPOINT,TPL_LATE,TPL_INELIGIBLE,TPL_WARN}` (6).

**Build/tooling:** `SENTRY_ORG`, `SENTRY_PROJECT` (next.config.js), `SUPABASE_PROJECT_ID` (`db:generate`). Clerk publishable/secret keys are consumed implicitly by `@clerk/nextjs`.

**Vercel is unaffected by the migration** — env vars are project-level, not path-level. Mobile-side env handling (`EXPO_PUBLIC_*`, EAS secrets) is Phase C scope.

---

## 3. Auth today — what a Clerk Expo client must replicate (investigation task 2)

### 3.1 What Clerk actually does

Clerk is **identity only**: `userId`, sessions, sign-in/up UI, email + phone-OTP (MSG91 BYO-SMS via the `clerk-sms` webhook). `auth().orgId` is never read anywhere. Clerk Organizations, org invitations, and org webhooks were all removed 2026-06-18.

### 3.2 How tenancy actually resolves (`src/lib/current-user.ts`)

1. `auth()` → Clerk `userId`. No userId → null.
2. Load ALL non-terminated `employees` rows for that `clerk_user_id` (joined to `organizations`) — an org membership **is** an `employees` row. One login can belong to many orgs.
3. If zero rows: one-time auto-link fallback — match by email, then phone, against unlinked employee rows, back-fill `clerk_user_id`, reload. Still zero → return null (dashboard redirects to `/onboarding`).
4. Active org = the org named by the signed, httpOnly `jambahr_active_org` cookie **iff** the caller has a membership in it (`resolveActiveOrg` in `src/lib/auth/active-org.ts`); else first membership by `created_at ASC`. The cookie is a hint, re-validated every request.
5. Role, `employeeId`, plan, and 7 feature flags come off that active membership + org row.

### 3.3 How data access actually works

- Every server action uses `createAdminSupabase()` (**service-role key**, RLS bypassed by design — gotcha #5). Org isolation is app-layer: every query filters `.eq("org_id", user.orgId)` after `getCurrentUser()`.
- The anon-key clients (`createServerSupabase`, browser `createClient` in `src/lib/supabase/`) are **dead code** — referenced nowhere outside their own folder.
- RLS policies exist on all tables but are advisory, written in the old Clerk-Organizations claim pattern (D2). They activate for no one.

### 3.4 Consequence for mobile — the decision Amol must make

A mobile client **cannot** talk to Supabase directly today: the service-role key must never ship in an app binary, and the anon key + existing RLS yields zero rows. Two real options:

**Option A — BFF (recommended): mobile calls the Next.js backend.**
- Mobile signs in with `@clerk/clerk-expo` (same Clerk instance → same `userId`, email + phone-OTP both work).
- Mobile calls new `/api/mobile/*` route handlers in `apps/web`, sending the Clerk session token as `Authorization: Bearer <token>`; Clerk's Next.js SDK verifies it server-side, then org/role resolution reuses the exact `getCurrentUser()` machinery.
- One adaptation needed: active-org selection is cookie-based (`jambahr_active_org`, httpOnly) — mobile sends an `X-Org-Id` header instead; the server validates it against real memberships exactly as `resolveActiveOrg` does (same tamper-safety property).
- Pros: zero RLS work, reuses every existing guard (`isAdmin`, plan gating, feature flags), zero schema change, DPDP posture unchanged (service key stays server-side). Cons: mobile features wait on API endpoints (they'd wait on RLS policies otherwise — strictly less work).
- Fits the PRD's own hint: "a Supabase Auth migration is under consideration separately; isolate all auth code behind a thin `packages/shared/auth` interface."

**Option B — real Clerk-JWT → Supabase RLS.** Wire Supabase third-party auth to Clerk, mint a session claim, and **rewrite every RLS policy** (the current ones check claims that no longer exist; the new model would need membership-subquery policies against `employees`, across ~90 tables). Weeks of work, high blast radius, contradicts "zero functional changes." Not recommended for PRD-01; revisit only if offline-first direct-to-DB sync ever becomes a requirement.

**Recommendation: Option A — APPROVED 2026-07-05.** PRD-01 acceptance criterion 3 is amended to: *"sign in on device → correct role-based tab set renders → an authenticated `/api/mobile/me` call returns the signed-in employee's own record (org-scoped server-side)."* The Phase C spike then proves: Expo Clerk sign-in (email + phone-OTP) → bearer-token call → `getCurrentUser`-equivalent resolution.

---

## 4. Shared-package extraction inventory (investigation task 3)

Mobile's first features: attendance (view/punch/regularization), leave (apply/balance), payslips, profile, role-based navigation. Verdicts below; **purity** = no `"use server"`/`"use client"`, no Next/React/DOM imports, no server-only deps.

### 4.1 MOVE to `packages/shared` (pure, mobile-needed)

| File | Exports (key) | Mobile feature |
|---|---|---|
| `src/types/index.ts` | `UserRole`, `ROLE_HIERARCHY`, `hasPermission`, `isOwner`, `ActionResult<T>`, row-type shortcuts, `NavItem` | navigation, everything |
| `src/lib/ctc.ts` | `computeCTCBreakdown`, `computeTaxByRegime`, `computeMonthsInFY`, `formatINR`, `INDIAN_STATES`, `DEFAULT_RATIO_CONFIG` | payslips |
| `src/lib/payroll/line-items.ts` | `LineItemCategory`, `sumLineItems`, `partitionByTaxable` | payslips |
| `src/lib/payroll/late-penalty.ts` | `computeLatePenaltyDeduction` | payslips |
| `src/lib/phone.ts` | `normalizePhone`, `isValidPhone` | profile |
| `src/lib/employees/employee-schema.ts` | `employeeSchema` (Zod), `EmployeeFormData` | profile |
| `src/config/plans.ts` | `OrgPlan`, `hasFeature`, `PLAN_FEATURES` | plan-gated nav |
| `src/lib/attendance/week-off.ts` | `isWeekOff`, `resolveEffectiveWeekOff`, `isAltSaturdayOff` | attendance |
| `src/lib/attendance/lateness.ts` | `computeLateness` (IST math) | attendance |
| `src/lib/attendance/daily-attendance.ts` | `computeDailyAttendance`, `dedupePunches` | attendance |
| `src/lib/attendance/pair-punches.ts` | `pairPunches` | attendance |
| `src/lib/attendance/shift-time.ts` | `parseHHMM`, `isOvernight`, `computeShiftTotalHours` | attendance |
| `src/lib/attendance/attribute-date.ts` | `attributedDateForClockIn` (IST) | attendance |
| `src/lib/attendance/ot.ts` | `computeDailyOvertimeMinutes`, `computeHourlyRate` | attendance |
| `src/lib/attendance/overtime-types.ts` | `OvertimeSettings`, `DEFAULT_OT_SETTINGS` | attendance |
| `src/lib/attendance/late-penalty-bands.ts` | `resolvePenaltyDays`, `validateBands` | attendance/payslips |
| `src/lib/utils.ts` (SPLIT) | pure formatters only: `formatDate`, `formatDateTime`, `timeAgo`, `formatRelativeDay`, `formatCurrency`, `capitalize`, `slugify`, `getInitials`, `sleep` | all |

`src/lib/utils.ts#cn` (clsx + tailwind-merge) **stays in web** — DOM/Tailwind-only.

### 4.2 MOVE to `packages/supabase`

| File | Note |
|---|---|
| `src/types/database.types.ts` | The generated `Database` interface (874 lines). Canonical home per PRD. Also fix `db:generate` output path to match. |
| (pattern, later) `resolve-zone.ts`, `company-group.ts` | Client-injected query helpers (`(supabase, …) => …`) — the right shape for `packages/supabase` helpers, but only needed by web today. Move when mobile needs them; `manager-scope.ts` must first be refactored to accept a client instead of instantiating one. |

### 4.3 KEEP in web (impure or web-only domain)

`src/lib/supabase/*` (next/headers + service-role — must never reach mobile), `lib/calendar.ts` (DOM), `config/navigation.ts` (web routes; mobile authors its own tab manifest reusing the `NavItem` type), `config/onboarding-seed.ts`, all attendance ingest/device modules (`adms-ingest`, `adms-commands`, `iclock-path`, `device-provisioning`, `device-command-diff`, `cross-org-resolution`, `late-policy-dispatch`, `simulate-adms-punch`), `lib/payroll/recompute-entry.ts` + `disbursement-reconcile.ts`, `lib/hire/*` (pure but ATS-domain; they also type-import from a `"use server"` file — extracting would need `ApplicationStage` pulled into shared first), all of `src/actions/*`.

### 4.4 Zod schemas — mostly inline, extraction deferred

Input schemas live **inline inside `"use server"` action files** (`requestLeaveSchema` in `actions/leaves.ts`, `SalaryStructureSchema` etc. in `actions/payroll.ts`, profile schemas in `actions/profile.ts`, …). They are plain `z.object` declarations and extractable — this is the single highest-value future extraction (shared client+server validation for punch/regularize/leave-apply/profile-edit) — but touching server actions carries functional-change risk, so it is **deferred to PRD-02**, extracted per-feature as mobile consumes each endpoint. Phase B extracts only the standalone-module schemas (`employee-schema.ts`).

---

## 5. Attendance write path — the mobile punch contract (investigation task 4)

Documented now so PRD-02 doesn't rediscover it. **No DB change in this PRD**; the migration below ships with PRD-02.

### 5.1 How punches flow today

- **Device (ADMS)**: `POST /iclock/cdata` → `ingestAttlog` resolves org by serial + employee by PIN (`employees.device_code`), converts device-local IST → UTC, inserts one row per punch into **`attendance_punch_events`** (`source: 'adms'`, `device_id`, `location_id` = the device's location, `status` defaults `'approved'`), dedupes on `uq_punch_events_dedupe (org_id, employee_id, punched_at, coalesce(device_id, zero-uuid))`, then calls `recomputeAttendanceDay(supabase, orgId, employeeId, istDate)` per affected day.
- **Rollup**: `recomputeAttendanceDay` (in `adms-ingest.ts`) takes the day's `approved` events, resolves the employee's zone (`resolveEmployeeZoneLocationIds`), runs pure `computeDailyAttendance` (min = first-in, max = last-out, chronological pairing, dedupe window 60s, direction never trusted), and **upserts `attendance_records`** on `(org_id, employee_id, date)` with `source: 'device'`.
- **Web clock-in (`actions/attendance.ts`)**: writes **`attendance_records` directly** (`source: 'web'`) — it never enters the punch-event stream, and it *contends* with the rollup for the same unique daily row (recompute upsert overwrites a web row and vice versa). **Mobile must NOT copy the web path** — it must use the event stream.

### 5.2 Exact contract for a future mobile punch

Insert into `attendance_punch_events` (template: the manual-punch insert in `src/actions/attendance-punches.ts:145-164`):

```
org_id:      caller's org           employee_id: from auth session
device_id:   null                   location_id: real locations.id if GPS-resolved, else null
punched_at:  UTC ISO                source:      'mobile'   ← needs migration, see below
punch_type:  'in' | 'out' (optional; direction re-derived anyway)
status:      'approved' (or 'pending' → held for review, contributes no hours until approved)
raw_payload: { gps, accuracy, … }
```

Then call `recomputeAttendanceDay(supabase, orgId, employeeId, istDate)` with the **IST calendar date** of the punch. That's the whole integration.

**Blockers/gotchas the PRD-02 implementer must know:**

1. **`source` CHECK rejects `'mobile'` today** — migration 078 constrains `source IN ('web','device','manual','adms')`. PRD-02 needs a one-line CHECK-widening migration (or interim `'manual'`, not recommended — audit clarity).
2. **Zone exclusion silently drops null-location punches for zoned employees** — if the employee has an `employee_zone_assignments` row, `computeDailyAttendance` keeps only punches whose `location_id` is in the resolved zone set; `location_id: null` is dropped and counted in `out_of_zone_count`. **DECIDED 2026-07-05: mobile punches BYPASS zone filtering (lenient).** Implementation consequence for PRD-02: the zone filter in `computeDailyAttendance` (or its caller `recomputeAttendanceDay`) must be extended so events with `source: 'mobile'` are always kept, regardless of the employee's zone — e.g. pass `source` through the `PunchEvent` shape and exempt `'mobile'` from the location check. Pure-function change + unit tests; biometric punches keep today's strict zone semantics.
3. **Dedupe collision**: with `device_id: null` (coalesced to zero-uuid), two punches at the identical `punched_at` for one employee collide — fine in practice (distinct timestamps), worth knowing.
4. `attendance_records.source` needs no change — the rollup always writes `'device'`.

---

## 6. Target Turborepo structure

```
hr-portal/                          # repo root (name stays; npm workspaces + turbo)
├── apps/
│   └── web/                        # the entire current Next.js app, moved via git mv
│       ├── src/  public/  tests/  scripts/  eslint-rules/
│       ├── next.config.js  tailwind.config.ts  postcss.config.js  tsconfig.json
│       ├── .eslintrc.json  vitest.config.ts  components.json  .prettierrc
│       ├── sentry.client.config.ts  sentry.server.config.ts  sentry.edge.config.ts
│       ├── vercel.json  .vercelignore  .env.local (untracked, copied manually)
│       └── package.json            # name: "web" (renamed in B2, not in the move commit)
│   └── mobile/                     # Phase C (Expo) — NOT created in Phase B
├── packages/
│   ├── shared/                     # @jambahr/shared — pure types, schemas, compute, formatters
│   │   └── src/{index.ts, types/, attendance/, payroll/, phone.ts, plans.ts, format.ts}
│   ├── supabase/                   # @jambahr/supabase — generated Database types (+ future query helpers)
│   │   └── src/{index.ts, database.types.ts}
│   └── config/                     # @jambahr/config — tsconfig base (design tokens arrive in Phase C)
│       └── tsconfig.base.json
├── docs/  supabase/  CLAUDE.md  README.md  PRODUCT.md  PAYROLL_AUDIT.md   # stay at root
├── package.json                    # workspaces + turbo scripts
├── package-lock.json               # regenerated at root (workspaces need a root lock)
├── turbo.json
└── .gitignore                      # updated for apps/* paths
```

Decisions locked in (flag if you disagree — §12):

- **`supabase/` stays at repo root.** The CLI convention expects it there; live migrations go via MCP/SQL Editor regardless; moving it buys nothing.
- **`docs/`, `CLAUDE.md`, tooling dirs stay at root.** One CLAUDE.md for the monorepo (updated in B8).
- **`scripts/` and `tests/` move with the app** (they reach into `../src` and are web-app-scoped).
- **Package consumption via workspace deps + `transpilePackages`** (`next.config.js` gains `transpilePackages: ["@jambahr/shared","@jambahr/supabase"]`) — packages ship TS source, no build step, and Metro (Phase C) consumes the same source.
- **Re-export shims**: every extracted module leaves a one-liner at its old path (`export * from "@jambahr/shared/…"`), so no consumer import changes and rename detection stays intact. Shim removal is optional later cleanup.

---

## 7. Exact file-move map (Commit B1)

```bash
mkdir -p apps/web

# App source + assets + tooling that belongs to the app
git mv src           apps/web/src
git mv public        apps/web/public
git mv tests         apps/web/tests
git mv scripts       apps/web/scripts
git mv eslint-rules  apps/web/eslint-rules

# App-level config files
git mv next.config.js          apps/web/next.config.js
git mv tailwind.config.ts      apps/web/tailwind.config.ts
git mv postcss.config.js       apps/web/postcss.config.js
git mv tsconfig.json           apps/web/tsconfig.json
git mv .eslintrc.json          apps/web/.eslintrc.json
git mv vitest.config.ts        apps/web/vitest.config.ts
git mv components.json         apps/web/components.json
git mv .prettierrc             apps/web/.prettierrc
git mv sentry.client.config.ts apps/web/sentry.client.config.ts
git mv sentry.server.config.ts apps/web/sentry.server.config.ts
git mv sentry.edge.config.ts   apps/web/sentry.edge.config.ts
git mv vercel.json             apps/web/vercel.json
git mv .vercelignore           apps/web/.vercelignore
git mv package.json            apps/web/package.json   # content byte-identical in this commit

# Lock file: workspaces require a ROOT lock — remove and regenerate (B1 step 4)
git rm package-lock.json
```

Untracked files (no `git mv` possible — manual copy): `.env.local` and `.env.production.local` → copy into `apps/web/`. `next-env.d.ts` is gitignored and regenerates. **`sample-documents/` stays at root untouched.**

Stays at root (no action): `docs/`, `supabase/`, `CLAUDE.md`, `README.md`, `PRODUCT.md`, `PAYROLL_AUDIT.md`, `MOVE.md`, `skills-lock.json`, `.gitignore` (edited in B1), all dot-tooling dirs.

Path integrity after the move (verified during investigation): `scripts/tsconfig.json` extends `../tsconfig.json` and includes `../src/…` — both now inside `apps/web`, still correct. `instrumentation.ts` → `../sentry.*.config` — both inside `apps/web`, still correct. All five `process.cwd()` readers move with their content (§2.2). `outputFileTracingIncludes` `./public/…` — relative to app root, still correct.

---

## 8. Vercel changes

One manual dashboard change on the existing project (+ one temporary validation project):

1. **Validation first (recommended):** create a throwaway Vercel project pointed at the same GitHub repo, branch `feat/monorepo-foundation`, **Root Directory = `apps/web`**, "Include source files outside of the Root Directory in the Build Step" = **ON** (needed for `packages/*`), copy env vars (or scope-limit to what the build needs + runtime smoke set). Confirm it builds and serves. Delete afterward.
2. **Cutover (B4):** on the production project: Settings → Build & Deployment → **Root Directory: `apps/web`** (leave framework auto-detect; `apps/web/vercel.json` supplies buildCommand/regions/crons). Root Directory changes apply to **all future deployments of every branch** — so flip the setting and merge the branch **back-to-back** (setting first, merge immediately after; the window where an old-layout commit could deploy under the new setting is the gap between the two actions).
3. **Crons**: Vercel reads `vercel.json` from the Root Directory — the 18 crons ride along unchanged. Verify post-deploy (B4 step 6).
4. **Env vars, domains, webhook URLs (`/api/webhooks/*`, `/iclock/*`): unchanged** — routes are identical, only the build root moved.

---

## 9. Risk list with mitigations

| # | Risk | Likelihood | Mitigation |
|---|------|-----------|------------|
| R1 | Root Directory flip is project-wide and instant → a mis-sequenced flip deploys a broken layout to prod | Med | Validation project first (§8.1); flip+merge back-to-back; Vercel **Instant Rollback** restores the previous deployment in one click regardless of settings |
| R2 | `package-lock.json` regeneration bumps transitive deps and changes build behavior | Med | Versions stay caret-pinned in `apps/web/package.json` (Next 14.2.x, eslint-config-next 14.2.15 exact); after regen run full build+tests; diff `npm ls next eslint-config-next` before/after |
| R3 | `process.cwd()` content reads (blog/legal/runbooks/help/logo) break if Vercel's cwd ≠ apps/web | Low | Vercel sets cwd to Root Directory; explicit post-deploy smoke of `/blog/*`, `/privacy`, a runbook page, assistant help search, and `/superadmin/social` image gen (B4 step 5) |
| R4 | Root `.gitignore` anchored patterns (`/.next/`, `/node_modules`, `/supabase/.temp/`) stop matching under `apps/web` → build junk gets staged | High (cosmetic) | Update `.gitignore` in B1 (unanchored `.next/`, `node_modules/`, add `apps/web/next-env.d.ts`); never `git add -A` |
| R5 | `git mv` + content edits in the same commit degrade rename detection → history breaks | Low | B1 is moves-only (package.json byte-identical); all edits land in B2+; verify with `git log --follow apps/web/src/lib/ctc.ts` |
| R6 | Sentry release/sourcemap upload path assumptions in `withSentryConfig` | Low | Config moves with the app; `SENTRY_ORG`/`SENTRY_PROJECT` are env-level; verify a Sentry event arrives post-deploy (B4 step 5) |
| R7 | `db:generate`/`db:push` scripts break (supabase/ at root, scripts now in apps/web) | Low | Pre-broken/unused on Windows anyway (gotcha #4; `db:seed` target doesn't even exist); B7 re-points or documents; live migrations continue via MCP |
| R8 | `convert-legal` / avatar scripts lose `sample-documents/` relative path | Low | B7 one-line path fixes (`../../sample-documents`), or run them from repo root; both are occasional dev tools |
| R9 | Vitest/tsc/eslint path resolution breaks after move | Med | All three configs move together with identical relative shapes; B1 verification runs all three before anything else happens |
| R10 | Windows long-path issues on the deep moved tree | Low | Repo already runs deep paths on this machine; `git config core.longpaths true` if a move errors |
| R11 | Extraction commits accidentally change behavior (import cycles, `"use server"` boundary violations) | Med | Shim pattern keeps consumer imports unchanged; every extracted module is verified-pure (§4); one cluster per commit, full test suite after each; extracted-module tests keep running from `apps/web/tests` unchanged via the shims |
| R12 | The two baked-URL crons (`onetime-nudge?...`) mis-fire during the deploy window | Low | They ride in `vercel.json` unchanged; check Vercel cron dashboard post-cutover (B4 step 6) |

## 10. Rollback plan

- **Before anything:** `git tag pre-monorepo-2026-07 <main-sha>` and push the tag. Confirm latest prod deployment is marked in Vercel (candidate for Instant Rollback).
- **Web down after cutover:** (1) Vercel → Deployments → **Instant Rollback** to the last pre-cutover deployment — this restores serving immediately and is independent of the Root Directory setting; (2) revert Root Directory to empty; (3) `git revert -m 1 <merge-commit>` on main (or fast-forward reset if nothing landed after) so subsequent deploys build the old layout.
- **Broken before cutover:** nothing to roll back — all commits live on `feat/monorepo-foundation`; main and prod untouched.
- **Data:** zero DB/schema changes in this entire PRD → no data rollback surface. Webhooks/crons/domains unchanged.
- **Extraction commit regressions post-cutover:** each extraction is an isolated commit with a shim — `git revert <sha>` cleanly restores the previous layout for that cluster.

---

## 11. Phase B execution checklist (commit-by-commit)

> Run in a separate approved session. Branch: `feat/monorepo-foundation` off `main`. Baseline first, verification after every commit. Never `git add -A`.

### B0 — Baseline (no commit)

- [ ] `git checkout -b feat/monorepo-foundation && git tag pre-monorepo-2026-07`
- [ ] Record green baseline: `npm run build` → exit 0 (stop all dev servers first — gotcha #92); `npm run test` → all pass (note count); `npm run lint` → warnings only. Save outputs for comparison.

### B1 — Commit `chore(monorepo): move web app to apps/web (git mv, history-preserving)`

- [ ] Execute the exact move map from §7 (moves only; `apps/web/package.json` byte-identical)
- [ ] Copy `.env.local` + `.env.production.local` → `apps/web/` (manual, untracked)
- [ ] Create new **root** `package.json`:

```json
{
  "name": "jambahr",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "build": "npm run build --workspace=hr-portal",
    "test": "npm run test --workspace=hr-portal",
    "lint": "npm run lint --workspace=hr-portal"
  }
}
```

  (Temporary pass-through scripts; replaced by turbo in B2. Workspace name is still `hr-portal` in this commit.)
- [ ] Update root `.gitignore`: unanchor `.next/` and `node_modules/`; change `/supabase/.temp/` stays (supabase didn't move); add `apps/web/next-env.d.ts`, keep `.env*.local`
- [ ] `npm install` at root (regenerates root `package-lock.json`)
- [ ] **Verify:** `npm run build` → exit 0; `npm run test` → same pass count as B0; `npm run lint` → same as B0; `npm ls next eslint-config-next` matches baseline versions; `git log --follow apps/web/src/lib/ctc.ts` shows pre-move history
- [ ] Stage explicitly (`git add apps/web package.json package-lock.json .gitignore` + removed paths); commit

### B2 — Commit `chore(monorepo): add turborepo pipelines`

- [ ] Add `turbo` (^2.x) to root devDependencies; add `turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": [".next/**", "!.next/cache/**"] },
    "dev": { "cache": false, "persistent": true },
    "lint": {},
    "test": {},
    "typecheck": {}
  }
}
```

- [ ] `apps/web/package.json`: rename `"name"` to `"web"`; add `"typecheck": "tsc --noEmit"`
- [ ] Root scripts → `"build": "turbo build"`, `"test": "turbo test"`, `"lint": "turbo lint"`, `"typecheck": "turbo typecheck"`, `"dev": "turbo dev"`
- [ ] **Measure D4:** `npx turbo typecheck --filter=web` — record red/green. If red (expected, gotcha #3): leave the script in place, note the count, and gate D4 per the Decision Record (strict for packages, advisory for web — do NOT fix `never` errors in this PRD)
- [ ] Add minimal CI (per Decision Record) — create `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx turbo lint test
```

  Deliberately **no `next build` in CI** — the build needs real env vars (Clerk keys are read implicitly by `@clerk/nextjs` at build time) and Vercel already gates every deploy with a full build. When B3 lands, extend the last line to `npx turbo lint test typecheck --filter=!web` territory — concretely, after B3 change it to `npx turbo lint test && npx turbo typecheck --filter=@jambahr/shared --filter=@jambahr/supabase` (strict packages, advisory web per the Decision Record).
- [ ] **Verify:** `npx turbo build --filter=web` exit 0; `npx turbo test --filter=web` same pass count; commit; push branch and confirm the Actions run is green on GitHub before proceeding

### B3 — Commit `chore(monorepo): scaffold packages/shared, packages/supabase, packages/config`

- [ ] `packages/config/tsconfig.base.json` (strict base extracted from apps/web tsconfig compilerOptions, minus Next-specific bits)
- [ ] `packages/shared/package.json` → `{ "name": "@jambahr/shared", "version": "0.0.0", "private": true, "main": "src/index.ts", "types": "src/index.ts", "dependencies": { "zod": "^3.23.0", "date-fns": "^3.6.0" } }` + empty `src/index.ts` + tsconfig extending the base + `"typecheck": "tsc --noEmit"`
- [ ] `packages/supabase/package.json` → `@jambahr/supabase`, same shape, no deps yet
- [ ] `apps/web/package.json`: add `"@jambahr/shared": "*", "@jambahr/supabase": "*"` to dependencies; `next.config.js`: add `transpilePackages: ["@jambahr/shared", "@jambahr/supabase"]`
- [ ] `npm install` at root
- [ ] **Verify:** `npx turbo build --filter=web` exit 0; `npx turbo typecheck --filter=@jambahr/shared --filter=@jambahr/supabase` green; commit

### B4 — Vercel cutover (manual + merge; the approval-gated moment)

- [ ] Validation project: new Vercel project on this repo, branch `feat/monorepo-foundation`, Root Directory `apps/web`, include-files-outside-root ON, env vars copied → build green, `/`, `/sign-in`, `/blog`, `/privacy` render
- [ ] Production project: flip Root Directory → `apps/web` (include-outside-root ON), then **immediately** merge the branch to main (no intervening pushes)
- [ ] **Verify prod deploy:** build green in Vercel; smoke: sign-in → dashboard, `/blog/<any-post>`, `/privacy`, assistant help answer (cwd-read paths), one `/careers/*` page, `/superadmin` login page
- [ ] **Verify crons:** Vercel → Settings → Cron Jobs lists all 18; trigger one manually (e.g. `webhook-events-cleanup`) with `Authorization: Bearer $CRON_SECRET` → 200
- [ ] **Verify Sentry:** confirm a new event/release appears post-deploy
- [ ] **Verify webhooks:** Clerk + Razorpay dashboards show no delivery failures over the next hours; `/iclock/getrequest?SN=<known-serial>` returns `OK`
- [ ] Delete the validation project

### B5 — Commit `refactor(shared): move generated Database types to @jambahr/supabase`

- [ ] `git mv apps/web/src/types/database.types.ts packages/supabase/src/database.types.ts`; `packages/supabase/src/index.ts` → `export type { Database } from "./database.types";` (+ re-export `Json` and table helper types if referenced)
- [ ] Shim at old path `apps/web/src/types/database.types.ts`: `export * from "@jambahr/supabase";` (type-only re-export — zero consumer churn)
- [ ] Fix `db:generate` script to write `packages/supabase/src/database.types.ts` (also fixes the pre-existing wrong path)
- [ ] **Verify:** `npx turbo build --filter=web` exit 0; `npx turbo test` same pass count; commit

### B6 — Commit `refactor(shared): extract pure attendance + payroll compute to @jambahr/shared`

- [ ] `git mv` into `packages/shared/src/`: the §4.1 attendance cluster (`week-off`, `lateness`, `daily-attendance`, `pair-punches`, `shift-time`, `attribute-date`, `ot`, `overtime-types`, `late-penalty-bands`), `ctc.ts`, `payroll/line-items.ts`, `payroll/late-penalty.ts`, `phone.ts`, `employees/employee-schema.ts`, `config/plans.ts` → mirror paths under `packages/shared/src/{attendance,payroll,…}`
- [ ] Split `apps/web/src/lib/utils.ts`: pure formatters → `packages/shared/src/format.ts`; `cn` stays; `utils.ts` re-exports the formatters from `@jambahr/shared` so its consumers are untouched
- [ ] One-line shims at every old path (`export * from "@jambahr/shared/attendance/week-off"` etc.); fix intra-package relative imports (e.g. `lateness` → `shift-time`, `daily-attendance` → `pair-punches`, `late-penalty` → `late-penalty-bands`, `employee-schema` → `phone`) to package-internal relatives; populate `packages/shared/src/index.ts`
- [ ] `src/types/index.ts` re-exports (`UserRole`, `hasPermission`, `ActionResult`, `NavItem`, row shortcuts) → move the pure type block to `packages/shared/src/types.ts`, keep `src/types/index.ts` as shim + geo/domain leftovers
- [ ] **Verify:** `npx turbo typecheck --filter=@jambahr/shared` green; `npx turbo test --filter=web` — attendance/payroll/ctc suites (`tests/attendance/*`, `tests/payroll/*`) all pass unchanged; `npx turbo build --filter=web` exit 0; commit
- [ ] Push, confirm prod deploy green

### B7 — Commit `chore(monorepo): fix script paths + document commands`

- [ ] `scripts/convert-legal-docs.js`: `sample-documents/policy` → `path.join(process.cwd(), "..", "..", "sample-documents", "policy")` (or document "run from repo root"); same decision for `upload-employee-avatars.mjs`
- [ ] Root README section: monorepo layout, `npm run dev` (→ turbo), `npx turbo dev --filter=web`, where `.env.local` lives now
- [ ] **Verify:** `node apps/web/scripts/convert-legal-docs.js --help`-style dry run or documented invocation works; `npx turbo build --filter=web` exit 0; commit

### B8 — Commit `docs: update CLAUDE.md for monorepo`

- [ ] CLAUDE.md: new structure map (§6), command cheatsheet (`npx turbo dev --filter=web`, `--filter=@jambahr/shared`), the rule **"Mobile PRDs are future-state specs; always inspect `apps/web` and the real schema for divergence before implementing"**, note that `supabase/` stays at root and `.env.local` lives in `apps/web/`
- [ ] **Verify:** `npx turbo build --filter=web` exit 0 (docs-only, sanity); commit; push; confirm prod deploy green
- [ ] **PRD-01 §2.1 approval gate reached:** web deploys identically from `apps/web` → get Amol's sign-off before any Phase C (Expo scaffold) work

### Phase C preview (separate session, after gate — not in this checklist)

Expo scaffold per PRD-01 §2.2, **preceded by the auth spike**: `@clerk/clerk-expo` sign-in (email + phone-OTP) → bearer-token call to a new `/api/mobile/me` → employee record over the BFF (per §3.4 Option A, assuming approval). Design tokens into `packages/config`, Metro workspace config, Sentry RN project, EAS setup.

---

## 12. Open questions — RESOLVED

All six questions were answered by Amol on 2026-07-05. See the **Decision record** at the top of this document. Summary: BFF approved, typecheck compromise approved, Vercel choreography approved, `@jambahr/*` naming approved, mobile punches **bypass** zone filtering (PRD-02 consequence recorded in §5.2), and minimal CI is added in commit B2.
