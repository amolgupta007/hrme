# Mobile — Android parity (D5b)

**Date:** 2026-08-12 · **Status:** planned → executing
**Requested by:** Amol — "start doing all of it for Android as well now"
**Base:** `feat/mobile-d5-geo-punch` (D5 geo punch + PRD-04/05 closure)

Android has never been built — no APK, no Play Console track, no FCM. The app code
is cross-platform already, so this is about the things that are silently
*platform-specific and currently wrong*, plus the Play release path.

---

## 1. What is actually broken on Android today

Not "missing features" — these are code paths that would ship and misbehave.

### 1.1 Push has no notification channel — **functional bug**

`apps/mobile/src/lib/push.ts` never calls `setNotificationChannelAsync`, and the
server (`apps/web/src/lib/mobile/push.ts`) sends no `channelId` or `priority`.

On Android 8+ every notification belongs to a channel. With none declared,
expo-notifications falls back to an auto-created "Miscellaneous" channel at
*default* importance: **no heads-up banner, no sound**, and FCM is free to delay
delivery while the device is dozing. For an approvals app whose entire promise is
"clear it from the lock screen in under 15 seconds", that is a broken feature, not
a polish item.

**Fix:** create channels client-side at module load (before any notification can
arrive, mirroring why `setNotificationHandler` is already at module scope), and
send `channelId` + `priority: 'high'` from the server.

Two channels, not one — so a user can mute payslip noise without muting approvals:
- `approvals` (HIGH) — something is waiting on you.
- `updates` (DEFAULT) — leave decided, payslip ready, document to acknowledge.

Channel choice is derived server-side from the existing notification `type`, so no
new call-site plumbing.

### 1.2 FCM is not wired

Remote push on Android requires an FCM project and `google-services.json`. Missing
it means the Android build produces no push token at all.

**Fix:** wire `android.googleServicesFile` **conditionally** via a new
`app.config.js`, so a missing file degrades to "no push on Android" instead of
breaking every build, `expo config` introspection, and the new CI job. The file
itself is a founder download and is gitignored.

### 1.3 iOS privacy manifest declares the wrong location type — **compliance bug**

D5 declared `NSPrivacyCollectedDataTypeCoarseLocation`, and
`docs/mobile-release/02-privacy-labels.md` says "Approximate location" for Play.
Both are **wrong**, and Android is what surfaces it:

- A 200m office geofence cannot be resolved from coarse location (Android's
  `ACCESS_COARSE_LOCATION` is ~1–3 km). The app must hold `ACCESS_FINE_LOCATION`.
- Apple defines Precise Location as anything at three or more decimal places
  (~110 m). We transmit full-precision doubles. Google defines Approximate as
  ≥3 km². We are well inside both precise thresholds.

**Fix:** declare **Precise location** on both stores and in the manifest. What we
*store* stays coarse (an office name, or a locality) and the docs say so — but the
declaration must describe what is *collected*, not what survives.

### 1.4 Android 12 "Approximate only" grant

From Android 12 the OS permission dialog lets a user downgrade a fine-location
request to approximate. The resulting fix (~1–3 km) is far outside any office
fence, and the accuracy slack is capped at 100 m, so it resolves to **remote** —
fail-safe, never a false "at office". Worth an explicit note and a test, because
the failure mode is silent and would otherwise look like a geofencing bug.

### 1.5 Branding is still the Expo template

`android.adaptiveIcon.backgroundColor` is `#E6F4FE` and the splash background is
`#208AEF` — both Expo template blue, not JambaHR. The splash affects iOS too.

**Fix:** move both to brand tokens. The adaptive-icon *artwork* is still the Expo
template PNG; replacing it needs real assets and is flagged for Amol rather than
faked.

### 1.6 Edge-to-edge

Android 15 forces edge-to-edge for apps targeting SDK 35+. Every screen already
uses `react-native-safe-area-context`, so setting the flag explicitly makes the
behaviour intentional and testable rather than a surprise at target-SDK bump.

---

## 2. Release path (Play Console)

- `eas.json`: `preview` builds an **APK** (sideloadable for testers without a Play
  track — the fastest loop, and how Android testing will actually start),
  `production` builds an **AAB** (Play requires it) and submits to the
  `internal` track.
- Play requires a **public account-deletion URL** even though the app has an
  in-app path. New route needed: `/account-deletion` on the marketing site.
- New doc `docs/mobile-release/04-play-console.md`: account setup, the closed
  testing requirement, Data Safety, target-API currency, and the low-RAM test
  matrix.

---

## 3. Out of scope / flagged, not faked

- **Adaptive icon artwork** — needs a designed foreground PNG.
- **Play Console account** — has an identity-verification lead time; founder task.
- **Actually building and running the APK** — no Android device or emulator here.
  Everything below is verified by typecheck, lint, unit tests, and Expo config
  introspection only.

---

## 4. Execution order

1. Android notification channels (client) + `channelId`/`priority` (server) + tests
2. `app.config.js` with conditional FCM wiring
3. Precise-location correction: manifest + privacy docs
4. Android config: permissions, edge-to-edge, brand colours
5. `eas.json` Android profiles + public account-deletion URL
6. Play Console doc + runbook/changelog updates
7. Full gate: lint, tests, typecheck, expo config introspect
