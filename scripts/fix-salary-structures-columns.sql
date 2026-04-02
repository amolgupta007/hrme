-- ============================================================
-- Fix salary_structures table — add missing columns
-- Run this FIRST, then run seed-payroll-demo.sql
-- Safe to re-run (uses IF NOT EXISTS)
-- ============================================================

ALTER TABLE salary_structures
  ADD COLUMN IF NOT EXISTS include_hra             BOOLEAN       NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS employer_pf_monthly     INTEGER       NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS employer_gratuity_annual INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at              TIMESTAMPTZ   NOT NULL DEFAULT now();
