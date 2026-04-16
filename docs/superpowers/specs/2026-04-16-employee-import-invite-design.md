# Employee Bulk Import & Invite System — Design Spec

## Goal

Allow admins to bulk-import employees from a CSV file, review the import results, then send Clerk-based activation invites to the imported employees — all from within the JambaHR dashboard.

## Architecture

Two surfaces: a new full-page import flow at `/dashboard/employees/import`, and invite management integrated into the existing employees page. A new `employee_invites` DB table tracks invite state independently of Clerk. Clerk's invitation API handles email delivery and secure sign-up links.

**Tech Stack:** Next.js 14 App Router, Supabase Postgres, Clerk Invitations API, papaparse (CSV parsing), Sonner toasts, Lucide icons, Tailwind CSS.

---

## Part 1 — Information Architecture

### New route: `/dashboard/employees/import`
- Full-page experience (not a dialog) to give large imports (100+ rows) room to breathe
- Linked from a new "Import CSV" button on the employees page header (next to "Add Employee")
- Admin-only: non-admins are redirected to `/dashboard/employees`
- Three inline stages rendered on the same page via state: **Upload → Preview → Results**

### Employees page additions
- New "Not activated" filter chip — filters to employees where `clerk_user_id IS NULL`
- Unactivated employees show an amber "Not activated" badge instead of a green "Active" dot
- Row dropdown gets a "Send Invite" / "Resend Invite" option
- New "Send Invites" bulk button in the page header — fires invites to all selected or all filtered unactivated employees

### New DB table: `employee_invites`
```sql
CREATE TABLE public.employee_invites (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  clerk_invitation_id TEXT,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id)  -- one active invite record per employee
);
CREATE INDEX idx_employee_invites_org ON public.employee_invites(org_id);
CREATE INDEX idx_employee_invites_employee ON public.employee_invites(employee_id);
```

### Invite status (derived, not stored)
Computed at query time from `employees` + `employee_invites`:

| Condition | Badge | Color |
|-----------|-------|-------|
| `clerk_user_id` is set | Active | Green |
| No invite row | Not activated | Amber |
| Invite row exists, `accepted_at` null, `expires_at` > now | Invite sent (date) | Amber |
| Invite row exists, `accepted_at` null, `expires_at` <= now | Invite expired | Red |
| `accepted_at` is set | Active | Green |

---

## Part 2 — CSV Import Flow

### Expected CSV format

**Required columns** (row skipped if missing or invalid):
```
first_name, last_name, email, role, employment_type, date_of_joining
```

**Optional columns** (left null if missing — no error):
```
phone, department, designation, date_of_birth, reporting_manager_email
```

**Value constraints:**
- `role` → `admin` | `manager` | `employee`
- `employment_type` → `full_time` | `part_time` | `contract` | `intern`
- `date_of_joining`, `date_of_birth` → `YYYY-MM-DD`
- `department` → matched case-insensitively against existing department names; unknown name = left null (not an error)
- `reporting_manager_email` → matched against existing active employees in the org; no match = left null (not an error)

A downloadable template CSV (with headers + one example row) is available on the import page.

### Stage 1: Upload
- Drag-and-drop zone + "Browse files" button, `.csv` only
- "Download template" link
- Column reference table (column name → what it accepts)

### Stage 2: Preview & Validation
- CSV parsed **client-side** using `papaparse` — no server round-trip until confirmed
- Table shows every row with a status indicator:
  - Green check — valid, will be imported
  - Red X — skipped, reason shown inline
- Summary bar: "42 valid · 3 skipped"
- Skipped rows remain visible in the table (greyed out) for reference
- "Back" to re-upload; "Import X employees" confirm button (disabled if 0 valid rows)

**Row-level skip reasons:**
- Missing required field (specifies which field)
- Invalid email format
- Duplicate email — already active in this org
- Duplicate email — belongs to a terminated employee (suggest re-activating manually)
- Invalid `role` or `employment_type` value
- Invalid date format

