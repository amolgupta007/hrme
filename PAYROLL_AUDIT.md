# JambaHR Payroll Module — Audit Report

**Date:** 2026-05-17
**Scope:** Payroll calc engine, server actions, UI, schema, statutory rules
**Mode:** Planning only — no code changes

---

## ⚠️ Critical Surfacing

**No Critical-severity SECURITY findings detected.** Tenant isolation is enforced via `org_id` filters in every server action.

**However, one Critical QUALITY finding warrants top placement:** the three core payroll tables (`payroll_runs`, `payroll_entries`, `salary_structures`) do **not** exist in versioned migrations under `supabase/migrations/`. They live only in the production Supabase instance, created ad-hoc via the SQL Editor per CLAUDE.md gotcha #6. This blocks reproducible environments, schema review, rollback, and disaster recovery.

---

## 1. Findings Table (sorted by severity)

| ID | Axis | Sev | File:Line | Finding | Fix Direction |
|---|---|---|---|---|---|
| P-001 | QUALITY | **C** | `supabase/migrations/*` (absent) | Payroll schema (`payroll_runs`, `payroll_entries`, `salary_structures`) not in versioned migrations; lives only in prod DB. | Create formal DDL migration with PKs, FKs, indexes, RLS, unique constraints. |
| P-002 | LOGIC | **H** | `src/lib/ctc.ts:63` (std-deduction block) | Standard deduction is a flat ₹75,000/FY but tax is divided by 12 — mid-year joiners get full deduction, overstating refund. | Pro-rate std deduction by `employment_days / fiscal_year_days`. |
| P-003 | LOGIC | **H** | `src/lib/ctc.ts:45` | Only new regime TDS slabs supported; no `tax_regime` field on `salary_structures`. Old-regime earners are mis-taxed. | Add `tax_regime` enum to salary_structures; thread through `computeCTCBreakdown`. |
| P-004 | LOGIC | **H** | `src/actions/payroll.ts:~290` (LOP block) | LOP deduction = `gross_monthly / working_days * lop_days`. Non-linear at high CTC because employee PF is capped at ₹1,800. | Apply per-day rate to actual variable salary components, not full gross. |
| P-005 | LOGIC | **H** | `src/actions/payroll.ts:~267-280` | Bonus added to gross but TDS is **not** recomputed; net pay overstated in bonus months. | When bonus ≠ 0, recompute `annualTaxable = (gross + bonus) * 12 - PF - stdDed`; re-run TDS. |
| P-006 | SECURITY | **H** | `src/actions/payroll.ts:~242` | `getPayrollEntries()` calls `getCurrentUser()` but does **not** call `isAdmin()`. Relies on org_id filter for tenant safety, but role gate missing. | Add explicit `if (!isAdmin(user.role)) return { success: false, error: "Admins only" }`. |
| P-007 | SECURITY | **H** | `src/actions/payroll.ts:~200` | `getPayrollRuns()` same gap — no `isAdmin()` check. | Same fix as P-006. |
| P-008 | LOGIC | **H** | `src/components/payroll/payroll-client.tsx:~157` | Reprocess flow warns "will reset edits" but does not verify entries exist; silent no-op possible. | Pre-check entry count via `count: "exact"`; warn if >0. |
| P-009 | LOGIC | M | `src/lib/ctc.ts:30-41` | PT slabs hardcoded to FY 2025-26; no year parameter. Breaks silently if a state revises rates. | Add `fyear` parameter to `getProfessionalTax()` or document fixed-FY assumption. |
| P-010 | LOGIC | M | `src/lib/ctc.ts:~82` | Employee PF capped at ₹1,800 silently; no `pfCapped` flag in output. Admins/employees can't tell if cap kicked in. | Surface `pfCapped: boolean` in CTCBreakdown and show note in UI. |
| P-011 | LOGIC | M | `src/lib/ctc.ts:~93` | Net monthly can go negative for edge cases (very high TDS + PT > gross). No floor. | `Math.max(0, netMonthly)`; admin warning if net ≤ 0. |
| P-012 | LOGIC | M | `src/actions/payroll.ts:~260-280` | LOP assumes salary structure was unchanged across the run month; mid-month revisions silently break pro-ration. | Document constraint or add salary-change-date tracking. |
| P-013 | SECURITY | M | `src/actions/payroll.ts:~241-260` | `processPayrollRun()` does not filter salary_structures by `effective_from ≤ run.month`. Stale/future structures included. | Add `effective_from` date filter on fetch. |
| P-014 | UX | M | `src/components/payroll/payroll-client.tsx:~143-165` | Reprocess uses native `confirm()`; slow networks produce no clear error if run already processed. | Replace with explicit modal + error toast on conflict. |
| P-015 | LOGIC | M | `src/actions/payroll.ts:~321` | `markPayrollPaid()` flips status but does not log actor/timestamp. No audit trail. | Add `paid_by UUID`, `paid_at TIMESTAMPTZ` columns; populate in action. |
| P-016 | UX | M | `src/components/payroll/payslip-dialog.tsx:~79-82` | "New Tax Regime" rendered as static text; payslip doesn't reflect actual regime or PT applicability. | Drive from data once `tax_regime` column exists (depends on P-003). |
| P-017 | LOGIC | M | `src/actions/payroll.ts:~271-274` | Entry edits not audit-logged; no `previous_net_pay`, no `edited_by`. | Add audit columns and write on each `updatePayrollEntry`. |
| P-018 | QUALITY | M | `src/components/payroll/ctc-breakdown-card.tsx:~52` | Recomputes full breakdown at render time, not memoized. | `React.memo()` wrap. |
| P-019 | QUALITY | M | `src/actions/payroll.ts:~225-238` | Stored breakdown values can drift from `ctc.ts` if logic changes; no `computed_at` to detect staleness. | Add `computed_at` column; recompute on read if older than threshold or version bump. |
| P-020 | LOGIC | L | `src/lib/ctc.ts:45-60` | Cess applied after 87A rebate. Correct per current rules but undocumented; flip-risk if interpretation changes. | Add an inline comment citing the rule. |
| P-021 | SECURITY | L | `src/components/payroll/payslip-dialog.tsx:~14` | Employee name interpolated into payslip; theoretical XSS if Supabase return ever bypasses React escaping. | React auto-escapes by default — keep an eye on any `dangerouslySetInnerHTML`. |
| P-022 | LOGIC | L | `src/actions/payroll.ts:~183-188` | Month parsed via `split("-")` + `new Date(year, month, 0)`. No validation for `month` ∈ 1-12. | Add Zod month-format check. |
| P-023 | QUALITY | L | `src/components/payroll/salary-structure-dialog.tsx:~90` | CTC input is raw number, no Indian comma grouping. | Format via `Intl.NumberFormat("en-IN")`. |
| P-024 | UX | L | `src/components/payroll/payroll-client.tsx:~260-265` | Unconfigured-employees banner shows a count but doesn't link to the salary dialog. | Make the count clickable → opens dialog. |

