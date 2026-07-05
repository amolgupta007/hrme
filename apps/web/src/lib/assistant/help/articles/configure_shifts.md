---
id: configure_shifts
title: Configure shifts
summary: How an admin creates and manages shifts (Morning, Evening, Night, etc.) with start/end times, break, grace, and half-day threshold.
route_key: settings_attendance
allowed_roles: [owner, admin]
plan_tier: starter
required_org_feature: attendanceEnabled
keywords: [shift, shift master, morning shift, night shift, overnight, break, grace, half day, attendance shift, configure shift]
---
# Configure shifts

Shifts define the working window for each employee. You can have as many as you need
(Morning, Evening, Night, General, etc.). Phase 1 supports manual assignment per
employee or per department.

## Steps

1. Open **Settings → Attendance → Shift Master**.
2. Click **Add shift**.
3. Enter:
   - **Name** (e.g. "Morning")
   - **Start** and **End** time (24-hour). Overnight shifts (end < start, e.g. 22:00–06:00) are auto-detected.
   - **Break (minutes)** — subtracted from total hours.
   - **Grace (minutes)** — late-mark tolerance.
   - **Half-day threshold (minutes)** — anything less than this is half-day.
4. Tick **Default shift** to make this the org's fallback shift.
5. Click **Save**.

Mark a shift inactive instead of deleting it — historical records stay safe.
