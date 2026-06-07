-- 035_payroll_run_and_entry_extensions.sql — Payroll PRD 02 Phase 1:
-- Snapshot the active ratio config on each payroll run + denormalise the sum
-- of line items on each entry for fast reads.
-- Additive + idempotent.

ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS structure_config_snapshot JSONB NULL;

COMMENT ON COLUMN public.payroll_runs.structure_config_snapshot IS
  'Frozen copy of the org''s salary_structure_config row used at process time. Shape: {basic_pct, hra_pct_metro, hra_pct_non_metro, gratuity_pct, effective_from, config_id}. NULL for runs processed before this migration; treat NULL as "default hard-coded ratios" for back-compat.';

ALTER TABLE public.payroll_entries
  ADD COLUMN IF NOT EXISTS total_line_items INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.payroll_entries.total_line_items IS
  'Sum of all payroll_line_items.amount for this entry. Denormalised for fast read; recomputed by recomputeEntryFromLineItems on every line-item add/remove.';
