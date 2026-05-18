---
id: run_payroll
title: Run monthly payroll
summary: How an admin creates a payroll draft for a month, processes it, reviews entries, and marks it paid.
route_key: run_payroll
allowed_roles: [owner, admin]
plan_tier: business
keywords: [payroll, run payroll, monthly payroll, process payroll, mark paid, lop, salary run]
---
Payroll runs go through three stages: Draft → Processed → Paid. You review and adjust entries before finalising.

1. Open **Payroll** from the left sidebar.
2. Click the **Runs** tab, then click **New Run**.
3. Select the **Month** (e.g. May 2026) and enter the number of **Working Days**.
4. Click **Create Draft** — JambaHR generates one entry per employee with computed gross, deductions, and net pay.
5. Review the entries table. Click **Edit** on any row to adjust LOP days or add a bonus.
6. When satisfied, click **Process Run** — TDS and net pay are locked in.
7. After you've transferred salaries, click **Mark as Paid** to close the run.

Processed runs can still have individual entries edited (net pay changes are logged in the audit trail). Once marked Paid, the run is read-only. Employees can view their payslips as soon as the run is Processed.
