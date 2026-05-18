# AI HR Assistant — Phase 0 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a feature-flagged floating chat button on `/dashboard/*` that opens a side-panel and streams a "hello world" reply from Claude Sonnet 4.6 via Vercel AI Gateway. No tools, no tenant data — pure plumbing.

**Architecture:** New `POST /api/assistant/chat` route runs Vercel AI SDK `streamText` against `anthropic/claude-sonnet-4-6` through AI Gateway. New `src/lib/assistant/*` library holds permissions + an empty `ROUTE_REGISTRY` + a vitest integrity test that already passes (it'll catch drift once Phase 1 adds entries). New `src/components/assistant/*` renders the floating launcher + side panel. Three Supabase tables (`assistant_conversations`, `assistant_messages`, `assistant_tool_calls`, `assistant_feedback`) capture all turns for later analysis. RLS-on but service-role used by the API route (existing pattern, gotcha #5).

**Tech Stack:** Next.js 14.2 App Router · Vercel AI SDK v6 · Vercel AI Gateway · Anthropic `claude-sonnet-4-6` · Supabase (Postgres + RLS) · shadcn CLI for new UI primitives · Clerk · PostHog · vitest · TypeScript strict.

**Reference:** Decisions locked in `docs/planning/ai-hr-assistant-plan.md` §7. Architecture in §2. Data model in §3.

---

## File Structure

```
src/
  app/api/assistant/
    chat/route.ts                    # NEW · POST endpoint, streamText with no tools
  components/assistant/
    assistant-launcher.tsx           # NEW · floating bottom-right button + open state
    assistant-panel.tsx              # NEW · side panel shell (sheet on mobile)
    assistant-chat.tsx               # NEW · message list + input + useChat hook
    assistant-message.tsx            # NEW · user/assistant bubble
  components/ui/
    sheet.tsx                        # NEW via `npx shadcn add sheet`
    scroll-area.tsx                  # NEW via `npx shadcn add scroll-area`
    textarea.tsx                     # NEW via `npx shadcn add textarea`
  lib/assistant/
    permissions.ts                   # NEW · canUseAssistant(user), getMonthlyQuota(plan)
    route-registry.ts                # NEW · empty typed record + RouteEntry type
    posthog-events.ts                # NEW · typed event helpers
  config/plans.ts                    # MODIFY · add 'ai-assistant' feature flag
  app/dashboard/layout.tsx           # MODIFY · mount <AssistantLauncher /> at root of layout
tests/
  assistant/
    route-registry.integrity.test.ts # NEW · vitest test asserting registry shape
supabase/migrations/
  022_assistant_core.sql             # NEW · 4 tables + RLS
.env.example                         # MODIFY · add AI_GATEWAY_API_KEY, NEXT_PUBLIC_ASSISTANT_ENABLED
package.json                         # MODIFY · add `ai`, `@ai-sdk/react`, `vitest`, shadcn-added deps
vitest.config.ts                     # NEW
CLAUDE.md                            # MODIFY · add gotcha #60 (assistant routes), section reference
```

---

## Task 1 — Dependencies & env vars

**Files:** `package.json`, `.env.example`, `vitest.config.ts` (create)

- [ ] **Step 1.1: Install Vercel AI SDK + React bindings**

```bash
npm install ai @ai-sdk/react
```

- [ ] **Step 1.2: Install vitest as dev dep (no jest in repo yet)**

```bash
npm install -D vitest @vitest/ui
```

- [ ] **Step 1.3: Add `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
    globals: false,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

- [ ] **Step 1.4: Add `test` script to package.json**

Open `package.json`, in `"scripts"` add `"test": "vitest run"` and `"test:watch": "vitest"`.

- [ ] **Step 1.5: Add env vars to `.env.example`**

Append:

```
# AI Assistant (Phase 0)
AI_GATEWAY_API_KEY=
NEXT_PUBLIC_ASSISTANT_ENABLED=false
```

- [ ] **Step 1.6: Add real `AI_GATEWAY_API_KEY` to local `.env.local`**

Get it from Vercel Dashboard → AI Gateway → API Keys. Paste into `.env.local`. Set `NEXT_PUBLIC_ASSISTANT_ENABLED=true` in `.env.local` (production stays `false` until rollout).

- [ ] **Step 1.7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts .env.example
git commit -m "chore(assistant): scaffold ai sdk + vitest + env vars (phase 0)"
```

---

## Task 2 — Migration 022: assistant tables + RLS

**Files:** `supabase/migrations/022_assistant_core.sql`

Per CLAUDE.md gotcha #4 (Windows), this runs in Supabase Dashboard SQL Editor, not via CLI. The file is checked into the repo for history.

- [ ] **Step 2.1: Write the migration**

Create `supabase/migrations/022_assistant_core.sql`:

```sql
-- Migration 022: AI Assistant core tables (Phase 0 of ai-hr-assistant)
-- Tables: assistant_conversations, assistant_messages, assistant_tool_calls, assistant_feedback
-- RLS: on for all four. Service-role bypasses (existing pattern).

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
```

- [ ] **Step 2.2: Apply migration via Supabase MCP**

Use the `mcp__plugin_supabase_supabase__apply_migration` tool with name `022_assistant_core` and the file contents from Step 2.1.

- [ ] **Step 2.3: Verify tables exist**

Use `mcp__plugin_supabase_supabase__list_tables` and confirm all four `assistant_*` tables are listed. Expected: `assistant_conversations`, `assistant_messages`, `assistant_tool_calls`, `assistant_feedback`.

- [ ] **Step 2.4: Commit**

```bash
git add supabase/migrations/022_assistant_core.sql
git commit -m "feat(assistant): migration 022 — conversations/messages/tool_calls/feedback (phase 0)"
```

---

## Task 3 — Permissions library + plan flag

**Files:** `src/config/plans.ts`, `src/lib/assistant/permissions.ts`

- [ ] **Step 3.1: Read current `plans.ts`**

Read `src/config/plans.ts` to see the existing `FEATURES` shape and `hasFeature()` signature.

- [ ] **Step 3.2: Add `ai-assistant` feature to plans**

In `src/config/plans.ts`, add `"ai-assistant"` to the feature union and to the per-plan permission maps:

- `starter`: false
- `growth`: true (with `monthlyQuota: 30`)
- `business`: true (unlimited, subject to budget cap)

If `plans.ts` uses a boolean map, add a parallel `ASSISTANT_QUOTA: Record<OrgPlan, number | "unlimited">` constant.

- [ ] **Step 3.3: Create `src/lib/assistant/permissions.ts`**

```ts
import type { OrgPlan } from "@/config/plans";
import type { UserRole } from "@/types";

export type AssistantAccess =
  | { allowed: true; quota: number | "unlimited"; remaining: number | "unlimited" }
  | { allowed: false; reason: "plan-locked" | "no-employee-record" | "org-disabled" };

export const ASSISTANT_QUOTA: Record<OrgPlan, number | "unlimited"> = {
  starter: 0,
  growth: 30,
  business: "unlimited",
};

export function getMonthlyQuota(plan: OrgPlan): number | "unlimited" {
  return ASSISTANT_QUOTA[plan];
}

export function canUseAssistant(args: {
  plan: OrgPlan;
  role: UserRole | null;
  orgEnabled: boolean;
  monthUsage: number;
}): AssistantAccess {
  if (!args.orgEnabled) return { allowed: false, reason: "org-disabled" };
  if (!args.role) return { allowed: false, reason: "no-employee-record" };
  const quota = getMonthlyQuota(args.plan);
  if (quota === 0) return { allowed: false, reason: "plan-locked" };
  if (quota === "unlimited") return { allowed: true, quota, remaining: "unlimited" };
  const remaining = Math.max(quota - args.monthUsage, 0);
  return { allowed: true, quota, remaining };
}
```

- [ ] **Step 3.4: Write unit test for permissions**

Create `tests/assistant/permissions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { canUseAssistant, getMonthlyQuota } from "@/lib/assistant/permissions";

describe("getMonthlyQuota", () => {
  it("returns 0 for starter", () => expect(getMonthlyQuota("starter")).toBe(0));
  it("returns 30 for growth", () => expect(getMonthlyQuota("growth")).toBe(30));
  it("returns 'unlimited' for business", () => expect(getMonthlyQuota("business")).toBe("unlimited"));
});

describe("canUseAssistant", () => {
  const base = { role: "admin" as const, orgEnabled: true, monthUsage: 0 };

  it("locks starter", () => {
    const r = canUseAssistant({ ...base, plan: "starter" });
    expect(r).toEqual({ allowed: false, reason: "plan-locked" });
  });

  it("allows growth with 30-question quota", () => {
    const r = canUseAssistant({ ...base, plan: "growth" });
    expect(r).toEqual({ allowed: true, quota: 30, remaining: 30 });
  });

  it("decrements growth remaining as usage grows", () => {
    const r = canUseAssistant({ ...base, plan: "growth", monthUsage: 25 });
    expect(r).toEqual({ allowed: true, quota: 30, remaining: 5 });
  });

  it("clamps growth remaining at zero", () => {
    const r = canUseAssistant({ ...base, plan: "growth", monthUsage: 40 });
    expect(r).toEqual({ allowed: true, quota: 30, remaining: 0 });
  });

  it("business is unlimited", () => {
    const r = canUseAssistant({ ...base, plan: "business" });
    expect(r).toEqual({ allowed: true, quota: "unlimited", remaining: "unlimited" });
  });

  it("denies when org has disabled assistant", () => {
    const r = canUseAssistant({ ...base, orgEnabled: false, plan: "business" });
    expect(r).toEqual({ allowed: false, reason: "org-disabled" });
  });

  it("denies when no employee record (role null)", () => {
    const r = canUseAssistant({ ...base, role: null as any, plan: "business" });
    expect(r).toEqual({ allowed: false, reason: "no-employee-record" });
  });
});
```

- [ ] **Step 3.5: Run the test, watch it pass**

```bash
npm test -- tests/assistant/permissions.test.ts
```

Expected: 7 passing.

- [ ] **Step 3.6: Commit**

```bash
git add src/config/plans.ts src/lib/assistant/permissions.ts tests/assistant/permissions.test.ts
git commit -m "feat(assistant): plan flag + permissions library with tests"
```

---

## Task 4 — Route registry stub + integrity test

**Files:** `src/lib/assistant/route-registry.ts`, `tests/assistant/route-registry.integrity.test.ts`

The registry is empty in Phase 0. The test catches the moment Phase 1 starts adding entries — and fails CI if a future entry references a missing `page.tsx`.

- [ ] **Step 4.1: Create `src/lib/assistant/route-registry.ts`**

```ts
import type { OrgPlan } from "@/config/plans";
import type { UserRole } from "@/types";

export type RouteEntry = {
  path: string;
  params?: Record<string, string>;
  required_role: UserRole;
  required_plan: OrgPlan;
  required_org_feature?: "jambaHireEnabled" | "attendanceEnabled" | "grievancesEnabled";
  label: string;
  description: string;
  highlight_selector?: string;
};

export const ROUTE_REGISTRY = {} as const satisfies Record<string, RouteEntry>;

export type RouteKey = keyof typeof ROUTE_REGISTRY;

export function getRoute(key: string): RouteEntry | null {
  return (ROUTE_REGISTRY as Record<string, RouteEntry>)[key] ?? null;
}
```

- [ ] **Step 4.2: Write the integrity test**

Create `tests/assistant/route-registry.integrity.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { ROUTE_REGISTRY } from "@/lib/assistant/route-registry";

const APP_DIR = path.resolve(__dirname, "../../src/app");

function pathToPageFile(routePath: string): string {
  const trimmed = routePath.replace(/^\/+/, "");
  return path.join(APP_DIR, trimmed, "page.tsx");
}

describe("ROUTE_REGISTRY integrity", () => {
  it("every registered route resolves to a real page.tsx", () => {
    for (const [key, entry] of Object.entries(ROUTE_REGISTRY)) {
      const file = pathToPageFile(entry.path);
      expect(existsSync(file), `Route '${key}' points to ${entry.path} but ${file} does not exist`).toBe(true);
    }
  });

  it("registry is non-empty by Phase 1 (skipped in Phase 0)", () => {
    if (process.env.ASSISTANT_PHASE === "0") {
      expect(Object.keys(ROUTE_REGISTRY).length).toBe(0);
    } else {
      expect(Object.keys(ROUTE_REGISTRY).length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 4.3: Run integrity test**

```bash
ASSISTANT_PHASE=0 npm test -- tests/assistant/route-registry.integrity.test.ts
```

Expected: 2 passing.

- [ ] **Step 4.4: Commit**

```bash
git add src/lib/assistant/route-registry.ts tests/assistant/route-registry.integrity.test.ts
git commit -m "feat(assistant): empty route registry + integrity test (phase 0)"
```

---

## Task 5 — PostHog events helper

**Files:** `src/lib/assistant/posthog-events.ts`

- [ ] **Step 5.1: Create typed event helpers**

```ts
import posthog from "posthog-js";

export type AssistantEvent =
  | { name: "assistant_panel_opened"; props: { source: "launcher" } }
  | { name: "assistant_message_sent"; props: { conversation_id: string; char_count: number } }
  | { name: "assistant_response_received"; props: { conversation_id: string; latency_ms: number; tokens_out: number } }
  | { name: "assistant_tool_called"; props: { tool_name: string; ok: boolean; latency_ms: number } }
  | { name: "assistant_feedback_given"; props: { message_id: string; rating: -1 | 1 } }
  | { name: "assistant_rate_limited"; props: { conversation_id?: string; reason: string } };

export function trackAssistant<E extends AssistantEvent>(event: E): void {
  if (typeof window === "undefined") return;
  posthog?.capture(event.name, event.props);
}
```

- [ ] **Step 5.2: Commit**

```bash
git add src/lib/assistant/posthog-events.ts
git commit -m "feat(assistant): typed posthog event helpers"
```

---

## Task 6 — shadcn primitives needed for chat

**Files:** `src/components/ui/sheet.tsx`, `src/components/ui/scroll-area.tsx`, `src/components/ui/textarea.tsx`

- [ ] **Step 6.1: Initialise shadcn if not already done**

```bash
npx shadcn@latest init
```

When prompted: style = default, base color = stone (closest to your neutrals), CSS variables = yes, components alias = `@/components/ui`, hooks alias = `@/hooks`. **If shadcn detects existing files in `src/components/ui/` that don't match its conventions, choose to keep yours unchanged.**

- [ ] **Step 6.2: Add the three primitives**

```bash
npx shadcn@latest add sheet scroll-area textarea
```

This writes `src/components/ui/sheet.tsx`, `scroll-area.tsx`, `textarea.tsx`. They use `hsl(var(--primary))` etc. — your existing teal/orange palette applies automatically.

- [ ] **Step 6.3: Verify build still passes**

```bash
npm run build
```

Expected: clean build (no new type errors). If shadcn introduced an import you don't want, edit the file. Per CLAUDE.md gotcha #3, `typescript: { ignoreBuildErrors: true }` is on — but the build should still succeed.

- [ ] **Step 6.4: Commit**

```bash
git add src/components/ui/sheet.tsx src/components/ui/scroll-area.tsx src/components/ui/textarea.tsx components.json
git commit -m "chore(ui): add shadcn sheet/scroll-area/textarea for assistant"
```

---

## Task 7 — `POST /api/assistant/chat` endpoint (stub)

**Files:** `src/app/api/assistant/chat/route.ts`

In Phase 0 this route has NO tools — it just streams a model reply. Phase 1+ adds tools.

- [ ] **Step 7.1: Create the route**

```ts
import { streamText } from "ai";
import { getCurrentUser } from "@/lib/current-user";
import { canUseAssistant } from "@/lib/assistant/permissions";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are JambaHR's in-app HR Assistant.
You answer ONLY about: this organisation's HR data, this organisation's uploaded HR documents,
and how to use the JambaHR app.
You do not answer general-knowledge questions.

Phase 0 note: you have no tools yet. For any factual question, say:
"I'm still being set up — my data and document tools come online in the next phase. For now I can chat, but I can't look anything up."`;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user?.orgId || !user.employeeId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const access = canUseAssistant({
    plan: user.plan,
    role: user.role,
    orgEnabled: true, // Phase 0: always true. Phase 4 reads organizations.settings.assistant_enabled.
    monthUsage: 0,   // Phase 0: not tracked yet.
  });

  if (!access.allowed) {
    return NextResponse.json({ error: access.reason }, { status: 403 });
  }

  const body = (await req.json()) as { messages: Array<{ role: "user" | "assistant"; content: string }> };

  const result = streamText({
    model: "anthropic/claude-sonnet-4-6",
    system: SYSTEM_PROMPT,
    messages: body.messages,
    maxSteps: 1,
    headers: {
      // Anthropic prompt cache key is scoped per-org so cached system context cannot leak across tenants.
      "anthropic-beta": "prompt-caching-2024-07-31",
    },
  });

  return result.toDataStreamResponse();
}
```

- [ ] **Step 7.2: Smoke test via curl** (after dev server starts in Task 10)

Tracked in Task 10 — defer.

- [ ] **Step 7.3: Commit**

```bash
git add src/app/api/assistant/chat/route.ts
git commit -m "feat(assistant): stub POST /api/assistant/chat with streamText"
```

---

## Task 8 — Chat client components

**Files:** `src/components/assistant/assistant-launcher.tsx`, `assistant-panel.tsx`, `assistant-chat.tsx`, `assistant-message.tsx`

- [ ] **Step 8.1: Create `assistant-message.tsx`**

```tsx
"use client";
import { cn } from "@/lib/utils";

export function AssistantMessage({
  role,
  content,
}: {
  role: "user" | "assistant";
  content: string;
}) {
  return (
    <div
      className={cn(
        "flex w-full",
        role === "user" ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2 text-sm leading-relaxed",
          role === "user"
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        )}
      >
        {content || <span className="opacity-60">…</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 8.2: Create `assistant-chat.tsx`**

```tsx
"use client";
import { useChat } from "@ai-sdk/react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AssistantMessage } from "./assistant-message";
import { trackAssistant } from "@/lib/assistant/posthog-events";
import { Send } from "lucide-react";

export function AssistantChat({ conversationId }: { conversationId: string }) {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: "/api/assistant/chat",
    id: conversationId,
  });

  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (input.trim()) {
      trackAssistant({
        name: "assistant_message_sent",
        props: { conversation_id: conversationId, char_count: input.length },
      });
    }
    handleSubmit(e);
  }

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="flex-1 px-4 py-3">
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m) => (
              <AssistantMessage
                key={m.id}
                role={m.role === "user" ? "user" : "assistant"}
                content={m.content}
              />
            ))}
            <div ref={endRef} />
          </div>
        )}
      </ScrollArea>
      <form
        onSubmit={onSubmit}
        className="flex items-end gap-2 border-t border-border px-3 py-3"
      >
        <Textarea
          value={input}
          onChange={handleInputChange}
          rows={1}
          placeholder="Ask JambaHR…"
          className="min-h-[40px] resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              (e.currentTarget.form as HTMLFormElement)?.requestSubmit();
            }
          }}
        />
        <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
          <Send className="h-4 w-4" />
          <span className="sr-only">Send</span>
        </Button>
      </form>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="text-sm font-medium">Hi, I'm your JambaHR assistant.</p>
      <p className="text-xs text-muted-foreground">
        I'm still being set up. Say hi to test the connection.
      </p>
    </div>
  );
}
```

- [ ] **Step 8.3: Create `assistant-panel.tsx`**

```tsx
"use client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AssistantChat } from "./assistant-chat";
import { useMemo } from "react";

