-- Migration 027: AI Assistant Phase 4 — per-org monthly token budget rollup.
create table if not exists public.assistant_budget (
  org_id uuid not null references public.organizations(id) on delete cascade,
  month text not null,                         -- 'YYYY-MM' (IST month)
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cost_inr_paise bigint not null default 0,    -- running cost in paise
  hard_cap_inr_paise bigint,                   -- null = use plan default
  soft_alert_sent_at timestamptz,
  hard_paused_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (org_id, month)
);

alter table public.assistant_budget enable row level security;

create policy "assistant_budget_own_org"
  on public.assistant_budget for select
  using (org_id::text = current_setting('request.jwt.claims', true)::jsonb->>'org_id');

-- Speeds the redaction cron + any message-based usage queries.
create index if not exists assistant_messages_created_idx
  on public.assistant_messages(created_at);
