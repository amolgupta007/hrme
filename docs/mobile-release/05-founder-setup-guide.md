# Founder setup guide — the four accounts that gate the app store launch

Everything here needs a human with a credit card and ID. None of it can be done
from the repo, and all of it blocks submission.

**Do them in this order.** Items 1 and 2 have waiting periods that run in the
background, so start them before the ones that don't.

| # | Item | Blocks | Waiting period |
|---|---|---|---|
| 1 | Play Console account + verification | All of Android | Days to weeks |
| 2 | App Store Connect app record | `eas submit`, TestFlight | None, but must exist first |
| 3 | Demo tenant + demo mailbox | App Review (both stores) | None |
| 4 | Firebase project → `google-services.json` | Android push | None |

---

## 1. Google Play Console account + identity verification

**Cost:** US$25, one-off. **Start this first** — verification is the longest wait
in the whole launch.

### 1.1 Create the account

1. Go to `play.google.com/console` and sign in with the Google account you want
   to own the listing forever. **Use a company account, not a personal Gmail** —
   this cannot be changed later without a full app transfer.
2. Choose **Organisation**, not Individual. The developer name shown on the
   listing becomes your company name rather than "Amol Gupta", which matters for
   B2B credibility and matches the Apple account.
3. Pay the US$25 registration fee.

### 1.2 Identity verification

Google will ask for:

- **Legal entity name and address** — must match your registration documents
  exactly, including punctuation.
- **A D-U-N-S number** for the organisation. You already obtained one for the
  Apple Developer Program in July 2026 — reuse it. If Google says it can't find
  it, the D&B record may still be propagating; that can take a fortnight.
- **Contact details** that will be shown publicly on the listing.
- **A phone number and email** they will verify.

Verification typically takes a few days but can run to weeks if anything
mismatches. Check the Console for status; Google emails but the mail is easy to
miss.

### 1.3 Check whether closed testing applies to you

Once verified, go to the Console and look for a **closed testing requirement**
banner on your account.

- Google requires new **personal** developer accounts to run a closed test with
  12 testers for 14 continuous days before they can publish to production.
- **Organisation** accounts are usually exempt — but **verify this for your own
  account rather than assuming.** If it applies and you have not started, it is
  a hard two-week wall discovered at the worst possible moment.

If it applies, start the closed test the same week iOS goes to TestFlight so the
two clocks run together. You will need 12 real Google accounts that opt in and
stay opted in for the full period — recruit them before you need them.

### 1.4 Create the app entry

1. Console → **Create app**.
2. App name: `JambaHR`. Default language: English (India) or English (UK).
3. Type: **App**. Free or paid: **Free** — the subscription is sold to companies
   on the web, and the app itself is free to install.
4. Confirm the declarations (Play Console policies, US export laws).

Do **not** upload a build yet — get the AAB from
`04-play-console.md` §3 first.

---

## 2. App Store Connect app record

**Cost:** none beyond the Apple Developer Program you already hold.

This does not exist yet, and **`eas submit` cannot create it** — the record must
be there before the first upload.

1. Sign in to `appstoreconnect.apple.com` with the Apple Developer account.
2. **My Apps → + → New App**.
3. Fill in:
   - **Platform:** iOS
   - **Name:** `JambaHR` — this must be globally unique across the App Store. If
     it is taken, `JambaHR – HR & Attendance` or similar. Reserve it now even if
     you are not ready to submit; the name is held while the app is in
     preparation.
   - **Primary language:** English (India), or English (UK) if India is
     unavailable.
   - **Bundle ID:** select `com.jambahr.mobile` from the dropdown. It should
     already be listed, because the first EAS iOS build registered it. **If you
     see `com.jambahr.app` anywhere, ignore it** — the shipped identifier is
     `com.jambahr.mobile` and it is permanent.
   - **SKU:** any internal string, e.g. `jambahr-mobile-ios`. Never shown to
     users.
   - **User Access:** Full Access.
4. On the app's page, set:
   - **Category:** Primary *Business*. Secondary *Productivity* (optional).
   - **Content Rights:** you own or are licensed to use all content.
   - **Age Rating:** complete the questionnaire — all "None"; the result should
     be 4+.
5. **App Privacy** section — fill from `02-privacy-labels.md`. Note that
   location is declared **Precise**, and the reasoning is documented there. Do
   not downgrade it.
6. **Pricing and Availability:** Free. Availability: India at minimum; add other
   territories if you intend to sell there.

You will also need, before you can actually submit for review:

- **Screenshots** — 6.7" (1290×2796) and 6.5" or 6.1". Minimum three each.
  Take them from a real device or the simulator once the build runs.
- **App icon** 1024×1024, no transparency, no rounded corners.
- **Description, subtitle, keywords, support URL, marketing URL.**
- **Privacy policy URL** — the updated one, including the mobile section.

---

## 3. Demo tenant + demo mailbox

This is the single highest-risk item in the whole submission. A reviewer who
cannot sign in rejects the app, and for a B2B product with no public sign-up
that happens by default unless you do this properly.