**Counts by severity:** 1 C · 7 H · 10 M · 6 L · = **24 findings**.

---

## 2. Top 5 to Fix First

1. **P-001 — Migrate the payroll schema into version control.**
   Why first: without DDL, no preview/staging parity, no rollback, no review of indexes/constraints, no RLS verification path. Every other finding becomes easier to fix once schema is reviewable.

2. **P-006 + P-007 — Add `isAdmin()` guards to `getPayrollRuns` and `getPayrollEntries`.**
   Why high: org_id filtering is defense-in-depth, not defense-in-front. Auth gate at the action boundary is the documented pattern (CLAUDE.md §"Server action guards"). Trivial fix; closes a class of future regressions.

3. **P-005 — Recompute TDS when bonus is applied.**
   Why high: this is a money-correctness bug. Every entry with a non-zero `bonus` field has overstated net pay. Visible to employees and to admins reconciling against TDS filings.

4. **P-002 — Pro-rate ₹75k standard deduction for joiners.**
   Why high: another money-correctness bug. Affects every new hire in their first FY. Compounds with P-005 for bonus-receiving new joiners.

5. **P-003 — Add old vs new tax regime selector.**
   Why high: regime is per-employee in Indian law; many employees still elect old regime (esp. those with sizable 80C/HRA exemptions). Today's code silently puts everyone on new regime — wrong tax for a significant employee subset.

---

## 3. Inferred Schema (from server action reads/writes)

