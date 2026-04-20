# Fingerprint Punch-In Integration — Design Spec
**Date:** 2026-04-20
**Status:** Approved

---

## Overview

Add a physical fingerprint device integration to the JambaHR attendance module. A fingerprint scanner at the office door calls a JambaHR webhook when an employee punches in or out. JambaHR validates the request, resolves the employee, and records the attendance — identical to a manual web clock-in but sourced from the device.

**Scope:** Option A only — HTTP webhook receiver. No local bridge agent, no manufacturer cloud sync.

**Feature flag:** Gated by `organizations.settings.fingerprint_enabled`. Only admins can configure. Attendance must already be enabled for the org.

---

## Punch Flow

```
Device (office door)
  → POST https://jambahr.com/api/attendance/punch
  → Authorization: Bearer <device_token>
  → Body: { "employee_code": "EMP001", "timestamp": "2026-04-20T09:05:00Z", "event_type": "auto" }

JambaHR API (route.ts)
  1. Validate Bearer token → look up org by settings->>'device_token'
  2. Check org has fingerprint_enabled = true
  3. Resolve employee: match employees.device_code = employee_code
     → fallback: match employees.email = employee_code
  4. If event_type = "auto" (default):
     → No open record today → clock_in
     → Open record (clock_in_at set, clock_out_at null) → clock_out
  5. Write to attendance_records (source: 'device')
  6. Return { ok: true, action: "clock_in" | "clock_out", employee_name, time }
```

### event_type values
- `"auto"` (default) — smart toggle: clock in if not in, clock out if in
- `"clock_in"` — force clock in (error if already clocked in)
- `"clock_out"` — force clock out (error if not clocked in)

### Error responses
| Condition | HTTP | Body |
|-----------|------|------|
| Missing/invalid token | 401 | `{ error: "Unauthorized" }` |
| Fingerprint disabled for org | 403 | `{ error: "Fingerprint integration not enabled" }` |
| Employee not found | 404 | `{ error: "Employee not found for code: EMP001" }` |
| Already clocked in (forced clock_in) | 409 | `{ error: "Already clocked in" }` |
| Not clocked in (forced clock_out) | 409 | `{ error: "Not clocked in" }` |

---

## Database Changes (SQL Editor — not in migration file)

```sql
-- 1. attendance_records: track punch source and device identifier
ALTER TABLE attendance_records
  ADD COLUMN source text NOT NULL DEFAULT 'web'
    CHECK (source IN ('web', 'device')),
  ADD COLUMN device_id text;

-- 2. employees: enrollment code set by admin when enrolling fingerprint
ALTER TABLE employees
  ADD COLUMN device_code text;

-- 3. Unique constraint: one device_code per org
CREATE UNIQUE INDEX employees_device_code_org_idx
  ON employees (org_id, device_code)
  WHERE device_code IS NOT NULL;
```

`organizations.settings` (JSONB) stores:
```json
{
  "fingerprint_enabled": true,
  "device_token": "dt_abc123xyz..."
}
```
No schema change needed — settings column already exists.

---

## File Structure

### New files

| File | Responsibility |
|------|----------------|
| `src/app/api/attendance/punch/route.ts` | Webhook endpoint — token auth, employee lookup, punch logic |
| `src/components/settings/fingerprint-section.tsx` | Settings UI — enable toggle, URL display, token management, employee codes table |
| `src/actions/fingerprint.ts` | `generateDeviceToken()`, `toggleFingerprintEnabled()`, `updateEmployeeDeviceCode()` |

### Modified files

| File | Change |
|------|--------|
| `src/app/dashboard/settings/page.tsx` | Import and render `FingerprintSection` (admin only) |
| `src/components/attendance/attendance-client.tsx` | Show "via device" badge on records where `source = 'device'` |
| `src/actions/attendance.ts` | Add `source: 'web'` explicitly to `clockIn()` and `clockOut()` inserts |

---

## Webhook Endpoint

