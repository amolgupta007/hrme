# Multi-Location Attendance (Biometric Zones)

Shipped to `main` 2026-06-25 (`3809d21`). Spec: [`docs/prds/multi-location-attendance.md`](./prds/multi-location-attendance.md).

Lets employees punch on **biometric devices across multiple physical locations** and have those punches pooled into one daily attendance record. A real ZKTeco device pushes punches to JambaHR over its native **ADMS** protocol; JambaHR derives the daily record (first-in → last-out) from the punch stream, scoped to the employee's **attendance zone**.

---

## 1. What it does

- **Device integration** — ZKTeco / eSSL biometric terminals push fingerprint punches to JambaHR over ADMS ("push SDK"). No on-premise PC/agent required.
- **Zones (location groups)** — group one or more locations into a zone; assign an employee to a zone. Punches from any device in the zone count toward that employee's day; punches **outside** the zone are excluded.
- **Daily rollup** — `first-in → last-out` across the zone, with total hours, punch count, and an out-of-zone count. Direction (in/out) is **derived** (min/max), never trusted from the device.
- **Self-serve admin UI** — register devices, manage locations & zones, map employee PINs, view daily records, and review incomplete/out-of-zone days — all in Settings + the Attendance page.
- **Security** — punches are accepted only from registered, active device serials; an optional per-org URL token adds a shared secret.

---

## 2. Architecture / data flow

```
Biometric device (ZKTeco K40 Pro, …)
   │  ADMS push over HTTP(S)
   ▼
POST /iclock/cdata?SN=<serial>&table=ATTLOG        ← src/app/iclock/[...seg]/route.ts
   │  (handshake GET /iclock/cdata + command poll GET /iclock/getrequest also handled)
   ▼
ingestAttlog(serial, body)                          ← src/lib/attendance/adms-ingest.ts
   │  parse ATTLOG (tab-separated), resolve org by serial + employee by PIN
   ▼
attendance_punch_events                             (one row per punch, source='adms')
   │  recomputeAttendanceDay(employee, IST-day)
   ▼
resolveEmployeeZoneLocationIds()                    ← src/lib/attendance/resolve-zone.ts
   │  + computeDailyAttendance()                    ← src/lib/attendance/daily-attendance.ts (pure)
   ▼
attendance_records  (clock_in/out, total_minutes, first/last location, punch_count,
                     out_of_zone_count, derived_status)
   ▼
Attendance → "Locations" tab  +  existing attendance views
```

- **Org is resolved by device serial**; **employee by PIN** (`employees.device_code` = the User ID enrolled on the device).
- **Timestamps are device-local IST**, converted to UTC on ingest.
- The compute function is **pure and idempotent** — recompute runs on every punch (`waitUntil`-style, inline) and on a manual "recalculate day" action; last write wins.

---

## 3. Schema & migrations

All applied to the live DB by Supabase MCP. Idempotent (`if not exists`).

| Migration | Adds |
|---|---|
| `076_locations.sql` | `locations` (org physical sites) |
| `077_devices.sql` | `devices` (serial → location, `is_active`) |
| `078_attendance_punch_events.sql` | `attendance_punch_events` (neutral punch log) + `uq_punch_events_dedupe` (idempotency for ADMS reboot resends) |
| `082_devices_last_seen.sql` | `devices.last_seen_at` / `last_punch_at` (connection status) |
| `083_attendance_zones.sql` | `attendance_zones`, `attendance_zone_locations`, `employee_zone_assignments` (effective-dated) |
| `084_attendance_records_multiloc.sql` | `attendance_records.{first_in_location_id, last_out_location_id, punch_count, out_of_zone_count, derived_status}` |

> Migrations were originally numbered 079–081 but **renumbered to 082–084** to avoid colliding with the contractor migrations (`079`/`080`) already on `main`. RLS uses the Clerk-JWT pattern; service-role bypasses by design.

**Per-org settings** (`organizations.settings`, no migration): `device_ingest_token`, `device_ingest_require_token`.

---

## 4. Operator guide

### 4.1 Connect a biometric device
Settings → Attendance → **Biometric Devices** → "How to connect a device":

1. **Enroll the employee** on the device (Menu → User Mgmt → New User). Note the **User ID** — that's the PIN.
2. **Point the device at JambaHR** — Menu → Comm → **Cloud Server (ADMS)**:
   - Server Mode `ADMS` · Server Address `jambahr.com` · Server Port `443` · HTTPS / Encrypt **ON** · Enable Domain Name **ON**
3. **Reboot** the device (connects within ~30s; needs internet).
4. **Register the device** here (serial + location) and set the employee's **PIN** under "Employee PINs".
5. The device's status dot turns green **"Connected"**; punches flow into Attendance.

A device stuck on **"Waiting"** shows a "Not connecting?" checklist (rebooted? internet? HTTPS on? port 443? serial matches?).

### 4.2 Zones
Settings → Attendance → Biometric Devices → **Attendance Zones**:
- Create a zone (name + tick its locations).
- Assign each employee to a zone (dropdown). **Unassigned employees pool punches from all locations** (no-zone fallback).

