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
The TestFlight External Beta is at capacity, and `eas go` needs an Apple
Developer account. iPhone testing resumes once the Apple Developer org
enrollment (D-U-N-S, initiated 2026-07-05) clears — then via EAS development
builds or `eas go` through TestFlight.

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
- No custom native modules. None are needed for the current shell.
- (Today, additionally: no iOS Expo Go at all — see "Dev loop" above.)

When native modules or iOS device testing are needed: **EAS development
build** (cloud — iOS builds require the Apple Developer org account;
enrollment is in progress separately):

    npm i -g eas-cli
    eas login
    eas init          # links the project (one-time)
    eas build --profile development --platform ios

`apps/mobile/eas.json` already has `development` / `preview` / `production`
build profiles scaffolded — no `eas init` or first build has been run yet.

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
