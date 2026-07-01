-- 090_payroll_entry_late_penalty.sql
-- Late-penalty deduction on payroll entries. Reduces net pay only (not taxable
-- income) — mirrors lop_deduction. Rupees (integer) for the deduction amount.

ALTER TABLE public.payroll_entries
  ADD COLUMN IF NOT EXISTS late_penalty_days numeric(4,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_penalty_deduction integer NOT NULL DEFAULT 0;
