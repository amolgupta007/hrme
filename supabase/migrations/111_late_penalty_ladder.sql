-- 111_late_penalty_ladder.sql
-- Late-arrival penalty ladder (warning email → CL deduction → LOP) on top of
-- the existing late policy (061-065, 089-090), plus the supporting fixes:
--   • evaluate_from — the policy's go-live date. Lateness was only ever
--     computed for web clock-ins; now that biometric/mobile punches are
--     evaluated too, days before this date never count (no retroactive
--     penalties for orgs whose policy never actually ran).
--   • per-day "excuse late" on attendance_records.
--   • late_penalty_events — one row per ladder step; its unique key makes
--     re-evaluation idempotent.
--   • leave_adjustments — an append-only leave ledger. Balances were derived
--     only from leave_requests; a CL deduction is a negative adjustment and a
--     reversal a compensating positive one (never an edit).
-- RLS is enabled but ADVISORY (service role bypasses, gotcha #5); isolation is
-- enforced in the server actions. Idempotent.

-- ── late_policies ───────────────────────────────────────────────────────────
ALTER TABLE public.late_policies DROP CONSTRAINT IF EXISTS late_policies_consequence_check;
ALTER TABLE public.late_policies
  ADD CONSTRAINT late_policies_consequence_check
  CHECK (consequence IN ('block_bonus','salary_deduction','both','none','leave_deduction'));

ALTER TABLE public.late_policies
  ADD COLUMN IF NOT EXISTS evaluate_from date,
  ADD COLUMN IF NOT EXISTS ladder_warning_at int CHECK (ladder_warning_at BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS ladder_deduct_at int NOT NULL DEFAULT 5 CHECK (ladder_deduct_at BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS ladder_leave_type text NOT NULL DEFAULT 'casual'
    CHECK (ladder_leave_type IN ('paid','sick','casual','custom')),
  ADD COLUMN IF NOT EXISTS ladder_deduct_days numeric(3,1) NOT NULL DEFAULT 1
    CHECK (ladder_deduct_days BETWEEN 0.5 AND 5 AND ladder_deduct_days * 2 = floor(ladder_deduct_days * 2)),
  ADD COLUMN IF NOT EXISTS ladder_repeat boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ladder_lop_fallback boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ladder_cc_managers boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ladder_cc_admins boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ladder_dispute_days int NOT NULL DEFAULT 2 CHECK (ladder_dispute_days BETWEEN 0 AND 30);

ALTER TABLE public.late_policies DROP CONSTRAINT IF EXISTS late_policies_ladder_order;
ALTER TABLE public.late_policies ADD CONSTRAINT late_policies_ladder_order
  CHECK (ladder_warning_at IS NULL OR ladder_warning_at < ladder_deduct_at);

-- Existing policies go live from the day this migration runs (deploy day).
UPDATE public.late_policies SET evaluate_from = (now() AT TIME ZONE 'Asia/Kolkata')::date
WHERE evaluate_from IS NULL;

-- ── attendance_records: per-day excuse ──────────────────────────────────────
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS late_excused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS late_excused_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS late_excused_at timestamptz,
  ADD COLUMN IF NOT EXISTS late_excuse_reason text;

-- ── late_penalty_events ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.late_penalty_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  policy_id uuid NOT NULL REFERENCES public.late_policies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  month text NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'),
  kind text NOT NULL CHECK (kind IN ('warning','deduction')),
  occurrence_no int NOT NULL CHECK (occurrence_no >= 1),
  late_count int NOT NULL,
  late_record_ids uuid[] NOT NULL DEFAULT '{}',
  trigger_date date NOT NULL,
  cl_days numeric(3,1) NOT NULL DEFAULT 0,
  lop_days numeric(3,1) NOT NULL DEFAULT 0,
  cl_balance_before numeric(5,1),
  leave_policy_id uuid REFERENCES public.leave_policies(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'applied' CHECK (status IN ('applied','reversed','waived','needs_review')),
  status_reason text,
  status_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  status_at timestamptz,
  email_status text CHECK (email_status IN ('sent','failed','skipped_no_email')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, employee_id, month, kind, occurrence_no)
);

CREATE INDEX IF NOT EXISTS idx_late_penalty_events_month
  ON public.late_penalty_events (org_id, month);

-- ── leave_adjustments: append-only ledger ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leave_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  policy_id uuid NOT NULL REFERENCES public.leave_policies(id) ON DELETE CASCADE,
  year int NOT NULL,
  days numeric(4,1) NOT NULL CHECK (days <> 0), -- negative = debit, positive = credit back
  reason text NOT NULL,
  source text NOT NULL CHECK (source IN ('late_penalty','late_penalty_reversal')),
  source_ref uuid NOT NULL,                     -- late_penalty_events.id
  created_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- A step can be applied, reversed and re-applied, so the same event can own
-- several debits/credits over time; they must always alternate, which the
-- application enforces. This index only speeds the per-employee balance read.
CREATE INDEX IF NOT EXISTS idx_leave_adjustments_balance
  ON public.leave_adjustments (org_id, employee_id, policy_id, year);
CREATE INDEX IF NOT EXISTS idx_leave_adjustments_source
  ON public.leave_adjustments (source_ref);

-- Immutable: corrections are new rows. DELETE is allowed only as a cascade
-- (the owning employee / policy / org is already gone).
CREATE OR REPLACE FUNCTION public.leave_adjustment_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF tg_op = 'UPDATE' THEN
    RAISE EXCEPTION 'leave_adjustments is append-only';
  END IF;
  IF EXISTS (SELECT 1 FROM public.employees WHERE id = old.employee_id)
     AND EXISTS (SELECT 1 FROM public.leave_policies WHERE id = old.policy_id)
     AND EXISTS (SELECT 1 FROM public.organizations WHERE id = old.org_id) THEN
    RAISE EXCEPTION 'leave_adjustments is append-only';
  END IF;
  RETURN old;
END;
$$;

DROP TRIGGER IF EXISTS leave_adjustments_immutable ON public.leave_adjustments;
CREATE TRIGGER leave_adjustments_immutable
  BEFORE UPDATE OR DELETE ON public.leave_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.leave_adjustment_guard();

-- ── RLS (advisory; Clerk-JWT pattern) ───────────────────────────────────────
ALTER TABLE public.late_penalty_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS late_penalty_events_org_read ON public.late_penalty_events;
CREATE POLICY late_penalty_events_org_read ON public.late_penalty_events
  FOR SELECT USING (auth.jwt() ->> 'org_id' = org_id::text);

DROP POLICY IF EXISTS leave_adjustments_org_read ON public.leave_adjustments;
CREATE POLICY leave_adjustments_org_read ON public.leave_adjustments
  FOR SELECT USING (auth.jwt() ->> 'org_id' = org_id::text);
