# Android — Play Console runbook

Android has never been built. This is the path from nothing to a Play listing.

Read `00-release-runbook.md` first — the EAS environment, Clerk, and demo-tenant
steps are shared with iOS and are not repeated here. `02-privacy-labels.md` has
the Data Safety answers.

**Start the account and the closed test early.** Both have waiting periods that
run in the background, and neither depends on the app being finished. Everything
else here is quick by comparison.

---

## 0. Where things stand

**Done in the repo**

- [code] Android notification channels (`approvals_v1` high, `updates_v1`
  default), created on device at module load, with the server sending a matching
  `channelId` and FCM `priority`.
- [code] Conditional FCM wiring — `app.config.js` sets
  `android.googleServicesFile` only when the file exists, so a missing
  credential can't break local dev or CI.
- [code] Explicit permission allowlist and a `blockedPermissions` list that
  strips background location and storage permissions a dependency might drag in.
- [code] Build profiles: `preview` → **APK** (sideloadable), `production` →
  **AAB** (what Play requires), submitting to the `internal` track.
- [code] Public account-deletion page at `/account-deletion` — Play requires the
  URL even though the app has an in-app path.
- [code] Adaptive-icon and splash colours moved off the Expo template blue.
- [code] Status bar pinned to dark icons, because Android 16 makes edge-to-edge
  mandatory and content now draws under the system bars.

**Not done — yours**

- [ ] Play Console account (US$25, one-off) + identity verification.
- [ ] Firebase project and `google-services.json` for FCM.
- [ ] Closed test with the required number of testers.
- [ ] Store listing: screenshots, feature graphic, description.
- [ ] Adaptive-icon **artwork** — still the Expo template PNG (see §6).

---

## 1. Accounts (do these first — they have waiting periods)

1. **Play Console** — register at `play.google.com/console`, US$25 one-off.
   Register as an **organisation**, matching the Apple account, so the developer
   name reads "JambaHR" rather than a personal name. Identity verification
   (documents, and for organisations a D-U-N-S number) has a lead time.
2. **Closed testing.** Google requires new personal developer accounts to run a
   closed test with 12 testers for 14 continuous days before production access.
   Organisation accounts are usually exempt, but **verify your own account's
   requirement in the Console rather than assuming** — if it applies and you
   haven't started, it is a hard two-week wall at the worst moment. Start the
   closed test the same week iOS goes to TestFlight so the clocks overlap.

## 2. Firebase / FCM (required for push)

Android push does not work without this — the app produces no push token at all.

1. Create a Firebase project (or reuse an existing JambaHR one).
2. Add an **Android app** with package name exactly `com.jambahr.mobile`.
3. Download `google-services.json`.
4. Local dev: drop it at `apps/mobile/google-services.json`. It is gitignored,
   and `app.config.js` picks it up automatically.
5. EAS builds:
   ```bash
   cd apps/mobile
   eas env:create --environment production --name GOOGLE_SERVICES_JSON \
     --type file --value ./google-services.json
   eas env:create --environment preview --name GOOGLE_SERVICES_JSON \
     --type file --value ./google-services.json
   ```
6. Link FCM to Expo so the push relay can deliver:
   `eas credentials` → Android → *FCM V1 service account key* → upload the
   service-account JSON from Firebase → Project settings → Service accounts.

> The iOS APNs key is already uploaded. FCM is the Android equivalent and is
> entirely separate — having one does nothing for the other.

## 3. Build

```bash
cd apps/mobile

# Testers, sideloaded — no Play track needed. Fastest way to get real feedback.
eas build --platform android --profile preview     # → .apk

# Play-bound
eas build --platform android --profile production  # → .aab
```

The `development` profile also produces an APK, for a dev client running against
Metro.

## 4. Submit

`eas submit` needs a Google service account with Play Console access:

1. Play Console → Setup → API access → link a Google Cloud project → create a
   service account → grant it **Release manager** on the app.
2. Download its JSON key and give it to EAS as a file secret (never commit it):
   ```bash
   eas env:create --environment production --name GOOGLE_SERVICE_ACCOUNT_KEY \
     --type file --value ./play-service-account.json
   ```
3. Submit:
   ```bash
   eas submit --platform android --profile production --latest
   ```

`submit.production.android.track` is `internal`; promote through
internal → closed → open → production in the Console.

## 5. Store listing and policy

- **Data Safety form** — answers in `02-privacy-labels.md`. Note that location
  is declared **Precise**, not Approximate, and the reasoning is written down
  there. Play cross-checks declarations against the manifest, so an
  under-declaration is caught automatically.
- **Account deletion URL** — `https://jambahr.com/account-deletion`.
- **Privacy policy URL** — the same one used for iOS, updated with the mobile
  section from `03-dpdp-and-privacy-copy.md`.
- **Target API level** — Play enforces a rolling minimum. Expo SDK 57 targets a
  current level; if a submission is rejected for this, the fix is an Expo SDK
  upgrade, not a manual `targetSdkVersion` override.
- **App category** — Business. **Content rating** — complete the questionnaire;
  this app has no user-generated public content.
- **Testing instructions** — Play's equivalent of Apple's review notes. Reuse the
  demo credentials and the B2B explanation from `01-app-review-notes.md`; the
  "there is no public sign-up" point matters just as much here.
- **No purchase UI** — same rule as iOS. Subscriptions are sold to companies on
  the web, so Play Billing does not apply. Keep every pricing and upgrade
  affordance out of the app.

## 6. Known gaps to close before a public launch

- **Adaptive icon artwork.** `assets/images/android-icon-*.png` are still the
  Expo template. The background colour is now brand teal, but the foreground is
  not a JambaHR mark. Needs a designed 432×432 foreground with the logo inside
  the safe circle — deliberately not faked here.
- **Feature graphic** (1024×500) and phone screenshots are required by Play and
  do not exist yet.
- **Device testing on a low-RAM handset.** This is the real Indian SMB workforce
  device and where the PRD-04 performance budget actually bites; an iPhone tells
  you nothing about it. Check cold start, the month calendar scroll, and the
  approvals list.

## 7. Android-specific things to verify on device

Ordered by how likely they are to be wrong, since none of this can be checked
from CI:

1. **Push arrives as a heads-up banner with sound.** If it is silent or appears
   only in the shade, the channel wiring is wrong. Check *Settings → Apps →
   JambaHR → Notifications* — you should see **Approvals** and **Updates** as
   separate toggles. If you instead see "Miscellaneous", the client and server
   channel ids have drifted.
2. **Notification permission prompt** appears on Android 13+ on first launch
   after sign-in (it does not exist on Android 12 and below).
3. **Location prompt offers Precise / Approximate.** Choose **Approximate** and
   confirm the punch is tagged **Remote**, never "At office" — that is the
   fail-safe path and it is silent when broken.
4. **Edge-to-edge**: content is not hidden behind the status bar or the gesture
   bar, and status-bar icons are dark and legible on every screen.
5. **Offline punch** in airplane mode replays with its original coordinates on
   reconnect (same check as iOS, but Android's aggressive background limits make
   it worth repeating here).
6. **Back gesture** from a stacked screen returns to the tab, and from a tab root
   exits the app rather than looping.