**Plan limit enforcement:**
If valid row count + current active employee count would exceed `org.max_employees`:
> "Your Starter plan allows 10 employees. You have 8. Only 2 of these 42 valid rows will be imported. Upgrade to Growth to import all."

Admin can proceed (imports up to the limit) or cancel and upgrade.

### Stage 3: Results
- Server creates employee records for all valid rows (up to plan limit)
- Progress indicator while inserting
- Final summary: "42 employees imported · 3 skipped"
- "Download errors.csv" button — exports skipped rows with an added `error_reason` column so admin can fix and re-import
- CTA: "Go to Employees" — returns to `/dashboard/employees`
- All imported employees: `status = active`, `clerk_user_id = null`

### Special case at import time
If an imported email already has a Clerk account linked to this org (i.e. a user exists with that email and is already a member):
- Employee record is created and `clerk_user_id` is set immediately
- No invite needed — badge shows green "Active" right away

---

## Part 3 — Invite & Activation System

### Sending invites

**Single invite** (row dropdown → "Send Invite"):
1. Call `clerkClient().invitations.createInvitation({ emailAddress, redirectUrl: "/dashboard" })`
2. Insert row into `employee_invites` — store `clerk_invitation_id`, set `expires_at = now() + 7 days`
3. Badge updates to amber "Invite sent (Apr 16)"
4. Dropdown option becomes "Resend Invite" for this employee

**Bulk invites** ("Send Invites" button):
- Fires invite for every employee in the org where `clerk_user_id IS NULL` (all unactivated, regardless of current filter)
- Shows a progress toast ("Sending invites…") and a final summary ("12 invites sent")
- Failures are reported per-email in the summary without blocking the rest

**Resend invite:**
- Creates a new Clerk invitation (Clerk invalidates the old one automatically)
- Updates `employee_invites.sent_at` and `expires_at`

### Invite acceptance (webhook)

The existing Clerk webhook handler at `/api/webhooks/clerk` handles `organizationInvitation.accepted`:
1. Extract `email_address` from the event payload
2. Look up the employee record by email in the org
3. Set `employees.clerk_user_id` to the new Clerk user ID
4. Stamp `employee_invites.accepted_at = now()`
5. `revalidatePath("/dashboard/employees")`

### Invite email
- Sent by Clerk (their default invitation email template)
- `redirectUrl: "/dashboard"` — accepted invites land directly in the app
- No custom email template needed for this phase

---

## Part 4 — Guards & Edge Cases

### Access control
- Import page (`/dashboard/employees/import`) and all invite actions: **admin-only**
- Available on **all plan tiers** (getting employees into the system is core, not premium)

### Clerk invitation API failure
- Toast error shown to admin
- `employee_invites` row not created
- Badge stays "Not activated"
- Admin can retry from the dropdown

### Import of an already-terminated employee email
- Row skipped with reason: "Email belongs to a terminated employee — re-activate from the employee list"
- Not imported, not treated as a valid row

### Invite for employee who later gets terminated
- `employee_invites` row is deleted when employee is terminated
- Any pending Clerk invitation is revoked via `clerkClient().invitations.revokeInvitation(clerk_invitation_id)`

---

## File Map

| File | Change |
|------|--------|
| `src/app/dashboard/employees/import/page.tsx` | New — import page (server, passes org/plan to client) |
| `src/components/employees/import-client.tsx` | New — 3-stage import UI (Upload / Preview / Results) |
| `src/actions/employees.ts` | Add `bulkImportEmployees(rows[])` action |
| `src/actions/invites.ts` | New — `sendInvite(employeeId)`, `sendBulkInvites(employeeIds[])`, `resendInvite(employeeId)` |
| `src/app/api/webhooks/clerk/route.ts` | Handle `organizationInvitation.accepted` event |
| `src/components/employees/employees-client.tsx` | Add "Import CSV" button, "Not activated" filter, "Send Invites" bulk button, invite badges |
| `supabase/migrations/004_employee_invites.sql` | New — `employee_invites` table |
| `public/employee-import-template.csv` | New — downloadable template file |
