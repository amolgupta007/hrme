-- 121_epf_wage_ceiling_25000.sql
-- Statutory update: on 16 Sep 2026 the Cabinet approved raising the EPFO wage
-- ceiling from ₹15,000 to ₹25,000 a month.
--
-- Added as a NEW global version of the EPF rule effective from pay month
-- 2026-09, so the engine picks by pay period:
--   pay months up to 2026-08 → ₹15,000 ceiling (₹1,800 each side)
--   pay months from 2026-09 → ₹25,000 ceiling (₹3,000 each side)
-- The whole of September uses the new ceiling (no pro-rating around the 16th).
-- The old version stays, so earlier months are unchanged. Orgs that keep their
-- own EPF rule still get theirs (org overrides beat global defaults).
--
-- Mirrors GLOBAL_RULE_UPDATES in packages/shared/src/payroll/engine/presets.ts.
-- Idempotent.

insert into public.statutory_rules (scope, org_id, rule_key, jurisdiction, effective_from_month, params, label, notes)
values (
  'global', null, 'epf', null, '2026-09',
  '{"eeRate":12,"erRate":12,"wageBase":["BASIC"],"wageCeiling":25000,"contributeAboveCeiling":false}'::jsonb,
  'EPF wage ceiling ₹25,000',
  'Cabinet approval 16 Sep 2026: EPFO wage ceiling raised from ₹15,000 to ₹25,000 per month, applied from pay month September 2026.'
)
on conflict do nothing;
