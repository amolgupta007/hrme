# JambaHR — Contractor / Contingent Workforce Audit — RESULTS

> Codebase audit executed 2026-06-23 against the checklist in
> [`contractor-features-audit.md`](./contractor-features-audit.md).
> All findings verified against `src/` and the 78 migration files — no assumptions.
> Status legend: **READY** (works for contractors today) · **PARTIAL** (exists
> for employees, needs adaptation) · **MISSING** (does not exist).

---

## Headline finding (Step 2) — the data-model gap

**Contractors are a cosmetic label, not a first-class entity.**

`employees.employment_type` accepts `'contract'`
(`supabase/migrations/001_initial_schema.sql:59`), but **no payroll, TDS, leave,
or attendance code path branches on it.** The only reads are display labels
(`src/components/dashboard/employee-table.tsx:331`) and CSV-import validation
(`src/actions/employees.ts:470`).

If you onboard a creative today as `employment_type='contract'`:

- **Payroll** deducts **PF + Professional Tax + salary-slab TDS** as if salaried
  (`src/actions/payroll.ts:550–720`) — wrong for a 194J/194C contractor.
- **TDS** uses annual salary slabs + 87A rebate; there is **no 194J (10%) or
  194C (1–2%) flat-rate path** anywhere (`src/lib/ctc.ts`).
- **Leave** accrues statutory paid/sick/casual leave to them.
- **Disbursement** can't pay them without a full payroll run, because
  `disbursement_items.payroll_entry_id` is `NOT NULL`
  (`supabase/migrations/046_disbursement_items.sql:5`).
- **Portal** gives them the full `employee` self-service surface — no scoped role.

The foundational work is a real **data model** (worker-type-aware payroll/TDS/leave
gating + a contractor role), not a flag.

**Reusable as-is:** penny-drop bank verification, the RazorpayX disbursement
engine (minus the payroll_entry FK), the LOI/offer token-accept flow (→ agreement
signing), doc-acknowledgment e-sign, and self-service payslip views.

---

## Capability table

### A. Worker classification & data model
| Capability | Status | Evidence |
|---|---|---|
| `employment_type` field | **PARTIAL** (cosmetic) | `001_initial_schema.sql:59`; reads only in `employee-table.tsx:331`, `employees.ts:470` — no logic branch |
| Contractor profile fields (rate type, start/end, renewal) | **MISSING** | `salary_structures` is monthly-CTC only (`018`); no contract dates |
| Misclassification guardrails | **MISSING** | Payroll/leave/attendance apply identical statutory logic |
| Contractor grouping (project/client/skill) | **MISSING** | No project/client/engagement table |

### B. Onboarding
| Capability | Status | Evidence |
|---|---|---|
| Self-service invite + self-fill profile | **PARTIAL** | `invites.ts:28` (AccountSetupEmail, 7-day token), `onboarding.ts:97`, `config/onboarding.ts` (7 steps) — no contractor variant |
| Document collection (PAN/GST/bank/cheque) | **PARTIAL** | `documents` categories `policy/contract/id_proof/tax/certificate/other` (`001:145`); no PAN/GST first-class, no per-worker required-doc gating |
| Contract/agreement generation | **PARTIAL** (reusable pattern) | JambaHire LOI + Offer token-accept built: `hire.ts:796 sendLOI`, `:1956 sendOffer`, `/loi/[token]`, `/offers/[token]`, `offer-letter.tsx`; no clause/PDF templates |
| IP assignment clause | **MISSING** | Zero references |
| NDA collection & tracking | **MISSING** | Zero references |
| Bank/identity verification (penny-drop) | **READY** (reusable) | `penny-drop.ts:27`, `employee_bank_accounts` (`043`), `penny_drop_results` 30-day cache (`044`), enforced in `disbursement.ts` preflight |

### C. Contracts & document lifecycle
| Capability | Status | Evidence |
|---|---|---|
| Contract repository w/ expiry/renewal alerts | **MISSING** | No contract entity with dates |
| Versioning of agreements | **MISSING** | — |
| E-signature flow | **PARTIAL** | Two reusable patterns: LOI/offer token accept + doc ack with `signature_text`/IP/UA (`060`) |
| Auto-reminders before contract end | **MISSING** | Cron infra reusable (doc-reminders, loi-expiry); no contract-end concept |

