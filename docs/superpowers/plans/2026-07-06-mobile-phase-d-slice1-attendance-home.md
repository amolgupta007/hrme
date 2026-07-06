# Mobile Phase D — Slice 1: Attendance + Home (PRD-02 §2.1–2.2 + data-layer addendum)

**Date:** 2026-07-06 · **Branch:** `feat/mobile-attendance-home` (off main `b73de39`)
**Specs:** `docs/prds/mobile/02-PRD-Staff-MVP.md` (§2.1 Home, §2.2 Attendance), `docs/prds/mobile/PRD-addendum-mobile-data-layer.md` (binding), `docs/prds/mobile/01A-MIGRATION-PLAN.md` §5.2 (punch-path decision record).
**Investigation:** `.superpowers/sdd/phase-d/investigation-summary.md` — REQUIRED READING for every implementer; contains file:line maps of the web code each task integrates with.

## Goal

A staff member can open the app, see today's status instantly (from disk cache), punch in/out (optimistic, offline-safe, idempotent), and browse a month calendar of their attendance with correct day states — all through composed BFF endpoints, coexisting with biometric device punches. Ends with the first EAS Android development build (MMKV requires it) and a device checkpoint.

## Global Constraints (bind every task)

- NO direct Supabase from mobile. All data via `/api/mobile/*` BFF routes reusing `getCurrentUser({orgIdHint})`. Copy the `/api/mobile/me` pattern exactly: thin route, pure payload builder in `apps/web/src/lib/mobile/`, unit tests, `dynamic="force-dynamic"`, error contract `{error:string}` with 401 `unauthenticated` / 403 `no_membership`.
- **Mobile punches go through the EVENT stream** (01A §5.2): insert `attendance_punch_events` with `source:'mobile'` → `recomputeAttendanceDay`. NEVER the web clockIn direct-write path.
- Shared DTOs in `packages/shared/src/mobile/types.ts` (new module, exported from index); pure compute in `packages/shared` with vitest TDD (packages are strictly typechecked).
- Expo Router root `apps/mobile/src/app/`. Only `EXPO_PUBLIC_*` env in mobile. No `.env*` committed. Don't touch `metro.config.js` resolveRequest / `eslint.config.js` port.
- **Expo Go fallback**: MMKV is unavailable in Expo Go — storage adapter must degrade to in-memory without crashing (feature-detect, not platform-detect).
- Migrations: next free number (check `supabase/migrations/`, expect 101+). Apply to live DB via Supabase MCP `apply_migration` AND check the file into `supabase/migrations/`. Confirm live constraint names via `pg_constraint` BEFORE writing the widening SQL.
- IST conventions: reuse `attributedDateForClockIn` + shared helpers; do not re-implement `now+5.5h` ad hoc in new server code — add a tiny `istToday()` helper to shared if needed.
- No Co-Authored-By trailers. Explicit staging only (never `git add -A`). Lockfile must keep `swc-linux-x64-gnu` after any install (npm/cli#4828 guard).
- Windows dev; verification per task: workspace typecheck + lint + (mobile tasks) full Metro Android bundle via the manifest `launchAsset.url` method.

## Out of scope (Slice D2/D3)

Leave apply/cancel screens (D2, incl. half-day), payslips (D2), profile edit (D2), push notifications (own PRD), FlashList/expo-image sweep (D3), payslip PDF (D3), web clockIn→event-stream unification (separate web fix), account deletion (D2/PRD-05).

---

## Task 1 — Migration 10x: punch-event mobile support (+ live constraint check)

**Files:** new `supabase/migrations/1xx_mobile_punch_support.sql`; applied live via MCP.

1. Live check (Supabase MCP `execute_sql`): `SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'attendance_punch_events'::regclass AND contype='c';` and same for `attendance_records`. Record real names in the migration comments.
2. Migration (idempotent, drop+recreate CHECKs by discovered name):
   - `attendance_punch_events.source` CHECK += `'mobile'`.
   - `attendance_records.source` CHECK += `'mobile'` (rollup stamps it for mobile-only days, Task 3).
   - `attendance_punch_events.client_event_id uuid NULL` + partial unique index `uq_punch_events_client_event (org_id, client_event_id) WHERE client_event_id IS NOT NULL` — idempotency key for offline replays (stronger than punched_at collision).
   - `attendance_punch_events.lat double precision NULL, lng double precision NULL` (optional coarse location per PRD §2.2 — nullable, org-flag-gated capture later; columns now to avoid a second migration).
3. Verify: re-run constraint query; insert probe row with source='mobile' + client_event_id, duplicate insert must conflict; clean up probe.

## Task 2 — Shared compute: PunchEvent.source + zone exemption + month calendar (TDD)

**Files:** `packages/shared/src/attendance/daily-attendance.ts` (extend), NEW `packages/shared/src/attendance/month-calendar.ts`, tests in `packages/shared` (or apps/web tests dir if that's where shared tests run — inspect existing test layout for daily-attendance and follow it).

1. Add `source` to `PunchEvent` (`{id, punched_at, location_id, source}`); `computeDailyAttendance` zone-exclusion exempts `source==='mobile'` (lenient GPS punches per decision record). TDD: failing test first (mobile punch outside zone still counts; device punch outside zone still excluded; out_of_zone_count unchanged for device).
2. NEW pure `computeMonthCalendar(input)` → per-day states for the mobile month view. Input: `{ year, month, records: DailyRecordLite[], holidays: {date,is_optional,name}[], approvedLeaves: {start_date,end_date,days,type}[], weekOff: EffectiveWeekOff, todayIst: string }`. Output: `MonthDay[] = {date, state: 'present'|'half_day'|'absent'|'week_off'|'holiday'|'leave'|'future'|'no_data', minutes?, isToday}`. Precedence: holiday > leave > week-off > attendance-derived > absent (past working day with no record) > future. Half-day from `shifts.half_day_threshold_minutes` when available on the record, else skip half-day classification. TDD with table-driven cases (month boundaries, alt-Saturday via existing `isAltSaturdayOff`, optional holidays count as holiday).
3. Export from shared index. `npx turbo typecheck --filter=@jambahr/shared` + tests green.

## Task 3 — BFF: `/api/mobile/home`, `/api/mobile/attendance`, `POST /api/mobile/attendance/punch`

**Files:** `packages/shared/src/mobile/types.ts` (NEW: `MobileHomeResponse`, `MobileAttendanceMonthResponse`, `MobilePunchRequest/Response`); `apps/web/src/lib/mobile/home-payload.ts`, `attendance-payload.ts`, `punch.ts`; routes under `apps/web/src/app/api/mobile/{home,attendance,attendance/punch}/route.ts`; tests `apps/web/tests/mobile/*`.

1. **GET /api/mobile/home**: one composed query set → `{ today: {isClockedIn, clockInAt, clockOutAt, minutesToday, shift?{name,start,end}}, leave: {balances: [{policyId,name,type,total,used,remaining}]}, nextHolidays: [{date,name,is_optional}] (≤3), pending: {leaveRequests: n, regularizations: n} }`. Balances via the AGGREGATION logic (sum approved current year — investigation §Leave), NOT the stale `leave_balances` table. Today via the `getTodayStatus` query shape.
2. **GET /api/mobile/attendance?month=YYYY-MM**: fetch month's `attendance_records` (+ shift half-day thresholds), org holidays, my approved leaves overlapping the month, effective week-off (`resolveEffectiveWeekOff` w/ dept+employee overrides) → run `computeMonthCalendar` → also return per-day punch detail `{pairs:[{in,out}], source, autoClosed, outOfZoneCount}` for tap-through (pairs via shared `pairPunches` on that day's punch events where they exist, else the record's clock_in/out).
3. **POST /api/mobile/attendance/punch**: body `{clientEventId: uuid, punchedAt: ISO, lat?, lng?}`. Validate: punchedAt within ±24h of server now (clock-skew guard), employee active. Insert `attendance_punch_events` `{source:'mobile', status:'approved', client_event_id, punch_type: null (derived), lat, lng}`; on unique-violation of `uq_punch_events_client_event` → return the existing result as SUCCESS (idempotent replay). Then `recomputeAttendanceDay(orgId, employeeId, istDateOf(punchedAt))`; rollup `source`: `'device'` if any device/adms event that day else `'mobile'` (touch `recomputeAttendanceDay` minimally). Response: fresh today-status shape (same as home.today).
4. Route-level tests: pure builders unit-tested; PLUS the deferred follow-up from Phase C final review — route-level test pattern (mock `getCurrentUser`) for /api/mobile/me AND the new routes (401/403/200 shape).
5. Verify: typecheck/lint/tests; manual curl 401 on all three.

## Task 4 — Mobile data layer: TanStack Query + MMKV persistence

**Files:** `apps/mobile/src/lib/{query.tsx,storage.ts,offline-queue.ts}` (queue consumed in Task 5); `_layout.tsx` (provider mount); package installs.

1. `npx expo install @tanstack/react-query @tanstack/react-query-persist-client react-native-mmkv @react-native-community/netinfo` (lockfile guard after).
2. `storage.ts`: MMKV adapter with **feature-detected fallback** — `try { new MMKV() } catch → in-memory Map adapter` (Expo Go). Export `createAppStorage(userKey)`.
3. `query.tsx`: `QueryClientProvider` + `persistQueryClient` (buster = cache-schema version), cache key namespace `${clerkUserId}:${orgId}`; on sign-out or org change → `queryClient.clear()` + storage wipe (DPDP). staleTimes per addendum (60s home, 0 attendance-today, 5min static).
4. `useApi` stays the transport; add a typed `useMobileQuery(key, path)` convenience. Session provider (`session.tsx`) migrates onto TanStack (me query) — keep `useSession()` API stable for the tab layouts; add distinct handling for `error==='unauthenticated'` (sign-out CTA) — closes the Phase C follow-up.
5. Verify: typecheck/lint/full Metro Android bundle; Expo Go boot shows fallback log (no crash).

## Task 5 — Home screen (real) + punch action (optimistic + offline queue)

**Files:** `apps/mobile/src/app/(staff)/home.tsx` (replace placeholder), `apps/mobile/src/components/{today-card,quick-actions,holiday-card,pending-card}.tsx`, `apps/mobile/src/lib/offline-queue.ts` (implement), `(admin)/home.tsx` gets the same today-card (admins punch too) with a note that admin dashboards come in D-later.

1. Home = greeting (firstName from session), TodayCard (shift, punch state, live hours ticker), quick actions (Punch In/Out now; Apply Leave / Payslips stubs → toast "coming in the next update"), next holiday, pending statuses. Single `/api/mobile/home` query, renders from persisted cache instantly (skeleton only on true first run).
2. Punch mutation: optimistic flip via `onMutate` (cancel queries, snapshot, set), rollback + toast on error; server error copy surfaced (e.g., future zone rejections).
3. Offline queue: on network failure OR offline, enqueue `{clientEventId, punchedAt}` to MMKV queue; drain on netinfo reconnect + app foreground; "syncing" badge on TodayCard while queue non-empty; persistent banner after 3 failed drains. Queue survives app kill.
4. Verify: typecheck/lint/bundle; Expo Go manual pass for UI (queue drains only meaningfully in dev build — note it).

## Task 6 — Attendance screen: month calendar + day detail

**Files:** `apps/mobile/src/app/(staff)/attendance.tsx` (replace placeholder), `apps/mobile/src/components/attendance/{month-grid,day-detail-sheet,state-legend}.tsx`.

1. Month header with ‹ › nav (default current IST month; no future months). Grid renders `MonthDay.state` colors from tokens; legend. Data: one `/api/mobile/attendance?month=` query per month, cached per month key.
2. Tap day → bottom sheet: date, state, punch pairs (in/out/hours), source chips (mobile/device/web/auto-closed), out-of-zone note if any, and (Task 7 hook) "Request correction" button placeholder.
3. Today shortcut chip; pull-to-refresh.
4. Verify: typecheck/lint/bundle; Expo Go visual pass with real data (needs seeded punches — use test1/testorg data or punch on device).

## Task 7 — Regularization v1 (DROPPABLE → D2 if session budget runs out)

**Files:** shared types += regularization DTOs; `apps/web/src/lib/mobile/regularize.ts` + `apps/web/src/app/api/mobile/attendance/regularize/route.ts`; day-detail-sheet gains the request form; investigation task inside: confirm the web admin review surface.

1. Model (decision from investigation): employee-initiated **pending punch events** — `POST /api/mobile/attendance/regularize` body `{date, proposedIn: ISO, proposedOut: ISO|null, reason}` → inserts 1–2 `attendance_punch_events` rows `{source:'mobile', status:'pending', note: reason, created_by: employeeId}`. NO new table.
2. Verify web-side visibility: pending mobile events must appear in the existing admin punch review queue (`attendance-punches.ts` list/approve — implementer inspects `punch-permissions.ts` + the daily-attendance review UI; if pending-mobile rows are invisible there, add the minimal filter/label to surface them, nothing more). On approve, existing `recomputeAttendanceDay` path already folds them in — confirm.
3. Mobile: form in day-detail-sheet (only for past days, non-holiday), my pending regularizations show "pending" chip on the day + count on Home pending card.
4. Verify: end-to-end on dev: request on mobile → approve on web → day state updates on mobile after refetch.

## Task 8 — First EAS Android dev build + DEVICE CHECKPOINT + docs

**Files:** `apps/mobile/README.md` (dev-build section), `.superpowers/sdd/progress.md`; possibly `apps/mobile/app.json` (expo-dev-client plugin), `eas.json` already exists.

1. `npx expo install expo-dev-client`; `eas login` (Amol's Expo account — interactive, user does it), `eas build:configure` if needed, then `eas build --profile development --platform android`. Cloud build → APK link → install on the Android phone (replaces Expo Go for this app).
2. 🔴 DEVICE CHECKPOINT (Amol + controller): cold start < ~2s to cached Home; airplane-mode relaunch shows last-known Home (MMKV proof); punch in/out reflects on web attendance view (paired correctly, source mobile); offline punch (airplane) → reconnect → exactly one server punch (idempotency proof); month calendar states sane vs web data.
3. README: dev-build loop (when to use dev build vs Expo Go), EAS commands, MMKV caveat. Ledger updated. CLAUDE.md: add 1-2 gotcha lines only if something new was learned.

## Sequencing & checkpoints

1 → 2 → 3 (backend chain), 4 (parallel-ok with 3 after types exist) → 5 → 6 → 7 (droppable) → 8. Task reviews after each (SDD pattern, same as Phase C). Device checkpoint hard-gates slice completion, not intermediate tasks (Expo Go smoke passes happen along the way with the in-memory fallback).

## Risks

- **recomputeAttendanceDay touch** (rollup source stamping) is shared with ADMS ingest — regression risk on biometric path; the task must run/extend existing daily-attendance tests and keep the change minimal.
- MMKV/new-arch compatibility on Expo SDK 57 dev build — if `react-native-mmkv` fights the build, fall back to `expo-sqlite/kv-store` as the persistence adapter (same interface, slightly slower) rather than blocking the slice.
- Clock skew on device timestamps: ±24h window + server-received-at recorded via `created_at` default; disputes resolvable.
- Web's own clockIn direct-write contention bug remains (out of scope) — mobile punches through events NEVER hit it, but a user mixing web-clockIn + mobile-punch same day inherits the existing last-writer-wins quirk. Documented, not fixed here.
