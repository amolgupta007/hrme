-- 028_assistant_insights.sql — Phase 5 proactive insights
create table if not exists public.assistant_insights (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  rule_key      text not null,
  category      text not null check (category in ('leave','compliance','people','ops')),
  priority      int  not null,
  title         text not null,
  body          text not null,
  metric_count  int,
  deep_link     text not null,
  computed_for  date not null,
  created_at    timestamptz not null default now(),
  dismissed_at  timestamptz,
  dismissed_by  uuid references public.employees(id),
  unique (org_id, rule_key, computed_for)
);

create index if not exists assistant_insights_active_idx
  on public.assistant_insights (org_id, computed_for) where dismissed_at is null;

alter table public.assistant_insights enable row level security;
-- Advisory only — service-role bypasses RLS (see CLAUDE.md gotcha #5).
drop policy if exists assistant_insights_admin_rw on public.assistant_insights;
create policy assistant_insights_admin_rw on public.assistant_insights
  for all using (true) with check (true);
