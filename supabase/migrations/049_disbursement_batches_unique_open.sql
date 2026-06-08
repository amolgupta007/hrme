-- 049_disbursement_batches_unique_open.sql — Phase 2 post-review fix:
-- prevent duplicate open batches per payroll_run via a partial unique index.
-- Idempotent.

CREATE UNIQUE INDEX IF NOT EXISTS disbursement_batches_one_open_per_run
  ON public.disbursement_batches (payroll_run_id)
  WHERE status IN ('awaiting_approval', 'approved', 'processing', 'partial_failed');
