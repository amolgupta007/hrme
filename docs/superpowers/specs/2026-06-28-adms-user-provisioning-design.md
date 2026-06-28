# ADMS User Provisioning — Push JambaHR Employees to Biometric Devices

**Date:** 2026-06-28
**Status:** Design approved, pending spec review → implementation plan
**Related:** `docs/multi-location-attendance.md`, `src/content/runbooks/biometric-relay.md`, CLAUDE.md "Multi-Location Attendance" section

## Problem

JambaHR's biometric integration is **receive-only** today. The `/iclock` ADMS endpoint
ingests punches from ZKTeco/eSSL devices and resolves them to employees via
`employees.device_code` (= the device "User ID"/PIN), but JambaHR has **no way to push
users *out* to devices**. Onboarding a fleet means hand-entering every PIN one-at-a-time in
Settings, then separately enrolling each user on each physical device via vendor software or
USB — tedious and error-prone.

This feature makes JambaHR the source of truth for device **user records** (PIN + Name) and
auto-provisions them onto devices over the ADMS command channel the devices already poll.

**Hard boundary:** fingerprint *templates* cannot be created from data — each person still
enrolls a finger once at the device. Pushing the user record just makes their PIN+Name exist
so the physical enrollment attaches to the correct person, and so punches resolve.

## Requirements (locked during brainstorming)

| Decision | Choice |
|---|---|
| **Push scope** | Org-wide — every **active** employee **with a `device_code`** → every **active** device in the org. Everyone can punch anywhere. |
| **Sync triggers** | (1) New device registered → backfill all active employees with PINs onto it. (2) Employee terminated → delete their user record from all devices. (3) Manual "Sync all now" button. **NOT** on PIN edit. |
| **PIN assignment** | Admin-managed only. Employees without a `device_code` are skipped (no auto-generation). |
| **Bulk PIN entry** | Add a `device_code` column to the existing employee CSV importer. |
| **PIN uniqueness** | Hard rule: `device_code` is unique per org (DB partial unique index + import validation). |
| **Mechanism** | DB-backed command queue (Approach 1), drained via the device's `getrequest` poll, confirmed via its `devicecmd` ack. |

## Out of scope (v1 — YAGNI)

Fingerprint template push/transfer; per-device manual user selection; zone-scoped
provisioning; auto-PIN generation; sync-on-PIN-edit. All recorded as future options.

## Architecture

```
TRIGGERS (server actions)                 DEVICE (polls every few seconds)
  registerDevice ──┐
  terminateEmployee├─> enqueue device_commands (status=pending)
  syncAllUsersToDevices ┘                         │
                                                  ▼
                          GET /iclock/getrequest?SN=<serial>
                          → fetch ≤20 pending for SN, build lines,
                            set status=sent + cmd_seq, return commands
                                                  │  device executes
                                                  ▼
                          POST /iclock/devicecmd?SN=<serial>
                          → parse ID+Return → status=confirmed | failed
```

All command string building/parsing is isolated in a **pure, unit-tested boundary module**
so the route handler stays thin and the protocol can be tested without a device or DB.

### Components

| Unit | Responsibility | Depends on |
|---|---|---|
| `device_commands` table | Durable per-device command queue | Postgres |
| `src/lib/attendance/adms-commands.ts` (pure) | `buildUserCommand()`, `buildDeleteCommand()`, `parseDeviceCmdAck()`; field validation/sanitization | none (pure) |
| `src/lib/attendance/device-provisioning.ts` | `enqueueUpsertForDevice()`, `enqueueDeleteForEmployee()`, `enqueueSyncAll()`; dedup-aware inserts | admin Supabase, adms-commands |
| `src/app/iclock/[...seg]/route.ts` (extend) | `getrequest` → dispatch batch; `devicecmd` → record ack. Best-effort, never stalls the device | device-provisioning, adms-commands |
| `src/actions/attendance-devices.ts` (extend) | `syncAllUsersToDevices()`, `retryFailedCommands()`, `getProvisioningStatus()`; hook backfill into `registerDevice` | device-provisioning |
| `src/actions/employees.ts` (extend) | hook delete-enqueue into `terminateEmployee`; accept `device_code` in `bulkImportEmployees` | device-provisioning |
| `src/components/dashboard/import-client.tsx` (extend) | `device_code` column + validation | — |
| `src/components/settings/biometric-devices-section.tsx` (extend) | "Sync all now" + status line + "Retry failed" | attendance-devices actions |

## Data model

**Table `device_commands`:**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `org_id` | uuid → organizations | tenant isolation |
| `device_id` | uuid → devices | target device |
| `device_serial` | text | denormalized SN for join-free `getrequest` lookup |
| `cmd_seq` | bigint (sequence) | integer command id sent as `C:<cmd_seq>:…`, echoed in ack |
| `cmd_type` | text CHECK (`upsert_user`,`delete_user`) | |
| `pin` | text | the `device_code` |
| `employee_id` | uuid → employees, nullable | null-safe if employee later deleted |
| `name` | text | snapshot, truncated to 24 chars, tab/newline-stripped |
| `command_text` | text | exact ADMS line, written when dispatched |
| `status` | text CHECK (`pending`,`sent`,`confirmed`,`failed`) default `pending` | |
| `attempts` | int default 0 | |
| `last_error` | text nullable | |
| `created_at` / `sent_at` / `confirmed_at` | timestamptz | |

