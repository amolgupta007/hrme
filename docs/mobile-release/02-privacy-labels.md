# Privacy answer sheets — Apple Nutrition Label & Google Data Safety

Two forms, one underlying truth. Fill them from this file so they can never
disagree — a mismatch between the two stores, or between either store and the
`PrivacyInfo.xcprivacy` manifest in `app.json`, is what gets apps pulled.

**Source of truth for the manifest:** `apps/mobile/app.json` →
`expo.ios.privacyManifests`. If you change what the app collects, change all
three: this file, the manifest, and both store forms.

---

## What the app actually collects

| Data | Why | Linked to identity | Used for tracking |
|---|---|---|---|
| Name | Shows who you are; appears to your employer's admins | Yes | No |
| Email address | Sign-in identifier; notifications | Yes | No |
| Phone number | Alternative sign-in identifier (OTP); optional contact | Yes | No |
| User ID (employee + Clerk id) | Ties the session to an employee record | Yes | No |
| Coarse location | **Only** at the moment of a punch, and **only** if the employer enabled location-verified clock-in | Yes | No |
| Crash data (Sentry) | Diagnosing crashes | No | No |
| Performance data (Sentry) | Cold-start and error-rate monitoring | No | No |

**Not collected:** contacts, photos, browsing history, search history, purchases,
financial account details entered in the app, advertising identifiers,
biometric identifiers, precise/background location, health data, audio, video.

**A note on biometrics.** Face ID / Touch ID is used only as a local device
check before a payroll approval; iOS never hands the app the biometric itself.
Fingerprint attendance devices used by some customers keep templates on the
hardware — our servers receive an employee number and a timestamp only. Neither
counts as collecting biometric data, and neither should be declared as such.

**A note on payroll.** Salary and bank details are *displayed* in the app for
the signed-in employee, but the app does not *collect* them — they are entered
by the employer on the web. Declare them as collected only if that ever changes.

---

## Apple — App Privacy (Nutrition Label)

**Does this app collect data?** Yes.

**Do you or your third-party partners use data for tracking?** **No.** No data
is linked with third-party data for advertising, and no data is shared with
data brokers. Consequently **App Tracking Transparency is not required** and the
app must not show an ATT prompt.

Declare these categories, all **linked to the user**, all **App Functionality**,
none used for tracking:

- Contact Info → Name
- Contact Info → Email Address
- Contact Info → Phone Number
- Identifiers → User ID
- Location → Coarse Location

Declare these **not linked to the user**, App Functionality, not tracking:

- Diagnostics → Crash Data
- Diagnostics → Performance Data

**Other required answers**

- Export compliance: uses only standard HTTPS → exempt.
  `ITSAppUsesNonExemptEncryption` is already `false` in `app.json`.
- Age rating: 4+ (no objectionable content).
- Category: Business.
- Account deletion: Yes, in-app — Profile → Delete my account (request-based;
  see `01-app-review-notes.md` for the wording that explains why).

---

## Google Play — Data Safety (for the Android track)

Mirror the Apple answers exactly. Play asks two extra questions:

- **Is data encrypted in transit?** Yes (HTTPS/TLS throughout).
- **Can users request data deletion?** Yes — in-app request, plus a web route.
  Provide the public deletion URL on the store listing as well; Play requires a
  URL even when an in-app path exists.

Per data type, Play wants *collected* vs *shared*. Everything above is
**collected**; nothing is **shared** with third parties for their own purposes.
Sentry and Clerk are processors acting on our instructions, which Play does not
count as sharing.

**Location, specifically.** Declare **Approximate location**, collected,
optional, App functionality. Do **not** declare Precise location and do **not**
declare background location — the app requests when-in-use only and the config
explicitly sets `isIosBackgroundLocationEnabled: false` /
`isAndroidBackgroundLocationEnabled: false`.

---

## Required-reason API declarations (iOS privacy manifest)

Already declared in `app.json`. Recorded here so the *reasons* survive:

| API category | Reason code | Why |
|---|---|---|
| `UserDefaults` | `CA92.1` | App-scoped preferences only (Expo, Clerk token cache) |
| `FileTimestamp` | `C617.1` | Local cache/queue files created and read by the app itself (MMKV) |
| `SystemBootTime` | `35F9.1` | Measuring in-app event timings (crash/perf reporting) |
| `DiskSpace` | `E174.1` | Checking space before writing app-owned cache data |

Re-audit this table whenever a native dependency is added or an SDK is
upgraded — third-party SDKs ship their own manifests, and Apple merges them,
so a new dependency can silently introduce a category you have not declared a
reason for.
