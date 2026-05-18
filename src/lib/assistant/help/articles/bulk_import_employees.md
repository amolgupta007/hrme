---
id: bulk_import_employees
title: Bulk import employees from CSV
summary: How an admin uploads a CSV file to add multiple employees at once.
route_key: bulk_import_employees
allowed_roles: [owner, admin]
plan_tier: starter
keywords: [bulk import, csv, upload employees, mass add, multiple employees, spreadsheet]
---
Use the bulk import flow to add many employees in one go — ideal when migrating from another HR tool or onboarding a whole team at once.

1. Open **Employees** from the left sidebar and click **Import** (or navigate directly to the import page).
2. Download the **CSV template** to see the expected column format.
3. Fill in your employee data in the template: first name, last name, email, department, role, employment type.
4. Click **Upload CSV** and select your filled-in file.
5. Review the preview table — fix any rows flagged in red before continuing.
6. Toggle **Send invite emails** if you want all imported employees to get Clerk sign-up links.
7. Click **Import** to create all valid employee records.

Rows with duplicate emails or missing required fields are skipped and listed in an error summary after the import completes.
