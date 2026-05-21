# AI HR Assistant — Phase 4 (History, Feedback, Audit, Budget) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task. Steps use `- [ ]` checkboxes.

**Goal:** Operationalize the assistant — let users see/search/delete past conversations, rate answers, give founders a usage/cost dashboard, enforce per-org monthly token budgets, and run the PII-redaction retention cron.

**Architecture:** Builds on Phase 0's tables (`assistant_conversations`, `assistant_messages`, `assistant_tool_calls`, `assistant_feedback` — all exist from migration 022). Adds one new table (`assistant_budget`), a pricing helper (tokens→INR), a budget gate in the chat route, a feedback endpoint + UI, a conversation-history UI, a founder dashboard at `/superadmin/assistant`, and a daily redaction cron. No new AI/LLM surface — pure data + UI + ops.

**Tech Stack:** Next.js 14.2 · Supabase Pro · existing Resend (budget alert email) · existing superadmin cookie auth · vitest. No new external deps.

**Reference:** parent plan `docs/planning/ai-hr-assistant-plan.md` §3 (data), §4.5 (audit), §4.6 (cost), §6 Phase 4. Locked decisions: OQ-8 (14d raw → 76d redacted → 90d delete), OQ-13 (₹500 Growth / ₹2000 Business caps + ₹200 starter credit), OQ-12 (founder dashboard Phase 4).

**Naming reminder:** tool names underscored (n/a here — no new tools). Cron routes exempt from Clerk via existing `/api/cron(.*)` matcher; each enforces `Bearer CRON_SECRET`.

---

## Pre-flight facts (verified)

- Tables `assistant_conversations` / `assistant_messages` / `assistant_tool_calls` / `assistant_feedback` exist (migration 022). `assistant_messages` already persists `input_tokens` / `output_tokens` / `model` / `created_at` per turn, and `content` (raw).
- `assistant_budget` does NOT exist — Phase 4 creates it (migration 027).
- Superadmin auth: `isSuperadminAuthenticated()` (cookie `SUPERADMIN_SESSION_TOKEN` / `SUPERADMIN_SECRET`); existing pages under `/superadmin/*` (e.g. `/superadmin/feedback`). Model the new dashboard on those.
- Resend senders: `FROM_EMAIL` (support@), `FOUNDER_EMAIL_FROM` (amol@), `NOREPLY_EMAIL_FROM`. Budget alerts → admin via `FROM_EMAIL`.
- Chat route already computes + persists usage in `onFinish`. Budget gate goes BEFORE `streamText` (reject over-cap) and rollup update goes IN `onFinish`.

---

## File Structure

```
supabase/migrations/
  027_assistant_budget.sql              # NEW — assistant_budget table + RLS + index on messages(created_at)
src/lib/assistant/
  pricing.ts                            # NEW — model rate card + tokensToInrPaise()
  budget.ts                             # NEW — getMonthBudget(), checkBudget(), recordUsage()
  redact.ts                             # NEW — redactPII(text) for the retention cron
  conversations.ts                      # NEW — listConversations/getConversation/deleteConversation (per-user)
  feedback.ts                           # NEW — submitFeedback(messageId, rating, comment)
src/app/api/assistant/
  chat/route.ts                         # MODIFY — budget gate (429-style) + recordUsage in onFinish
  feedback/route.ts                     # NEW — POST 👍/👎 + comment
  conversations/route.ts                # NEW — GET list / GET one / DELETE (per-user)
src/app/api/cron/
  assistant-redact/route.ts             # NEW — 14d→redact, 90d→delete
src/components/assistant/
  assistant-history.tsx                 # NEW — past-conversations dropdown (search + delete)
  assistant-feedback-buttons.tsx        # NEW — 👍/👎 + comment under each assistant message
  assistant-chat.tsx                    # MODIFY — mount history dropdown + load a past conversation
  assistant-message.tsx                 # MODIFY — render feedback buttons on assistant messages
  assistant-panel.tsx                   # MODIFY — header gets the history control
src/app/superadmin/assistant/
  page.tsx                              # NEW — founder usage/cost/feedback dashboard
src/actions/
  assistant-admin.ts                    # NEW — superadmin-gated read queries for the dashboard
src/components/emails/
  assistant-budget-alert.tsx            # NEW — admin email at soft/hard cap
vercel.json                             # MODIFY — register assistant-redact cron
tests/assistant/
  pricing.test.ts                       # NEW
  budget.test.ts                        # NEW
  redact.test.ts                        # NEW
CLAUDE.md                               # MODIFY — gotchas + Phase 4 section
```

---

## Task 1 — Migration 027: assistant_budget + message index

