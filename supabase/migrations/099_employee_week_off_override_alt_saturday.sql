-- 099_employee_week_off_override_alt_saturday.sql
-- Bug fix: adding a per-employee week-off override failed with Postgres 42703
-- ("column alt_saturday_rule ... does not exist"). Migration 041 added
-- alt_saturday_rule to week_off_policy ONLY, but the action + UI + read paths
-- (src/actions/week-off.ts: upsertEmployeeWeekOffOverride writes it;
-- getEmployeeWeekOffOverride / listAllWeekOffOverrides select it) were written
-- expecting it on the override table too. A per-employee override "fully
-- REPLACES the org policy" (CLAUDE.md), so it must carry its own alt-Saturday
-- rule. Add the column with the same definition/default as week_off_policy.
alter table public.employee_week_off_override
  add column if not exists alt_saturday_rule text not null default 'none';

do $$ begin
  alter table public.employee_week_off_override
    add constraint employee_week_off_override_alt_saturday_rule_check
    check (alt_saturday_rule in ('none','odd_off','even_off'));
exception when duplicate_object then null; end $$;