> **Caveat:** No DDL was reviewed. Below is reverse-engineered from `SELECT`/`INSERT`/`UPDATE` statements in `src/actions/payroll.ts`. Types are best-guess.

### `salary_structures`
- `id UUID PK`
- `org_id UUID` *(tenant — required in WHERE)*
- `employee_id UUID FK employees.id`
- `ctc NUMERIC` (annual)
- `basic_monthly INTEGER`, `hra_monthly INTEGER`, `special_allowance_monthly INTEGER`
- `gross_monthly INTEGER`, `net_monthly INTEGER`
- `employer_pf_monthly INTEGER`, `employer_gratuity_annual INTEGER`
- `employee_pf_monthly INTEGER`, `professional_tax_monthly INTEGER`, `tds_monthly INTEGER`
- `state VARCHAR`, `is_metro BOOLEAN`, `include_hra BOOLEAN`
- `effective_from DATE`
- `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`
- **Likely unique:** `(org_id, employee_id)` — code does upsert
- **Missing (per audit):** `tax_regime`, `computed_at`

### `payroll_runs`
- `id UUID PK`
- `org_id UUID`
- `month VARCHAR("YYYY-MM")` — likely `DATE` would be cleaner
- `status VARCHAR` enum: `draft | processed | paid`
- `working_days INTEGER`
- `total_gross NUMERIC`, `total_deductions NUMERIC`, `total_net NUMERIC`, `employee_count INTEGER`
- `notes TEXT`
- `processed_at TIMESTAMPTZ`, `paid_at TIMESTAMPTZ` (likely)
- `created_at TIMESTAMPTZ`
- **Likely unique:** `(org_id, month)` — 23505 collision handled in code
- **Missing:** `paid_by UUID`

### `payroll_entries`
- `id UUID PK`
- `org_id UUID`
- `payroll_run_id UUID FK payroll_runs.id`
- `employee_id UUID FK employees.id`
- `basic_monthly INTEGER`, `hra_monthly INTEGER`, `special_allowance_monthly INTEGER`
- `gross_salary INTEGER`
- `employee_pf INTEGER`, `professional_tax INTEGER`, `tds INTEGER`
- `lop_days NUMERIC` (0.5 increments)
- `lop_deduction INTEGER`, `bonus INTEGER`
- `total_deductions INTEGER`, `net_pay INTEGER`
- `created_at TIMESTAMPTZ`
- **Missing:** audit columns (`edited_by`, `edited_at`, `previous_net_pay`)

**Unknown without DDL:** RLS policies, indexes, constraints. Mark as "cannot review."

---

## 4. Assumed Indian Statutory Rules (please confirm)

| Rule | Code assumption | Where |
|---|---|---|
| Employee PF | 12% of basic, capped at ₹1,800/month | `src/lib/ctc.ts:~82` |
| Employer PF | ~3.67% of basic, capped ~₹1,100/month | `src/lib/ctc.ts:~79` + seed |
| Gratuity (employer-side) | 4.81% of basic annually | `src/lib/ctc.ts:~81` |
| HRA | 50% basic (metro) / 40% (non-metro) | `src/lib/ctc.ts:~76` |
| Professional Tax | State-based slabs hardcoded for 10 states | `src/lib/ctc.ts:30-41` |
| Standard Deduction | ₹75,000 flat, no pro-ration | `src/lib/ctc.ts:~93` |
| Income Tax | **New regime only**, FY 2025-26 slabs (0-4L 0%, 4-8L 5%, 8-12L 10%, 12-16L 15%, 16-20L 20%, 20-24L 25%, 24L+ 30%) | `src/lib/ctc.ts:45-60` |
| 87A Rebate | Full rebate if taxable income ≤ ₹12L (post std ded + PF) | `src/lib/ctc.ts:~57` |
| H&E Cess | 4% on final tax | `src/lib/ctc.ts:~60` |
| Joiner / leaver pro-ration | **Not handled** — full year assumed | n/a |
| ESI / LWF | **Not implemented** | n/a |

> Please confirm:
> 1. Old-regime support needed? (P-003)
> 2. ESI required for any of your customer profiles? (≤₹21k gross threshold)
> 3. LWF required in your serviced states? (MH/KA/TN/etc.)
> 4. Gratuity at 4.81% is a common CTC convention but not statutory — confirm intent.

