-- Migration: 004_employee_invites
-- Tracks Clerk org invitation state per employee

CREATE TABLE public.employee_invites (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id              UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id         UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  email               TEXT NOT NULL,
  clerk_invitation_id TEXT,
  sent_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at         TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id)
);

CREATE INDEX idx_employee_invites_org      ON public.employee_invites(org_id);
CREATE INDEX idx_employee_invites_employee ON public.employee_invites(employee_id);
