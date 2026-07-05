---
id: assign_shift
title: Assign a shift
summary: How an admin assigns a shift to one or more employees, or to an entire department, with an optional end date.
route_key: settings_attendance
allowed_roles: [owner, admin]
plan_tier: starter
required_org_feature: attendanceEnabled
keywords: [assign shift, shift assignment, department shift, employee shift, attendance assignment]
---
# Assign a shift

## Steps

1. Open **Settings → Attendance → Shift Assignments**.
2. Click **Assign shift**.
3. Pick the **shift** from the dropdown.
4. Choose scope:
   - **Employees** — multi-select individuals.
   - **Whole department** — assigns every active employee in that department.
5. Set the **From** date. Leave **To** blank for an ongoing assignment.
6. Click **Assign**.

The clock-in flow on `/dashboard/attendance` will use the latest active
assignment automatically.
