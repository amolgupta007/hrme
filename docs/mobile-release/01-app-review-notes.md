# App Store Review Notes — JambaHR

Paste the **Review Notes** section below verbatim into App Store Connect →
your build → *App Review Information → Notes*. It exists to pre-empt the two
rejections that kill multi-tenant B2B apps: *"we could not sign in"* and
*"we could not find how to create an account / where the subscription is"*.

Keep the demo tenant seeded and the credentials live for the whole review
window. A reviewer who hits a dead login is an automatic rejection.

---

## Review Notes (copy from here)

**What JambaHR is**

JambaHR is a business-to-business HR platform used by small and medium
companies in India (typically 10–500 employees). This app is the companion
client for employees and managers of companies that already subscribe to
JambaHR on the web.

**Accounts are created by employers, not by end users**

There is no public sign-up in this app, and this is deliberate. An account
exists only when an employer adds that person as an employee in their JambaHR
workspace; the employee then receives an invitation and signs in here with the
email address or phone number their employer registered. This is why you will
not find a "Create account" button — the same model used by other workforce
apps.

**Demo credentials (please use these)**

We have seeded a dedicated demo company with realistic data so you can review
every screen.

| Role | Sign in with |
|---|---|
| Employee | `<DEMO_EMPLOYEE_EMAIL>` |
| Manager / admin | `<DEMO_ADMIN_EMAIL>` |

Sign-in sends a one-time code to the account's email address. So that you do
not need to contact us for it, both demo mailboxes are accessible here:

- Webmail: `<DEMO_MAILBOX_URL>`
- Mailbox login: `<DEMO_MAILBOX_USER>` / `<DEMO_MAILBOX_PASSWORD>`

Steps: choose "Email or phone number", enter the address above, tap continue,
open the mailbox, and enter the six-digit code.

The employee account shows attendance, leave, payslips and profile. The admin
account additionally shows the approvals inbox, team reports and the people
directory.

**Subscriptions and payments**

JambaHR subscriptions are purchased by the *company*, on our website, as a
business service. Nothing is sold, unlocked or purchased inside this app, and
the app contains no pricing, purchase or upgrade UI, and no links to any
purchase flow. Employees simply sign in to a workspace their employer already
pays for. We therefore have not implemented In-App Purchase; this follows the
"Reader"/multiplatform business-service pattern for enterprise software.

**Account deletion**

Profile → *Delete my account* submits a deletion request to the employee's
employer, who completes offboarding. We use a request-based flow because an
employee record in a B2B HR system is jointly owned: statutory payroll and
attendance records must be retained by the employer under Indian law, so the
employee cannot unilaterally erase them. The request is recorded, the
employer's administrators are notified, and the behaviour is documented in our
privacy policy.

**Location**

If — and only if — an employer enables "location-verified clock-in", the app
asks for *when in use* location permission and reads a single position at the
moment the employee taps clock in or out, to record whether the punch happened
at one of the company's offices. There is no background location use, and no
location tracking between punches. Employees are shown a plain-language notice
explaining this before the system permission prompt, and the feature is off by
default. The demo company has it enabled so you can see the flow.

**Biometrics**

The app does not collect, store or transmit any biometric data. Face ID / Touch
ID is used only as a local device re-authentication step before a manager
approves a payroll run. Where a customer uses fingerprint attendance devices,
those fingerprints stay on the physical device; our platform only ever receives
an employee number and a timestamp.

**Notifications**

Push notifications are transactional only — a leave request approved, a payslip
published, an item awaiting your approval. There is no marketing push.

Contact for any review question: `support@jambahr.com`.

---

## How the reviewer actually signs in — read this before filling in the blanks

This is the single highest-risk item in the whole submission, so be precise:

- The mobile sign-in screen offers **email code → phone code → password**, and
  the client picks the **first supported factor Clerk returns**. For an account
  with an email address, that is *always* the emailed one-time code — setting a
  password on the demo account will **not** get the reviewer a password prompt.
- Clerk's fixed-code test identifiers (`+clerk_test` addresses, code `424242`)
  work on **development instances only**. A store build points at the
  production Clerk instance, so they are not available here. Do not put a fixed
  code in the review notes: it will not work, and a failed login is a rejection.
- Therefore: create the two demo accounts on a mailbox **you control and can
  share**, and give the reviewer webmail access in the notes above. A dedicated
  mailbox used for nothing else is the safe choice — never a personal or
  company-operations inbox.
- Verify end to end on a clean device, from the mailbox credentials as written,
  exactly as a reviewer would. Do not verify from a device already signed in.

If you would rather not share a mailbox, the alternative is a demo-only
sign-in path (an account flagged to accept a fixed code). That is a code change
and is **not** currently implemented — do not describe it in the notes unless
it ships first.

## Pre-submission checklist for this document

- [ ] Demo tenant seeded (`scripts/seed-mobile-demo.sql`) on **production**
- [ ] Demo mailbox created, and its webmail credentials filled into the notes
- [ ] Both demo accounts sign in successfully on a clean device install, using
      only what the review notes say
- [ ] Location-verified clock-in **enabled** for the demo org, with at least one
      pinned office, so the reviewer sees the consent notice and the tagged punch
- [ ] Demo org has payslips, leave balances and pending approvals to look at
- [ ] The fixed verification code path is live for the two demo accounts
- [ ] `support@jambahr.com` is monitored during the review window
