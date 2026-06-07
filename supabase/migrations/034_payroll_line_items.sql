-- 034_payroll_line_items.sql — Payroll PRD 02 Phase 1: Ad-hoc line items per
-- payroll entry. Categories: bonus, allowance, reimbursement, other.
-- Idempotent.

CREATE TABLE IF NOT EXISTS public.payroll_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  payroll_entry_id UUID NOT NULL REFERENCES public.payroll_entries(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('bonus', 'allowance', 'reimbursement', 'other')),
  amount INTEGER NOT NULL CHECK (amount >= 0),
  taxable BOOLEAN NOT NULL DEFAULT TRUE,
  note TEXT,
  created_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payroll_line_items_entry_idx
  ON public.payroll_line_items (payroll_entry_id);

CREATE INDEX IF NOT EXISTS payroll_line_items_org_category_idx
  ON public.payroll_line_items (org_id, category);

ALTER TABLE public.payroll_line_items ENABLE ROW LEVEL SECURITY;

-- Admin write (Clerk-JWT pattern).
DROP POLICY IF EXISTS payroll_line_items_admin_all ON public.payroll_line_items;
CREATE POLICY payroll_line_items_admin_all ON public.payroll_line_items FOR ALL
  USING (
    auth.jwt() ->> 'org_id' = payroll_line_items.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  )
  WITH CHECK (
    auth.jwt() ->> 'org_id' = payroll_line_items.org_id::text
    AND auth.jwt() ->> 'org_role' IN ('org:owner', 'org:admin')
  );

-- Employees can SELECT their own line items via the entry FK (powers My Payslips).
-- Mirror of payroll_entries_self_read in 018_payroll_schema_capture.sql.
DROP POLICY IF EXISTS payroll_line_items_self_read ON public.payroll_line_items;
CREATE POLICY payroll_line_items_self_read ON public.payroll_line_items FOR SELECT
  USING (
    auth.jwt() ->> 'org_id' = payroll_line_items.org_id::text
    AND EXISTS (
      SELECT 1 FROM public.payroll_entries pe
       WHERE pe.id = payroll_line_items.payroll_entry_id
         AND auth.jwt() ->> 'employee_id' = pe.employee_id::text
    )
  );