### 4.3 Daily records / review queue
Attendance → **Locations** tab (admin): per-day first-in/last-out **with location**, hours, punch count, out-of-zone flag, status badge, and a **recalculate** button. Toggle **"Review queue only"** to see just incomplete or out-of-zone days.

### 4.4 Device security
Settings → Attendance → Biometric Devices → **Device security**:
- By default any **registered, active** serial is accepted.
- **Generate an ingest token** to get a secret server path `https://jambahr.com/iclock/<token>` — set that as the device's server path so punches carry a secret.
- **Require token** rejects plain serial-only pushes (only for devices that can set a custom server path).

### 4.5 User provisioning (push employees → devices)
Settings → Attendance → Biometric Devices → **Sync users to devices**:
- **"Sync all users to devices"** queues an `upsert_user` command (PIN + Name) for every active employee with a PIN, onto every active device. The status line shows `pending · sent · confirmed · failed`; **Retry failed** re-queues failed commands.
- Provisioning is **automatic** on two events: registering a new device **backfills** all existing employees with PINs; terminating an employee **deletes** their user record from all devices.
- PINs come from `employees.device_code` — set per-employee under "Employee PINs", or in bulk via the CSV importer's **`device_code`** column (digits only, unique per org).
- **Fingerprints are NOT pushed** — only the user record (PIN + Name). The employee still enrolls their fingerprint physically at the device. Provisioning just means the device already knows who PIN *N* is, so the first punch resolves correctly.

### 4.6 eSSL devices & the HTTP relay (learned during the Medialoop go-live, 2026-07-17)

eSSL terminals are ZKTeco OEMs but differ on the wire; all of this is now handled natively:

- **`.aspx` verb dialect** — eSSL polls `/iclock/getrequest.aspx` and posts `/iclock/cdata.aspx`. `parseIclockPath` strips the suffix (commit `dcbc0e7`). Pre-fix symptom: device shows **Connected** (liveness bumps in the catch-all handler) but commands never dispatch and punches are acknowledged-then-dropped.
- **Batched command acks** — eSSL acks every outstanding command in ONE devicecmd POST (one `ID=<seq>&Return=<code>` per line). `recordAck` parses all lines via `parseDeviceCmdAcks` (commit `076b421`). Pre-fix symptom: commands stuck at `sent` although the device executed them.
- **Zero-padded PINs** — the tested eSSL unit transmits PINs exactly as enrolled (`016`). Ingest matches `employees.device_code` by exact string; after any new model's first punch, check the PIN form in `attendance_punch_events`.
- **Name-only sync onto pre-enrolled users works**: `DATA UPDATE USERINFO` renames an existing PIN without touching fingerprint templates. Caveats: it resets device-admin privilege to normal user and clears punch passwords/RFID cards on the synced users (fields sent empty).

**First-connect debugging order** for a registered device that never shows Connected:

1. **Network config on the device** — a plugged-in Ethernet cable takes routing priority over WiFi, and a static config with Gateway `0.0.0.0` (very common) silently kills all push. DHCP is fine for ADMS (device only dials out). "Enable Domain Name" must be ON *before* the Server Address field will accept a hostname; settings apply only after reboot.
2. **Vercel runtime logs** (`query=/iclock`, filter by SN) — shows the device's real wire behavior; zero requests = device-side network/TLS, requests present = server-side handling.
3. **TLS capability** — if the device has a healthy config and internet but zero requests ever arrive, the firmware can't complete the TLS handshake Vercel requires (confirmed on the Medialoop eSSL unit; also ZKTeco K40). Fix = the on-prem **Caddy HTTP→HTTPS relay**: full runbook at `/superadmin/runbooks/biometric-relay`; a ready-to-run Windows package is caddy.exe + a Caddyfile (`:8080 { reverse_proxy https://jambahr.com { header_up Host jambahr.com } }`) + a scheduled-task installer (auto-start as SYSTEM, firewall rule on 8080). Device then points at the relay machine's LAN IP : 8080, HTTPS OFF. Give the relay machine a DHCP reservation and disable sleep-when-plugged-in. Relay downtime is safe — devices buffer punches and deliver on reconnect.
4. **TLS-capable units (MB140-class) connect direct** — prefer them for new purchases to skip the relay entirely.

**How it works:** commands sit in the `device_commands` queue (`pending`). On each `GET /iclock/getrequest` poll, the route drains a batch, builds ADMS command lines (`C:<seq>:DATA UPDATE USERINFO …`), and flips them to `sent`. The device executes them and `POST`s an ack to `/iclock/devicecmd` (`ID=<seq>&Return=0`), which flips the row to `confirmed` (or `failed` on a negative return). All command-string building/parsing is pure and unit-tested (`adms-commands.ts`); enqueue is best-effort and never blocks punch ingestion.

---

## 5. Key files

