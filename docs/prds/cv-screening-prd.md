# PRD: CV Screening — JambaHire Module

**Status:** Finalized v1 — ready to build
**Owner:** Amol
**Module:** JambaHire (ATS), Business tier
**Last updated:** 2026-06-19

---

## 1. Summary

Add an AI-powered CV screening capability to JambaHire that ingests candidate CVs, parses them into structured data, scores and ranks them against a job's requirements, and presents recruiters with an explainable, easy-to-scan shortlist. The goal: let an Indian SMB recruiter go from a pile of incoming CVs to a confident shortlist in minutes, with screened candidates flowing through the **existing** JambaHire pipeline (`applied → screening → shortlisted → …`) and onward to JambaHR onboarding.

Screening is the missing intelligence layer that decides who enters the pipeline and in what order. It does **not** introduce a parallel pipeline — it scores `applications` and surfaces the score on the existing Kanban.

## 2. Problem & Motivation

SMB recruiters (10–500 employees) review CVs manually: slow, inconsistent, fatigue-biased. Keyword filters miss strong candidates (transferable skills, non-standard phrasing) and pass weak ones. JambaHire has a pipeline but nothing intelligent ordering the front of it.

**Why now:** The embedding + extraction + LLM infrastructure already exists in this codebase for the AI HR Assistant and the JambaHire JD generator. CV screening is largely an assembly + prompt-engineering job on proven parts — not a new ML pipeline. Specifically reusable today:

| Capability | Existing implementation | Reuse for screening |
|---|---|---|
| PDF/DOCX → text | `src/lib/assistant/extract.ts` (`extractText`, `unpdf` + `mammoth`) | CV text extraction |
| Embeddings | `src/lib/assistant/embeddings.ts` (`embed`, Voyage `voyage-3-large`, 1024-dim) | CV + JD embeddings for Stage-1 ranking |
| Chunking | `chunkMarkdown(md, 600, 100)` | Long-CV chunking if needed |
| Idempotent ingest + background run | `src/lib/assistant/ingest-document.ts` (`ingestDocument`, wipe-first) + `waitUntil` | CV parse/embed on upload, non-blocking |
| LLM reasoning | `@anthropic-ai/sdk` in `src/actions/hire.ts:1426` (JD gen, `claude-haiku-4-5`) | Parse (Haiku) + score (Sonnet) |
| Prompt-injection guard | `<source>` / untrusted-data delimiter pattern (assistant) | Wrap CV text before it enters any prompt |
| LLM cost cap (INR) | `assistant_budget` + `tokensToInrPaise` (`src/lib/assistant/pricing.ts`) | Per-org monthly screening budget |
| Resume storage | `documents` Supabase bucket; Indeed résumés already land here | CV file storage |
| Single-file upload action | `uploadApplicationFile(formData)` (`hire.ts:1297`) — one file, 5 MB, → `documents` bucket, returns public URL | Extend to accept **multiple** files for bulk upload |
| Single candidate add | `createCandidate` (`hire.ts:332`) + `add-candidate-dialog.tsx` | Per-CV candidate/application row creation |

> **Starting point check (verified 2026-06-19):** Today JambaHire supports only **single** candidate add and **single** resume upload. There is **no** bulk/multi-file upload, **no** CV parsing, and **no** auto-creation of candidate/application rows from a CV. `bulkUpdateApplicationStage` is bulk *stage moves*, not uploads. Bulk ingestion + parsing is genuinely net-new (Phase 2) and extends the single-file plumbing above.

## 3. Goals & Non-Goals

### Goals
- Ingest CVs from **upload (single + bulk)** and from candidates **already in the pipeline** (referral apply, Indeed inbound, manual add).
- Parse each CV into structured candidate data (skills, experience, education, contact) + retain raw text.
- Produce an explainable **match score (0–100), fit tier, and per-requirement coverage** for each candidate **against a specific job** (i.e. per `application`).
- Give recruiters a ranked, scannable shortlist with a **human approval gate before any reject**.
- Surface the score on the existing Kanban; advancing/rejecting reuses the existing stage-transition machinery (`updateApplicationStage` / `rejectApplication`).
- Maintain tenant isolation (`org_id` + RLS) and an audit log of every scoring decision.

