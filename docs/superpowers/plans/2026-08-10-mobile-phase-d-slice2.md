# Mobile Phase D — Slice 2: Leave + Payslips + Profile + 5-tab IA (PRD-02 §2.3–2.5)

**Date:** 2026-08-10 · **Branch:** `feat/mobile-d2` (off main, post-`c6f5b75`)
**Specs:** `docs/prds/mobile/02-PRD-Staff-MVP.md` + `02A-PHASE-D-DECISIONS.md` (locked) + `PRD-addendum-mobile-data-layer.md` (binding) + `docs/design/mobile/mobile-design-spec.md` & `jambahr-ios.dc.html`. **Design binding order:** the Turn-2 HI-FI screens (`#2a` Home, `#2b` Leaves, `#2c` Approvals — spec §"Hi-fi screens") are the pixel reference where they exist; Turn-1 wireframes (WF-Request-Leave sheet, WF-More, WF-Payslip) bind the rest.
**Investigation:** `.superpowers/sdd/d2-investigation.md` — REQUIRED READING for every implementer (file:line maps of every web action D2 composes).

## Goal

A staff member gets the design's full 5-tab app: apply/cancel leave (incl. half-day start/end chips) with live balances, browse & read payslips natively, view/edit their profile — all through composed BFF endpoints; managers additionally get the Leaves→Approvals segment. Ends with an on-device pass (iPhone dev build already installed).

## Locked decisions (this plan)