**Files:** `supabase/migrations/027_assistant_budget.sql` (apply via Supabase MCP)

- [ ] **Step 1.1: Write + apply**

```sql
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
```

Apply via `mcp__plugin_supabase_supabase__apply_migration` name `027_assistant_budget`. Verify table + index.

- [ ] **Step 1.2: Commit** — `git add supabase/migrations/027_assistant_budget.sql && git commit -m "feat(assistant): migration 027 — assistant_budget + messages created_at index"`

(No Co-Authored-By. Stage only the migration.)

---

## Task 2 — Pricing helper + tests

**Files:** `src/lib/assistant/pricing.ts`, `tests/assistant/pricing.test.ts`

- [ ] **Step 2.1: Write `pricing.ts`**

```ts
import type { OrgPlan } from "@/config/plans";

// USD per 1M tokens for the gateway model we use. Keep in one place; update when rates change.
const RATE_USD_PER_MTOK = {
  "anthropic/claude-sonnet-4-6": { input: 3, output: 15 },
} as const;

const DEFAULT_MODEL = "anthropic/claude-sonnet-4-6";
const USD_TO_INR = 86;            // coarse; refine if you want live FX
const INR_PER_PAISA = 100;

export function tokensToInrPaise(args: {
  inputTokens: number;
  outputTokens: number;
  model?: string;
}): number {
  const rate =
    RATE_USD_PER_MTOK[(args.model ?? DEFAULT_MODEL) as keyof typeof RATE_USD_PER_MTOK] ??
    RATE_USD_PER_MTOK[DEFAULT_MODEL];
  const usd =
    (args.inputTokens / 1_000_000) * rate.input +
    (args.outputTokens / 1_000_000) * rate.output;
  return Math.round(usd * USD_TO_INR * INR_PER_PAISA);
}

// Monthly hard cap per plan, in paise. Overridable per-org via assistant_budget.hard_cap_inr_paise.
export const PLAN_BUDGET_PAISE: Record<OrgPlan, number> = {
  starter: 0,                 // assistant locked on starter anyway
  growth: 500 * 100,          // ₹500
  business: 2000 * 100,       // ₹2000
  custom: 2000 * 100,
};

export const STARTER_CREDIT_PAISE = 200 * 100; // one-time ₹200 on upgrade (OQ-13) — applied in budget logic
```

- [ ] **Step 2.2: Tests** `tests/assistant/pricing.test.ts` — cover: known token counts → expected paise (compute by hand for a fixed input/output pair); unknown model falls back to default; zero tokens → 0. ~4 cases.

- [ ] **Step 2.3: Run + commit**

```bash
npm test -- tests/assistant/pricing.test.ts
git add src/lib/assistant/pricing.ts tests/assistant/pricing.test.ts
git commit -m "feat(assistant): token→INR pricing helper + plan budget caps"
```

---

## Task 3 — Budget library + tests

**Files:** `src/lib/assistant/budget.ts`, `tests/assistant/budget.test.ts`

- [ ] **Step 3.1: Write `budget.ts`**

```ts
import { createAdminSupabase } from "@/lib/supabase/server";
import { tokensToInrPaise, PLAN_BUDGET_PAISE } from "./pricing";
import type { OrgPlan } from "@/config/plans";

function istMonth(d = new Date()): string {
  // IST = UTC+5:30
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}`;
}

export type BudgetVerdict =
  | { allowed: true; usedPaise: number; capPaise: number }
  | { allowed: false; reason: "budget-exceeded"; usedPaise: number; capPaise: number };

export async function checkBudget(orgId: string, plan: OrgPlan): Promise<BudgetVerdict> {
  const supabase = createAdminSupabase();
  const month = istMonth();
  const { data } = await supabase
    .from("assistant_budget")
    .select("cost_inr_paise, hard_cap_inr_paise, hard_paused_at")
    .eq("org_id", orgId)
    .eq("month", month)
    .maybeSingle();

  const used = (data as any)?.cost_inr_paise ?? 0;
  const cap = (data as any)?.hard_cap_inr_paise ?? PLAN_BUDGET_PAISE[plan] ?? 0;
  if (cap > 0 && used >= cap) {
    return { allowed: false, reason: "budget-exceeded", usedPaise: used, capPaise: cap };
  }
  return { allowed: true, usedPaise: used, capPaise: cap };
}

