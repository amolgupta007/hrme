# DPDP notice & privacy-policy copy for the mobile app

Drafted for India's Digital Personal Data Protection Act, 2023. **This is
prepared copy, not legal advice** — have it reviewed before publishing, and fill
every `<PLACEHOLDER>`.

Three deliverables:
1. §1 — the in-app notice (already implemented, kept here as the canonical text)
2. §2 — the mobile section to append to the public privacy policy
3. §3 — what has to be true operationally for the copy to be honest

---

## 1. In-app notices (already shipped)

### 1a. Location at clock-in

Rendered by `apps/mobile/src/components/location-consent-sheet.tsx`, shown once
before the OS permission prompt. Canonical text:

> **Location at clock-in**
>
> {Org} has turned on location-verified clock-in. When you punch in or out,
> JambaHR reads your location once and records whether you were at one of
> {Org}'s offices.
>
> - **Only at the moment you punch** — nothing is read while the app is in the
>   background or closed. There is no continuous trail.
> - **What your employer sees** — either the office you punched from, or that
>   you were remote and the general area, for example "Andheri East, Mumbai".
>   Never your exact address.
> - **You stay in control** — you can turn location off for JambaHR at any time
>   in your device Settings.

If you change this copy, change it here too. The two must not drift.

### 1b. Account deletion

Rendered by `apps/mobile/src/components/account-deletion-sheet.tsx`. It states
that deletion is a *request to your employer*, and that attendance and payroll
records are retained under company policy and statutory requirements.

---

## 2. Privacy-policy section to publish (append to the existing policy)

### Mobile application

This section describes how the JambaHR mobile application handles personal
data, in addition to everything stated elsewhere in this policy.

**Who is responsible.** Your employer is the Data Fiduciary for your employment
data. JambaHR operates as a Data Processor on your employer's instructions.
Requests about your data should normally go to your employer first; our
Grievance Officer details are at the end of this section.

**What the app processes**

- *Identity and contact*: your name, work email address, phone number, employee
  identifier, and profile photo if you upload one — so you can sign in and so
  colleagues and administrators can identify you.
- *Attendance*: the date and time you clock in and out, and the device or
  channel used.
- *Location at clock-in* — only if your employer has enabled location-verified
  clock-in. In that case the app reads your device's location at the
  moment you clock in or out, and stores either the office site you were within,
  or an indication that you were remote together with the locality and city (for
  example "Andheri East, Mumbai"). We do not store a street address. Location is
  never read in the background or between punches. You may decline or later
  withdraw this permission in your device settings; if your employer has made
  location mandatory for clock-in, declining will prevent you clocking in
  through the app and you should contact your administrator.
- *Leave, payroll and documents*: shown to you in the app; created by your
  employer, not collected by the app.
- *Notifications*: a push notification token for your device, so we can tell you
  about approvals, payslips and decisions. Removed when you sign out.
- *Diagnostics*: crash and performance data, which does not include the contents
  of your records.

**Biometric data.** The app does not collect or store biometric data. Face ID or
Touch ID, where used, is verified by your device and never shared with us. Where
your employer uses fingerprint attendance devices, the fingerprint template
remains on that physical device; our systems receive only an employee number and
a timestamp.

**Purpose limitation.** Data is processed only to operate the HR services your
employer has subscribed to. We do not sell personal data, do not use it for
advertising, and do not track you across other apps or websites.

**Retention.** Attendance, leave and payroll records are retained by your
employer for as long as their policy and Indian statutory obligations require.
Push tokens are removed on sign-out. Diagnostic data is retained for a limited
period for reliability purposes.

**Deleting your account.** You can submit a deletion request from the app under
Profile → Delete my account, or in writing to the address below. Because your
employment records are jointly governed by your employer's statutory
obligations, the request is routed to your employer's administrators, who
complete offboarding; records they are legally required to keep are retained for
the required period and are not used for any other purpose.

**Your rights.** Subject to the DPDP Act, you may seek access to, and correction
of, your personal data, seek erasure where the law permits, nominate another
person to exercise your rights, and raise a grievance.

**Grievance Officer**

- Name: `<GRIEVANCE_OFFICER_NAME>`
- Email: `<GRIEVANCE_OFFICER_EMAIL>`
- Address: `<REGISTERED_ADDRESS>`
- We aim to respond within `<RESPONSE_SLA_DAYS>` days.

**Processors we use.** Clerk (authentication), Supabase (database and file
storage), Vercel (application hosting), Sentry (crash reporting), Expo (push
notification delivery), Mapbox (converting a coordinate to a locality name),
Resend (email). Hosting is in the `<REGION>` region.

---

## 3. What must be true before publishing this

The copy above makes promises. Each one has a matching fact in the system —
verify them rather than assuming:

- [ ] **"Never your exact address."** True today: `reverseGeocode` requests only
      `neighborhood,locality,place` types, so no street-level result is stored.
      Do not widen those types without revisiting this sentence. Note the
      distinction the policy relies on: the app *reads* a precise fix (a 200 m
      geofence needs one, and both stores are told so) but *retains* only the
      office name or the locality. The copy must keep describing retention, not
      imply the reading is coarse.
- [ ] **"Never read in the background."** True today: the app requests
      when-in-use only, and `app.json` sets both background-location flags to
      `false`. Adding any background location capability breaks this claim and
      changes the App Store review outcome.
- [ ] **"Push tokens removed when you sign out."** Implemented via
      `unregisterPush` in `session.tsx`.
- [ ] **"Off by default."** Location-verified clock-in defaults to disabled per
      org (`DEFAULT_LOCATION_PUNCH_SETTINGS`).
- [ ] Grievance Officer appointed, and the address monitored.
- [ ] Public deletion URL live (required by Google Play even with an in-app path).
- [ ] Sub-processor list above matches what is actually deployed.
