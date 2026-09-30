# Web-only timekeeping mode ("devices record presence")

**Asked by:** Medialoop — clock-in/out should come from the web; the biometric
device should only show that someone came in. Approved 2026-09-30.

## Problem

Every punch source (web, mobile, ADMS device, manual) is pooled into one daily
rollup: first punch = clock-in, last = clock-out. With a device online, a 09:05
badge becomes the clock-in and the web **Clock In** button is then blocked
("You are already clocked in"); hours mix device and web times.

## Decisions (approved)

1. **Org-wide** setting (no per-employee exceptions for now).
2. **Lateness** (and the late-penalty ladder) uses the **web clock-in**.
3. Seen at the device but no web clock-in → **present, flagged** "Seen at office,
   not clocked in" — not absent.
4. **Mobile app** punches count as timekeeping, like web.

## Design

- `organizations.settings.attendance.timekeeping_source`: `all` (default, today's
  behaviour) | `web_app`, with `timekeeping_source_from` (IST date) so switching
  never rewrites earlier days.
- `recomputeAttendanceDay` in `web_app` mode (for days ≥ from):
  - clock-in/out, hours, pairing, lateness ← `web`, `mobile`, `manual` events only;
  - `adms`/`device` events → presence only: new `attendance_records.device_first_seen_at`,
    `device_last_seen_at`, `device_first_seen_location_id`, `device_punch_count`
    (migration 112). Device fields are filled in every mode.
  - a device-only day is still recorded (clock-in null) so presence is visible.
- Web **Clock In/Out** guards read the rollup → only web/app times count, so the
  device can no longer block them.
- Presence = clock-in OR device seen: Team Today counts, History + Team Today show
  the "Seen at office HH:MM · not clocked in" flag, the report shows status **P**
  (present, no hours) and pairs only timekeeping punches.
- Settings → Attendance → **Clock-in/out source** card; switching on offers
  "recalculate this month from today" (only days from the switch date change).

## Out of scope

Per-employee exceptions, nudging people who badged but didn't clock in, mobile
admin Home presence counts (follow-up).
