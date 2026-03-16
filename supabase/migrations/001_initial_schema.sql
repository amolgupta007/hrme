-- ============================================================
-- HRFlow Database Schema
-- Migration: 001_initial_schema
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";  -- for future AI features

-- ============================================================
-- ORGANIZATIONS (multi-tenant root)
-- ============================================================
CREATE TABLE public.organizations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clerk_org_id  TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  logo_url      TEXT,
  plan          TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'growth', 'business')),
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  max_employees INTEGER NOT NULL DEFAULT 10,
  settings      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- DEPARTMENTS
-- ============================================================
CREATE TABLE public.departments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  head_id     UUID, -- FK added after employees table
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_departments_org ON public.departments(org_id);

-- ============================================================
-- EMPLOYEES
-- ============================================================
CREATE TABLE public.employees (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id               UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  clerk_user_id        TEXT,
  first_name           TEXT NOT NULL,
  last_name            TEXT NOT NULL,
  email                TEXT NOT NULL,
  phone                TEXT,
  avatar_url           TEXT,
  role                 TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('owner', 'admin', 'manager', 'employee')),
  department_id        UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  designation          TEXT,
  date_of_joining      DATE NOT NULL DEFAULT CURRENT_DATE,
  date_of_birth        DATE,
  employment_type      TEXT NOT NULL DEFAULT 'full_time' CHECK (employment_type IN ('full_time', 'part_time', 'contract', 'intern')),
  status               TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'on_leave', 'terminated')),
  reporting_manager_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  metadata             JSONB NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(org_id, email)
);

CREATE INDEX idx_employees_org ON public.employees(org_id);
CREATE INDEX idx_employees_clerk ON public.employees(clerk_user_id);
CREATE INDEX idx_employees_dept ON public.employees(department_id);
CREATE INDEX idx_employees_manager ON public.employees(reporting_manager_id);

-- Add FK for department head now that employees exists
ALTER TABLE public.departments
  ADD CONSTRAINT fk_department_head
  FOREIGN KEY (head_id) REFERENCES public.employees(id) ON DELETE SET NULL;

