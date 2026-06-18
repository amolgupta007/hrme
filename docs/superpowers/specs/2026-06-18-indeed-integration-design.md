# Indeed Integration — Design Spec

**Date:** 2026-06-18
**Module:** JambaHire (ATS, `/hire/*`) — Business tier
**Status:** Approved design, pending implementation plan
**Approach:** A (lean: sync state on `jobs` + inline `waitUntil` push + reconcile cron). Approach B (dedicated sync tables + raw inbound-event log) is a deferred follow-up.

---

## 1. Goal

Let a JambaHire org (a) push its job postings to Indeed and keep them in sync, and
(b) receive applicants from those postings directly into the existing candidates →
applications → pipeline flow. The integration must be buildable and testable **now**,
while live Indeed access is gated behind partner approval (see §10), and stay inert
until real credentials exist.

## 2. Scope decisions (locked)

| Decision | Choice |
|----------|--------|
| Scope | **Both halves** — outbound job posting + inbound applicant capture |
| Posting model | **JambaHR as the Indeed partner** (2-legged OAuth). Jobs posted on behalf of each org; one set of partner credentials; applicants fan out to the right org by job id |
| Sync trigger | **Opt-in per job** — admin flips a "Post to Indeed" toggle; status changes (pause/close) then propagate automatically |
| Build vs partner gate | **Full build now, feature-flagged + sandbox mode**; flip live when credentials land |
| Architecture | **Approach A** (this spec). B's raw-event table deferred |

**Out of scope (YAGNI):** Sponsored/paid Jobs API, per-org 3-legged OAuth, résumé
parsing/enrichment, Approach B's dedicated `indeed_job_syncs` / raw-event tables.

## 3. Indeed API surface used

- **Outbound — Job Sync API** (GraphQL): create/upsert/reactivate, get status, list,
  expire. Auth: OAuth 2.0 **2-legged** (server-to-server), scopes `employer_access` +
  `employer.hosted_job`. `jobPostingId` must be unique per ATS (we use `jobs.id`).
  Jobs do not auto-expire — expiry is an explicit call; reactivation allowed within
  30 days.
- **Inbound — Indeed Apply**: on apply, Indeed HTTP POSTs a JSON document to a
  per-job `postUrl` (our webhook). Payload includes candidate contact (name, email,
  phone), résumé (base64: `contentType`/`data`/`fileName`; `.pdf .doc .docx .txt .rtf`),
  and screener-question answers. Secured with `X-Indeed-Signature` (HMAC-SHA1 over the
  raw JSON body + a shared secret). Must return 2XX; Indeed retries with backoff.

## 4. Architecture & components

A new `src/lib/indeed/` module is the **single boundary** to Indeed; actions, the
webhook, and the cron talk only to it.

```
src/lib/indeed/
  client.ts              # real Job Sync GraphQL client (fetch) + OAuth token cache
  sandbox.ts             # stub client: no-ops outbound, returns deterministic fake ids, logs
  index.ts               # getIndeedClient() → real | sandbox by INDEED_LIVE + creds
  oauth.ts               # 2-legged token fetch + in-memory cache (expiry-aware)
  job-mapper.ts          # JambaHire Job → Indeed job payload (pure, unit-tested)
  application-mapper.ts  # Indeed webhook JSON → { candidate, application } (pure, unit-tested)
  signature.ts          # HMAC-SHA1 verify of inbound payload
  types.ts               # Indeed payload types + Zod schema for inbound

src/app/api/webhooks/indeed/route.ts              # inbound applicant capture
src/app/api/cron/indeed-sync-reconcile/route.ts   # daily drift/error re-push
src/actions/indeed.ts                             # toggleIndeedPosting + (dev) simulateIndeedApplication
```

The **mappers are pure functions** (no I/O) — the correctness core of the integration
lives there and is trivially unit-testable. `getIndeedClient()` returns the sandbox
unless `INDEED_LIVE=true` and credentials are present.

## 5. Data model & schema changes

One additive migration on `jobs` (next sequential migration number at implementation time):

| Column | Type | Purpose |
|--------|------|---------|
| `indeed_enabled` | `boolean not null default false` | per-job opt-in toggle |
| `indeed_job_id` | `text null` | Indeed's returned posting id (external ref) |
| `indeed_status` | `text null` | `pending` / `posted` / `expired` / `error` |
| `indeed_synced_at` | `timestamptz null` | last successful push |
| `indeed_sync_error` | `text null` | last error message (cron + admin UI) |

- **No new candidate/application columns.** Inbound maps onto existing `candidates`
  (`source='indeed'` — already a valid source value) and `applications`
  (`stage='applied'`, `answers` JSONB).
- **Dedup reuses `webhook_events`** keyed on Indeed's per-application id (same pattern
  as the Razorpay webhook: insert, catch `23505`).
- **Résumés** decode from base64 → upload to the existing `"documents"` storage bucket
  → `candidates.resume_url`.
- **Credentials in env** (JambaHR-as-partner = one set, not per-org → no encrypted-cred
  table): `INDEED_CLIENT_ID`, `INDEED_CLIENT_SECRET`, `INDEED_APPLY_SHARED_SECRET`,
  `INDEED_LIVE`.

## 6. Outbound job sync flow

