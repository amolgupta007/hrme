# JambaHR Mobile (`apps/mobile`)

Expo SDK 57 + Expo Router + NativeWind v4. All data access goes through the
web BFF (`/api/mobile/*` in `apps/web`) — **never talk to Supabase directly
from this app** (no Clerk-JWT→RLS path exists; see
`docs/prds/mobile/01A-MIGRATION-PLAN.md` §3).

Expo Router root is **`src/app/`** (not `app/` — SDK 57 template layout).

## Environment variables (`apps/mobile/.env`, untracked — never commit)

| Var | What | Example |
|---|---|---|
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key. MUST match the instance the target BFF uses: `pk_test_…` ↔ local dev web, `pk_live_…` ↔ https://jambahr.com | `pk_test_…` |
| `EXPO_PUBLIC_API_URL` | BFF base URL, no trailing slash | `http://192.168.1.23:3000` or `https://jambahr.com` |
| `EXPO_PUBLIC_SENTRY_DSN` | DSN of the `jambahr-mobile` Sentry project (org `jambahr`, region de). Unset = Sentry disabled | `https://…ingest.sentry.io/…` |

`EXPO_PUBLIC_*` values are baked into the JS bundle — put only non-secrets here.
Do **not** create an `.env.example` file — this repo documents env var *names*
in READMEs only, never a template file (real values must never enter tracked
files). EAS build-time secrets (later): `SENTRY_AUTH_TOKEN` for sourcemap
upload — set via `eas env:create`, never in files.

## Dev loop on Windows (no macOS)