- **5-tab IA adopted NOW** (Amol, 2026-08-10): Home · Leaves · People · Grow · More. The `(staff)`/`(admin)` route groups CONVERGE into one tab group with inline role gating (investigation §6). Attendance screen remains a routable screen reachable from Home's TodayCard/quick actions (not a tab). Admin-specific dashboards stay deferred (Phase D-later); admins see the same 5 tabs (+ Approvals segment, + People admin affordances later).
- **Half-day model** (from the approved wireframe): two chips — *half-day start* / *half-day end* — each subtracts 0.5 from the derived `days`. NO AM/PM column; NEW **migration 103**: `leave_requests.start_half_day BOOLEAN NOT NULL DEFAULT false`, `end_half_day BOOLEAN NOT NULL DEFAULT false` (persist intent; admins/web render later). Server derives `days` via new shared pure `computeLeaveDays(start, end, startHalf, endHalf)` — client never sends `days`. Same-date single-day leave with both chips = 0 → reject ("Leave must be at least half a day"); one chip on a single day = 0.5.
- **Balances** = aggregation (mirror `listLeavePolicies` math exactly; investigation §1). Overlap/balance validation REUSED from `lib/leaves/validation.ts` (PR #22) — mobile BFF calls the same helpers; half-day chips don't change overlap semantics (date-range based).
- **Payslips**: native render only (no PDF, D3). List (month, net, status) + detail (full earnings/deductions incl. line items — compose `getMyPayslips` + self-scoped line-items read; investigation §4 gap). Draft runs never exposed.
- **Profile**: view-broad / edit-narrow — editable: phone, personal email, emergency contact, WhatsApp opt-in, avatar (Supabase `avatars` bucket flow); masked: PAN/Aadhaar (render last-4 only); salary NEVER in the profile payload. Account deletion = D3.
- **People tab v1**: read-only directory via the employee-safe `listDirectoryEmployees` composition (name, dept, role badge, avatar, contact affordances). No org chart in D2.
- **Grow tab v1**: designed "coming soon" screen (design-language empty state) — objectives/reviews/training are D-later.
- **Money rendering**: add a `mono`/money text style token for payslip amounts (investigation §9) — Indian digit grouping via shared `formatINR`.

## Global Constraints (bind every task)

- NO direct Supabase from mobile; every screen = one composed `GET/POST /api/mobile/*` route copying the D1 idiom (401 `unauthenticated`/403 `no_membership`, `getCurrentUser({orgIdHint})`, pure payload builder in `apps/web/src/lib/mobile/`, DTOs in `packages/shared/src/mobile/`, route tests in `apps/web/tests/mobile/`).
- D1 data-layer idioms EXACTLY: `useMobileQuery(key, path, {staleTime, orgId})` with orgId in EVERY key; mutations via `useApi` + TanStack `useMutation` (they inherit `networkMode:'always'` — leave/profile mutations are online-only, NO offline queue); new persisted caches only through `createAppStorage` namespaces (DPDP wipe coverage).
- Design language per `mobile-design-spec.md`: canvas/cards/16pt metrics, 50pt primary CTA (one per screen), status-on-tint chips, WF-Request-Leave's sheet pattern (grabber, Cancel/Submit header), WF-Payslip's net-pay hero + EARNINGS/DEDUCTIONS sections with red negative deductions, monospace amounts.
- Migrations: next free number (verify ≥103), idempotent, applied live via Supabase MCP AND checked into `supabase/migrations/`.
- Strict gates per task: `npx turbo typecheck --filter=mobile --filter=@jambahr/shared`, lint, apps/web vitest (mobile+leaves suites then full), Metro iOS/Android bundle check (dev build already on the iPhone — Metro connect for UI tasks). Lockfile guard after any install (`@next/swc-linux-x64-gnu` present; sharp stays in optionalDependencies).
- No Co-Authored-By trailers; explicit staging; don't touch metro.config.js / eslint.config.js.

## Tasks

### Task 1 — Migration 103 + shared leave compute (TDD)
`103_leave_half_day.sql` (two boolean columns, idempotent, live-applied + probed). NEW shared pure `packages/shared/src/leaves/compute-days.ts`: `computeLeaveDays(start, end, startHalf, endHalf): number` (inclusive dates, weekend/holiday NOT excluded — matches current web `days` semantics; verify in investigation §1 and mirror exactly), input validation errors as typed results. TDD: single day ±chips, multi-day both chips, zero-day rejection, month boundaries. Export from shared index.

### Task 2 — Web leave action touch: accept + persist half-day flags
`requestLeave` gains optional `startHalfDay`/`endHalfDay` (Zod default false), server-side `days` derivation via `computeLeaveDays` when flags present (web UI unchanged — sends explicit days as today; flag path is mobile-only for now), inserts the two columns. `cancelLeave` untouched (PR #22 guards suffice). Balance/overlap validation unchanged (derived days feeds the same checks). Tests: extend `tests/leaves/validation.test.ts` + a requestLeave-path unit where the harness allows.

### Task 3 — BFF: leave endpoints
`GET /api/mobile/leave` → `MobileLeaveResponse` {balances (aggregation), myRequests (status/type/dates/days/halfDay flags, **approver attribution: approverName + decidedAt** per hi-fi 2b, reverse-chron, ≤50)}; `POST /api/mobile/leave/apply` → {policyId, startDate, endDate, startHalfDay, endHalfDay, reason} (server derives days, full PR #22 validation, 409-style typed errors for overlap/balance); `POST /api/mobile/leave/cancel` → {requestId} (pending-only, ownership via the action's guard). Manager extra per hi-fi 2c: `GET /api/mobile/leave/approvals` → per request {requester name/dept/avatar initials, isDirectReport, type, dates+days, **balanceAfter** (requester's remaining − requested), reason, **teamOverlap: null | {name}** (vs approved leaves of the manager's scoped employees)} + decision-history count; `POST /api/mobile/leave/decide` {requestId, approve|reject, comment?} composing existing manager-guarded actions. Route tests: 401/403/validation/success per D1 pattern + an approvals-scope test (manager sees only own-scope requests).

### Task 4 — BFF: payslips + profile + directory endpoints
`GET /api/mobile/payslips` (list) + `GET /api/mobile/payslips/[entryId]` (detail composing line items; self-scope enforced — entry must belong to caller); `GET /api/mobile/profile` + `POST /api/mobile/profile` (whitelist edits; PAN/Aadhaar masked in GET, never writable); `GET /api/mobile/directory` (employee-safe projection). DTOs for all; route tests incl. the payslip IDOR case (other employee's entryId → 403/404).

### Task 5 — 5-tab IA restructure
Converge `(staff)`/`(admin)` → single `(tabs)` group: Home · Leaves · People · Grow · More per the design's tab bar (icons/labels/badge styling from spec). Attendance becomes a stacked route off Home (TodayCard tap + quick action). Deep-link/redirect hygiene for the old routes; role gating inline (Approvals segment manager+; any admin-only affordances hidden). Update `index.tsx` role router. Metro bundle + on-device sanity.

### Task 6 — Leaves tab UI (pixel reference: hi-fi 2b + 2c)
Per 2b: FY label, Mine/Approvals segment (Approvals count in danger red), three balance cards (22/800 numerals, 5px progress), All/Pending/Approved/Rejected filter pills (active solid brand), UPCOMING/EARLIER grouping, request cards with approver-attribution divider row. **Request Leave sheet** per WF (no hi-fi yet): type chips, date range, half-day start/end chips, reason, derived-days + balance-after preview (client mirrors `computeLeaveDays` from shared), submit → optimistic list insert + invalidate; cancel (pending only). Approvals segment per 2c: PENDING YOUR DECISION cards (dept · reports-to sub, DATES/BALANCE AFTER labeled rows, quoted reason, overlap advisory line ✓/⚠, Approve/Reject pair), decision-history count link (list view of history can be a simple modal or deferred with the link hidden — implementer's call, note it).

### Task 6b — Home refresh to hi-fi 2a
Bring the D1 Home to the 2a pixel reference: greeting/date/org header (no notification bell until D3 push), three-stat strip (leave days left wired to the new leave data; approvals count for managers; trainings-overdue stat only if the home payload cheaply provides it — else omit the third cell, do NOT fake it), "Needs attention · N items" section (leave approvals row for managers + overdue doc/training rows if available), **Announcements section** (extend `/api/mobile/home` payload with latest ≤3 announcements {title, body 2-line, category chip, relative time} — org-scoped read of the existing announcements table), tab-bar Leaves badge (pending approvals count for managers). Keep D1's TodayCard/punch/holiday/pending cards where 2a doesn't contradict them.

### Task 7 — Payslips + Profile + People + Grow UI (More tab)
More tab: profile header row, Payslips entry, sign-out. Payslip list → detail per WF-Payslip (net hero, sections, mono amounts — add the money text style); Profile view/edit per locked scope incl. avatar upload (reuse web's `avatars` bucket flow via a BFF upload route or presigned pattern — investigation §5; keep v1 simplest: base64 POST ≤1MB downscaled client-side); People directory list (search, dept filter); Grow coming-soon screen.

### Task 8 — Device pass + docs + close
On-device pass (iPhone dev build): leave apply (incl. half-day both-edges), cancel, manager approval (second account or role switch on TestOrg), payslip render vs web values, profile edit round-trip, directory, tab navigation + deep links, REGRESSION: D1 punch/offline/calendar still green (covers the deferred calendar re-test, task #17). README/CLAUDE.md deltas (≤3 gotchas), ledger close, PR.

## Sequencing
1 → 2 → 3 → 4 (backend chain; 4 parallel-ok with 3 after DTOs exist) → 5 (IA, independent of 3/4 — may run parallel to them) → 6 → 6b → 7 → 8. SDD per-task reviews; device pass hard-gates the slice.

## Risks
- IA convergence touches every existing screen's routing — the D1 regression sweep in Task 8 is mandatory, not optional.
- Half-day + LOP payroll: unpaid 0.5 days flows to LOP via existing numeric math (investigation §2 says clean) — Task 2 adds one payroll-facing assertion test to lock it.
- Avatar upload via BFF is the only binary-ish endpoint — keep size-capped and validated; defer to D3 if it fights (profile ships view+text edits without it).
- Two agents/sessions must not run Metro simultaneously (port clash gotcha).