**Trigger:** `toggleIndeedPosting(jobId, enabled)` (admin-only) sets `indeed_enabled`
and fires an initial push/expire. Thereafter `createJob` / `updateJob` /
`updateJobStatus` each fire a push **via `waitUntil`** *only when `indeed_enabled`* —
non-blocking, so the admin save returns instantly (the payslip/attendance pattern).

**`pushJobToIndeed(jobId)`:**
- **active job** → `job-mapper` builds the payload (title, HTML description, location,
  salary only when `show_salary`, employment type, org company name + contact,
  `custom_questions` → Indeed screener questions, `postUrl` = our webhook) → upsert via
  Job Sync API → store `indeed_job_id`, `indeed_status='posted'`, `indeed_synced_at`.
- **paused / closed / toggle turned off** → `expire` call → `indeed_status='expired'`.
- **failure** → `indeed_status='error'` + `indeed_sync_error`. Never throws into the
  user action — best-effort.

**Reconcile cron** `/api/cron/indeed-sync-reconcile` (daily, `Authorization: Bearer
CRON_SECRET`): re-pushes any `indeed_enabled` job where `indeed_status='error'` or the
job was updated after `indeed_synced_at` (drift). Safety net for missed `waitUntil`
pushes.

**UI:** a "Post to Indeed" toggle + status chip (Posted / Pending / Error) on the job
— in the `⋯` menu and the job dialog, beside the existing "Share on LinkedIn" item.
Business-tier + admin only (existing `requireJambaHireAccess` + `isAdmin` guards).

## 7. Inbound applicant capture flow

`POST /api/webhooks/indeed` (already Clerk-exempt via the `/api/webhooks(.*)` public
matcher in `middleware.ts`):

1. Read raw body (`req.text()`); verify `X-Indeed-Signature` HMAC-SHA1 against
   `INDEED_APPLY_SHARED_SECRET` → **401** on mismatch.
2. Zod-parse JSON robustly: missing fields → empty, ignore unknown fields.
3. **Dedup**: insert Indeed's application id into `webhook_events`; `23505` → return
   **200** (already processed).
4. **Resolve org + job**: look up `jobs` by `indeed_job_id` (carried in the payload) →
   `org_id` + `job_id`. Unknown id → **200** + log (don't trap Indeed in retries).
5. `application-mapper` → upsert candidate (`onConflict: org_id,email`,
   `source='indeed'`); decode résumé base64 → `"documents"` bucket → `resume_url`;
   build `answers` from screener responses.
6. Insert `applications` (`stage='applied'`). Duplicate apply (`23505` on the
   application unique constraint) → treat as success.
7. Return **2XX**. Unexpected error → **5XX** so Indeed retries with backoff.

The candidate then flows through the **existing pipeline, Kanban, and emails with zero
downstream changes** — indistinguishable from a careers-page apply, tagged
`source='indeed'`.

## 8. Sandbox, feature-flagging & testing

- **`INDEED_LIVE` flag:** unset/false → `getIndeedClient()` returns the **sandbox**
  (outbound calls log + return deterministic fake `indeed_job_id`s, no network). True +
  creds → real client. The feature/UI is also gated so it is invisible without the flag.
- **Dev-only `simulateIndeedApplication(jobId)`** server action → constructs a
  realistic signed payload and POSTs it to our own webhook, exercising the entire
  inbound path locally with no Indeed access.
- **Tests (vitest, matching repo style):**
  - `job-mapper` — field mapping, salary hidden when `!show_salary`, screener questions.
  - `application-mapper` — contact, résumé decode, screener answers, missing fields.
  - `signature` — valid / invalid HMAC.
  - webhook route — bad signature → 401, dedup → 200, unknown job → 200, happy path →
    candidate + application created.

## 9. Error handling principles

- **Outbound is best-effort:** never blocks admin actions; errors surface via the
  status chip + `indeed_sync_error` and are retried by the reconcile cron.
- **Inbound is idempotent:** signature → dedup → upsert; HTTP status drives Indeed's own
  retry (2XX success/handled, 401 bad signature, 5XX transient).

## 10. External prerequisite (not a code task)

Indeed access is partner-gated: signed Developer Agreement + formal "Become an Indeed
partner" application + technical review; API credentials (client id/secret) and the
Indeed Apply shared secret are issued only after approval (~6 weeks). The build ships
flagged-off and inert; going live = setting `INDEED_LIVE=true` + the four env vars once
approval lands.

## 11. Plan & feature gating

- Business tier only (JambaHire is Business-gated); admin/owner only.
- Reuses: `requireJambaHireAccess`, `isAdmin`, `createAdminSupabase`, `webhook_events`,
  the `"documents"` bucket, `candidates.source='indeed'`, the `submitApplication` core
  mapping, and the `waitUntil` + cron patterns already in the repo.

## 12. References

- Indeed — ATS integration with Indeed Apply: https://docs.indeed.com/indeed-apply/ats
- Indeed — Job Sync API guide: https://docs.indeed.com/job-sync-api/
- Existing patterns: `src/app/api/webhooks/razorpay/route.ts` (HMAC + `webhook_events`),
  `src/middleware.ts` (public matcher), `src/actions/hire.ts`
  (`createJob`/`updateJob`/`updateJobStatus`/`submitApplication`/`uploadApplicationFile`).