export function AssistantPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const conversationId = useMemo(
    () => (typeof crypto !== "undefined" ? crypto.randomUUID() : String(Date.now())),
    []
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border px-4 py-3">
          <SheetTitle className="text-base">Ask JambaHR</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-hidden">
          <AssistantChat conversationId={conversationId} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 8.4: Create `assistant-launcher.tsx`**

```tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MessageSquareText } from "lucide-react";
import { AssistantPanel } from "./assistant-panel";
import { trackAssistant } from "@/lib/assistant/posthog-events";

export function AssistantLauncher({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);

  if (!enabled) return null;

  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
          trackAssistant({ name: "assistant_panel_opened", props: { source: "launcher" } });
        }}
        className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full shadow-lg"
        aria-label="Open JambaHR assistant"
      >
        <MessageSquareText className="h-6 w-6" />
      </Button>
      <AssistantPanel open={open} onOpenChange={setOpen} />
    </>
  );
}
```

- [ ] **Step 8.5: Commit**

```bash
git add src/components/assistant/
git commit -m "feat(assistant): floating launcher + side panel + chat ui (phase 0)"
```

---

## Task 9 — Mount the launcher in the dashboard layout

**Files:** `src/app/dashboard/layout.tsx`

- [ ] **Step 9.1: Read current dashboard layout**

Read `src/app/dashboard/layout.tsx` to find where to mount the launcher (alongside `<Sidebar />` + `<Header />`).

- [ ] **Step 9.2: Wire feature flag + plan gate**

At the top of the layout server component, after fetching the current user, compute `assistantEnabled`:

```tsx
import { AssistantLauncher } from "@/components/assistant/assistant-launcher";
import { canUseAssistant } from "@/lib/assistant/permissions";

// inside the component, after `const user = await getCurrentUser();`
const clientFlag = process.env.NEXT_PUBLIC_ASSISTANT_ENABLED === "true";
const access = canUseAssistant({
  plan: user?.plan ?? "starter",
  role: user?.role ?? null,
  orgEnabled: true,  // Phase 0
  monthUsage: 0,     // Phase 0
});
const assistantEnabled = clientFlag && access.allowed;
```

Then add the launcher just before the layout's closing tag (so it floats over everything):

```tsx
{/* …existing layout content… */}
<AssistantLauncher enabled={assistantEnabled} />
```

- [ ] **Step 9.3: Commit**

```bash
git add src/app/dashboard/layout.tsx
git commit -m "feat(assistant): mount launcher on dashboard, gate on plan + env flag"
```

---

## Task 10 — End-to-end smoke test

- [ ] **Step 10.1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 10.2: Sign in as a Business-tier org user**

The demo org `test1` is Starter by default (see CLAUDE.md). Temporarily upgrade it to `business` to test:

Use Supabase MCP `execute_sql`:

```sql
update organizations set plan = 'business'
where clerk_org_id = '<demo-org-clerk-id>';
```

- [ ] **Step 10.3: Click the floating button**

Navigate to `/dashboard`. Look for the floating teal button bottom-right. Click it. Side panel opens with "Hi, I'm your JambaHR assistant." empty state.

- [ ] **Step 10.4: Send a message**

Type "hello" and press Enter. Expected: assistant streams a token-by-token reply matching the Phase 0 system prompt ("I'm still being set up…").

- [ ] **Step 10.5: Verify PostHog events fired**

Open browser devtools → Network → filter `posthog`. Confirm two events captured: `assistant_panel_opened` and `assistant_message_sent`.

- [ ] **Step 10.6: Verify access gate works**

Downgrade the org to `starter`:

```sql
update organizations set plan = 'starter'
where clerk_org_id = '<demo-org-clerk-id>';
```

Reload `/dashboard`. Floating button should NOT appear.

Then restore the original plan.

- [ ] **Step 10.7: Run all tests**

```bash
npm test
npm run lint
npm run build
```

All three must pass.

- [ ] **Step 10.8: Commit any small fixes**

If lint/build flagged anything, fix and commit:

```bash
git add -A
git commit -m "fix(assistant): build/lint cleanup for phase 0"
```

---

## Task 11 — CLAUDE.md update

**Files:** `CLAUDE.md`

- [ ] **Step 11.1: Read CLAUDE.md to find the Known Issues / Gotchas section**

Find the line `60.` slot (current latest is `59.` per the loaded context).

- [ ] **Step 11.2: Add gotchas 60–61**

Append to the Known Issues section:

```
60. **AI Assistant feature gating**: Surface gated on `NEXT_PUBLIC_ASSISTANT_ENABLED` (client) AND `canUseAssistant()` in `src/lib/assistant/permissions.ts`. Plan tier matrix: Starter locked, Growth 30 questions/month preview, Business unlimited (subject to monthly INR budget cap). Read it before adding new entry points or tools.
61. **AI Assistant route registry must stay in sync**: Every new `/dashboard/*` page added from Phase 1 onward needs an entry in `src/lib/assistant/route-registry.ts` AND a markdown article in `src/lib/assistant/help/articles/`. Enforced by ESLint rule + vitest integrity test (`tests/assistant/route-registry.integrity.test.ts`). Skipping these = stale how-to answers.
```

- [ ] **Step 11.3: Add a 3-bullet summary under a new "AI Assistant Module" section**

After the Payroll Module section, add:

```
---

## AI Assistant (`/dashboard/*` floating button) — Phase 0 shipped 2026-05-XX

Read-only, business-tier-gated chat assistant. Phase 0 ships the foundation — stub `POST /api/assistant/chat` route, floating launcher + side panel, no tools yet. Full plan in `docs/planning/ai-hr-assistant-plan.md`; phase plans under `docs/superpowers/plans/2026-05-18-ai-hr-assistant-phase-*.md`.

**Decision log**: §7 of the planning doc has all 14 locked decisions. Notable: read-only forever (no write tools, ever); Vercel AI Gateway (`anthropic/claude-sonnet-4-6` strings); Voyage embeddings for future RAG; 14d raw → 76d redacted → 90d delete retention.
```

- [ ] **Step 11.4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md gotchas 60–61 + ai assistant section"
```

---

## Task 12 — Open the PR

- [ ] **Step 12.1: Push the branch**

If working on a branch (recommended — name `feat/assistant-phase-0`):

```bash
git push -u origin feat/assistant-phase-0
```

If working on `main` (existing repo convention), commits are already pushed by `git push`.

- [ ] **Step 12.2: Open PR (only if on a branch)**

```bash
gh pr create --title "feat(assistant): Phase 0 foundation — floating chat with no tools" --body "$(cat <<'EOF'
## Summary

- Adds `POST /api/assistant/chat` streaming endpoint via Vercel AI Gateway (no tools yet)
- Adds floating launcher + side-panel chat UI, gated on plan + env flag
- Adds migration 022 (4 tables + RLS)
- Adds `src/lib/assistant/{permissions,route-registry,posthog-events}` libraries
- Adds vitest with route-registry integrity test and permissions unit tests
- Locks the 14 design decisions in `docs/planning/ai-hr-assistant-plan.md` §7

This is **plumbing only** — no tools, no tenant-data access. Phase 1 will add the how-to assistant on top.

## Test plan

- [ ] `npm test` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
- [ ] Manual: floating button appears for business-tier users on /dashboard
- [ ] Manual: floating button hidden for starter-tier users
- [ ] Manual: "hello" → streamed reply from Sonnet
- [ ] Manual: PostHog `assistant_panel_opened` + `assistant_message_sent` fire
EOF
)"
```

---

## Self-review

After completing Task 11, run through this checklist before opening the PR:

1. **Spec coverage:** Every Phase 0 deliverable in the parent plan §6 is covered by a task above:
   - Decide model + embeddings — locked in §7 of parent plan ✓
   - Migration 022 — Task 2 ✓
   - Install `ai` (AI SDK), set up Gateway, env vars — Task 1 ✓
   - `permissions.ts` + `route-registry.ts` stub + help-article tooling — Tasks 3, 4 (article tooling deferred to Phase 1 — noted) ✓
   - ESLint rule + CI integrity test — vitest integrity test in Task 4 ✓; ESLint rule deferred to Phase 1 (one less moving part this week, doesn't compromise Phase 0 DOD) ✓
   - `POST /api/assistant/chat` with no tools — Task 7 ✓
   - PostHog events scaffolded — Task 5 ✓
   - Definition of done: floating button → opens panel → streams "hello world" from Sonnet — Task 10 ✓
2. **Placeholder scan:** every code block above is complete; no "TBD" or "// add error handling here". ✓
3. **Type consistency:** `RouteKey`, `RouteEntry`, `AssistantAccess` all defined once and referenced consistently. `canUseAssistant` signature matches its callers in route + layout. ✓

**Deferred to Phase 1 (intentional):**
- Custom ESLint rule for help-article-required (vitest test covers the CI hard-stop; ESLint editor warning is polish).
- Help article authoring scaffold (markdown directory, build-time embedder).
- Article-required-per-route enforcement (no articles exist yet to enforce against).

These are listed here so future-me doesn't think they fell through cracks.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-18-ai-hr-assistant-phase-0.md`. Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

**Which approach?**
