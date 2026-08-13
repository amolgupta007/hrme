# JambaHR Mobile — Changelog

Versions here track `expo.version` in `app.json`. Every App Store / TestFlight
submission gets an entry; OTA-only (EAS Update) pushes are noted inline under
the version they patch.

Release policy (PRD-05 §1):
- **OTA (EAS Update)** for JS-only fixes: copy, layout, logic, bug fixes.
- **Store release** for anything native: a new Expo SDK, a new native module,
  a new permission, an app-icon/name change, or a change to the privacy
  manifest.

## [Unreleased]

### Added
- **Location-verified clock-in.** When an org enables it, a mobile punch carries
  a coarse GPS fix and is tagged as being at a named office or remote from a
  named locality. Includes a DPDP consent notice shown before the OS prompt.
  *(native: `expo-location` — requires a store/dev build, not OTA)*
- **Minimum-supported-version gate.** The app checks `/api/mobile/config` at
  launch and blocks builds below the server's floor with an update screen.
  Fails open on every uncertain path.
- **Haptic feedback** on punch. *(native: `expo-haptics`)*
- Cold-start instrumentation reported to Sentry (`cold_start_js_ms`) against the
  PRD-04 <2s budget.
- iOS **privacy manifest** (`NSPrivacyAccessedAPITypes` + collected data types),
  declaring no tracking.
- Maestro smoke flow covering the cold-start white-screen regression.

### Fixed
- **Android push was effectively silent.** No notification channel was declared,
  so Android delivered everything on an auto-created default-importance fallback
  — no heads-up banner, no sound, and free to be deferred while the device
  dozed. Now two channels (`approvals_v1` high, `updates_v1` default) with a
  matching `channelId` and FCM priority from the server, so approvals can
  interrupt and payslip notices can be muted separately.
- **Location was declared as Coarse/Approximate** in the iOS privacy manifest and
  the store answer sheets. A 200m office geofence needs fine location, and the
  app transmits full-precision coordinates, so both stores must be told
  **Precise**. Only a coarse derivative is retained, and the listing says so.

### Changed
- `runtimeVersion` now follows the `appVersion` policy, so an OTA update can
  only ever reach builds with matching native code.
- `expo-updates` is installed and `updates.url` is set, so EAS Update (OTA) is
  active from the next build. It was pulled in automatically by the first
  Android build because the build profiles declare update channels.
- Android: explicit permission allowlist plus a `blockedPermissions` list that
  strips background location and legacy storage permissions a dependency might
  otherwise pull in.
- Android builds — `preview` produces a sideloadable APK, `production` an AAB.
- Adaptive-icon and splash backgrounds moved from the Expo template blue to
  brand colours. *(The adaptive-icon foreground artwork is still the Expo
  template — see `docs/mobile-release/04-play-console.md` §6.)*
- Status bar pinned to dark icons: Android 16 makes edge-to-edge mandatory, so
  content now draws under the system bars.

## [0.1.0] — 2026-08-12 (internal, not submitted)

First feature-complete internal build. Not published to any store.

- **Phase C** — Expo shell, Clerk sign-in, `/api/mobile/*` BFF.
- **D1** — attendance: punch with offline queue, month calendar, regularization.
- **D2** — leave (incl. half-day), payslips, profile, five-tab navigation.
- **D3** — payslip PDF, account-deletion request, push notifications, FlashList.
- **D4** — owner/admin: approvals inbox, admin home, people lookup, reports.
