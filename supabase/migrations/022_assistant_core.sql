-- Migration 022: AI Assistant core tables (Phase 0 of ai-hr-assistant)
-- Tables: assistant_conversations, assistant_messages, assistant_tool_calls, assistant_feedback
-- RLS: on for all four. Service-role bypasses (existing pattern, CLAUDE.md gotcha #5).

create extension if not exists "pgcrypto";

create table if not exists public.assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_employee_id uuid not null references public.employees(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  message_count int not null default 0,
  last_model text,
  last_token_usage jsonb
);

create index if not exists assistant_conversations_org_user_idx
  on public.assistant_conversations(org_id, user_employee_id, updated_at desc);

create table if not exists public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.assistant_conversations(id) on delete cascade,
  role text not null check (role in ('system','user','assistant','tool')),
  content text,
  tool_call jsonb,
  tool_result jsonb,
  finish_reason text,
  model text,
  input_tokens int,
  output_tokens int,
  created_at timestamptz not null default now(),
  redacted_at timestamptz,
  pii_redacted boolean not null default false
);

create index if not exists assistant_messages_conv_created_idx
  on public.assistant_messages(conversation_id, created_at);

create table if not exists public.assistant_tool_calls (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.assistant_messages(id) on delete cascade,
  tool_name text not null,
  args_hash text not null,
  latency_ms int,
  ok boolean not null,
  error_class text,
  rows_returned int,
  created_at timestamptz not null default now()
);

create index if not exists assistant_tool_calls_message_idx
  on public.assistant_tool_calls(message_id);

create table if not exists public.assistant_feedback (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.assistant_messages(id) on delete cascade,
  user_employee_id uuid not null references public.employees(id) on delete cascade,
  rating smallint not null check (rating in (-1, 1)),
  comment text,
  created_at timestamptz not null default now(),
  unique (message_id, user_employee_id)
);

alter table public.assistant_conversations enable row level security;
alter table public.assistant_messages enable row level security;
alter table public.assistant_tool_calls enable row level security;
alter table public.assistant_feedback enable row level security;

-- Policies are advisory; service-role bypasses (CLAUDE.md gotcha #5). They activate
-- the moment Clerk-JWT-to-Supabase wiring lands.
create policy "assistant_conv_own_org"
  on public.assistant_conversations for select
  using (org_id::text = current_setting('request.jwt.claims', true)::jsonb->>'org_id');

create policy "assistant_msg_via_conversation"
  on public.assistant_messages for select
  using (exists (
    select 1 from public.assistant_conversations c
    where c.id = conversation_id
      and c.org_id::text = current_setting('request.jwt.claims', true)::jsonb->>'org_id'
  ));

create policy "assistant_tool_calls_via_message"
  on public.assistant_tool_calls for select
  using (exists (
    select 1 from public.assistant_messages m
    join public.assistant_conversations c on c.id = m.conversation_id
    where m.id = message_id
      and c.org_id::text = current_setting('request.jwt.claims', true)::jsonb->>'org_id'
  ));

create policy "assistant_feedback_own"
  on public.assistant_feedback for select
  using (exists (
    select 1 from public.assistant_messages m
    join public.assistant_conversations c on c.id = m.conversation_id
    where m.id = message_id
      and c.org_id::text = current_setting('request.jwt.claims', true)::jsonb->>'org_id'
  ));
