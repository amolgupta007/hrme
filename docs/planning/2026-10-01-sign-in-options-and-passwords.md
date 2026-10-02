# Open all sign-in options: email + password, email OTP, phone OTP

> **Status (2026-10-02):** steps 1, 3, 5, 6 DONE.
> - Prod audit done.
> - Web banner + `/account/security` shipped (PR #51).
> - Invite link fixed.
> - Sign-in email sent to Medialoop 20/20 on 2026-10-01, one version for everyone. The masked-phone/per-person variants were dropped at the user's request.
> - Step 2 shrank to just Vedika (open).
> - Step 4 (mobile parity) not started.
> - Step 7: re-run the audit in a week.

**Goal:** every employee can sign in with **email + password**, **email code**, or
**phone code** — on web and mobile — and can set a password themselves.
**Trigger:** Medialoop feedback (2026-10-01): staff only ever use email OTP.

## Where we are today

| Option | Prod Clerk | Web sign-in | Mobile sign-in | Who can actually use it |
|---|---|---|---|---|
| Email code | on | default path | default for email | everyone with an email |
| Phone code | on | "Use phone" link | type a phone number | only if the phone is attached to their Clerk account |
| Email/phone + password | on | password field on first screen | **not offered** | **nobody** — accounts are created without a password |

Root causes:
1. `syncEmployeeAuthIdentifiers` / `provisionPhoneOnlyUser` create every Clerk user with
   `skipPasswordRequirement: true` → no password.
2. Setting one is possible but hidden: web "Forgot password?" (signed out) or avatar →
   Manage account → Security (signed in). Nobody was told.
3. The welcome email says "Create your password" and links to /sign-up — the account
   already exists, so that never happens.
4. Mobile never offers a password, or a way to reset one.
5. A phone stored on the employee row isn't automatically on the Clerk account
   (only when "Sync phone logins" ran, or the employee was added/edited after 2026-06-29).

**Principle:** passwords are only ever set by the employee. No admin sets, sees or emails
a password.

## Steps

### Step 1 — Audit (read-only, ~10 min)
With the **production** Clerk secret (local `.env.local` has the dev key): per org, count
employees whose Clerk account has (a) a password, (b) their employee-row phone attached,
(c) a verified email. Output counts plus a list of mismatches; nothing is changed.
*Needs:* the prod `CLERK_SECRET_KEY`, used only in memory for a one-off script.

### Step 2 — Attach every phone and email to the login account (no code change)
Run the existing **Employees → "Sync phone logins"** for each org, or the same function
across all orgs in one pass. Attaches each employee's stored phone/email as a verified
sign-in identifier, without sending an SMS. Re-run the Step 1 audit to confirm zero mismatches.

### Step 3 — Make "set a password" easy to find on web (small code change)
- **Avatar menu:** add **"Set or change password"**, which opens Clerk's account page on the
  Security tab.
- **Dashboard banner** for employees whose account has no password (`user.passwordEnabled`
  false): "Set a password so you can sign in without waiting for a code" → **Set password**
  · **Not now**. Dismissal remembered per device; shows again after 30 days until a password
  exists.
- Clerk's built-in flow handles the rest (rules, breached-password check, confirmation).

### Step 4 — Mobile parity (app update)
On the mobile sign-in screen:
- After entering an email or phone: **"Use password instead"** when the account has a password.
- **"Forgot password?"** → code to email/phone → set a new password (Clerk reset flow).
- On the code screen: **"Send code to my phone instead"** when both exist.
Strings go in `src/locales/en.ts`. Ships as an app update; needs an Android + iOS device check.

### Step 5 — Fix the new-joiner email (small code change)
Rewrite `AccountSetupEmail`: "Sign in at jambahr.com/sign-in with your email or phone
number — we'll send you a code. Once in, set a password from the banner if you'd like one."
Point the button at **/sign-in**, not /sign-up.
**Check first:** PR #39 deliberately pointed invites at /sign-up; confirm why before changing.

### Step 6 — Tell existing employees (one email per person)
New template **"Your JambaHR sign-in options"** from `noreply@`:
- the three ways to sign in, with 3-line steps each (incl. tap **Use phone**);
- **how to set a password** — sign in with a code → click **Set password** on the banner
  (or avatar → Set or change password); or **Forgot password?** on the sign-in page;
- the phone number on file, masked (e.g. `+91 ••••• ••321`), so they know which number
  works, with "wrong number? tell your HR admin";
- a button to jambahr.com/sign-in.

Sent via an admin button **Employees → "Email sign-in instructions"** (per org, preview
first, then Resend batch; logged so it can't be sent twice in 24h). Phone-only employees
(no email) are listed in the preview so the admin can tell them directly; they can already
use phone OTP and can set a password the same way. Roll out Medialoop first.

### Step 7 — Verify
For one Medialoop employee: sign in with email code → set password via the banner → sign
out → email + password → sign out → **Use phone** + SMS code → mobile: same three. Then
re-run the Step 1 audit: % with a password, before vs after.

## Order and effort

| Step | Effort | Ship |
|---|---|---|
| 1 Audit | 10 min | — |
| 2 Sync identifiers | 15 min | — |
| 3 Web prompt + menu | ~½ day | web deploy |
| 5 Welcome email fix | ~1 h | same deploy |
| 6 Instructions email | ~½ day | same deploy, then send Medialoop |
| 4 Mobile parity | ~1 day | app update |
| 7 Verify | 30 min | — |

## Open decisions
1. Send the instructions email to **Medialoop only first**, or every org?
2. Banner: **recommended prompt (dismissible)**, or force a password before using the app?
3. Mobile parity now, or after the web steps prove out?
4. Sender: an admin clicks the button themselves, or I send for Medialoop?
