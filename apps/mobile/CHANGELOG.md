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

### Changed
- `runtimeVersion` now follows the `appVersion` policy, so an OTA update can
  only ever reach builds with matching native code.

## [0.1.0] — 2026-08-12 (internal, not submitted)

First feature-complete internal build. Not published to any store.

- **Phase C** — Expo shell, Clerk sign-in, `/api/mobile/*` BFF.
- **D1** — attendance: punch with offline queue, month calendar, regularization.
- **D2** — leave (incl. half-day), payslips, profile, five-tab navigation.
- **D3** — payslip PDF, account-deletion request, push notifications, FlashList.
- **D4** — owner/admin: approvals inbox, admin home, people lookup, reports.
