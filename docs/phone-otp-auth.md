# Phone + OTP Authentication (email-less employees) — Operator Guide

**Status:** Phase 1 shipped on branch `feat/phone-otp-auth`. Spec: `docs/superpowers/specs/2026-06-16-phone-otp-authentication-design.md`. Plan: `docs/superpowers/plans/2026-06-16-phone-otp-authentication.md`.

## What this does

Employees who have **no email** (field / frontline / blue-collar staff) can now be onboarded and sign in with **phone number + SMS OTP**. The existing email-based onboarding is completely unchanged — phone-only is a clean additive path.

- Email is no longer mandatory on an employee; **every employee must have an email OR a phone** (DB CHECK).
- Phone is stored normalized to **E.164** (`+91XXXXXXXXXX`) and is unique per org.
- A phone-only employee is **provisioned directly in Clerk** at creation (no email invite), and their `clerk_user_id` is linked synchronously.

## One-time operator setup (NOT code — do this before launch)

1. **Clerk Dashboard** → User & Authentication → Email, Phone, Username:
   - Enable **Phone number** as an identifier.
   - Enable **SMS verification code**.
   - Keep **Email address** enabled (existing users keep email login).
2. **India SMS / DLT compliance:** Clerk delivers the login OTP by **SMS only** (there is no WhatsApp login-OTP path). For Indian numbers this requires **TRAI/DLT registration** of Clerk's SMS sender ID + approved templates, and a per-SMS cost. Complete this before going live, or OTP SMS will not deliver to Indian numbers.

> The WhatsApp pipeline (late-policy adapters) is **not** the login channel — it is reserved for app *notifications* in Phase 2. Login OTP is always Clerk SMS.

## How to onboard a phone-only employee

- **Single:** Employees → Add employee → fill name + **phone** (leave email blank). On save, the employee is created and provisioned in Clerk; they appear as a normal active employee (no "Send Invite" button — they don't need one).
- **CSV import:** A row is valid with an email **or** a valid phone. Phone-only rows are provisioned automatically. Duplicate phones (within the file or already in the org) are skipped per-row with an error, just like duplicate emails.

The employee then goes to **/sign-in**, enters their phone, receives the SMS OTP, and lands on the dashboard with the correct role and org.

## What changed in the code (for maintainers)

- `src/lib/phone.ts` — `normalizePhone` / `isValidPhone` (E.164, India-first).
- `src/lib/clerk/provision-phone-user.ts` — `provisionPhoneOnlyUser(client, opts)` (find-or-create Clerk user by phone + add org membership; idempotent).
- `src/lib/employees/employee-schema.ts` — extracted `employeeSchema` (out of the `"use server"` file); `email` optional, `phone` validated, refine requires email-or-phone.
- `src/actions/employees.ts` — `addEmployee` + `bulkImportEmployees` fork to provision phone-only employees; identity-aware duplicate-key messages.
- `src/app/api/webhooks/clerk/route.ts` — `organizationMembership.created` links phone-only members by phone identifier.
- `src/lib/current-user.ts` — phone-match fallback so a phone-only user never falls through to the `admin` default.
- `src/components/dashboard/employee-table.tsx` — shows phone when email is absent.
- Notification senders guarded to **skip** phone-only employees (Phase 1; Phase 2 routes them to WhatsApp).
- Migration `066_employees_phone_identity.sql` — `email` nullable, partial unique index on `(org_id, phone)`, CHECK email-or-phone. **Applied to production HRme.**

## Manual verification checklist (run after Clerk config above)

1. **Provision:** As an admin, add an employee with a phone and no email. Confirm the directory shows the phone (no "Send Invite" button) and the `employees` row has `clerk_user_id` set + `email` null.
2. **Login:** In a fresh browser, sign in with that phone → receive SMS OTP → land on `/dashboard` with the correct role/org (NOT the admin-default sidebar).
3. **Email regression:** Add an employee with an email (no phone) → confirm a Clerk email invitation is sent and the accept-invite flow still links `clerk_user_id` by email.
4. **CSV:** Import a CSV mixing email rows and phone-only rows → confirm both onboard; a duplicate phone is reported as a skipped row, not a whole-batch failure.

## Phase 1 limitations / known follow-ups

- **Notifications:** phone-only employees receive **no email notifications** in Phase 1 (leave approvals, payslips, reminders are skipped for them). Phase 2 routes these to the existing WhatsApp pipeline. Grep `Phase 2 will route to WhatsApp` for the skip sites.
- **Login phone is admin-managed:** employees cannot change their own login phone (it's their credential). Admins edit it.
- **Provisioning-failure recovery:** if Clerk provisioning fails at creation (rare), the employee row exists but is unlinked (`clerk_user_id` null). Recovery today is delete + re-add. A directory "retry provisioning" action is a noted follow-up.
- **Org creators keep email:** owner/admin phone-only *signup* (creating a brand-new org by phone) is out of scope — org creators still use email.
- **Phone normalization is India-first** (`+91` default for bare 10-digit numbers); already-E.164 numbers for other countries pass through.
