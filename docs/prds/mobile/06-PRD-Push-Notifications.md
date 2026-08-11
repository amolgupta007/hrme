# PRD-06 — Mobile Push Notifications (D3 Stage D)

**Date:** 2026-08-11 · **Status:** planned, build-ready — **blocked only on the Apple APNs auth key** (Amol) + one native EAS rebuild.
**Phase:** Mobile Phase D Slice 3, Stage D. Prereqs A (payslip PDF) + C (account deletion) shipped. Stage B (FlashList) bundles with this rebuild.

## Goal
When something happens that concerns a staff/manager user — their leave is approved/rejected, their payslip is paid, a document needs acknowledgment — they get a push notification on their phone, and a tappable in-app notification history + the Home bell (the bell deferred from the D2 hi-fi 2a on purpose).

## External prerequisites (not code — human/Apple/Google)
1. **Apple APNs Auth Key** (Amol): developer.apple.com → Keys → new key with "Apple Push Notifications service (APNs)" → download the `.p8` (once) + note Key ID + Team ID → upload to Expo via `eas credentials` (iOS → Push Notifications → Upload a key). One key, all apps, never expires.
2. **A fresh EAS dev build** with `expo-notifications` (native module) — one-time reinstall on the device. Bundle Stage B (FlashList) into the same build.
3. **FCM (Android)** — deferred to the Play Store track; not needed for the iOS-first push.

## Architecture (Expo push relay)
`expo-notifications` gets an **Expo push token** per device → we store it → on a trigger event, the **server sends to the Expo Push API** (`https://exp.host/--/api/v2/push/send`) → Expo relays to APNs (using the uploaded key) / FCM. No direct APNs integration in our code — Expo is the relay. Our server never touches the `.p8`.

## Data model (new — none exists; only `late_punch_notifications` which is feature-specific)
- **`push_tokens`** — `(id, org_id, employee_id, clerk_user_id, expo_push_token UNIQUE, platform, last_seen_at, created_at)`. One row per device; upserted on sign-in / token refresh; deleted on sign-out (DPDP) and on `DeviceNotRegistered` push errors.
- **`notifications`** — the general in-app feed (this is the table the D2 Home "announcements" hinted at but is distinct): `(id, org_id, employee_id, type, title, body, data jsonb, read_at, created_at)`. `type ∈ leave_decision | payslip_paid | doc_ack | announcement | …`. Written at each trigger point; the in-app list + Home bell read it; push send is best-effort on top.

## Trigger points (server-side, mirror the existing email sends — 02A)
Each of these ALREADY sends an email; add a best-effort "create notification row + push" alongside (never block the core action):
- `approveLeave` / `rejectLeave` → the requester: "Leave approved/rejected".
- `markPayrollPaid` → `sendPayslipEmail` path → each employee: "Payslip for {month} is ready".
- doc-reminder cron / `requires_acknowledgment` docs → "{doc} needs your acknowledgment".
- (Manager side, optional v1.1) new leave request → the approver: "{name} requested leave".
Extract a small `sendPush(employeeIds, {title, body, data})` helper (plain module, NOT "use server") that: looks up their `push_tokens`, POSTs to the Expo Push API in chunks of 100, and handles the receipt/`DeviceNotRegistered` cleanup. Best-effort, swallowed like the email sends.

## Consent / opt-in
- iOS requires runtime permission — request it contextually (after first sign-in or on a "turn on notifications" prompt, not cold at launch). Store the grant; if denied, the in-app feed still works, just no push.
- A profile toggle "Push notifications" (reuse the whatsapp-opt-in pattern) — respect it in `sendPush`.

## Mobile surface
- Token registration in the session/auth flow (on `me` load): get Expo token → `POST /api/mobile/push/register` (Bearer + X-Org-Id) → upsert `push_tokens`. Clear on sign-out (ties into the DPDP wipe).
- **Notifications list screen** (stacked route off the Home bell): `GET /api/mobile/notifications` (paginated, mark-read); tap → deep-link to the relevant screen (leave → Leaves, payslip → the payslip).
- **Home bell** (hi-fi 2a): unread count badge from `GET /api/mobile/notifications?unread=1` count (fold into the home payload like `pendingApprovals`).
- Foreground/received handlers + notification-tap deep-link routing (`expo-notifications` listeners in the root layout).

## BFF endpoints (new)
- `POST /api/mobile/push/register` {expoPushToken, platform} → upsert.
- `POST /api/mobile/push/unregister` (on sign-out) → delete the token.
- `GET /api/mobile/notifications?cursor=&unread=` → the feed.
- `POST /api/mobile/notifications/read` {ids|all} → mark read.
- Home payload gains `unreadNotifications` count.
All the D1/D2 BFF idioms (getCurrentUser({orgIdHint}), self-scoped, force-dynamic, route tests).

## Build plan (when the key lands)
1. Migrations: `push_tokens` + `notifications` (+ RLS advisory). Apply live + check in.
2. `sendPush` helper + wire the 4 trigger points (best-effort, tested that the core action still succeeds if push fails).
3. BFF: register/unregister/notifications/read + home unread count.
4. `npx expo install expo-notifications` + config (app.json plugin, iOS `aps-environment`) → **new EAS dev build** (bundle Stage B FlashList here). Lockfile guard.
5. Mobile: token registration, permission prompt, notifications list screen, Home bell + badge, tap deep-linking, profile toggle.
6. Device pass: grant permission → approve a leave on web → push arrives + appears in the feed + bell badge + tap deep-links. Sign out → token cleared (no more pushes).

## Scope notes / non-goals (v1)
- iOS push only (Android/FCM later). No rich media/action buttons. No scheduled/local notifications beyond the server-sent ones. No per-type granular preferences (one master toggle). Announcements→push is optional v1.1.

## Estimate
~1 focused slice (comparable to a D-slice) once the APNs key + first rebuild are done. The rebuild + permission + device-tap testing require Amol's device, like the D1/D2 checkpoints.