**iOS via Expo Go is currently blocked.** Expo Go on the iOS App Store is
frozen at SDK 54 — it's been stuck in Apple review since ~May 2026 (see
[expo.dev/changelog/expo-go-and-app-store-may-2026](https://expo.dev/changelog/expo-go-and-app-store-may-2026)).
The Apple Developer Program enrollment is now **ACTIVE** (D-U-N-S cleared,
2026-07-17), so iPhone testing goes through **EAS development builds** — see
"Development builds (EAS)" below. Expo Go on iOS stays unusable until Apple
approves the SDK 57 Go build.

**The working device loop today is Android**: sideload the official Expo Go
57 APK from [expo.dev/go](https://expo.dev/go) (or
[github.com/expo/expo-go-releases](https://github.com/expo/expo-go-releases))
onto an Android phone/emulator.

1. Start the web BFF LAN-visible: `npx next dev -H 0.0.0.0` (cwd `apps/web`).
   First run: allow Node through Windows Defender Firewall (private
   networks) — otherwise the phone can't reach Metro (8081) or the BFF
   (3000).
2. Find the PC's LAN IP: `ipconfig` → IPv4 of the active adapter.
   Set `EXPO_PUBLIC_API_URL=http://<that-ip>:3000` in `apps/mobile/.env`.
3. Start Metro — **only one Metro at a time, and never at the same time as
   `npm run dev` from the repo root** (that starts the web app only, not
   mobile):
   - `npx expo start` (cwd `apps/mobile`), or
   - `npm run dev:mobile` (repo root)
4. Android phone (same Wi-Fi) → open Expo Go → scan the QR.

Troubleshooting:
- QR opens but bundle never loads → firewall is blocking Metro (port 8081);
  allow Node, or `npx expo start --tunnel` (bundler via tunnel — the API URL
  still needs LAN reachability, so fix the firewall for real work).
- Sign-in fails with an instance error → key/instance mismatch (see table
  above), or see "Clerk session stuck" below.
- Styles silently don't apply / NativeWind looks like plain RN → run
  `npx expo start --clear` (Metro's transform cache serves stale
  resolutions after any babel/metro/tailwind config change — this is not
  optional, it will not self-heal).
- Sign-in appears to "bounce back" after completing the flow (`isSignedIn`
  never flips true) → the Clerk instance likely has
  `force_organization_selection` enabled, which parks native sessions in
  `pending`. This must be off on whichever Clerk instance the app points at.
- Phone-OTP shows no SMS in dev → expected; the dev Clerk instance's MSG91
  webhook is wired to production only. Use the email-code factor for local
  testing.
- Changed `.env` → restart `expo start` (env is inlined at bundle time).

Pointing at production instead: `EXPO_PUBLIC_API_URL=https://jambahr.com` +
a `pk_live_` key — works once `/api/mobile/me` is deployed. Verify the
production Clerk instance does not have `force_organization_selection` set
before relying on this path.

## What Expo Go can't do

- No native crash reporting (Sentry captures JS errors only in Go).
- **No `react-native-mmkv`** (v4 Nitro module): in Expo Go the storage layer
  falls back to an **in-memory** adapter — the offline punch queue and the
  TanStack Query cache do NOT survive an app restart. Fine for JS-only UI
  work; useless for testing offline/persistence behavior.
- (Today, additionally: no iOS Expo Go at all — see "Dev loop" above.)

For anything involving native modules, persistence, or iOS devices, use a
development build (next section). Expo Go remains the quick loop for
JS-only changes.

## Development builds (EAS)

A development build = your own app binary (bundle id `com.jambahr.mobile`)
with the `expo-dev-client` launcher baked in. It replaces Expo Go for this
app: MMKV really persists (offline queue + query cache survive restarts),
Sentry captures native crashes, and it runs on iPhone.

> **Bundle id is permanent once registered with Apple.** The shipped ids are
> `com.jambahr.mobile` (iOS `bundleIdentifier` + Android `package`, set in
> Phase C). Note: PRD 05 (`docs/prds/mobile/05-PRD-Release-Compliance.md`)
> mentions `com.jambahr.app` — the shipped `com.jambahr.mobile` wins unless
> deliberately changed **before** the first iOS build creates the App ID in
> the Apple Developer portal. After that, changing it means a new App ID,
> new provisioning, and (later) a different App Store listing identity.

Rebuild the binary only when native config changes (new native module, plugin
change in `app.json`, SDK upgrade). JS-only changes just need Metro.

### One-time setup + first builds (interactive — needs Expo/Apple accounts)

    npm i -g eas-cli
    eas login                       # Expo account
    cd apps/mobile

    # Android — APK for sideloading (profile sets buildType: apk)
    eas build --profile development --platform android
    #   First run: prompts to create/link the EAS project (writes
    #   extra.eas.projectId into app.json — commit that change) and to
    #   generate an Android keystore (let EAS manage it).

    # iOS — register the iPhone FIRST, then build
    eas device:create               # emits a QR/URL; open on the iPhone to
    #                                 register its UDID for ad-hoc installs
    eas build --profile development --platform ios
    #   First run: sign in with the Apple Developer account when prompted —
    #   EAS creates the App ID, certificate, and ad-hoc provisioning profile
    #   for the registered device(s). (Apple Developer Program enrollment is
    #   ACTIVE as of 2026-07-17.)

Devices registered with `eas device:create` AFTER an iOS build are not in
that build's provisioning profile — rebuild to add them.

### Installing the artifacts

- **Android**: build page (or terminal) gives an APK link — open it on the
  phone and install directly (same sideload flow as the Expo Go APK). If
  Expo Go is also installed, the dev build is a separate app ("JambaHR").
- **iOS**: open the build link (or expo.dev → project → Builds) on the
  registered iPhone in Safari → Install. First launch needs
  Settings → General → VPN & Device Management → trust the developer
  profile if iOS prompts.

### Daily loop with a dev build

1. Start the BFF LAN-visible as usual (`npx next dev -H 0.0.0.0`).
2. `npx expo start` (cwd `apps/mobile`) — the dev client discovers Metro on
   the LAN, or scan the QR from inside the dev-build app. Same
   single-Metro/firewall rules as the Expo Go loop above.
3. After any babel/metro/tailwind/app-config change: `npx expo start --clear`
   (unchanged from the Expo Go loop — Metro cache will not self-heal).

`--profile development` comes from `apps/mobile/eas.json` (developmentClient
+ internal distribution; Android `buildType: apk`, iOS device build).
`preview` / `production` profiles are scaffolded but unused so far.

## Commands

| Command (repo root) | What |
|---|---|
| `npm run dev:mobile` | Metro dev server (root `npm run dev` starts **web only**) |
| `npx turbo dev --filter=mobile` | same, via turbo |
| `npx turbo typecheck --filter=mobile` | strict `tsc --noEmit` (CI-gated) |
| `npx turbo lint --filter=mobile` | `expo lint` |

Or from `apps/mobile` directly: `npx expo start`, `npm run typecheck`,
`npm run lint`.

## Structure

    src/app/_layout.tsx        Sentry + ClerkProvider + SessionProvider
    src/app/index.tsx          auth gate + role router
    src/app/(auth)/sign-in.tsx email-code / phone-OTP / password sign-in
    src/app/(staff)/…          Home · Attendance · Leave · Payslips · Profile
    src/app/(admin)/…          Home · Approvals · People · Reports · Profile
    src/lib/api.ts             BFF fetch (Bearer + X-Org-Id)
    src/lib/session.tsx        /api/mobile/me context
    src/lib/sentry.ts          Sentry init (DSN-gated)

Design tokens come from `@jambahr/config/tokens` (single source; drift-tested
against the web theme in `apps/web/tests/design-tokens/`).

**Do not modify without reading the history first:**
- `metro.config.js` — the `resolveRequest` override pinning
  `react-native-css-interop` to a single instance is load-bearing (two
  copies silently no-op NativeWind styles on device).
- `eslint.config.js` — a manual port of `eslint-config-expo/flat/default.js`
  (the stock config crashes when resolved from inside this monorepo's ESLint
  8 root). Re-sync by hand if upstream `eslint-config-expo` changes.