---

## 5. Not Reviewed (and Why)

| Item | Reason |
|---|---|
| Live Supabase DDL for payroll tables | No checked-in migration. Would need MCP introspection or dashboard inspection. |
| RLS policies on payroll tables | Same — only `009_jambahire_rls.sql` was searched; no payroll RLS migration found. |
| Email payslip delivery | No template exists (`src/components/emails/*payslip*` empty). Confirmed print-only. |
| Bulk CSV upload of salary structures | No code path found. |
| Payroll reversals / arrears / retro | Not implemented; can't audit what isn't there. |
| YTD totals on payslip | Not implemented; payslip is single-month. |
| Form 16 / TDS certificate export | Not implemented. |
| Bank disbursal integration | None — `markPayrollPaid` is a status flip only. |
| PF UAN / EPFO filing integration | None. |
| Live test of role gates against a real session | Static code review only; no end-to-end IDOR probe was run. |
| `attendance_payroll_enabled` integration path (attendance hours → entry) | CLAUDE.md mentions the flag but no code path observed wiring attendance minutes into LOP/per-day rate. Worth a follow-up audit. |

---

## 6. Architecture Observations

- **Auth:** Clerk → `getCurrentUser()` → Supabase admin client (RLS bypass). Org isolation is application-layer, not DB-layer for payroll. Acceptable since service-role is server-side only, but it does mean schema-level RLS is advisory (defense-in-depth) rather than primary.
- **Money type:** All amounts are JS `number` (float64). `Math.round` is called inconsistently — usually once at the boundary. Float drift is unlikely at typical CTC magnitudes (≤₹50L) but is a long-term hygiene concern.
- **Calc centrality:** `src/lib/ctc.ts` is genuinely the single source of truth for CTC breakdown and TDS. Good. The one duplication risk is that `salary_structures` stores precomputed values that can drift if `ctc.ts` logic changes — that's what P-019 (`computed_at`) addresses.
- **No tests:** No `*.test.ts` for `ctc.ts` was found. For a money-correctness module, unit tests are a high-leverage future investment.
- **LOP bridge:** Per code, only `unpaid` leave type counts toward LOP — matches CLAUDE.md gotcha. Bridge is implemented inside `processPayrollRun`, not in `leaves.ts`. That's fine, but worth documenting.

---

## 7. Suggested Sequencing

**Wave 1 (this week — security + schema floor):**
P-001 (schema migration), P-006 + P-007 (auth gates).

**Wave 2 (next sprint — money correctness):**
P-005 (TDS-on-bonus), P-002 (joiner pro-ration), P-003 (regime support), P-004 (LOP formula).

**Wave 3 (when convenient — audit & UX):**
P-008, P-013, P-015, P-017 (audit columns + state-machine guards), P-014, P-016, P-024 (UX polish).

**Wave 4 (longer-term):**
ESI/LWF, Form 16 export, email payslips, bank disbursal, attendance bridge, paise-integer money type.

---

## 8. Status Log