| File | Role |
|---|---|
| `src/app/iclock/[...seg]/route.ts` | Public ADMS endpoint — handshake, ATTLOG ingest, `getrequest` command dispatch + `devicecmd` acks |
| `src/lib/attendance/adms-ingest.ts` | Parse ATTLOG, IST→UTC, dedupe, write punch events, `recomputeAttendanceDay`, token/`is_active` checks |
| `src/lib/attendance/adms-commands.ts` | Pure ADMS command builders + ack parser (`buildUserCommand`/`buildDeleteCommand`/`parseDeviceCmdAck`) — 11 tests |
| `src/lib/attendance/device-command-diff.ts` | Pure command dedup (`missingCommands`/`commandKey`) — tests |
| `src/lib/attendance/device-provisioning.ts` | Enqueue helpers (upsert-for-device, delete-for-employee, sync-all) — best-effort DB I/O |
| `src/lib/attendance/daily-attendance.ts` | Pure `computeDailyAttendance()` / `dedupePunches()` (9 tests) |
| `src/lib/attendance/resolve-zone.ts` | Employee + day → in-zone location ids |
| `src/lib/attendance/iclock-path.ts` | `parseIclockPath()` — token vs ADMS verb (5 tests) |
| `src/actions/attendance-devices.ts` | Locations/devices CRUD + ingest-token security actions |
| `src/actions/attendance-zones.ts` | Zone CRUD + effective-dated employee assignment |
| `src/actions/attendance-daily.ts` | `getDailyAttendance` (range + review filter) + `recalculateDay` |
| `src/components/settings/biometric-devices-section.tsx` | Devices + locations + PINs + setup guide |
| `src/components/settings/register-device-dialog.tsx` | Register/edit device + ADMS instructions |
| `src/components/settings/attendance-zones-card.tsx` | Zone CRUD + assignment |
| `src/components/settings/ingest-security-card.tsx` | Token generation + require-token |
| `src/components/attendance/daily-attendance-tab.tsx` | Admin "Locations" daily view + review queue |

Tests: `tests/attendance/{daily-attendance,adms-ingest,iclock-path}.test.ts`.

---

## 6. Acceptance criteria (verified on a real ZKTeco K40 Pro)

- ✅ 09:00 punch at HO + 18:00 punch at Branch B, both in-zone → one record, **540 min**, first-in HO / last-out Branch B (pooled across two devices).
- ✅ With a zone of only HO, the Branch B punch is **excluded** → record is `incomplete`, not 540 min.
- ✅ A single punch → `incomplete` (no crash, no 0h).
- ✅ Device resends all logs on reboot → **deduped** (no double-count).
- ✅ IST→UTC conversion correct (13:38 IST stored as 08:08 UTC).

---

## 7. Gotchas / operational notes

1. **ATTLOG timestamps are device-local IST, not UTC.** `adms-ingest` parses them as `Asia/Kolkata`. (The node-zklib *pull* path returns UTC — different — but pull is not the production path.)
2. **`attendance_records.source` CHECK** only allows `web`/`device`/`auto_close`. The rollup writes `'device'`; punch events use `'adms'`.
3. **Device HTTPS: ON for production, OFF for local HTTP testing.** A device pointed at a plain-HTTP dev server with HTTPS on sends zero bytes (TLS handshake fails). Production (`jambahr.com`) has a real cert → HTTPS on.
4. **Push (ADMS) is the production path.** Pull over port 4370 (node-zklib) works but needs an always-on on-prem agent (Vercel can't reach a LAN device).
5. **ADMS devices resend all stored logs on reboot.** Idempotency is enforced by `uq_punch_events_dedupe`; recompute is safe to run repeatedly.
6. **Windows Firewall** blocks inbound to a dev port from the device even when same-host curl works — add an inbound allow rule when testing locally.
7. **`next build` exit 127 with no error** = multiple `next dev` servers sharing the project `.next` dir corrupting the build. Stop **all** dev servers + `rm -rf .next`, then build.
8. **Org-by-serial is the default trust boundary** — serials aren't secret. Use the per-org ingest token for stronger security where the device firmware supports a custom server path.
9. **`getrequest` now returns provisioning commands**, not just `OK`. Commands live in the `device_commands` queue (migration `085`); the device drains them via its poll and acks via `devicecmd`. Dispatch is best-effort — any failure falls through to `OK\n` so a device never stalls and punch ingestion is unaffected.
10. **`employees.device_code` (PIN) is unique per org** — backed by partial index `uq_employees_org_device_code` (migration `085`). The CSV importer and per-employee PIN edit both surface a friendly duplicate error.
11. **Fingerprint templates are never pushed** — provisioning sends only the user record (PIN + Name, 24-char limit, tab/newline-stripped). Biometric enrollment stays physical at the device.

---

## 8. Not yet done

- **Production HTTPS path** (device → deployed `https://jambahr.com/iclock/…`) not yet exercised with hardware — only local HTTP was tested. Everything is in place; needs a live device.
- **Option B** (direct per-employee location override, PRD §2.3) — deferred; Option A (zone-based) shipped.
- Legacy `fingerprint-section.tsx` (the old generic-JSON webhook UI) is **orphaned** (unmounted) — safe to delete later.
