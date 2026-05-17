-- 017_offers_revoked_status.sql
--
-- M5 — adds 'revoked' to the offers.status enum so backward-from-sent-offer
-- can mark the offer as revoked (and the candidate gets an offer-revoked email)
-- instead of leaving the offer in 'sent' limbo.
--
-- Safe to re-run: drops the constraint by name before recreating.
-- Run via Supabase Dashboard SQL Editor.

ALTER TABLE public.offers
  DROP CONSTRAINT IF EXISTS offers_status_check;

ALTER TABLE public.offers
  ADD CONSTRAINT offers_status_check
  CHECK (status IN ('draft', 'sent', 'accepted', 'declined', 'expired', 'revoked'));
