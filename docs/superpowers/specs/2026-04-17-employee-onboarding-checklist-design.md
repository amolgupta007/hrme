# Employee First-Login Onboarding Checklist — Design Spec

**Date:** 2026-04-17
**Status:** Approved

---

## Overview

When a new employee accepts their invite and logs in for the first time, they see a soft-nudge onboarding checklist card on the dashboard. The card guides them through completing their profile, uploading ID proof, adding an emergency contact, and acknowledging company documents. It does not block access to any part of the app.

Admins can configure which steps are enabled and which are required. Admins can also track onboarding completion across all employees from the Employees page.

---

## Section 1: Data Model

### Completion derivation

Onboarding step completion is derived from existing data — no separate progress tracking table is needed.

| Step ID | Label | Derived from |
|---------|-------|-------------|
| `profile` | Complete your profile | `employees.phone` AND `employees.personal_email` are filled |
| `photo` | Upload a profile photo | `employees.avatar_url` is filled |
| `address` | Add your address | `employees.communication_address` is filled |
| `id_proof` | Upload ID proof | `employees.pan_number` OR `employees.aadhar_number` is filled |
| `emergency_contact` | Add emergency contact | `employees.emergency_contact_name` AND `employees.emergency_contact_phone` are filled |
| `documents` | Acknowledge company documents | At least one row exists in `document_acknowledgments` for this employee |

### New columns on `employees` table

Two new columns added via migration:

```sql
ALTER TABLE public.employees
  ADD COLUMN emergency_contact_name TEXT,
  ADD COLUMN emergency_contact_phone TEXT,
  ADD COLUMN emergency_contact_relationship TEXT;
```

### Admin config in `organizations.settings` JSONB

No new table. Step config stored as a key in the existing `organizations.settings` JSONB column:

```json
{
  "onboarding_steps": [
    { "id": "profile",           "enabled": true,  "required": true  },
    { "id": "photo",             "enabled": true,  "required": false },
    { "id": "address",           "enabled": true,  "required": true  },
    { "id": "id_proof",          "enabled": true,  "required": true  },
    { "id": "emergency_contact", "enabled": true,  "required": false },
    { "id": "documents",         "enabled": false, "required": false }
  ]
}
```

Default config is seeded in the Clerk `organization.created` webhook handler (alongside leave policies and holidays).

---

## Section 2: Employee-Facing Dashboard Card

### Visibility rules

- Shown to employees only (not admins or managers)
- Shown when at least one enabled step is incomplete
- Hidden (permanently) once all **required** enabled steps are complete
- A "Setup complete" dismissible banner shown briefly after all required steps finish

### Card contents

- Heading: "Complete your setup"
- Progress bar: "X of Y steps complete" (Y = count of enabled steps)
- Step list:
  - Completed steps: checkmark, step label, muted text
  - Incomplete steps: empty circle, step label, action link
- Action links per step:
  - `profile`, `photo`, `address`, `id_proof`, `emergency_contact` → `/dashboard/profile`
  - `documents` → `/dashboard/documents`

### Computation

Computed server-side in the dashboard page:
1. Fetch org's `onboarding_steps` config from `organizations.settings`
2. Fetch employee's current field values
3. Fetch employee's `document_acknowledgments` count
4. Derive a `{ id, label, complete, required, actionUrl }[]` list
5. Pass to client component as a prop

---

## Section 3: Admin Configuration

### Location

New **"Employee Onboarding"** section on the Settings page (`/dashboard/settings`), visible to admins only.

### UI

A list of all 6 steps. Each row has:
- Step name and description
- **Enabled** toggle — whether the step appears in employee checklists
- **Required** toggle — whether it must be completed to dismiss the card (only active when Enabled is on)

Saving calls a server action `updateOnboardingSteps(steps)` which updates `organizations.settings.onboarding_steps` via Supabase `jsonb_set`. Changes are immediate.

### Constraints

- A step cannot be Required if it is not Enabled (UI enforces this: Required toggle disabled when Enabled is off)
- `documents` step is off by default (not all orgs have acknowledgment-required documents)

---

## Section 4: Admin Tracking View

### Location

New **"Onboarding"** tab on the `/dashboard/employees` page, alongside the existing employee list.

### Table columns

| Column | Content |
|--------|---------|
| Employee | Name + avatar |
| Department | Department name |
| Joined | `created_at` date |
| Steps Complete | `X / Y` (respects org's enabled config) |
| Status | "Complete" (green) / "In Progress" (amber) / "Not started" (gray) |

### Filters

- All / Complete / In Progress / Not started
- Existing search bar applies to employee name

### Row action

Clicking a row navigates to the employee's profile page.

### Computation

Server-side: for each active employee, derive completion using the same logic as the employee card. Counts only enabled steps. Passed to client component.

---

## Section 5: Server Actions

| Action | Description |
|--------|-------------|
| `getOnboardingSteps(employeeId)` | Returns derived step completion list for one employee |
| `updateOnboardingSteps(steps)` | Admin: saves step config to `organizations.settings` |
| `updateEmergencyContact(data)` | Employee: updates emergency contact fields on `employees` |

`updateEmergencyContact` is the only new mutation needed — all other steps are completed via existing profile/documents actions.

---

## Out of Scope

- Tutorial videos or guided tours (can be added later as a step type)
- Custom step labels per org
- Per-department onboarding templates
- Email reminders for incomplete onboarding (can reuse cron pattern from doc-reminders)