**Indexes:**
- `(device_serial, status)` — `getrequest` batch fetch.
- partial unique `(device_id, pin, cmd_type) WHERE status = 'pending'` — dedup; "Sync all" twice won't pile duplicates.

**`cmd_seq`** comes from a dedicated Postgres sequence so it's globally unique and monotonic
(the device keys its ack on this integer).

**RLS:** enabled on `device_commands`; service-role bypass (per CLAUDE.md gotcha #5),
Clerk-JWT advisory policies matching the other attendance tables.

**Employee PIN uniqueness:** partial unique index `(org_id, device_code) WHERE device_code IS NOT NULL`.

## ADMS protocol (validate against real MB140 first)

Standard ZKTeco PUSH format. Fields are **tab-separated**.

**`GET /iclock/getrequest?SN=<serial>`** — currently returns `OK`. New behavior:
- Fetch ≤ 20 `pending` rows for this serial (only if serial is registered + `is_active`).
- For each, build and persist `command_text`, set `cmd_seq`, flip to `sent`.
- Return one command per line:
  ```
  C:<cmd_seq>:DATA UPDATE USERINFO PIN=<pin>	Name=<name>	Pri=0	Passwd=	Card=	Grp=1	TZ=
  C:<cmd_seq>:DATA DELETE USERINFO PIN=<pin>
  ```
- If none pending → return `OK` (unchanged). `touchDeviceSeen()` still fires.

**`POST /iclock/devicecmd?SN=<serial>`** — device acks, body like `ID=<cmd_seq>&Return=0&CMD=DATA`.
- Parse `ID` + `Return`. `Return = 0` (≥0 on some firmware) → `confirmed`; negative → `failed` (code in `last_error`). Unknown `ID` → ignore + log.

**Field constraints (enqueue time):**
- `pin` numeric — non-numeric skipped + logged.
- `name` truncated to 24 chars, tabs/newlines stripped (can't break the wire format).
- No fingerprint data.

**Verification-first rollout:** the first implementation step after the queue + handler exist
is a single manual enqueue → watch the `[iclock capture]` log → confirm the MB140 actually
creates the user. Adjust the exact format there **before** wiring the triggers. No success
claim until a user is confirmed created on the device.

## Triggers

`src/lib/attendance/device-provisioning.ts` exposes the enqueue helpers; all are dedup-aware
and swallow failures so they never block the calling action:

- **New device** — in `registerDevice` after insert: `enqueueUpsertForDevice(newDevice)` for all active employees with a PIN.
- **Terminate** — in `terminateEmployee`: `enqueueDeleteForEmployee(employee)` across all active devices (only if the employee has a PIN).
- **Sync all** — `syncAllUsersToDevices()` admin action: every active device × every active employee with a PIN → `upsert_user`.

## CSV importer change

- `import-client.tsx`: add optional `device_code` to `COLUMN_REFERENCE` + `validateRow` (numeric, optional).
- `bulkImportEmployees`: persist `device_code`; validate per-org uniqueness (friendly error on collision), backed by the partial unique index.

## UI

Settings → Attendance → Biometric Devices (admin + `attendanceEnabled` only):
- **"Sync all users to devices"** button.
- **Status line** with org-wide counts: `pending · sent · confirmed · failed` (via `getProvisioningStatus()`).
- **"Retry failed"** → re-enqueue `failed` rows.
- No per-employee/per-device matrix in v1.

## Error handling

- Offline device → commands stay `pending`, drain on reconnect (durable queue; not an error).
- Failed ack → `failed` + `last_error`, visible in status line, fixable via Retry.
- `getrequest` command logic is wrapped; any failure falls through to the existing `OK` so a device never stalls and punch ingestion is never affected.
- Bad data → non-numeric PIN skipped; name sanitized; enqueue failures swallowed (calling action still succeeds).
- Deactivated/unregistered serials receive nothing (mirrors existing ingest guard).

## Testing

- **Pure unit tests** (`tests/attendance/adms-commands.test.ts`): build upsert/delete lines, parse ack (success/failure/unknown id), name truncation, tab sanitization, non-numeric PIN rejection.
- **Enqueue/dedup tests** for `device-provisioning.ts`.
- **Manual e2e on the real MB140**: enqueue one user → confirm created on device; terminate → confirm removed; "Sync all" → confirm a batch lands.
- Migration applied via Supabase MCP (Windows — gotcha #4).

## Open questions / risks

1. **Firmware format drift** — exact `USERINFO` field set and `devicecmd` ack shape may vary by firmware. Mitigated by the verification-first step and the isolated `adms-commands.ts` (one place to adjust). **Primary risk.**
2. **`getrequest` PII exposure** — responses include employee names over the device's chosen transport (HTTP for relayed K40, HTTPS for MB140). Same exposure class as punches; ingest-token path is the hardening lever.
3. **`cmd_seq` ↔ device command-id semantics** — confirm the device tolerates large/monotonic integer ids; if it requires per-device small ids, scope `cmd_seq` per device. Resolve during verification.
4. **Batch size (20)** — tune during the e2e if a device's poll cadence makes draining slow for 500 employees.
