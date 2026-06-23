-- 080_disbursement_contractor_support.sql
-- One disbursement engine, two worker types. Salaried items still carry payroll_entry_id;
-- contractor items carry contractor_engagement_id instead. Exactly one of the two is set.

ALTER TABLE public.disbursement_items
  ALTER COLUMN payroll_entry_id DROP NOT NULL;

ALTER TABLE public.disbursement_items
  ADD COLUMN IF NOT EXISTS contractor_engagement_id UUID
    REFERENCES public.contractor_engagements(id) ON DELETE CASCADE;

-- Exactly one source FK per item.
ALTER TABLE public.disbursement_items
  DROP CONSTRAINT IF EXISTS disbursement_items_one_source;
ALTER TABLE public.disbursement_items
  ADD CONSTRAINT disbursement_items_one_source CHECK (
    (payroll_entry_id IS NOT NULL AND contractor_engagement_id IS NULL) OR
    (payroll_entry_id IS NULL AND contractor_engagement_id IS NOT NULL)
  );

-- Replace the old composite UNIQUE (which assumed payroll_entry_id NOT NULL).
ALTER TABLE public.disbursement_items
  DROP CONSTRAINT IF EXISTS disbursement_items_batch_id_payroll_entry_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS disbursement_items_batch_payroll_uq
  ON public.disbursement_items (batch_id, payroll_entry_id)
  WHERE payroll_entry_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS disbursement_items_batch_contractor_uq
  ON public.disbursement_items (batch_id, contractor_engagement_id)
  WHERE contractor_engagement_id IS NOT NULL;

-- Tag batches so reconcile + UI can branch.
ALTER TABLE public.disbursement_batches
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'payroll'
    CHECK (kind IN ('payroll','contractor'));

-- Contractor batches are not tied to a payroll run. (Live schema confirmed:
-- disbursement_batches.payroll_run_id is currently NOT NULL — relax it so an
-- ad-hoc contractor batch can be created without a payroll_runs row.)
ALTER TABLE public.disbursement_batches
  ALTER COLUMN payroll_run_id DROP NOT NULL;
