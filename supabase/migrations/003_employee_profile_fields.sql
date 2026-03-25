-- Migration: 003_employee_profile_fields
-- Adds extended profile fields to employees table

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS pronouns TEXT,
  ADD COLUMN IF NOT EXISTS marital_status TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'India',
  ADD COLUMN IF NOT EXISTS pan_number TEXT,
  ADD COLUMN IF NOT EXISTS aadhar_number TEXT,
  ADD COLUMN IF NOT EXISTS communication_address JSONB,
  ADD COLUMN IF NOT EXISTS permanent_address JSONB;
