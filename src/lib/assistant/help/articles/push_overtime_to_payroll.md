---
id: push_overtime_to_payroll
title: Push approved overtime to payroll
summary: Move approved OT records into a month's payroll run as line items.
route_key: attendance_overtime
allowed_roles: [owner, admin]
plan_tier: business
required_org_feature: attendanceEnabled
keywords: [overtime, OT, push, payroll, line items, disbursement]
---

# Push overtime to payroll

## Steps

1. Make sure the **payroll run for the target month** is already created (Payroll → Create run).
2. Open **Attendance → Overtime** tab.
3. Pick the **month** in the date picker.
4. Click **Push approved OT to [Month]**.
5. The toast shows how many records were pushed and skipped.

For each approved OT record in the month:
- Hourly rate = `gross_monthly / (working_days × shift_hours)`
- Amount = `OT minutes / 60 × hourly rate × multiplier`
- Inserted into the employee's payroll entry as a `category=overtime`, `taxable=true` line item.
- TDS recomputes automatically.

Pushed records are marked `pushed` — re-running the push won't double-charge.
