-- Extend payroll_runs.status enum: add 'disbursing' (in-flight) and 'disbursement_failed'.
ALTER TABLE public.payroll_runs DROP CONSTRAINT IF EXISTS payroll_runs_status_check;
ALTER TABLE public.payroll_runs ADD CONSTRAINT payroll_runs_status_check
  CHECK (status IN ('draft', 'processed', 'disbursing', 'disbursement_failed', 'paid'));
