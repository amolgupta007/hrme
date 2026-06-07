---
id: configure_salary_ratios
title: Configure salary structure ratios
summary: Tune Basic, HRA, and Gratuity percentages applied to new salary upserts.
route_key: settings_payroll
allowed_roles: [owner, admin]
plan_tier: business
keywords: [basic, hra, gratuity, salary structure, ratios, percent]
---

# Configure salary structure ratios

## Steps

1. Open **Settings → Payroll → Salary Structure Ratios**.
2. Click **Edit**.
3. Enter the new percentages:
   - **Basic %** of CTC (typically 40–50%).
   - **HRA Metro %** of Basic (typically 50% in metros).
   - **HRA Non-Metro %** of Basic (typically 40% elsewhere).
   - **Gratuity %** of Basic (statutory 4.81%).
4. Set the **Effective from** date.
5. Click **Preview impact** to see per-employee old vs. new monthly diffs.
6. Click **Save config**.
7. Existing salary structures do NOT auto-recompute. Click **Recompute all salary structures** to propagate.
