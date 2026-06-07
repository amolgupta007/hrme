# Payroll PRD 02 Phase 1 — Configurable ratios + line items + email payslips

**Shipped:** 2026-06-07
**Scope:** PRD 02 §11 Phase 1. RazorpayX integration + maker-checker + bulk payout are Phase 2.

## What admins can do now
1. Tune salary-structure ratios (Settings → Payroll → Salary Structure Ratios).
2. Preview per-employee impact of a config change before saving.
3. Recompute all salary structures with the latest config.
4. Add itemised ad-hoc bonuses, allowances, reimbursements per payroll entry.
5. Email payslips on Mark Paid (automatic) or on demand.

## What the system does automatically
- Re-runs statutory recompute (PF, PT, TDS) when an employee's structure is upserted.
- Snapshots the active ratio config into each processed payroll run (immutable).
- Sums non-taxable line items into net pay without adding TDS.
- Sums taxable line items into TDS using marginal-tax math.
- Fires payslip emails (best-effort, never blocks) when a run is marked Paid.

## Out of scope (deferred)
- RazorpayX / Cashfree integration; bulk payout; penny-drop validation.
- Maker-checker approval workflow.
- Server-side PDF generation / PDF email attachments.
- Loan / advance / F&F lifecycle.
- Auto-flow of attendance OT into payroll (needs Attendance Phase 2 OT feed).
- Group-bulk-apply of an ad-hoc line item across many employees.

## Migrations (apply in order — already applied to live DB)
- `033_salary_structure_config.sql`
- `034_payroll_line_items.sql`
- `035_payroll_run_and_entry_extensions.sql`
- `036_payslip_deliveries.sql`

## Key files
- Schema: `supabase/migrations/033-036_*.sql`
- Core math (configurable): `src/lib/ctc.ts` (RatioConfig + DEFAULT_RATIO_CONFIG)
- Line-item helpers: `src/lib/payroll/line-items.ts`
- Server actions: `src/actions/payroll.ts` (config CRUD, line-items CRUD, sendPayslipEmail, recomputeAllSalaryStructures)
- Email template: `src/components/emails/payslip.tsx`
- Settings UI: `src/components/settings/payroll-section.tsx`, `salary-structure-config-card.tsx`, `config-impact-preview.tsx`
- Per-entry edit dialog: `src/components/payroll/entry-edit-dialog.tsx` (line items table)
- Payslip dialog: `src/components/payroll/payslip-dialog.tsx` (line items render)
- Salary structure dialog: `src/components/payroll/salary-structure-dialog.tsx` (drift warning)
- Help articles: `src/lib/assistant/help/articles/{configure_salary_ratios,add_payroll_line_item,send_payslip_email}.md`
- Route registry: `src/lib/assistant/route-registry.ts` (`settings_payroll` key)
