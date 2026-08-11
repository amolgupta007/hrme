# Mobile Push Notifications (D3 Stage D) + FlashList (Stage B) Implementation Plan

> **For agentic workers:** Execute task-by-task via superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Staff/manager mobile users get a push + in-app notification when their leave is approved/rejected, their payslip is paid, or a document needs acknowledgment; plus a notifications list screen and a Home bell badge.

**Architecture:** `expo-notifications` obtains an Expo push token per device → stored in `push_tokens` → on a trigger event the server writes a `notifications` row (in-app feed) and best-effort POSTs to the Expo Push API (`https://exp.host/--/api/v2/push/send`), which relays to APNs using the uploaded `.p8`. Our server never touches the key.

**Tech Stack:** Next.js 14 BFF routes, Supabase, Expo Router (SDK 57), `expo-notifications`, `@shopify/flash-list`, TanStack Query, `@jambahr/shared` DTOs.

## Global Constraints
- Push send + notification-row write are **best-effort, never block** the core action (mirror the existing `resend.emails.send` swallow / `waitUntil` idiom).
- Secret/PII-touching helpers (`sendPush`) are **plain modules, NOT `"use server"`** (gotcha #85).
- Every BFF route: `getCurrentUser({ orgIdHint: request.headers.get("x-org-id") })`, self-scoped, `export const dynamic = "force-dynamic"`, 401 on no `userId`, 403 on no membership. Route tests required.
- Next migration number = **105**. Apply live via Supabase MCP to project `imjwqktxzahhnfmfbtfc` AND check the `.sql` into `supabase/migrations/`.
- No Co-Authored-By trailer in commits. Explicit `git add <paths>` — never `git add -A`.
- INR/emoji: notification `title`/`body` are plain ASCII text (no ₹ — use "Rs " if an amount appears).
- iOS-only v1. No Android/FCM, no rich media, no per-type prefs (one master toggle).

---

### Task 1: Migration 105 — push_tokens + notifications tables

**Files:**
- Create: `supabase/migrations/105_mobile_push_notifications.sql`
- Apply live via `mcp__plugin_supabase_supabase__apply_migration`.

**Schema:**
- `push_tokens`: `id uuid pk default gen_random_uuid()`, `org_id uuid not null`, `employee_id uuid not null`, `clerk_user_id text not null`, `expo_push_token text not null unique`, `platform text not null check (platform in ('ios','android'))`, `last_seen_at timestamptz not null default now()`, `created_at timestamptz not null default now()`. Index on `(org_id, employee_id)`.
- `notifications`: `id uuid pk default gen_random_uuid()`, `org_id uuid not null`, `employee_id uuid not null`, `type text not null check (type in ('leave_decision','payslip_paid','doc_ack','announcement'))`, `title text not null`, `body text not null`, `data jsonb not null default '{}'::jsonb`, `read_at timestamptz`, `created_at timestamptz not null default now()`. Index on `(org_id, employee_id, created_at desc)` and partial index `(org_id, employee_id) where read_at is null`.
- RLS enabled on both (advisory — service-role bypasses per gotcha #5); add owner-can-read-own advisory policies mirroring the pattern in migration 104.

**Steps:**
- [ ] Write the `.sql` (idempotent: `create table if not exists`, `create index if not exists`).
- [ ] Apply live via MCP; confirm with `list_tables`.
- [ ] Commit the checked-in `.sql`.

---

### Task 2: sendPush helper + notify wiring at trigger points

**Files:**
- Create: `apps/web/src/lib/mobile/push.ts` (plain module — NOT "use server").
- Create: `apps/web/src/lib/mobile/notify.ts` (plain module — writes the `notifications` row + calls `sendPush`).
- Modify: `apps/web/src/actions/leaves.ts` (approveLeave ~L391, rejectLeave ~L460) — after the existing email send, best-effort `notifyLeaveDecision`.
- Modify: `apps/web/src/actions/payroll.ts` (`sendPayslipEmail` ~L842, per-employee loop) — best-effort `notifyPayslipPaid`.
- Modify: `apps/web/src/app/api/cron/doc-reminders/route.ts` — best-effort `notifyDocAck` per reminded employee.
- Test: `apps/web/tests/mobile/push.test.ts`, `apps/web/tests/mobile/notify.test.ts`.

**Interfaces (Produces):**
- `sendPush(supabase, employeeIds: string[], msg: { title: string; body: string; data?: Record<string,unknown> }): Promise<void>` — looks up `push_tokens` for those employees, chunks to 100, POSTs to Expo Push API, and on a `DeviceNotRegistered` receipt deletes that token row. Swallows all errors.
- `notify(supabase, { orgId, employeeId, type, title, body, data }): Promise<void>` — inserts a `notifications` row, then `sendPush(supabase, [employeeId], { title, body, data })`. Swallows all errors. Wrapper helpers `notifyLeaveDecision`, `notifyPayslipPaid`, `notifyDocAck` build the copy.

**Copy (verbatim):**
- Leave approved: title `"Leave approved"`, body `"Your leave request has been approved."`
- Leave rejected: title `"Leave update"`, body `"Your leave request was not approved."`
- Payslip: title `"Payslip ready"`, body `"Your payslip for {monthLabel} is ready to view."`
- Doc ack: title `"Action needed"`, body `"{docTitle} needs your acknowledgment."`

**Steps (TDD):**
- [ ] Test `sendPush`: given a mocked fetch + two tokens, it POSTs one batch of 2 messages; on a mocked fetch throw it resolves (no throw).
- [ ] Test `notify`: inserts a row (mocked supabase) then calls sendPush; a thrown insert still resolves.
- [ ] Implement `push.ts` + `notify.ts`.
- [ ] Wire the trigger points (wrap each in try/catch or `waitUntil`, never awaited in a way that can fail the action).
- [ ] Run tests; commit.

---

### Task 3: BFF endpoints + home unread count

**Files:**
- Create: `apps/web/src/app/api/mobile/push/register/route.ts` (POST {expoPushToken, platform} → upsert `push_tokens` on `expo_push_token`, stamping org/employee/clerk_user_id/last_seen_at).
- Create: `apps/web/src/app/api/mobile/push/unregister/route.ts` (POST {expoPushToken} → delete the row, self-scoped).
- Create: `apps/web/src/app/api/mobile/notifications/route.ts` (GET `?cursor=&unread=` → list self notifications, newest first, page 30; also returns `unreadCount`).
- Create: `apps/web/src/app/api/mobile/notifications/read/route.ts` (POST {ids?: string[]; all?: boolean} → set `read_at=now()` for self rows).
- Modify: `apps/web/src/lib/mobile/home-payload.ts` — add `unreadNotifications: number` to the payload; `apps/web/src/app/api/mobile/home/route.ts` computes the unread count.
- Add DTOs: `packages/shared/src/mobile/notifications.ts` (`MobileNotification`, `MobileNotificationsResponse`), export from the mobile barrel.
- Test: `apps/web/tests/mobile/notifications-route.test.ts` (401/403, self-scope, unread filter), `apps/web/tests/mobile/push-register-route.test.ts`.

**Steps (TDD):** failing route test → implement → pass → commit. Follow the account/deletion-request route as the closest idiom.

---

### Task 4: expo-notifications native install + config

**Files:**
- Modify: `apps/mobile/package.json` (+`expo-notifications`, `@shopify/flash-list` — Task 6 shares the rebuild), `package-lock.json`.
- Modify: `apps/mobile/app.json` — add the `expo-notifications` plugin; ensure iOS `aps-environment` entitlement (`development`).

**Steps:**
- [ ] `cd apps/mobile && npx expo install expo-notifications @shopify/flash-list`.
- [ ] Add plugin config to app.json.
- [ ] Lockfile guard: verify no Windows-only lock regen dropped Linux binaries (gotcha — regen clean if needed).
- [ ] Typecheck + Metro bundle export succeed (no `.expo/types` present).
- [ ] Commit.

---

### Task 5: Mobile push surface

**Files:**
- Create: `apps/mobile/src/lib/push.ts` — `registerForPush()` (permission request + `getExpoPushTokenAsync` + POST register), `unregisterPush()` (POST unregister). Uses `projectId` from expo config.
- Modify: `apps/mobile/src/lib/session.tsx` — on `me` load (signed in), fire `registerForPush()`; on sign-out, `unregisterPush()`.
- Modify: `apps/mobile/src/app/_layout.tsx` — `expo-notifications` received/response listeners → route on tap (leave→`/(tabs)/leaves`, payslip→`/payslips`, doc→home).
- Create: `apps/mobile/src/lib/notifications.ts` — `useNotifications()` (list + unreadCount), `useMarkRead()`.
- Create: `apps/mobile/src/app/notifications.tsx` — stacked notifications list screen (tap → deep-link + mark read).
- Modify: `apps/mobile/src/app/(tabs)/home.tsx` — Home bell in the header with unread badge (from home payload `unreadNotifications`) → pushes `/notifications`.
- Modify: `apps/mobile/src/components/profile-screen.tsx` (or the profile route) — a "Push notifications" master toggle (persist to profile; respect in `sendPush` via a follow-up — v1 the toggle just gates local registration).
- Register `notifications` in the root Stack.

**Steps:** wire each; typecheck + lint + Metro bundle green. No device pass here (rides Amol's EAS build). Commit.

---

### Task 6: FlashList perf sweep (Stage B)

**Files:** swap the long `ScrollView`/`FlatList` lists to `FlashList` with `estimatedItemSize` in: People directory, leave requests (Mine + Approvals), payslips list. Keep `expo-image` for avatars.

**Steps:** mechanical swap; typecheck + lint + Metro bundle green; commit. On-device perf verify rides the same EAS build.

---

## Post-plan: hand-off to Amol
Tasks 1–3 ship as normal PRs (backend, no rebuild). Tasks 4–6 land on a mobile branch; then Amol runs `eas build --profile development --platform ios`, reinstalls, and we device-test (permission grant → approve a leave on web → push arrives + feed + bell badge + tap deep-link; sign out clears token).