| ID | Status | Commit / Note |
|---|---|---|
| **P-001** | ✅ Closed | `b141dfa` — migration `018_payroll_schema_capture.sql` applied to prod via MCP. RLS enabled, 5 advisory policies, 4 indexes added. Reclassified SECURITY-C during execution (was QUALITY-C). |
| **P-005** | ✅ Closed | `5926d2e` — `computeAdditionalTaxOnBonus` helper + marginal TDS recompute in `updatePayrollEntry`. Idempotent on re-edit. |
| **P-006** | ✅ Closed | `b141dfa` — `isAdmin()` gate on `getPayrollRuns` (line 291). |
| **P-007** | ✅ Closed | `b141dfa` — `isAdmin()` gate on `getPayrollEntries` (line 509). |
| **P-008** | ❌ Won't-fix | Reprocess flow is unreachable. Server gate at `payroll.ts:355` only allows draft→processed; client-side "reprocess" warning at `payroll-client.tsx:124` is dead code. |
| **P-011** | ✅ Closed | `Math.max(0, …)` floor already in place at `payroll.ts:405` (processPayrollRun) and `:598` (updatePayrollEntry). |
| **P-013** | ✅ Closed | `cb02d46` — added `.lte("effective_from", monthStart)` to processPayrollRun salary fetch. |
| **P-022** | ✅ Closed | `cb02d46` — PayrollRunSchema regex tightened to `^\d{4}-(0[1-9]\|1[0-2])$`. |
| **P-024** | ✅ Closed | `cb02d46` — unconfigured-employees alert is a button that opens the salary dialog. |
| **P-004** | ❌ Won't-fix | Code matches standard Indian SME LOP practice (gross-for-period only; PF/PT/TDS stay constant from salary_structure). Audit was over-cautious. |
| **P-002** | 🔄 Rescoped | Audit fix direction was wrong — Indian std deduction is **not** legally pro-rated. Real bug: `processPayrollRun` projects annual income as `grossMonthly × 12` regardless of `employees.date_of_joining`, over-deducting TDS for mid-FY joiners. Needs its own design + plan (moves TDS calc from salary_structures to per-run). |
| **P-003** | Open | Tax regime toggle. Two scope levels — minimal (toggle + naive old-regime slabs, no deductions UX) or full (HRA exemption + 80C/80D/24 inputs). Needs scope decision. |
| **P-015** | ✅ Closed | `4f6bef3` — migration 019 added `payroll_runs.paid_by`; `markPayrollPaid` writes `user.employeeId`. |
| **P-017** | ✅ Closed | `4f6bef3` — migration 019 added `edited_by`, `edited_at`, `previous_net_pay` on `payroll_entries`; `updatePayrollEntry` writes them. |
| **P-019** | ✅ Closed | `4f6bef3` — migration 019 added `salary_structures.computed_at`; `upsertSalaryStructure` writes `now()`. |
| **P-014** | ❌ Won't-fix | Depended on reprocess flow which P-008 closed as unreachable. |
| **P-016** | ⚠️ Partial | `5f6f120` — removed the misleading static "New Tax Regime" line on the payslip. Per-entry regime display deferred (entries don't currently snapshot regime; would need a `payroll_entries.tax_regime` column or join on read). |
| **P-003** | ✅ Closed | `5f6f120` — migration 020 added `tax_regime` + `additional_deductions_annual`. Calc engine routes via `computeTaxByRegime`. Dialog has regime dropdown + conditional deductions input. CTC breakdown card is regime-aware. |
| **P-009** | ✅ Closed | Wave 3c — added FY 2025-26 reverify-annually comment on `getProfessionalTax` in `ctc.ts`. |
| **P-020** | ✅ Closed | Wave 3c — clarifying comment on rebate-before-Cess order in `computeNewRegimeTax`. |
| **P-021** | ❌ Won't-fix | React auto-escapes interpolated strings; payslip-dialog has no `dangerouslySetInnerHTML`. Theoretical XSS risk doesn't manifest. |
| **P-023** | ✅ Closed | Wave 3c — CTC input in `salary-structure-dialog.tsx` now formats via `Intl.NumberFormat("en-IN")` on each keystroke. |
| **P-012** | 🔄 Deferred | "Mid-month salary revision" assumes a schema change to track salary effective-date ranges. Document as known limitation; revisit alongside P-002. |
| **P-018** | 🔄 Deferred | Memoizing CTCBreakdownCard is premature — `computeCTCBreakdown` is pure arithmetic, no observed perf cost. Revisit if profiling shows render bottleneck. |
| **P-010** | ✅ Closed | `451b17c` — `pfCapped: boolean` added to `CTCBreakdown`; CTC card prints a footnote when basic exceeds EPF wage cap. |
| **P-002** | ✅ Closed | `cb0ec8e` — Method B smoothed projection via `computeMonthsInFY`. processPayrollRun snapshots `annual_taxable_income` + `months_in_fy` per entry (migration 021); updatePayrollEntry uses them on re-edit, falls back to gross×12 for legacy entries. |

**Waves 1–6 shipped 2026-05-17.** Commits: `b141dfa`, `5926d2e`, `cb02d46`, `4f6bef3`, `51bac1a`, `5f6f120`, `451b17c`, `cb0ec8e`.

**Audit closed.** Of the original 24 findings: 17 fixed, 1 partial (P-016 — per-entry regime display deferred), 4 won't-fix (P-004, P-008, P-014, P-021), 2 deferred-as-known-limitations (P-012 mid-month salary revision, P-018 memoization).