-- ============================================================
-- LEAVE POLICIES
-- ============================================================
CREATE TABLE public.leave_policies (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id                  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name                    TEXT NOT NULL,
  type                    TEXT NOT NULL CHECK (type IN ('paid', 'unpaid', 'sick', 'casual', 'maternity', 'paternity', 'custom')),
  days_per_year           INTEGER NOT NULL DEFAULT 0,
  carry_forward           BOOLEAN NOT NULL DEFAULT false,
  max_carry_forward_days  INTEGER NOT NULL DEFAULT 0,
  applicable_from_months  INTEGER NOT NULL DEFAULT 0,
  requires_approval       BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_leave_policies_org ON public.leave_policies(org_id);

-- ============================================================
-- LEAVE BALANCES
-- ============================================================
CREATE TABLE public.leave_balances (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id                UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id           UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  policy_id             UUID NOT NULL REFERENCES public.leave_policies(id) ON DELETE CASCADE,
  year                  INTEGER NOT NULL,
  total_days            NUMERIC(5,1) NOT NULL DEFAULT 0,
  used_days             NUMERIC(5,1) NOT NULL DEFAULT 0,
  carried_forward_days  NUMERIC(5,1) NOT NULL DEFAULT 0,

  UNIQUE(employee_id, policy_id, year)
);

CREATE INDEX idx_leave_balances_org ON public.leave_balances(org_id);
CREATE INDEX idx_leave_balances_emp ON public.leave_balances(employee_id);

-- ============================================================
-- LEAVE REQUESTS
-- ============================================================
CREATE TABLE public.leave_requests (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id       UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id  UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  policy_id    UUID NOT NULL REFERENCES public.leave_policies(id) ON DELETE CASCADE,
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  days         NUMERIC(5,1) NOT NULL,
  reason       TEXT,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by  UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  reviewed_at  TIMESTAMPTZ,
  review_note  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (end_date >= start_date)
);

CREATE INDEX idx_leave_requests_org ON public.leave_requests(org_id);
CREATE INDEX idx_leave_requests_emp ON public.leave_requests(employee_id);
CREATE INDEX idx_leave_requests_status ON public.leave_requests(org_id, status);

-- ============================================================
-- DOCUMENTS
-- ============================================================
CREATE TABLE public.documents (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id                  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id             UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  name                    TEXT NOT NULL,
  category                TEXT NOT NULL CHECK (category IN ('policy', 'contract', 'id_proof', 'tax', 'certificate', 'other')),
  file_url                TEXT NOT NULL,
  file_size               INTEGER NOT NULL DEFAULT 0,
  mime_type               TEXT NOT NULL DEFAULT 'application/octet-stream',
  uploaded_by             UUID NOT NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  is_company_wide         BOOLEAN NOT NULL DEFAULT false,
  requires_acknowledgment BOOLEAN NOT NULL DEFAULT false,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_documents_org ON public.documents(org_id);
CREATE INDEX idx_documents_emp ON public.documents(employee_id);

-- ============================================================
-- REVIEW CYCLES
-- ============================================================
CREATE TABLE public.review_cycles (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed')),
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_review_cycles_org ON public.review_cycles(org_id);

-- ============================================================
-- REVIEWS
-- ============================================================
CREATE TABLE public.reviews (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id           UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cycle_id         UUID NOT NULL REFERENCES public.review_cycles(id) ON DELETE CASCADE,
  employee_id      UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  reviewer_id      UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  self_rating      NUMERIC(3,1),
  manager_rating   NUMERIC(3,1),
  self_comments    TEXT,
  manager_comments TEXT,
  goals            JSONB NOT NULL DEFAULT '[]',
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'self_review', 'manager_review', 'completed')),
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reviews_org ON public.reviews(org_id);
CREATE INDEX idx_reviews_cycle ON public.reviews(cycle_id);
CREATE INDEX idx_reviews_emp ON public.reviews(employee_id);

-- ============================================================
-- TRAINING COURSES
-- ============================================================
CREATE TABLE public.training_courses (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id           UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  description      TEXT,
  category         TEXT NOT NULL CHECK (category IN ('ethics', 'compliance', 'safety', 'skills', 'onboarding', 'custom')),
  content_url      TEXT,
  duration_minutes INTEGER,
  is_mandatory     BOOLEAN NOT NULL DEFAULT false,
  due_date         DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_training_courses_org ON public.training_courses(org_id);

-- ============================================================
-- TRAINING ENROLLMENTS
-- ============================================================
CREATE TABLE public.training_enrollments (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id           UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  course_id        UUID NOT NULL REFERENCES public.training_courses(id) ON DELETE CASCADE,
  employee_id      UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'completed', 'overdue')),
  progress_percent INTEGER NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  completed_at     TIMESTAMPTZ,
  certificate_url  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(course_id, employee_id)
);

CREATE INDEX idx_training_enrollments_org ON public.training_enrollments(org_id);
CREATE INDEX idx_training_enrollments_emp ON public.training_enrollments(employee_id);

-- ============================================================
-- HOLIDAYS (company-wide)
-- ============================================================
CREATE TABLE public.holidays (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  date        DATE NOT NULL,
  is_optional BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(org_id, date)
);

CREATE INDEX idx_holidays_org ON public.holidays(org_id);

-- ============================================================
-- AUTO-UPDATE TIMESTAMPS
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_organizations_updated
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_employees_updated
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_leave_requests_updated
  BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
-- Helper: get current user's org_id from JWT
-- Clerk stores org_id in the JWT metadata when using organizations
-- The Supabase client is configured to pass the Clerk JWT

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

-- Organizations: users can only see their own org
CREATE POLICY "org_isolation" ON public.organizations
  FOR ALL USING (
    clerk_org_id = current_setting('request.jwt.claims', true)::json->>'org_id'
  );

-- All other tables: isolate by org_id
-- Using a reusable pattern: match org_id against the JWT's org_id claim

CREATE POLICY "tenant_isolation" ON public.departments
  FOR ALL USING (
    org_id IN (
      SELECT id FROM public.organizations
      WHERE clerk_org_id = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

CREATE POLICY "tenant_isolation" ON public.employees
  FOR ALL USING (
    org_id IN (
      SELECT id FROM public.organizations
      WHERE clerk_org_id = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

CREATE POLICY "tenant_isolation" ON public.leave_policies
  FOR ALL USING (
    org_id IN (
      SELECT id FROM public.organizations
      WHERE clerk_org_id = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

CREATE POLICY "tenant_isolation" ON public.leave_balances
  FOR ALL USING (
    org_id IN (
      SELECT id FROM public.organizations
      WHERE clerk_org_id = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

CREATE POLICY "tenant_isolation" ON public.leave_requests
  FOR ALL USING (
    org_id IN (
      SELECT id FROM public.organizations
      WHERE clerk_org_id = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

CREATE POLICY "tenant_isolation" ON public.documents
  FOR ALL USING (
    org_id IN (
      SELECT id FROM public.organizations
      WHERE clerk_org_id = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

CREATE POLICY "tenant_isolation" ON public.review_cycles
  FOR ALL USING (
    org_id IN (
      SELECT id FROM public.organizations
      WHERE clerk_org_id = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

CREATE POLICY "tenant_isolation" ON public.reviews
  FOR ALL USING (
    org_id IN (
      SELECT id FROM public.organizations
      WHERE clerk_org_id = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

CREATE POLICY "tenant_isolation" ON public.training_courses
  FOR ALL USING (
    org_id IN (
      SELECT id FROM public.organizations
      WHERE clerk_org_id = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

CREATE POLICY "tenant_isolation" ON public.training_enrollments
  FOR ALL USING (
    org_id IN (
      SELECT id FROM public.organizations
      WHERE clerk_org_id = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

CREATE POLICY "tenant_isolation" ON public.holidays
  FOR ALL USING (
    org_id IN (
      SELECT id FROM public.organizations
      WHERE clerk_org_id = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );
