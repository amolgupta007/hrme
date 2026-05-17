# Payroll Audit Overhaul — Operator Doc

**Shipped:** 2026-05-17 across 8 commits and 4 migrations (`018` → `021`).
**Per-finding ledger:** see `PAYROLL_AUDIT.md` at the repo root.

This doc is the operator-facing summary of what the payroll module looks like *after* the May-17 audit. It complements `CLAUDE.md` (which has the system-wide truth) and `PAYROLL_AUDIT.md` (which tracks each finding's status). If you're trying to understand "how does payroll work today" rather than "what changed during the audit," read this.

---

## 1. What's different from before

| Area | Before (pre-audit) | After (post-audit) |
|---|---|---|
| Schema | Three tables created via SQL Editor, no checked-in DDL | Captured in `018_payroll_schema_capture.sql`; idempotent; safe to re-apply |
| RLS | Disabled on all 3 payroll tables | Enabled with admin-CRUD + employee-self-read policies (advisory; service role still bypasses by design) |
| Tax regime | Hardcoded "new regime" only | Per-employee toggle: `'new'` (default) or `'old'`. Old regime accepts a catch-all `additional_deductions_annual` |
| Mid-FY joiners | Over-deducted TDS (calc assumed `gross × 12`) | TDS projected via `computeMonthsInFY` from `employees.date_of_joining`; snapshot stored on each entry |
| Bonus TDS | Static — bonus inflated net pay without re-taxing | Marginal: `tax(annual + bonus) − tax(annual)`; idempotent on re-edit |
| Auth gates | `getPayrollRuns/Entries` only checked auth, not role | `isAdmin()` required; org-filter is defense-in-depth |
| Audit trail | None | `paid_by`, `edited_by`, `edited_at`, `previous_net_pay`, `computed_at` populated by the actions |
| PF cap | Silent truncation at ₹1,800/mo | `pfCapped: boolean` flag in `CTCBreakdown`; UI footnote when triggered |
| CTC input | Plain digits | Auto-formats with Indian comma grouping (₹6,00,000) |

---

## 2. Schema reference

### `salary_structures`
| Column | Type | Note |
|---|---|---|
| `id` | uuid PK | |
| `org_id` | uuid FK organizations | Tenant |
| `employee_id` | uuid FK employees | Unique with org_id |
| `ctc` | numeric | Annual cost-to-company |
| `basic_monthly`, `hra_monthly`, `special_allowance_monthly` | numeric | Derived from CTC by `computeCTCBreakdown` |
| `employer_pf_monthly`, `employer_gratuity_annual` | numeric | Employer-side, default 0 |
| `employee_pf_monthly`, `professional_tax_monthly`, `tds_monthly` | numeric | Deductions, default 0. `tds_monthly` is **config-time preview only** — `processPayrollRun` recomputes per entry |
| `gross_monthly`, `net_monthly` | numeric | Take-home preview |
| `state`, `is_metro`, `include_hra` | text/bool | PT slabs + HRA % |
| `effective_from` | date | `processPayrollRun` filters by `≤ monthStart` |
| **`tax_regime`** | text `'new'\|'old'` | Default `'new'`. CHECK constraint enforces enum |
| **`additional_deductions_annual`** | numeric | Old-regime only catch-all (80C+80D+24+HRA-actual). New regime ignores this value |
| `created_at`, `updated_at`, **`computed_at`** | timestamptz | `updated_at` on every upsert; `computed_at` records when CTC breakdown was last derived (drift detection) |

Unique: `(org_id, employee_id)`.

### `payroll_runs`
| Column | Type | Note |
|---|---|---|
| `id` | uuid PK | |
| `org_id` | uuid FK organizations | |
| `month` | text | `YYYY-MM`, validated by `^\d{4}-(0[1-9]\|1[0-2])$` |
| `status` | text | `'draft'` → `'processed'` → `'paid'` (CHECK) |
| `working_days` | integer | Default 26 |
| `total_gross`, `total_deductions`, `total_net`, `employee_count` | numeric/int | Populated by `processPayrollRun` |
| `notes` | text | |
| `processed_at`, `paid_at` | timestamptz | Lifecycle stamps |
| **`paid_by`** | uuid FK employees ON DELETE SET NULL | Actor who marked the run paid |
| `created_at` | timestamptz | |

Unique: `(org_id, month)`.

### `payroll_entries`
| Column | Type | Note |
|---|---|---|
| `id` | uuid PK | |
| `payroll_run_id` | uuid FK payroll_runs | CASCADE |
| `org_id` | uuid FK organizations | |
| `employee_id` | uuid FK employees | |
| `basic_monthly`, `hra_monthly`, `special_allowance_monthly` | numeric | Frozen from salary_structure at process time |
| `gross_salary` | numeric | Frozen |
| `employee_pf`, `professional_tax`, `tds`, `lop_days`, `lop_deduction`, `bonus` | numeric, default 0 | `tds` is FY-projected + regime-aware (NOT a copy of `salary_structures.tds_monthly`) |
| `total_deductions`, `net_pay` | numeric | Derived |
| `payslip_url` | text | Unused today |
| **`annual_taxable_income`** | numeric, nullable | P-002 FY snapshot. NULL on legacy rows |
| **`months_in_fy`** | integer, nullable | P-002 FY snapshot. NULL on legacy rows |
| **`edited_by`** | uuid FK employees ON DELETE SET NULL | Last actor who edited via `updatePayrollEntry` |
| **`edited_at`** | timestamptz, nullable | |
| **`previous_net_pay`** | numeric, nullable | `net_pay` snapshot pre-edit |
| `created_at` | timestamptz | |

---

## 3. Tax regimes

`src/lib/ctc.ts` exports:
- `TaxRegime = 'new' | 'old'`
- `computeNewRegimeTax(taxableIncome)` — FY 2025-26 slabs (0/4L/8L/12L/16L/20L/24L at 0/5/10/15/20/25/30%); ₹75k std ded baked into the caller; 87A rebate at ≤₹12L; 4% Cess
- `computeOldRegimeTax(taxableIncome)` — slabs (0/2.5L/5L/10L at 0/5/20/30%); ₹50k std ded baked into the caller; 87A rebate at ≤₹5L; 4% Cess
- `computeTaxByRegime(taxableIncome, regime)` — dispatcher

`computeCTCBreakdown(ctc, state, isMetro, includeHra, taxRegime, additionalDeductions)`:
- Standard deduction switches: `'old'` → ₹50,000, `'new'` → ₹75,000
- `additionalDeductions` is subtracted **only** in old regime
- Returns `CTCBreakdown` with `taxRegime` and `pfCapped` fields

UI: regime dropdown in `salary-structure-dialog.tsx`; "Other Annual Deductions" input only shows when `taxRegime === 'old'`. `CTCBreakdownCard` renders the regime label in the TDS row and in the tax-summary banner; rebate threshold shifts ₹5L vs ₹12L.

---

## 4. Mid-FY joiner projection (P-002)

Indian FY = April 1 → March 31. `computeMonthsInFY(payMonth, dateOfJoining)`:
- `null`/missing date_of_joining → returns `12` (defensive)
- Joined before this FY's April 1 → returns `12` (old hire)
- Joined within this FY → returns months from joining month through March, inclusive
- Clamped to `[1, 12]`

In `processPayrollRun`, for each employee:
```
annualTaxable = (gross − PF) × monthsInFY − stdDed − allowedExtraDed
monthlyTds    = round(taxByRegime(annualTaxable, regime) / monthsInFY)
```
`annualTaxable` and `monthsInFY` are stored on each entry (`payroll_entries.annual_taxable_income`, `payroll_entries.months_in_fy`).

In `updatePayrollEntry`, those columns are read back so admin bonus/LOP edits use the right divisor. If the columns are NULL (legacy entries written before migration `021`), the action falls back to inline `gross × 12` derivation — same behavior as pre-audit.

### Example
Employee joined 2025-10-15, basic+HRA+special = ₹80,000/mo, new regime, October 2025 payroll run.
- monthsInFY = 6 (Oct–Mar)
- Annual taxable ≈ (80,000 − employee_pf) × 6 − 75,000 = 405,000
- New-regime tax on ₹4.05L = 0 (below ₹4L slab is 0%; the 4–8L slab kicks in at 5% but rebate at ₹12L caps total tax at 0 if taxable ≤ ₹12L)
- Monthly TDS = 0 / 6 = ₹0
Pre-audit, the same employee was being deducted as if they'd earn ₹9.6L this FY → real TDS would have been non-trivial.

---

## 5. Bonus + LOP edits

`updatePayrollEntry(entryId, { bonus, lop_days })`:
1. Fetches the entry (including `annual_taxable_income`, `months_in_fy`, `employee_id`, current `net_pay`).
2. Fetches the employee's salary structure for `tax_regime` + `additional_deductions_annual`.
3. Derives `baseTdsMonthly = round(taxByRegime(annualTaxable, regime) / monthsInFY)`.
4. Computes `bonusTax = computeAdditionalTaxOnBonus(annualTaxable, bonus, regime)`.
5. Writes `tds = baseTdsMonthly + bonusTax`, recalculated `total_deductions`, recalculated `net_pay`.
6. Snapshots `previous_net_pay`, `edited_by`, `edited_at` for audit.

**Idempotency:** if admin sets bonus back to 0, `bonusTax` collapses to 0 and `tds` reverts to base. Multiple edits to the same entry never compound tax.

**LOP formula** (unchanged from pre-audit): `lopDeduction = round((gross × lopDays) / workingDays)`. PF / PT / TDS stay constant — standard Indian SME practice (see `PAYROLL_AUDIT.md` P-004 rationale).

---

## 6. Audit trail

| Field | Set by | Set when |
|---|---|---|
| `payroll_runs.paid_at` | `markPayrollPaid` | Status → 'paid' |
| `payroll_runs.paid_by` | `markPayrollPaid` | Status → 'paid'; `user.employeeId` (may be null for org-owner fallback) |
| `payroll_runs.processed_at` | `processPayrollRun` | Status → 'processed' |
| `payroll_entries.edited_at` | `updatePayrollEntry` | Every edit |
| `payroll_entries.edited_by` | `updatePayrollEntry` | `user.employeeId` of caller |
| `payroll_entries.previous_net_pay` | `updatePayrollEntry` | Snapshot from pre-edit `net_pay` |
| `salary_structures.computed_at` | `upsertSalaryStructure` | Every save (drift detection vs ctc.ts logic changes) |

FKs use `ON DELETE SET NULL` so audit rows survive employee termination.

---

## 7. Migration order

Run these in order against a fresh DB (or replay against an existing one — all are idempotent):

| # | File | What it does |
|---|---|---|
| 018 | `018_payroll_schema_capture.sql` | Idempotent DDL for the 3 tables; 4 indexes; RLS on with 5 advisory policies |
| 019 | `019_payroll_audit_columns.sql` | Audit columns (`paid_by`, `edited_by`, `edited_at`, `previous_net_pay`, `computed_at`) |
| 020 | `020_tax_regime.sql` | `tax_regime` + `additional_deductions_annual` on salary_structures |
| 021 | `021_payroll_entry_fy_snapshot.sql` | `annual_taxable_income` + `months_in_fy` on payroll_entries |

Production DB: all four applied via MCP `apply_migration` on 2026-05-17.

---

## 8. Code file index

| File | Role |
|---|---|
| `src/lib/ctc.ts` | Pure calc engine. PT slabs, both regime tax functions, dispatcher, marginal bonus tax, FY-month projection, CTCBreakdown interface |
| `src/actions/payroll.ts` | All server actions (admin-gated except `getMyCompensation` / `getMyPayslips`). Schema: `SalaryStructureSchema`, `PayrollRunSchema`. Key actions: `upsertSalaryStructure`, `processPayrollRun`, `updatePayrollEntry`, `markPayrollPaid`, `deletePayrollRun` |
| `src/components/payroll/salary-structure-dialog.tsx` | Admin config UI: CTC + state + HRA + regime + (conditional) deductions |
| `src/components/payroll/ctc-breakdown-card.tsx` | Live CTC preview + regime-aware tax banner + PF-cap footnote |
| `src/components/payroll/payroll-client.tsx` | Tabs (Salary Structures / Payroll Runs / My Payslips / My Compensation), run table, entry table |
| `src/components/payroll/payroll-run-dialog.tsx` | Create-a-run dialog |
| `src/components/payroll/entry-edit-dialog.tsx` | Per-employee row edit (bonus + LOP days) |
| `src/components/payroll/payslip-dialog.tsx` | Printable payslip |
| `src/app/dashboard/payroll/page.tsx` | Server entry; gates on `hasFeature(plan, "payroll")` |

---

## 9. Edge cases + known limitations

- **Mid-FY salary revision (P-012, deferred):** if admin updates a salary structure on Nov 10, the November payroll run still uses the new value as-of-the-month — no proration across the revision date. Document as a known limitation; fixing requires either a `salary_revisions` history table or a more complex `effective_from` window scheme.
- **YTD reconciliation (Method A — not implemented):** TDS for a given month does NOT look at TDS already deducted in prior months of the same FY. Method B (smoothed projection) was shipped instead. If an employee gets a large bonus in Nov, Oct's TDS is not retroactively adjusted. Acceptable approximation for SMB scope.
- **Old-regime deductions UX:** `additional_deductions_annual` is a single catch-all. There are NO per-section inputs (no separate 80C/80D/24/HRA-actual fields). Admin computes the total externally. This is intentional MVP — full deductions UI is Wave 5.
- **Payslip regime display (P-016, partial):** the misleading "New Tax Regime" static text was removed, but the actual regime is not shown on the payslip. To restore, snapshot `tax_regime` on `payroll_entries` at process time (would need a small migration).
- **Bonus tax storage:** folded into `payroll_entries.tds`. Reprocessing a run resets `tds` back to base — admin must re-add the bonus. There's no `bonus_tax` audit column.
- **PF on LOP:** if employee has LOP days, PF stays at the configured full-month value (₹1,800 cap or 12% of full basic). Strict reading would reduce PF proportionally; current behavior matches common SME practice (P-004 won't-fix).
- **Memoization:** `CTCBreakdownCard` recomputes the breakdown on every render. Pure arithmetic, no observed perf cost; `React.memo` deferred (P-018).

---

## 10. Audit context

`PAYROLL_AUDIT.md` has the full 24-finding ledger with severity tags, file:line refs, fix directions, and the status log per commit. Use that doc when revisiting the audit or planning Wave 7.

The audit upgraded one finding mid-execution: **P-001 was reclassified from QUALITY-C to SECURITY-C** when introspection revealed that RLS was disabled in prod on all three payroll tables. Migration 018 closed that gap.

---

## 11. Test plan after a deploy

1. **Open a payroll run** and click an entry. Confirm `tds` for a mid-FY joiner is materially lower than the salary structure's `tds_monthly`.
2. **Edit any entry**, set `bonus` = ₹50,000, save. Confirm `tds` jumps by roughly `bonus × marginal_rate` for that employee's regime.
3. **Reset bonus to 0**, save again. Confirm `tds` reverts to base.
4. **Configure a new salary structure** with regime = "Old", add ₹150,000 to "Other Annual Deductions". Confirm the CTC card shows the old-regime banner ("₹50k std + ₹1,50,000 other deductions") and the rebate threshold reads ₹5L.
5. **Mark a processed run as paid** and SQL-check that `paid_by` is populated.
