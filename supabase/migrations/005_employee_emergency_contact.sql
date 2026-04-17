-- Migration: 005_employee_emergency_contact
-- Adds emergency contact fields to employees table

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS emergency_contact_name         TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone        TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship TEXT;
