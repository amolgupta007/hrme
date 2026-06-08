-- 039_payroll_line_items_overtime.sql — Attendance Phase 2 / Payroll bridge:
-- extend payroll_line_items.category CHECK to include 'overtime'.
-- Idempotent.

ALTER TABLE public.payroll_line_items
  DROP CONSTRAINT IF EXISTS payroll_line_items_category_check;

ALTER TABLE public.payroll_line_items
  ADD CONSTRAINT payroll_line_items_category_check
  CHECK (category IN ('bonus', 'allowance', 'reimbursement', 'other', 'overtime'));
