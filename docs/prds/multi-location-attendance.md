# PRD: Multi-Location Attendance via Location Groups (Attendance Zones)

> **Status:** Finalized & reconciled against the live schema (2026-06-23). Build in phases; one phase per session; plan-then-act with an approval gate. **This spec now carries a Phase 0 — the location/device/event-stream foundation it depends on does not exist yet (see §3).**

## 0. Reconciliation findings (verified against live DB + code, 2026-06-23)

This PRD originally assumed an existing multi-location, multi-device, event-stream attendance system. **That system does not exist.** What actually exists:

| The PRD assumed | Reality (verified) |
|---|---|
| `locations` table | ❌ Does not exist. No location/branch/site column on `employees` either. |
| `devices` table | ❌ Does not exist. `attendance_records.device_id` is a bare **`text`** column (no registry, no FK). |
| Punches as a neutral **event stream**, direction derived by pairing min/max | ❌ `attendance_records` is **one row per `(employee_id, date)`** — `UNIQUE (org_id, employee_id, date)` — holding a single `clock_in_at` + `clock_out_at` + `total_minutes = out − in`. It **physically cannot hold >2 punches/day.** |
| `daily_attendance` (new rollup table) | ❌ Doesn't exist — and `attendance_records` **already is** the per-day rollup (just single-pair). Don't introduce a second table; evolve this one or add an event log beside it. |
| eSSL/ZKTeco **ADMS/iclock push pipeline** | ⚠️ Partial. `POST /api/attendance/punch` exists, takes `{ employee_code, timestamp, event_type, device_id }` JSON and **already derives direction** (`event_type:"auto"` → infers in/out from current state). But it speaks generic JSON, **not** the eSSL ADMS `cmsdata`/iclock protocol. `public/hikvision-attendance-setup.html` exists; no ADMS protocol handler does. |
| Shift master for the day boundary | ✅ Accurate — `shifts` + `shift_assignments` exist (Attendance Phase 1). |
| `org_id` + RLS on all tables | ✅ Accurate — matches the multi-tenant pattern (service-role bypasses; gotcha #5). |

**The one originally-correct load-bearing claim** is §5.2: device direction is not trusted — and indeed the punch route already does `event_type:"auto"` derivation. But it derives into a *single pair*, not a poolable log. The current route also **breaks on a 3rd punch/day**: after clock-out exists, `"auto"` infers `clock_in` → re-INSERT → violates the unique constraint. Multi-punch is impossible today.

**Consequence:** zones (the headline feature) are Phase 1+. Phases 0.A–0.C below are prerequisites, not optional.

## 1. Problem

A single client operates multiple physical locations, each with its own biometric device (eSSL Aiface Orcus / ZKTeco). An employee can work across more than one location in the same day:

- Clock-in 09:00 at **Location A**
- (may or may not clock-out at 12:00)
- Clock-in 13:00 at **Location B**
- Final clock-out 18:00 at Location B

We must roll all punches from the devices the employee is assigned to into **one daily attendance record** and compute total working hours as **first-in to last-out** (09:00 → 18:00 = 9h, gap included).

A third location where this employee never works must **not** affect their record. Location assignment is per-employee, not global.

## 2. Core Model

### 2.1 Attendance Zone (Location Group)
A named group of one or more locations/devices whose punches are pooled into a single attendance computation. Membership is the unit that lets punches from different devices roll up together.

- A zone contains 1..N locations.
- An employee is assigned to a zone (or directly to a set of locations — see §2.3).
- Punches from any device in the employee's zone count toward that employee's daily record.
- Punches from devices **outside** the employee's zone are ignored for that employee.

### 2.2 Punch as Event (no trusted direction)
Devices send only timestamps; IN/OUT flags are **not reliable**. Treat every push as a neutral punch event and **derive** direction by pairing within the day. (The existing route already derives direction for the single-pair model — Phase 0.B generalizes this to an event log.)

### 2.3 Assignment options (pick during Phase 1 design)
- **Option A — Zone-based:** employee → zone → locations. Cleanest when the same group recurs across many employees.
- **Option B — Direct multi-location:** employee → set of locations directly. More flexible for one-offs.
- Recommend Option A as primary, with Option B as an override.

## 3. Schema — reconciled

> All new tables `org_id`-scoped with RLS (Clerk-JWT advisory pattern; service-role bypasses — gotcha #5). Migrations via Supabase SQL Editor / MCP, numbered after the current head (`069`).

### 3.A Foundation — locations & devices (NEW — does not exist today)

```sql
-- Physical work locations (Phase 0.A)
create table locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  address text,
  is_active boolean not null default true,
  created_at timestamptz default now()
);

-- Biometric device registry. Today device_id is a free-text column on
-- attendance_records; this gives it identity + a home location. (Phase 0.A)
create table devices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  device_serial text not null,           -- the eSSL/ZKTeco serial the device pushes
  label text,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  unique (org_id, device_serial)
);
```

### 3.B Event-stream punch log (NEW — the model the algorithm needs)

```sql
-- Neutral punch events. attendance_records (single in/out pair, UNIQUE per
-- employee/day) CANNOT hold a multi-punch stream, so events live here and
-- the daily rollup is DERIVED. (Phase 0.B)
create table attendance_punch_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  device_id uuid references devices(id) on delete set null,  -- null = web/manual
  location_id uuid references locations(id) on delete set null,
  punched_at timestamptz not null,
  source text not null,                  -- 'web' | 'device' | 'manual' | 'adms'
  raw_payload jsonb,                     -- audit: exactly what the device sent
  created_at timestamptz default now()
);
create index on attendance_punch_events (org_id, employee_id, punched_at);
```

> **`attendance_records` is retained as the derived daily rollup** (do NOT add a `daily_attendance` table). Phase 0.B/Phase 2 extend it: `first_in_location_id`, `last_out_location_id`, `punch_count`, `status` ('present'|'incomplete'|'absent'), and the contributing event ids (jsonb) for audit. `total_minutes` stays = `last_out − first_in`. The existing single-pair `clock_in_at`/`clock_out_at` map to first-in/last-out.

### 3.C Zones & assignment (NEW — the headline feature)

```sql
create table attendance_zones (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

create table attendance_zone_locations (
  zone_id uuid not null references attendance_zones(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  primary key (zone_id, location_id)
);

-- Effective-dated employee -> zone assignment
create table employee_zone_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  zone_id uuid not null references attendance_zones(id) on delete cascade,
  effective_from date not null,
  effective_to date,        -- null = open-ended
  created_at timestamptz default now()
);
```

## 4. Daily Attendance Computation

### 4.1 Attendance day boundary
Default `00:00`–`24:00` IST (the codebase computes IST day windows already — see the late-policy + auto-clockout crons). Leave it configurable; night-shift cutoff via the shift master is out of scope for v1 but must not be hardcoded.

### 4.2 Algorithm (per employee, per attendance day) — reads `attendance_punch_events`
1. Resolve the employee's zone for that date via `employee_zone_assignments` (effective-dated; latest `effective_from <= date` wins, mirroring `shift_assignments` resolution).
2. Resolve the set of `location_id`s in that zone.
3. Gather **all** `attendance_punch_events` for the employee that day whose `location_id` is in the zone set.
4. Sort ascending by `punched_at`. Devices are NTP-synced; no skew correction in v1.
5. 0 punches → `absent`. 1 punch → `incomplete` (flag, no hours).
6. **first_in = earliest; last_out = latest.**
7. **total_minutes = last_out − first_in** (gap included). 09:00 → 18:00 = 540.
8. Upsert the single `attendance_records` row: `clock_in_at=first_in`, `clock_out_at=last_out`, `total_minutes`, `first_in_location_id`, `last_out_location_id`, `punch_count`, `status`, contributing event ids.

### 4.3 Audit
Persist the contributing event ids on the daily record so the 9h is traceable to which device produced first-in and last-out — required for client disputes. `attendance_punch_events.raw_payload` keeps the exact device push.

### 4.4 Edge cases
- **Odd punch count (3+):** irrelevant under first-in/last-out — still min/max. No session pairing in v1.
- **Single punch:** `status='incomplete'`, hours null, surfaced in a review queue.
- **Duplicate punches** (same employee+device within N sec): dedupe by a configurable window (default 60s) before computing.
- **Employee in no zone but punches exist:** fall back to single-location behavior (that location alone) and flag for admin to assign a zone.
- **Punch outside the employee's zone:** excluded from hours, but logged (misconfig or shared device signal).
- **Late-arriving punches (ADMS push delay):** recompute is **idempotent** — re-derive the daily row from the full event set whenever a new event lands for that `(employee, day)`. Never compute-once.

## 5. Processing Trigger
- On each punch ingest (web route, manual, or ADMS), write an `attendance_punch_events` row, then recompute the affected `(employee_id, attendance_day)` rollup.
- Recompute is a pure function of the event set → safe to run many times; last write wins. Use `waitUntil` for the recompute so ingest stays fast (matches the doc-ingest / late-policy pattern).
- Manual "recalculate day" admin action for corrections.

## 6. Admin UI (owner/admin scoped, `attendanceEnabled` gated)
Lives under **Settings → Attendance** (where Shift Master / Week-Off / Late Policy already live; this is the established home for attendance config).
- **Locations & Devices:** CRUD locations; register devices (serial → location). (Phase 0.A)
- **Zones:** create/edit zone, add/remove locations.
- **Assignment:** assign employees to a zone with effective dates.
- **Daily view:** per employee — first-in (loc), last-out (loc), total hours, contributing punches, status badge.
- **Review queue:** records flagged `incomplete` or with out-of-zone punches.

## 7. Out of Scope (v1)
- Splitting paid vs. unpaid gap time (gap is included).
- Session-level pairing / per-location hours breakdown.
- Overtime / week-off / rotational-shift interaction (defer to shift master integration — `ot_records`, `week_off_policy` already exist).
- Real eSSL ADMS `cmsdata`/iclock protocol parsing **if** the client's devices can POST the existing generic JSON instead (confirm device capability during Phase 0.C; only build the raw ADMS handler if required).

## 8. Acceptance Criteria
- Employee punching 09:00@A and 18:00@B (same zone) → one record, 540 min, first-in loc A, last-out loc B.
- Same employee's punches outside their zone are excluded.
- A second employee not sharing those locations is unaffected.
- A single punch → `incomplete`, not 0h or a crash.
- A late punch after initial computation correctly updates the day's total on recompute.
- A 3rd+ punch in a day is stored and folded into min/max (today this is impossible — see §0).
- All queries org-scoped and respect RLS.

## 9. Implementation Phases

**Phase 0 — Foundation (prerequisite; does not exist today):**
- **0.A** `locations` + `devices` tables + RLS; Settings UI to manage them; backfill: map existing free-text `attendance_records.device_id` values to device rows where possible.
- **0.B** `attendance_punch_events` log + a pure, idempotent `computeDailyAttendance(employee_id, day)` that derives the `attendance_records` rollup from events. Dual-write: the existing punch route also appends an event; recompute reconciles. (Keeps single-pair behavior working while the event model lands.)
- **0.C** Confirm the client's eSSL/ZKTeco devices' push capability. If they can POST the existing `/api/attendance/punch` JSON (employee_code, timestamp, device serial), extend that route to write events. Only if they require the native ADMS `cmsdata`/iclock protocol, build a dedicated handler then.

**Phase 1 — Zones:** `attendance_zones`, `attendance_zone_locations`, `employee_zone_assignments` + RLS; zone resolution in the compute function (replaces single-location with zone-pooled events).

**Phase 2 — Daily rollup hardening:** extend `attendance_records` (first/last location, punch_count, status, contributing ids); review queue; recompute-on-ingest via `waitUntil`.

**Phase 3 — Admin UI:** zones, assignments, daily view, review queue.

**Phase 4 — Edge-case hardening:** dedupe window, single-punch flagging, out-of-zone logging, no-zone fallback.
