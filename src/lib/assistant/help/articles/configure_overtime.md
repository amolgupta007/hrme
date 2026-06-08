---
id: configure_overtime
title: Configure overtime
summary: Enable overtime, set multiplier, threshold mode, and approval requirement.
route_key: settings_overtime
allowed_roles: [owner, admin]
plan_tier: starter
required_org_feature: attendanceEnabled
keywords: [overtime, OT, multiplier, threshold, approval, settings]
---

# Configure overtime

## Steps

1. Open **Settings → Attendance → Overtime card**.
2. Tick **Enable Overtime tracking** — OT is OFF by default.
3. Set the **multiplier** (typically 1.5x — Factories Act minimum).
4. Pick **threshold mode**:
   - **Per-day** — OT = minutes worked beyond the assigned shift hours, computed daily.
   - **Weekly** — OT = total weekly minutes beyond the configured weekly threshold (default 48h).
5. Toggle **Require admin approval** if you want a maker-checker step before OT counts.
6. Click **Save settings**.

Use **Compute OT for this week** to scan the current week's attendance and generate OT records.