// Called from chat onFinish. Upserts the month rollup; returns the new used total + cap
// so the caller can decide whether to fire a soft-cap (80%) alert.
export async function recordUsage(args: {
  orgId: string;
  plan: OrgPlan;
  inputTokens: number;
  outputTokens: number;
  model?: string;
}): Promise<{ usedPaise: number; capPaise: number; crossedSoftCap: boolean }> {
  const supabase = createAdminSupabase();
  const month = istMonth();
  const delta = tokensToInrPaise(args);

  const { data: existing } = await supabase
    .from("assistant_budget")
    .select("cost_inr_paise, input_tokens, output_tokens, hard_cap_inr_paise, soft_alert_sent_at")
    .eq("org_id", args.orgId)
    .eq("month", month)
    .maybeSingle();

  const prevUsed = (existing as any)?.cost_inr_paise ?? 0;
  const newUsed = prevUsed + delta;
  const cap = (existing as any)?.hard_cap_inr_paise ?? PLAN_BUDGET_PAISE[args.plan] ?? 0;
  const softThreshold = Math.floor(cap * 0.8);
  const crossedSoftCap =
    cap > 0 && prevUsed < softThreshold && newUsed >= softThreshold && !(existing as any)?.soft_alert_sent_at;

  await supabase.from("assistant_budget").upsert(
    {
      org_id: args.orgId,
      month,
      input_tokens: ((existing as any)?.input_tokens ?? 0) + args.inputTokens,
      output_tokens: ((existing as any)?.output_tokens ?? 0) + args.outputTokens,
      cost_inr_paise: newUsed,
      updated_at: new Date().toISOString(),
      ...(crossedSoftCap ? { soft_alert_sent_at: new Date().toISOString() } : {}),
    },
    { onConflict: "org_id,month" }
  );

  return { usedPaise: newUsed, capPaise: cap, crossedSoftCap };
}
```

- [ ] **Step 3.2: Tests** — mock supabase. Cover: under-cap allows; at/over-cap blocks; cap=0 (unlimited/unset) always allows; recordUsage computes delta + crossedSoftCap exactly once. ~5 cases.

- [ ] **Step 3.3: Run + commit**

```bash
npm test -- tests/assistant/budget.test.ts
git add src/lib/assistant/budget.ts tests/assistant/budget.test.ts
git commit -m "feat(assistant): monthly budget check + usage rollup (IST month)"
```

---

## Task 4 — Wire budget into chat route

**Files:** `src/app/api/assistant/chat/route.ts`, `src/components/emails/assistant-budget-alert.tsx`

- [ ] **Step 4.1: Budget alert email** — create `assistant-budget-alert.tsx` (React Email) taking `{ orgName, usedInr, capInr, kind: "soft" | "hard" }`. Soft = "you've used 80%…", hard = "assistant paused for the month…". Model on existing `payment-failed.tsx` / `upgrade-push.tsx` templates.

- [ ] **Step 4.2: Gate before streamText** — after the rate-limit check, add:

```ts
import { checkBudget, recordUsage } from "@/lib/assistant/budget";
// ...
const budget = await checkBudget(user.orgId, user.plan);
if (!budget.allowed) {
  return NextResponse.json({ error: "budget-exceeded" }, { status: 402 });
}
```

(402 Payment Required — distinct from 429 rate-limit so the client can show the right message.)

- [ ] **Step 4.3: Record usage in onFinish** — inside the existing `onFinish`, after `persistMessage`, add a best-effort:

```ts
try {
  const { crossedSoftCap, usedPaise, capPaise } = await recordUsage({
    orgId: user.orgId,
    plan: user.plan,
    inputTokens: event.usage?.inputTokens ?? 0,
    outputTokens: event.usage?.outputTokens ?? 0,
    model: event.response?.modelId,
  });
  if (crossedSoftCap) {
    // best-effort soft-cap email to org admins (look up via employees role in/owner+admin)
    await sendBudgetAlert({ orgId: user.orgId, orgName: user.orgName, usedPaise, capPaise, kind: "soft" });
  }
} catch (err) {
  console.error("assistant budget record failed:", err);
}
```

Add a `sendBudgetAlert` helper (in `budget.ts` or inline) that looks up active admins and sends the email. Hard-cap email fires from the cron OR lazily when `checkBudget` first blocks — keep it simple: send hard-cap email at the moment `recordUsage` pushes `newUsed >= cap` and `hard_paused_at` is null; set `hard_paused_at`.

- [ ] **Step 4.4: Client handles 402** — in `assistant-chat.tsx`, surface a budget-exceeded message ("Your team's monthly assistant limit is reached — resets next month, or ask your admin to raise it"). The `useChat` `onError` / response status handling.

- [ ] **Step 4.5: Build + commit**

```bash
npm run build
git add src/app/api/assistant/chat/route.ts src/components/emails/assistant-budget-alert.tsx src/lib/assistant/budget.ts src/components/assistant/assistant-chat.tsx
git commit -m "feat(assistant): enforce monthly budget (402) + soft/hard cap admin alerts"
```

---

## Task 5 — Feedback (endpoint + library + UI)

**Files:** `src/lib/assistant/feedback.ts`, `src/app/api/assistant/feedback/route.ts`, `src/components/assistant/assistant-feedback-buttons.tsx`, `assistant-message.tsx` (modify)

- [ ] **Step 5.1: `feedback.ts`** — `submitFeedback({ messageId, rating: 1 | -1, comment? })`. Looks up caller via `getCurrentUser`, verifies the message belongs to a conversation owned by the caller's `employeeId`, upserts `assistant_feedback` (unique on `message_id, user_employee_id`).

- [ ] **Step 5.2: `POST /api/assistant/feedback`** — thin wrapper calling `submitFeedback`; Zod-validate body `{ messageId, rating, comment? }`; 401 if unauth.

- [ ] **Step 5.3: `assistant-feedback-buttons.tsx`** — 👍/👎 under each assistant message. On 👎, reveal an optional comment box. Posts to the endpoint, optimistic highlight, `trackAssistant({ name: "assistant_feedback_given", ... })` (event already typed in posthog-events.ts).

- [ ] **Step 5.4: Mount in `assistant-message.tsx`** — render `<AssistantFeedbackButtons messageId={message.id} />` on assistant (non-user) messages only, below the citations. Note: the message id must be the persisted DB id — confirm the streamed `UIMessage.id` matches what we persisted, OR thread the persisted id back. If they differ, key feedback by the streamed id and reconcile server-side by latest assistant message in the conversation. (Document whichever approach taken.)

- [ ] **Step 5.5: Build + commit**

```bash
npm run build
git add src/lib/assistant/feedback.ts src/app/api/assistant/feedback/route.ts src/components/assistant/assistant-feedback-buttons.tsx src/components/assistant/assistant-message.tsx
git commit -m "feat(assistant): per-message thumbs up/down feedback + comment"
```

---

## Task 6 — Conversation history (library + endpoint + UI)

**Files:** `src/lib/assistant/conversations.ts`, `src/app/api/assistant/conversations/route.ts`, `src/components/assistant/assistant-history.tsx`, `assistant-chat.tsx` + `assistant-panel.tsx` (modify)

- [ ] **Step 6.1: `conversations.ts`** — per-user (by `employeeId`):
  - `listConversations({ search?, limit })` → recent conversations with title + updated_at + message_count.
  - `getConversation(id)` → messages for that conversation (ownership-checked).
  - `deleteConversation(id)` → hard delete (cascade removes messages).
  - Title: derive from the first user message (first ~50 chars) if `title` is null.

- [ ] **Step 6.2: `GET/DELETE /api/assistant/conversations`** — `GET` (list or `?id=` for one), `DELETE ?id=`. Ownership enforced via `getCurrentUser().employeeId`.

- [ ] **Step 6.3: `assistant-history.tsx`** — a dropdown/drawer in the panel header: searchable list of past conversations, click to load (sets the chat's conversation id + hydrates messages via `getConversation`), trash icon to delete, "New chat" button.

- [ ] **Step 6.4: Wire into `assistant-chat.tsx`** — accept an optional `initialConversationId` + initial messages; `useChat` can be re-keyed when a past conversation is selected. Panel header (`assistant-panel.tsx`) mounts `<AssistantHistory />` next to the title/privacy controls (mind the close-button spacing — keep `pr-12`).

- [ ] **Step 6.5: Build + commit**

```bash
npm run build
git add src/lib/assistant/conversations.ts src/app/api/assistant/conversations/route.ts src/components/assistant/assistant-history.tsx src/components/assistant/assistant-chat.tsx src/components/assistant/assistant-panel.tsx
git commit -m "feat(assistant): conversation history — list, search, load, delete (per-user)"
```

---

## Task 7 — Founder analytics dashboard

**Files:** `src/actions/assistant-admin.ts`, `src/app/superadmin/assistant/page.tsx`

- [ ] **Step 7.1: `assistant-admin.ts`** — superadmin-gated (reuse `isSuperadminAuthenticated()`) read queries:
  - per-org: message count (30d), unique users, token totals, est. cost (via pricing), this-month budget usage vs cap.
  - top tool calls (from `assistant_tool_calls`): name, count, ok-rate, avg latency.
  - feedback summary: 👍 vs 👎 counts, recent 👎 comments.
  - All read-only; no message `content` shown by default.

- [ ] **Step 7.2: `/superadmin/assistant/page.tsx`** — model on `/superadmin/feedback/page.tsx` (auth guard + layout). Render: org usage table, tool-call breakdown, feedback summary, budget status. No raw conversation content (privacy) — counts + aggregates only.

- [ ] **Step 7.3: Build + commit**

```bash
npm run build
git add src/actions/assistant-admin.ts src/app/superadmin/assistant/page.tsx
git commit -m "feat(assistant): founder analytics dashboard at /superadmin/assistant"
```

---

## Task 8 — PII redaction + retention cron

**Files:** `src/lib/assistant/redact.ts`, `tests/assistant/redact.test.ts`, `src/app/api/cron/assistant-redact/route.ts`, `vercel.json`

- [ ] **Step 8.1: `redact.ts`** — `redactPII(text)`: replace emails → `<EMAIL>`, ₹/number amounts → `<AMOUNT>`, and known employee names if cheaply available (v1: emails + amounts + long digit sequences; name-redaction optional/deferred). Pure function, well-tested.

- [ ] **Step 8.2: Tests** `redact.test.ts` — emails, ₹ amounts, plain numbers, mixed text, idempotency (running twice = same). ~5 cases.

- [ ] **Step 8.3: Cron `assistant-redact/route.ts`** — `Bearer CRON_SECRET`. Two sweeps:
  - **Redact:** messages where `created_at < now()-14d` AND `pii_redacted = false` → set `content = redactPII(content)`, `pii_redacted = true`, `redacted_at = now()`. Batch (e.g. 500).
  - **Delete:** conversations (cascade messages) where `updated_at < now()-90d`. Batch.
  Return `{ redacted, deleted }`.

- [ ] **Step 8.4: Register cron in `vercel.json`** — `{ "path": "/api/cron/assistant-redact", "schedule": "0 7 * * *" }` (daily, 12:30pm IST). (Hobby = daily ok.)

- [ ] **Step 8.5: Run tests + build + commit**

```bash
npm test -- tests/assistant/redact.test.ts
npm run build
git add src/lib/assistant/redact.ts tests/assistant/redact.test.ts src/app/api/cron/assistant-redact/route.ts vercel.json
git commit -m "feat(assistant): PII-redaction + 90d-delete retention cron (14d→redact→90d→delete)"
```

---

## Task 9 — Smoke test, CLAUDE.md, PR

- [ ] **Step 9.1: Manual smoke** (`npm run dev`, demo org assistant enabled):
  - Send messages → confirm `assistant_budget` row accrues `cost_inr_paise`.
  - Temporarily set `hard_cap_inr_paise` low for the demo org → next message returns 402 + UI shows budget message.
  - 👍/👎 a reply → row in `assistant_feedback`; 👎 comment saved.
  - Open history dropdown → past conversations list, load one, delete one.
  - `/superadmin/assistant` (with superadmin cookie) → usage/cost/feedback render; no raw content leaks.
  - Hit `/api/cron/assistant-redact` with the Bearer secret → returns `{redacted, deleted}`; verify an old message's content got tokenised.
- [ ] **Step 9.2: Full suite** — `npm test` (pricing + budget + redact added) + `npm run lint` + `npm run build` all green.
- [ ] **Step 9.3: CLAUDE.md** — gotchas (budget IST-month rollup; 402 vs 429; redaction cron schedule; feedback message-id reconciliation) + extend the AI Assistant section to mark Phase 4 shipped + migration 027.
- [ ] **Step 9.4: Push branch `feat/assistant-phase-4` + open PR.**

---

## Self-review checklist

1. **Read-only preserved** — Phase 4 adds no LLM write tools. Feedback/history/budget are app-level CRUD on assistant's own metadata, not tenant HR data.
2. **Budget can't block unfairly** — cap=0 (starter/unset) always allows; business default ₹2000; per-org override supported; soft alert fires once.
3. **Privacy** — founder dashboard shows aggregates only, no raw message content by default; redaction cron enforces OQ-8 retention.
4. **Tenant isolation** — every conversation/feedback query scoped by `employeeId`/`orgId`; dashboard queries are superadmin-gated.
5. **Tests** — pricing, budget, redact unit-tested; existing 53 stay green.
6. **No placeholders** — every code block complete; the one open implementation detail (feedback message-id vs streamed UIMessage id, Task 5.4) is flagged to resolve at build time.

## Open implementation detail (resolve during Task 5)
The streamed `UIMessage.id` (client) may differ from the persisted `assistant_messages.id` (server, written in `onFinish`). Either (a) return the persisted id to the client via a stream annotation, or (b) key feedback by conversation + "latest assistant message" server-side. Decide when wiring Task 5.4; document the choice.
