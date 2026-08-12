# JambaHR Mobile — release runbook (iOS first, Android after)

The one document to work through when shipping. Everything marked **[code]** is
already in the repo; everything marked **[you]** is a founder action that cannot
be automated from here.

Companion docs: `01-app-review-notes.md` (paste into App Store Connect),
`02-privacy-labels.md` (both stores' privacy forms),
`03-dpdp-and-privacy-copy.md` (policy text + the claims it commits you to).

---

## 0. Where things stand

**Done and in the repo**

- [code] EAS build profiles `development` / `preview` / `production`, each
  pinned to an update channel of the same name.
- [code] `runtimeVersion: { policy: "appVersion" }` — an OTA update can only
  reach builds whose native code matches.
- [code] iOS privacy manifest (`expo.ios.privacyManifests`) with required-reason
  API declarations and `NSPrivacyTracking: false`.
- [code] `ITSAppUsesNonExemptEncryption: false` (HTTPS-only → export exempt).
- [code] In-app account deletion (request-based) — Profile → Delete my account.
- [code] Minimum-version gate: `GET /api/mobile/config` + a block screen.
- [code] Maestro smoke flow for the cold-start white-screen regression.
- [code] CI validates the Expo config and the Maestro flow on mobile PRs.
- [code] No purchase, pricing or upgrade UI anywhere in the app.
- [you] Apple Developer Program (Organization) — **active**.
- [you] Bundle id `com.jambahr.mobile` — **registered and permanent**.
- [you] APNs auth key uploaded to Expo.

**Not done — the actual critical path**

- [you] App Store Connect app record does not exist yet.
- [you] Demo tenant + demo mailbox for App Review.
- [you] Screenshots, icon, description, keywords, support URL.
- [you] Privacy policy updated with the mobile section.
- [you] Grievance Officer named (DPDP).
- [you] EAS `production` environment in the EAS env store (see §2 — a
  production build **will fail without it**, by design).
- [you] TestFlight beta.
- [you] Play Console registration and closed test.

---

## 1. Before you build anything

- [ ] Publish the mobile privacy-policy section (`03-...`), with the Grievance
      Officer filled in. The store listing needs the live URL.
- [ ] Work the "what must be true" checklist at the end of `03-...`. The copy
      makes specific promises; confirm each one still holds.
- [ ] Seed the demo tenant on **production** and confirm it has payslips, leave
      balances, pending approvals, and location-verified clock-in enabled with a
      pinned office.
- [ ] Create the demo mailbox and put its webmail credentials in the review
      notes. Read the sign-in warning in `01-...` first — a password on the demo
      account will *not* produce a password prompt, and a fixed test code will
      not work against production Clerk.

## 2. EAS environments (the standalone-build tripwire)

Standalone builds have **no local `.env`**. `EXPO_PUBLIC_*` values are baked in
by EAS servers from the environment named by the build profile. Missing them
means an undefined Clerk key, `ClerkProvider` throws, and the app crashes
instantly on launch.

`preview` already has its environment. `production` does not yet:

```bash
cd apps/mobile
eas env:create --environment production --name EXPO_PUBLIC_API_URL            --value https://jambahr.com
eas env:create --environment production --name EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY --value <prod pk_live_...>
eas env:create --environment production --name EXPO_PUBLIC_SENTRY_DSN         --value <prod dsn>
eas env:list --environment production   # verify all three before building
```

The production profile declares `"environment": "production"`, so a build
attempted before this exists fails loudly at build time — which is deliberate,
and far better than shipping a binary that white-screens on first launch.

## 3. Production Clerk checks (both have bitten us)

- [ ] **Native API enabled** — Clerk Dashboard → Configure → Native
      applications. If it is off, `clerk-expo` never finishes initialising,
      `isLoaded` stays false, and the app shows a **white screen**. Dev had it
      on; production did not.
- [ ] **`force_organization_selection` is false** on the production instance.
      Verify at `https://clerk.jambahr.com/v1/environment`.

## 4. Build and submit

```bash
cd apps/mobile

# TestFlight-bound build
eas build --platform ios --profile production

# First submit creates nothing — the App Store Connect record must exist first.
eas submit --platform ios --profile production --latest
```

Notes:
- `submit.production.ios` intentionally carries no `appleId` / `ascAppId` /
  `appleTeamId`. EAS prompts for them on first run and remembers the answers;
  hard-coded placeholders would just make the command fail.
- Sentry source-map upload is disabled on release builds
  (`SENTRY_DISABLE_AUTO_UPLOAD=true`), because a release build without
  `SENTRY_AUTH_TOKEN` dies in the Xcode phase. For symbolicated production
  crashes, add a real `SENTRY_AUTH_TOKEN` to the EAS environment and drop that
  flag — worth doing before a wide release.
- `autoIncrement` is on for production, so the build number rises on its own.
  The user-facing version comes from `app.json` → `expo.version`; bump it and
  add a `CHANGELOG.md` entry for every submission.

## 5. Before submitting for review

- [ ] Run the Maestro smoke flow against the actual build:
      `maestro test apps/mobile/.maestro/smoke-sign-in.yaml`
- [ ] **On a clean device that has never had a JambaHR dev build**: sign in,
      punch, apply for leave, open a payslip, approve something, receive a push.
      A device that once ran a dev build has a sandbox-keyed Expo push token and
      will always fail production push with `BadEnvironmentKeyInToken` — that is
      a device artefact, not a bug, and it will not affect real users.
- [ ] Paste the review notes from `01-...`, with the blanks filled.
- [ ] Complete the App Privacy answers from `02-...`.
- [ ] Confirm no pricing, purchase or upgrade UI is reachable anywhere.

## 6. After launch

- [ ] Watch Sentry release health; alert on a crash-rate regression.
- [ ] Watch the `cold_start_js_ms` measurement against the 2s budget.
- [ ] Set `MOBILE_LATEST_VERSION` and `MOBILE_UPDATE_URL` in Vercel so the app
      can nudge people to update. Leave `MOBILE_MIN_VERSION` unset until you
      genuinely need to block a build — setting it wrongly locks people out of
      clocking in.
- [ ] OTA policy: JS-only fixes go out with
      `eas update --branch production --message "..."`; anything native needs a
      store release. Note OTA pushes in `CHANGELOG.md` under the version they
      patch.

> **EAS Update is not installed yet.** The channels are configured and
> `runtimeVersion` is set, but `expo-updates` is not a dependency. Run
> `npx expo install expo-updates && eas update:configure` when you want OTA;
> it changes native code, so it needs a fresh build either way.

## 7. Android track (start the clock early)

- [ ] Register on Play Console and complete identity verification — this has a
      lead time and gates everything else.
- [ ] Start the closed test (12 testers / 14 days for new personal accounts) the
      same week iOS goes to TestFlight, so the two run concurrently.
- [ ] Complete the Data Safety form from `02-...`.
- [ ] Provide the public account-deletion URL — Play requires one even though
      the app has an in-app path.
- [ ] Configure FCM in Expo for Android push (iOS APNs is already done).
- [ ] Test on a low-RAM device: that is the real Indian SMB workforce handset,
      and it is where the performance budget actually bites.