**Route:** `src/app/api/attendance/punch/route.ts`

- Method: POST only
- Auth: `Authorization: Bearer <device_token>` header
- Token lookup: `SELECT * FROM organizations WHERE settings->>'device_token' = $1`
- No Clerk auth — device authenticates with token only
- Must be added to `middleware.ts` public routes: `/api/attendance/punch`
- `source` field written as `'device'` on all records created via this endpoint

**Request body schema:**
```typescript
{
  employee_code: string;       // required — matches employees.device_code or email
  timestamp?: string;          // ISO 8601 — defaults to server time if absent
  event_type?: "auto" | "clock_in" | "clock_out"; // defaults to "auto"
  device_id?: string;          // optional — stored for audit, not used for logic
}
```

**Success response:**
```json
{
  "ok": true,
  "action": "clock_in",
  "employee_name": "Priya Sharma",
  "time": "2026-04-20T09:05:00.000Z"
}
```

---

## Settings UI — FingerprintSection

Located in `src/components/settings/fingerprint-section.tsx`. Rendered on the settings page for admins only, below the onboarding steps section.

**Sub-sections:**

### 1. Enable toggle
- Toggle: "Enable fingerprint punch-in" → writes `settings.fingerprint_enabled`
- When disabled, webhook returns 403 for all punches

### 2. Webhook URL
- Static display: `https://jambahr.com/api/attendance/punch`
- Copy-to-clipboard button
- Method badge: `POST`

### 3. Device token
- Masked display: `dt_••••••••••••••••` + Show/Hide toggle
- Copy button
- "Regenerate token" button — confirms with inline warning ("Existing device must be reconfigured")
- Token format: `dt_` prefix + 32 random hex chars (generated server-side)

### 4. Payload format (collapsible)
Shows exact JSON the device should be configured to send:
```json
{
  "employee_code": "EMP001",
  "timestamp": "2026-04-20T09:05:00Z",
  "event_type": "auto"
}
```

### 5. Employee codes table
- Lists all active employees: Name | Email | Device Code | Action
- Inline editable `device_code` field per employee
- Save button per row
- Empty state: "No device codes set — employees will be matched by email"

---

## Server Actions — fingerprint.ts

```typescript
// Generate a new device token and save to org settings
generateDeviceToken(): Promise<ActionResult<string>>

// Enable or disable fingerprint integration for the org
toggleFingerprintEnabled(enabled: boolean): Promise<ActionResult<void>>

// Set or clear the device_code for a specific employee
updateEmployeeDeviceCode(employeeId: string, code: string | null): Promise<ActionResult<void>>
```

All actions require admin role. `generateDeviceToken` overwrites the previous token (old token immediately invalid).

---

## Attendance UI Changes

In `attendance-client.tsx`, records with `source = 'device'` show a small badge:

```
09:03 AM  [via device 🔌]
```

Badge style: muted, same size as existing status badges. Does not change any existing layout — appended inline next to the timestamp.

---

## Middleware Change

Add `/api/attendance/punch` to the public routes in `src/middleware.ts` so Clerk does not intercept it:

```typescript
const isPublicRoute = createRouteMatcher([
  // ... existing routes ...
  "/api/attendance/punch",
]);
```

---

## Security Notes

- Token is stored in `organizations.settings` JSONB — accessed via admin Supabase client only
- Token is never exposed in client-side code or logs
- Regenerating token immediately invalidates the old one — no grace period
- `timestamp` from device is stored as-is but capped: punches with timestamps more than 24 hours in the past or future are rejected with 422
- Rate limit: max 10 requests per minute per token (to be implemented via simple in-memory counter or Vercel WAF)

---

## Out of Scope (v1)

- Local bridge agent (Option B) for devices without HTTP push
- Manufacturer cloud sync (Option C)
- Multi-device support per org (one token per org is sufficient for v1)
- Device enrollment UI (fingerprint capture happens on the device itself)
- Offline punch queuing (device handles this if it supports store-and-forward)