**Read the sign-in warning in `01-app-review-notes.md` before you start.** In
short: the app always prefers the emailed one-time code over a password, so
setting a password on the demo account gets you nothing, and Clerk's fixed test
codes only work on development instances — not against production. The reviewer
needs mailbox access.

### 3.1 Create a dedicated demo mailbox

1. Create a **new** mailbox used for nothing else — for example a Google
   Workspace user `appreview@jambahr.com`, or a free account if you prefer to
   keep it off your domain.
2. Set a simple, stable password. You are going to write it in the review notes,
   so it must not be reused anywhere and must not have 2FA enabled — a reviewer
   cannot pass a second factor.
3. Confirm you can log into the webmail from a private browser window using only
   what you will write in the notes.

### 3.2 Seed the demo tenant

1. Open `apps/web/scripts/seed-mobile-demo.sql`.
2. Edit the two variables at the top to the addresses you just created:
   ```sql
   demo_employee_email text := 'appreview+employee@jambahr.com';
   demo_admin_email    text := 'appreview+admin@jambahr.com';
   ```
   Plus-addressing works if your mail provider supports it, and keeps both
   accounts in one inbox — which is easier for the reviewer, not harder.
3. Run it in the **production** Supabase SQL Editor (Windows can't use the
   Supabase CLI — gotcha #4). It is idempotent; re-running once the org exists
   does nothing.
4. Confirm it printed the `Demo org seeded:` notice.

### 3.3 Verify as a reviewer would

Do this on a **clean device or a fresh install**, not on a phone already signed
in — the whole point is to reproduce the reviewer's starting position.

1. Install the build.
2. Sign in as the employee address. Fetch the code from webmail using only the
   credentials from the notes.
3. Check the screens have content: attendance history, leave balances, payslips,
   and a location-tagged punch.
4. Sign out, sign in as the admin address, and confirm the approvals inbox has
   pending items.

### 3.4 Fill in the review notes

Open `01-app-review-notes.md`, replace every `<PLACEHOLDER>`, and paste the
"Review Notes" section into App Store Connect → your build → **App Review
Information → Notes**. Reuse the same text for Play's **Testing instructions**.

Keep the tenant and the mailbox alive for the whole review window, and do not
let the seeded data expire or get cleaned up mid-review.

---

## 4. Firebase project → `google-services.json`

Android push does not work without this. The app produces no push token at all,
so notifications silently never arrive.

**This is completely separate from the iOS APNs key you already uploaded.**
Having one does nothing for the other.

### 4.1 Create the Firebase project

1. Go to `console.firebase.google.com` → **Create a project** (or reuse an
   existing JambaHR project if you have one).
2. Name it `JambaHR`. Google Analytics is optional — decline it unless you want
   it; it adds data-collection obligations you would then have to declare.

### 4.2 Register the Android app

1. In the project, click the **Android** icon to add an app.
2. **Android package name:** `com.jambahr.mobile` — exactly this. A typo here
   produces a file that builds fine and delivers nothing.
3. App nickname: `JambaHR Android`. Debug signing certificate: leave blank.
4. Click **Register app**, then **Download `google-services.json`**.

### 4.3 Wire it up locally

Put the file at `apps/mobile/google-services.json`. It is gitignored, and
`app.config.js` picks it up automatically when present — you do not need to edit
any config.

### 4.4 Give it to EAS

```bash
cd apps/mobile
eas env:create --environment production --name GOOGLE_SERVICES_JSON \
  --type file --value ./google-services.json
eas env:create --environment preview --name GOOGLE_SERVICES_JSON \
  --type file --value ./google-services.json
```

### 4.5 Let Expo's push service talk to FCM

Expo relays notifications to FCM on your behalf, so it needs a credential:

1. Firebase Console → **Project settings** → **Service accounts** → **Generate
   new private key**. Download the JSON.
2. ```bash
   cd apps/mobile
   eas credentials
   ```
   Choose **Android** → **FCM V1 service account key** → **Upload a new key** →
   point at the JSON you just downloaded.
3. Delete the downloaded JSON afterwards. It is a full service-account
   credential and must never be committed.

### 4.6 Verify

After the next Android build, on a real device:

1. Sign in and accept the notification permission prompt (Android 13+).
2. Have someone approve one of your leave requests on the web.
3. The notification must arrive as a **heads-up banner with sound**.
4. Check **Settings → Apps → JambaHR → Notifications**. You should see
   **Approvals** and **Updates** as two separate toggles. If it instead says
   **Miscellaneous**, the channel wiring has drifted and push is degraded —
   see `04-play-console.md` §7.

---

## Quick reference — what you will have when this is done

| Credential | Where it lives | Committed? |
|---|---|---|
| Play Console account | Google | — |
| App Store Connect record | Apple | — |
| Demo mailbox password | Review notes (both stores) | No |
| `google-services.json` | `apps/mobile/` + EAS file secret | **No** (gitignored) |
| FCM service-account key | EAS credentials only | **No** — delete local copy |
| Play service-account key | EAS file secret | **No** |
| APNs `.p8` | Expo (already uploaded) | **No** |
