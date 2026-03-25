-- Migration: 002_leave_requests_ticket
-- Adds ticket number and exceeds_balance flag to leave_requests
-- Run this in the Supabase Dashboard → SQL Editor

ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS ticket_number TEXT,
  ADD COLUMN IF NOT EXISTS exceeds_balance BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.leave_requests.ticket_number IS 'Reference ticket number — required when request exceeds available balance';
COMMENT ON COLUMN public.leave_requests.exceeds_balance IS 'True when requested days exceed the employee remaining balance for the policy';