### D. Payments (core value prop)
| Capability | Status | Evidence |
|---|---|---|
| Contractor payouts separate from salaried run | **MISSING** | `processPayrollRun` applies PF+PT+TDS uniformly (`payroll.ts:550`) |
| TDS 194J / 194C | **MISSING** | `ctc.ts` salary-slab only (New/Old FY25-26 + 87A); zero matches for 194J/194C |
| Flexible cycles (monthly/project/milestone/gig) | **MISSING** | `payroll_runs.month` `YYYY-MM`, `UNIQUE(org, month)` (`018:18`) |
| Invoice ingestion / auto-invoice | **MISSING** | Only Razorpay subscription invoices (`billing.ts`) |
| Bulk payout via RazorpayX (maker-checker) | **PARTIAL** | Engine wired (`razorpayx.ts`, `disbursement.ts`); **blocker:** `disbursement_items.payroll_entry_id NOT NULL` (`046:5`) — batches only from a processed run |
| Payout statement self-service | **READY** | `getMyPayslips` (`payroll.ts:1035`), `getMyCompensation` (`:323`) |
| Form 16A / TDS certificate | **MISSING** | Zero matches for form16/16A/TAN |
| Active-only billing | **MISSING** | No engagement-active concept |

### E. Time / deliverable tracking
| Capability | Status | Evidence |
|---|---|---|
| Project/assignment work tracking | **MISSING** | Only `shift_assignments` + clock-in/out |
| Milestone/deliverable status | **MISSING** | No task/milestone/deliverable entity |
| Mobile/web check-in | **READY** (overkill) | Attendance clock-in/out exists; biometric/shift-oriented |
| Expense submission & reimbursement | **MISSING** | `payroll_line_items` `reimbursement` is admin-added only; employees SELECT-only RLS (`034:32`) |

### F. Self-service portal
| Capability | Status | Evidence |
|---|---|---|
| Contractor login (scoped/minimal role) | **MISSING** | Roles `owner/admin/manager/employee` only (`types/index.ts:23`); contractor → `employee`, full surface (12+ pages, `navigation.ts`) |
| Download statements/certs/contracts | **PARTIAL** | Payslips + company docs viewable; no TDS certs/contracts entity |
| Update own bank/PAN | **READY** | `/dashboard/profile` + bank-account management |
| Submit invoices/expenses | **MISSING** | — |

### G. Reporting & spend visibility
| Capability | Status | Evidence |
|---|---|---|
| Spend by project/client/individual | **MISSING** | `insights.ts`: `monthlyPayrollCost`/headcount/attrition only |
| Cost & profitability (agency margin) | **MISSING** | — |
| TDS liability summary | **MISSING** | — |
| Active vs inactive contractor counts | **MISSING** | — |

---

## Phased build plan

### Phase 1 — Demo-ready quick wins (≈2–3 wks)
Make contractor a real worker type and pay them correctly, reusing existing rails.

1. **`contractor_engagements` table** FK'd to `employees` — rate type
   (hourly/daily/monthly/milestone), rate amount, contract start/end, renewal
   date, TDS section (194J/194C), engagement status.
2. **`computeContractorTDS(amount, section)`** in `ctc.ts` — 194J 10% / 194C
   1–2% with threshold logic.
3. **Ad-hoc disbursement**: make `disbursement_items.payroll_entry_id` nullable +
   a "Pay contractors" screen paying an arbitrary list → reuse RazorpayX +
   penny-drop + maker-checker unchanged.
4. **Suppress employee-only logic** for contractors: no PF/PT, no leave-accrual
   seeding.
5. **Scoped `contractor` role** (or `employment_type`-gated nav) — narrowed sidebar.

*Builds on: payroll, ctc.ts, disbursement, penny-drop, navigation/RBAC.*
*Demo: onboard a creative → verify bank → pay a flat fee with correct 194J TDS →
they see their payout statement.*

### Phase 2 — Depth (≈3–4 wks)
6. Contractor agreement + NDA + IP-assignment signing (fork LOI/offer token flow;
   clause templates + `contractor_agreements` table with versioning).
7. Self-serve invoice + expense submission with approval gate (new tables + RLS
   INSERT for self).
8. Form 16A / TDS-certificate generation + TDS liability summary; org TAN config.
9. Contract expiry/renewal auto-reminders (reuse cron pattern).
10. Flexible pay cycles (per-project / milestone) on the ad-hoc payout screen.

### Phase 3 — Agency differentiators (nice-to-have)
11. **Client → Project → Contractor** mapping + spend-per-client / margin views in
    Insights (killer agency feature).
12. Milestone/deliverable tracking (reuse JambaHire dnd-kit kanban for an
    engagement-renewal pipeline).
13. Royalty / revenue-share payout type.
14. Misclassification guardrails + 194J/194C auto-detection with override.

---

## Hidden blockers (validated)
- The "one pay run, two worker types" idea is sound but **requires dropping the
  `payroll_entry_id NOT NULL` constraint** on `disbursement_items` first
  (`046:5`). This is the one non-obvious dependency for Phase 1.
- The LOI/offer flow genuinely is the right thing to fork for contractor
  agreements — token accept/decline + audit trail already exist.