### Non-Goals (v1)
- Automated candidate rejection without human review.
- AI interviews / video assessment (separate future module).
- Model fine-tuning or training a custom classifier (zero-shot LLM only).
- Outbound sourcing / candidate search (inbound screening only).
- **Email-to-inbox ingestion** and a **public careers per-job apply form** — both are net-new infra (inbound email provider + per-job aliases; the apply form was scoped but never built). Deferred to a fast-follow (see §9, Phase 6). v1 ingests via upload + existing pipeline sources.

## 4. Users & Use Cases

- **Recruiter / Hiring owner:** uploads or receives a batch of CVs, reviews the ranked shortlist, approves who advances.
- **Admin / Founder:** configures screening criteria per job, reviews audit logs, tunes scoring weights.
- Access follows existing JambaHire rules: **Business tier**, gated by `requireJambaHireAccess()` (owner/admin); managers get read access only where the existing `getHireAdminContext` permits.

**Primary use case:** A recruiter posts a job, bulk-uploads (or accumulates) 80 CVs, and within minutes sees a ranked list with the top ~15 surfaced — each with a 0–100 score, a one-line "why," and a green/amber/red breakdown against the must-have requirements.

## 5. Functional Requirements

### 5.1 Ingestion (v1)
- **Single + bulk CV upload** (PDF, DOCX) from the job's screening view. Each upload creates/links a `candidates` row and an `applications` row at stage `applied` (or attaches to an existing candidate by email match).
- **Candidates already in the pipeline:** referral apply (`/apply/r/[token]`), Indeed webhook (`source='indeed'`), and manual admin add are screened in place — no re-upload needed if a `resume_url` exists.
- On arrival, every CV is parsed to structured JSON and embedded immediately via `waitUntil` (non-blocking, mirrors `ingestDocument`). Stored under `org_id` + RLS.
- CV files live in the `documents` bucket (or a dedicated `cv-uploads` bucket). **CVs are personal PII and MUST NOT be embedded into `doc_chunks`** (the assistant only indexes company-wide docs — gotcha #67). Screening keeps its own embedding store (§6).

### 5.2 Parsing
- Extract: contact info, skills, work experience (titles, employers, durations, scale/outcomes), education, certifications.
- Store both the structured fields (`parsed` JSONB) and the raw text.
- LLM parse uses **`claude-haiku-4-5`** (cheap, matches the existing JD-gen pattern). CV text is wrapped in the untrusted-data delimiter before prompting.
- Handle non-standard formats gracefully; scanned/image PDFs (no extractable text) and low-confidence parses get `parse_status='needs_review'` and are flagged in the UI rather than silently dropped.

### 5.3 Scoring — two-stage pipeline
- **Stage 1 (coarse, cheap):** Embed the job (`description` + parsed criteria) once with Voyage `voyage-3-large`; embed each CV once on ingest. Rank candidates per job by cosine similarity (pgvector). One CV-level vector per candidate is sufficient for ranking; chunk only if a CV exceeds the model's context.
- **Stage 2 (fine, LLM):** Only the top-k (configurable per job, default **20**) go to **`claude-sonnet-4-6`** for reasoning. A structured prompt scores each against the job's defined criteria and returns: **match score (0–100), fit tier (`strong` / `possible` / `weak`), per-requirement coverage, and a short rationale.** Output is requested as strict JSON (one retry on parse failure, mirroring the social/JD-gen pattern).
- **Criteria are configurable per job:** must-haves vs nice-to-haves, weighted. Criteria can be **auto-suggested by LLM-parsing `jobs.description`** (the JD-gen Anthropic call, run in reverse) and then edited by the recruiter.
- **Cost guard:** Stage 1 filters the full pool cheaply so the expensive Sonnet pass only reasons over the surviving top-k. Token spend is accrued per org against a monthly INR cap reusing `tokensToInrPaise`; hitting the cap pauses Stage 2 (Stage 1 ranking still works).

### 5.4 Recruiter UI
- Ranked candidate list per job with: match score (0–100), fit tier badge, one-line summary.
- Expandable rationale per candidate.
- Requirements-coverage view: green/amber/red against each must-have.
- **Human approval gate:** nothing is auto-rejected. The recruiter confirms advance (`applied`→`screening`/`shortlisted` via `updateApplicationStage`) or reject (`rejectApplication`, reason required, internal-only — never in the candidate email, gotcha #48).
- Score + tier render as a chip on the existing Kanban card and the application detail dialog.
- `needs_review` parses are visually distinct with a "re-parse" / "view raw" action.

### 5.5 Audit & feedback
- Every scoring decision is recorded: inputs hash, score, tier, coverage, rationale, **model version**, top-k, criteria snapshot, timestamp, actor. Re-scores append to the audit log.
- Periodic audit view comparing full pool vs shortlist to catch false positives/negatives.
- Criteria/weight adjustment re-runs scoring for that job (idempotent: re-score updates the result row + appends audit).

## 6. Technical Design

- **Stack:** Next.js 14 (App Router), Server Actions, Supabase (Postgres + RLS + pgvector), Voyage AI embeddings, Anthropic API (`@anthropic-ai/sdk`, direct — matching `hire.ts`). UI primitives in `src/components/ui` + `src/components/hire` (Radix + CVA + tailwind-merge; shadcn-compatible). All mutations are Server Actions in `src/actions/hire.ts` (or a new `src/actions/screening.ts`) returning `ActionResult<T>`.

- **Data model** (new tables; numbered **070+**, applied via Supabase SQL Editor / MCP per gotchas #4/#6; all `org_id`-scoped with the Clerk-JWT advisory RLS pattern — service role bypasses by design, gotcha #5):

  - **`cv_screening_profiles`** — one row per candidate (the parsed CV):
    `id, org_id, candidate_id (FK → candidates, UNIQUE), source_document_id (FK → documents, nullable), raw_text, parsed jsonb, parse_confidence numeric, parse_status text ('ok'|'needs_review'|'unsupported'), embedding vector(1024), model_version text, created_at, updated_at`.
  - **`job_screening_criteria`** — one row per job:
    `id, org_id, job_id (FK → jobs, UNIQUE), must_haves jsonb (array of {label, weight}), nice_to_haves jsonb, top_k int default 20, criteria_source text ('jd'|'manual'), enabled bool default false, created_at, updated_at`.
  - **`screening_results`** — one row per application (current result):
    `id, org_id, application_id (FK → applications, UNIQUE), candidate_id, job_id, stage1_similarity numeric, score int, tier text ('strong'|'possible'|'weak'), coverage jsonb, rationale text, model_version text, criteria_snapshot jsonb, screened_at, screened_by`.
  - **`screening_audit_log`** — append-only decision record:
    `id, org_id, application_id, action text, payload jsonb (inputs/score/rationale/model/top_k), actor_id, actor_type, created_at`.

  Keying `screening_results` on **`application_id`** (not loose `candidate_id`+`job_id`) is deliberate: `applications` is the canonical candidate↔job join and already carries `stage`. The same candidate applying to two jobs gets two independent results.

- **Flow:** ingest (upload / existing pipeline row) → extract text (`extractText`) → parse (Haiku, wrapped) → embed CV (Voyage) → store in `cv_screening_profiles` → Stage 1 cosine rank per job → Stage 2 Sonnet on top-k → write `screening_results` + `screening_audit_log` → surface in UI → recruiter approval → existing stage transition → pipeline.

- **Models:** parse = `claude-haiku-4-5-20251001`; score = `claude-sonnet-4-6`; embeddings = `voyage-3-large`. (Direct SDK with `ANTHROPIC_API_KEY` matches `hire.ts`; the AI Gateway `anthropic/…` string is an alternative if centralized observability is wanted.)

- **Config / deps:** `unpdf` + `mammoth` are already in `serverComponentsExternalPackages` (gotcha #69) and are runtime deps — no change. Env already present: `VOYAGE_API_KEY`, `ANTHROPIC_API_KEY`. pgvector is enabled (Supabase Pro).

## 7. Risks & Mitigations

- **Bias in AI screening:** standardized weighted criteria, mandatory human approval gate, full decision logging, periodic full-pool-vs-shortlist audits. **Never auto-reject.**
- **Prompt injection via crafted CVs** (CVs with hidden instructions): treat all CV content as untrusted data — wrap in the existing `<source>` delimiter, never as instructions; the parse/score prompts state CV text is data only. (Same posture the Supabase MCP and assistant doc tools already use.)
- **PII leakage:** CVs are personal data — isolated from the assistant's `doc_chunks`, stored encrypted-at-rest via Supabase, access-gated to admins. Decrypted/raw reads are auditable.
- **Parsing failures on odd formats / scanned PDFs:** `parse_status` flagging + manual-review fallback; no OCR in v1 (degrade, don't crash — mirrors gotcha #68).
- **LLM cost runaway on large pools:** Stage-1 embedding filter + per-org INR monthly cap; Stage 2 bounded by top-k.
- **Over-reliance on score:** UI frames score as decision support; recruiter always decides.

## 8. Success Metrics

- Time from CV batch received → shortlist confirmed (target: minutes).
- Recruiter agreement rate with top-ranked candidates.
- False-negative rate (strong candidates buried) via audits.
- **Cost per screen (INR)** — tracked against the monthly cap.
- Adoption: % of active JambaHire jobs with screening enabled.

## 9. Build Phasing

1. **Migrations + storage:** 4 tables (070–073) + CV storage decision; RLS policies.
2. **Ingestion + parsing:** upload (single + bulk) + parse-existing-pipeline-rows → `cv_screening_profiles` via `waitUntil`; reuse `extractText`; Haiku parse; `needs_review` flagging.
3. **Stage 1 scoring:** CV + JD embeddings (Voyage) + cosine ranking RPC (mirror `match_doc_chunks`).
4. **Criteria config:** per-job must/nice-to-have weights; auto-suggest from `jobs.description`.
5. **Stage 2 reasoning:** Sonnet scoring on top-k → `screening_results`; INR budget guard.
6. **Recruiter UI:** ranked list, tiers, coverage view, rationale, approval gate; Kanban chip; audit view.
7. **Pipeline + feedback loop:** wire approve/reject to existing transitions; criteria re-tune re-scores.

**Fast-follow (post-v1):** email-to-inbox per-job aliases; public careers per-job apply form (the never-built route); LinkedIn ingestion if a real flow lands.

## 10. Open Questions (with recommended defaults)

- **CV storage bucket:** reuse `documents` (with a non-company-wide category that ingestion skips) **[recommended]** vs a dedicated `cv-uploads` bucket. Either keeps CVs out of `doc_chunks`.
- **Criteria config UX:** LLM auto-suggest must-haves from the JD, recruiter edits **[recommended]** vs manual-only entry.
- **Top-k default:** 20, recruiter can expand on demand **[recommended]**.
- **Embedding granularity:** single CV-level vector for ranking **[recommended]**; chunk only on overflow.
- **Data retention for rejected candidates (DPDP/consent):** align to existing retention-cron precedent (assistant-redact, geo retention sweep). Proposed: retain rejected CVs N days then purge raw text + embedding, keep audit metadata. **N to be confirmed** (suggest 180 days).
- **Per-org monthly screening INR cap:** reuse `assistant_budget` semantics; default cap **TBD** (suggest mirroring Business-tier assistant cap).
