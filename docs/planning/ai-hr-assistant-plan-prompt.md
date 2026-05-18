# JambaHR Feature Planning: AI-Powered HR Assistant

## Mode: PLAN ONLY — NO CODE
Do not write or modify any code. Produce a complete plan document. Wait for my explicit approval before implementation.

## Pre-Planning Context
Before planning, read `CLAUDE.md` and `ROADMAP.md` to align with the existing JambaHR architecture, conventions, and phasing. The plan must fit cleanly into the current codebase patterns and roadmap.

## Feature Overview
Build an AI-Powered HR Assistant inside JambaHR that lets users ask natural language questions about their HR data, tenant documents, AND how to perform tasks in the app. Examples:
- "Who has unused leave?"
- "Which employees are due for a performance review?"
- "Show me employees on probation ending this month"
- "What's our leave policy for new parents?"
- "Summarize the latest HR circular"
- "How do I approve a leave request?"
- "Where do I add a new employee?"
- "How do I run payroll for this month?"

Three query modes, unified in one interface:
1. **Structured data Q&A** — over Supabase tables (employees, leaves, attendance, reviews, etc.) via tool/function calling
2. **Semantic document search** — over tenant-uploaded HR docs (policies, handbooks, circulars) via pgvector + Voyage AI embeddings (reuse the existing RAG stack)
3. **App task guidance / how-to** — step-by-step walkthroughs of JambaHR features, with deep links to the relevant page and (where possible) inline navigation

## Planning Deliverables — produce ALL of the following

### 1. Product & UX Plan
- Primary user personas (HR admin, manager, employee) and what each is allowed to ask
- Entry points in the app (sidebar nav, global command bar, dashboard widget — recommend one)
- Conversation UI design (chat layout, message bubbles, streaming, citations, source chips, suggested prompts, empty state, error states, loading skeletons)
- shadcn components to use, mobile responsiveness, dark mode considerations
- Citation UX — how table rows, document chunks, and help-doc steps are surfaced as evidence, click-to-expand
- **How-to UX** — numbered steps, screenshots/icons where useful, "Take me there" deep-link buttons that navigate the user to the right page (and ideally highlight the right control)
- Conversation history (persist per user? per org? retention policy?)
- Suggested-prompt chips per role (mix of data questions and how-to questions)
- Guardrails UX (out-of-scope, unauthorized employee data, feature not available on user's plan tier)

### 2. Architecture Plan
- High-level diagram (text/ASCII) showing: client → API route → orchestrator (Vercel AI SDK) → tools (SQL tools + vector search tool + app-help retrieval tool) → LLM → streamed response
- Model choice rationale (GPT-4 vs Claude vs hybrid — given existing Voyage AI + Vercel AI SDK stack, evaluate alternatives)
- Tool-calling design: list every tool the LLM can call, with input/output schema (e.g., `query_employees`, `get_leave_balance`, `search_documents`, `get_attendance_summary`, `search_app_help`, `get_feature_route`, etc.)
- **App help knowledge base** — design the source of truth for how-to content. Options to evaluate:
  - Authored markdown files in the repo, indexed into a separate pgvector namespace
  - A `help_articles` table with structured steps + route metadata
  - Hybrid: structured route registry + markdown content
  Recommend one with rationale. Include how new features get help content added (developer workflow).
- **Route registry** — every feature surface (page path, required role, plan tier, short description, deep-link params) so the LLM can produce accurate "go to X" answers and the UI can render real navigation buttons
- How structured queries are kept safe — no raw SQL from LLM; only parameterized tool functions with RLS enforcement
- How the RAG pipeline plugs in as one of the tools (tenant docs vs app-help are separate namespaces/collections)
- Streaming strategy (Vercel AI SDK `streamText` + tool calls)
- Caching strategy (prompt caching, embedding cache, query result cache, app-help is mostly cacheable since it's not tenant-specific)

### 3. Data & Multi-Tenancy
- All new tables needed (conversations, messages, tool_calls log, feedback, help_articles or equivalent, route_registry)
- RLS policies — every tool function must respect `clerk_org_id` and the user's role; app-help content is global (no tenant scoping) but answers must filter by the user's role/plan
- How to prevent cross-tenant data leaks via the LLM (defense in depth: tool layer + RLS + system prompt)
- PII handling — what gets logged, what gets redacted, retention

### 4. Security & Access Control
- Role-based query restrictions (employee can only ask about self; manager about their team; HR admin org-wide)
- How-to answers must respect role and plan tier — don't tell an employee how to approve leaves; don't tell a Starter-tier user how to use a Business-tier feature
- Prompt injection defenses (especially for tenant document content fed into context)
- Rate limiting per user/org
- Audit log of every question asked, tools invoked, and answer returned
- Cost guardrails (per-org monthly token budget, hard caps)

### 5. Tech Stack Additions
- New dependencies (Vercel AI SDK if not already, OpenAI SDK or Anthropic SDK, etc.)
- Env vars needed
- Any new Supabase extensions or migrations
- Reuse vs new — explicitly call out what reuses the existing pgvector + Voyage AI RAG stack vs what's new for app-help
- Developer workflow for keeping help content + route registry in sync with shipped features (e.g., a CI check, a CLAUDE.md rule, or a doc-as-code pattern)

### 6. Implementation Phases
Break into shippable phases. Suggested split:
- Phase 1: App task guidance (how-to) — highest immediate value, no tenant-data risk
- Phase 2: Document Q&A over tenant HR docs
- Phase 3: Structured data tools (employees, leaves, attendance)
- Phase 4: Conversation history + feedback loop
- Phase 5: Proactive insights ("3 employees have probation ending this week")
Estimate effort per phase.

### 7. Open Questions & Decisions Needed
List every decision you need from me before coding (model choice, conversation retention period, role permission matrix, help-content authoring workflow, whether "Take me there" should highlight UI elements, etc.).

### 8. Risks & Mitigations
Hallucinations (especially fabricating non-existent app features or wrong routes), cost runaway, latency, data leaks, bad UX from slow streaming, stale help content after UI changes, etc.

## Constraints
- Stack: Next.js 14 App Router, Supabase, Clerk (with Organizations), Tailwind, shadcn, Vercel, pgvector, Voyage AI, Vercel AI SDK
- Multi-tenant — clerk_org_id scoping on everything tenant-related; app-help is global
- Must fit the existing JambaHR codebase patterns (check CLAUDE.md)
- India SMB context — concise, fast, mobile-friendly

## Output Format
Write the plan to `docs/planning/ai-hr-assistant-plan.md` as a single markdown document I can review section by section. Use headings, tables where useful, and concrete examples (sample tool schemas, sample prompts, sample UI states including a how-to answer with deep-link button).

Wait for my approval on the plan before any code.
