# Indeed Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a JambaHire org push jobs to Indeed (Job Sync API) and receive applicants back into the existing candidates → applications pipeline, behind a feature flag and inert until partner credentials exist.

**Architecture:** Approach A — a single `src/lib/indeed/` boundary module (pure mappers + signature + client interface with real/sandbox swap), Indeed sync state stored on five new `jobs` columns, outbound push fired via `waitUntil` from existing job actions + a daily reconcile cron, inbound applicants captured at `/api/webhooks/indeed` reusing the `submitApplication` mapping. Spec: `docs/superpowers/specs/2026-06-18-indeed-integration-design.md`.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (admin/service-role client), Zod, vitest, Node `crypto`, `@vercel/functions` `waitUntil`.

## Global Constraints

- Next.js **14.2.x** — do NOT upgrade.
- All mutations are Server Actions in `src/actions/*` with `"use server"`; non-action logic (DB orchestration, secrets, PII) stays in plain `src/lib/*` modules (gotcha #85).
- DB access via `createAdminSupabase()` (service-role; bypasses RLS by design — gotcha #5).
- Migrations applied via Supabase MCP `apply_migration` / SQL Editor on Windows (gotcha #4); also commit the `.sql` file under `supabase/migrations/`.
- Candidate `source` value for Indeed applicants is exactly `"indeed"` (already a valid value).
- Webhook idempotency reuses the `webhook_events` table (insert id, catch Postgres error code `23505`).
- Résumé files go to the existing public `"documents"` Supabase Storage bucket.
- Tests: vitest, `import { describe, it, expect } from "vitest"`, files under `tests/indeed/`. Run with `npm test`.
- Cron routes require `Authorization: Bearer ${CRON_SECRET}` and are registered in `vercel.json`.
- Feature is gated by env `INDEED_LIVE` (`"true"` → real client; anything else → sandbox). UI gated by Business tier + admin (existing `requireJambaHireAccess` + `isAdmin`).
- No Co-Authored-By trailer in commit messages (user preference).

---

### Task 1: Migration — Indeed sync columns on `jobs`

**Files:**
- Create: `supabase/migrations/068_indeed_job_sync.sql`
- Modify: `src/actions/hire.ts:33-52` (the `Job` type)

**Interfaces:**
- Produces: `jobs.indeed_enabled` (bool), `jobs.indeed_job_id` (text|null), `jobs.indeed_status` (text|null), `jobs.indeed_synced_at` (timestamptz|null), `jobs.indeed_sync_error` (text|null); `Job` type gains the same five fields.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/068_indeed_job_sync.sql`:

```sql
-- 068: Indeed job-sync state (Approach A). Additive, idempotent.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS indeed_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS indeed_job_id text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS indeed_status text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS indeed_synced_at timestamptz;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS indeed_sync_error text;

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_indeed_status_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_indeed_status_check
  CHECK (indeed_status IS NULL OR indeed_status IN ('pending','posted','expired','error'));

CREATE INDEX IF NOT EXISTS idx_jobs_indeed_job_id ON jobs (indeed_job_id) WHERE indeed_job_id IS NOT NULL;
```

- [ ] **Step 2: Apply the migration**

Apply via Supabase MCP `apply_migration` (name `068_indeed_job_sync`) or the Dashboard SQL Editor. Verify:

Run (MCP `execute_sql`):
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name='jobs' AND column_name LIKE 'indeed%' ORDER BY column_name;
```
Expected: 5 rows — `indeed_enabled, indeed_job_id, indeed_status, indeed_synced_at, indeed_sync_error`.

- [ ] **Step 3: Extend the `Job` type**

In `src/actions/hire.ts`, add to the `Job` type (after `hiring_manager_id: string | null;`, before the closing `};` at line ~52):

```typescript
  // Indeed integration (migration 068) — null/false until org opts a job in
  indeed_enabled: boolean;
  indeed_job_id: string | null;
  indeed_status: "pending" | "posted" | "expired" | "error" | null;
  indeed_synced_at: string | null;
  indeed_sync_error: string | null;
```

(`listJobs` / `getJob` use `select("*")` and spread `...j`, so these populate automatically.)

- [ ] **Step 4: Typecheck + commit**

Run: `npx tsc --noEmit` (expect no new errors from this change; pre-existing errors are ignored per `next.config.js`).

```bash
git add supabase/migrations/068_indeed_job_sync.sql src/actions/hire.ts
git commit -m "feat(hire): add Indeed sync columns to jobs (migration 068)"
```

---

### Task 2: Indeed payload types + inbound Zod schema

**Files:**
- Create: `src/lib/indeed/types.ts`

**Interfaces:**
- Produces:
  - `type IndeedJobPayload` (outbound job shape).
  - `IndeedApplicationSchema` (Zod) + `type IndeedApplication = z.infer<typeof IndeedApplicationSchema>` (inbound).
  - `type IndeedScreenerQA = { question: string; answer: string }`.

> Field names follow Indeed's Job Sync / Indeed Apply v1.2 reference. The schema is tolerant (`.passthrough()`, optionals) so unknown/missing fields never throw — confirm exact names against Indeed's "Application data reference" at go-live; any drift is localized to this file.

- [ ] **Step 1: Write the types file**

Create `src/lib/indeed/types.ts`:

```typescript
import { z } from "zod";

/** Outbound: payload we send to the Job Sync API (create/upsert). */
export type IndeedJobPayload = {
  jobPostingId: string; // our jobs.id — unique per ATS
  title: string;
  description: string; // HTML
  employmentType: string; // mapped from our employment_type
  company: string; // org name
  location: { city: string | null; remote: boolean };
  salary: { min: number; max: number } | null; // null unless show_salary
  contact: { email: string };
  applyUrl: string; // careers page URL (human apply)
  postUrl: string; // our webhook — where Indeed POSTs applications
  screenerQuestions: { question: string; required: boolean }[];
};

export type IndeedScreenerQA = { question: string; answer: string };

/** Inbound: Indeed Apply POSTs this JSON to our webhook. */
export const IndeedApplicationSchema = z
  .object({
    id: z.string(), // Indeed's application id — our dedup key
    appliedOnMillis: z.number().optional(),
    job: z
      .object({
        jobId: z.string().optional(), // echoes our jobPostingId
        jobTitle: z.string().optional(),
        jobCompany: z.string().optional(),
        jobLocation: z.string().optional(),
        jobUrl: z.string().optional(),
      })
      .passthrough(),
    applicant: z
      .object({
        fullName: z.string().optional().default(""),
        email: z.string().optional().default(""),
        phoneNumber: z.string().optional().default(""),
        coverletter: z.string().optional().default(""),
        resume: z
          .object({
            file: z
              .object({
                contentType: z.string().optional(),
                data: z.string().optional(), // base64
                fileName: z.string().optional(),
              })
              .passthrough()
              .optional(),
            text: z.string().optional(),
          })
          .passthrough()
          .optional(),
        questions: z
          .array(
            z
              .object({ question: z.string().default(""), answer: z.string().default("") })
              .passthrough()
          )
          .optional()
          .default([]),
      })
      .passthrough(),
  })
  .passthrough();

export type IndeedApplication = z.infer<typeof IndeedApplicationSchema>;
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit` — expect no new errors.

```bash
git add src/lib/indeed/types.ts
git commit -m "feat(indeed): payload types + inbound Zod schema"
```

---

### Task 3: Inbound signature verification (HMAC-SHA1)

**Files:**
- Create: `src/lib/indeed/signature.ts`
- Test: `tests/indeed/signature.test.ts`

**Interfaces:**
- Produces: `verifyIndeedSignature(rawBody: string, signature: string | null, secret: string): boolean`.

- [ ] **Step 1: Write the failing test**

Create `tests/indeed/signature.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { verifyIndeedSignature } from "../../src/lib/indeed/signature";

const SECRET = "test-shared-secret";
const sign = (body: string) => createHmac("sha1", SECRET).update(body).digest("base64");

describe("verifyIndeedSignature", () => {
  it("accepts a correct signature", () => {
    const body = '{"id":"abc"}';
    expect(verifyIndeedSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const body = '{"id":"abc"}';
    expect(verifyIndeedSignature('{"id":"xyz"}', sign(body), SECRET)).toBe(false);
  });

  it("rejects a null/empty signature", () => {
    expect(verifyIndeedSignature("{}", null, SECRET)).toBe(false);
    expect(verifyIndeedSignature("{}", "", SECRET)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/indeed/signature.test.ts`
Expected: FAIL — cannot find module `signature`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/indeed/signature.ts`:

```typescript
import { createHmac, timingSafeEqual } from "crypto";

/** Verify Indeed Apply's X-Indeed-Signature: base64 HMAC-SHA1 over the raw body. */
export function verifyIndeedSignature(
  rawBody: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false;
  const expected = createHmac("sha1", secret).update(rawBody).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/indeed/signature.test.ts`
Expected: PASS (3 passing).

- [ ] **Step 5: Commit**

```bash
git add src/lib/indeed/signature.ts tests/indeed/signature.test.ts
git commit -m "feat(indeed): inbound HMAC-SHA1 signature verification"
```

---

### Task 4: Job mapper (JambaHire Job → Indeed payload, pure)

**Files:**
- Create: `src/lib/indeed/job-mapper.ts`
- Test: `tests/indeed/job-mapper.test.ts`

**Interfaces:**
- Consumes: `IndeedJobPayload` (Task 2).
- Produces: `mapJobToIndeed(job, ctx): IndeedJobPayload` where
  `job: { id; title; description; employment_type; location_type; location; salary_min; salary_max; show_salary; custom_questions }`
  and `ctx: { companyName: string; contactEmail: string; applyUrl: string; postUrl: string }`.

- [ ] **Step 1: Write the failing test**

Create `tests/indeed/job-mapper.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { mapJobToIndeed } from "../../src/lib/indeed/job-mapper";

const baseJob = {
  id: "job-1",
  title: "Backend Engineer",
  description: "<p>Build APIs</p>",
  employment_type: "full_time" as const,
  location_type: "remote" as const,
  location: "Bangalore",
  salary_min: 1000000,
  salary_max: 2000000,
  show_salary: true,
  custom_questions: [{ question: "Years of Node?", required: true }],
};
const ctx = {
  companyName: "Acme",
  contactEmail: "hr@acme.com",
  applyUrl: "https://jambahr.com/careers/acme",
  postUrl: "https://jambahr.com/api/webhooks/indeed",
};

describe("mapJobToIndeed", () => {
  it("maps core fields and the postUrl", () => {
    const p = mapJobToIndeed(baseJob, ctx);
    expect(p.jobPostingId).toBe("job-1");
    expect(p.title).toBe("Backend Engineer");
    expect(p.company).toBe("Acme");
    expect(p.postUrl).toBe(ctx.postUrl);
    expect(p.location.remote).toBe(true);
    expect(p.screenerQuestions).toEqual([{ question: "Years of Node?", required: true }]);
  });

  it("includes salary only when show_salary is true", () => {
    expect(mapJobToIndeed(baseJob, ctx).salary).toEqual({ min: 1000000, max: 2000000 });
    expect(mapJobToIndeed({ ...baseJob, show_salary: false }, ctx).salary).toBeNull();
  });

  it("treats non-remote location types as not remote", () => {
    expect(mapJobToIndeed({ ...baseJob, location_type: "on_site" }, ctx).location.remote).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/indeed/job-mapper.test.ts`
Expected: FAIL — cannot find module `job-mapper`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/indeed/job-mapper.ts`:

```typescript
import type { IndeedJobPayload } from "./types";

type JobInput = {
  id: string;
  title: string;
  description: string;
  employment_type: "full_time" | "part_time" | "contract" | "intern";
  location_type: "on_site" | "remote" | "hybrid";
  location: string | null;
  salary_min: number | null;
  salary_max: number | null;
  show_salary: boolean;
  custom_questions: { question: string; required: boolean }[];
};

type MapCtx = { companyName: string; contactEmail: string; applyUrl: string; postUrl: string };

const EMPLOYMENT_MAP: Record<JobInput["employment_type"], string> = {
  full_time: "FULL_TIME",
  part_time: "PART_TIME",
  contract: "CONTRACT",
  intern: "INTERNSHIP",
};

export function mapJobToIndeed(job: JobInput, ctx: MapCtx): IndeedJobPayload {
  const hasSalary =
    job.show_salary && job.salary_min != null && job.salary_max != null;
  return {
    jobPostingId: job.id,
    title: job.title,
    description: job.description,
    employmentType: EMPLOYMENT_MAP[job.employment_type],
    company: ctx.companyName,
    location: { city: job.location ?? null, remote: job.location_type === "remote" },
    salary: hasSalary ? { min: job.salary_min!, max: job.salary_max! } : null,
    contact: { email: ctx.contactEmail },
    applyUrl: ctx.applyUrl,
    postUrl: ctx.postUrl,
    screenerQuestions: job.custom_questions ?? [],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/indeed/job-mapper.test.ts`
Expected: PASS (3 passing).

- [ ] **Step 5: Commit**

```bash
git add src/lib/indeed/job-mapper.ts tests/indeed/job-mapper.test.ts
git commit -m "feat(indeed): pure job → Indeed payload mapper"
```

---

### Task 5: Application mapper (Indeed JSON → candidate + application, pure)

**Files:**
- Create: `src/lib/indeed/application-mapper.ts`
- Test: `tests/indeed/application-mapper.test.ts`

**Interfaces:**
- Consumes: `IndeedApplication`, `IndeedApplicationSchema` (Task 2).
- Produces: `mapIndeedApplication(payload: IndeedApplication, ids: { orgId: string; jobId: string }): MappedApplication` where
  `MappedApplication = { candidate: { org_id; name; email; phone; source: "indeed" }; resume: { buffer: Buffer; fileName: string; contentType: string } | null; application: { org_id; job_id; cover_note: string | null; answers: { question: string; answer: string }[] } }`.

- [ ] **Step 1: Write the failing test**

Create `tests/indeed/application-mapper.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { mapIndeedApplication } from "../../src/lib/indeed/application-mapper";
import { IndeedApplicationSchema } from "../../src/lib/indeed/types";

const ids = { orgId: "org-1", jobId: "job-1" };

function parse(raw: unknown) {
  return IndeedApplicationSchema.parse(raw);
}

describe("mapIndeedApplication", () => {
  it("maps contact, source, answers and cover note", () => {
    const payload = parse({
      id: "ind-app-1",
      job: { jobId: "indeed-xyz" },
      applicant: {
        fullName: "Asha Rao",
        email: "ASHA@EXAMPLE.com",
        phoneNumber: "+919812345678",
        coverletter: "Keen to join",
        questions: [{ question: "Years of Node?", answer: "5" }],
      },
    });
    const out = mapIndeedApplication(payload, ids);
    expect(out.candidate).toEqual({
      org_id: "org-1",
      name: "Asha Rao",
      email: "asha@example.com",
      phone: "+919812345678",
      source: "indeed",
    });
    expect(out.application.job_id).toBe("job-1");
    expect(out.application.cover_note).toBe("Keen to join");
    expect(out.application.answers).toEqual([{ question: "Years of Node?", answer: "5" }]);
    expect(out.resume).toBeNull();
  });

  it("decodes a base64 résumé file", () => {
    const data = Buffer.from("PDF-BYTES").toString("base64");
    const payload = parse({
      id: "ind-app-2",
      applicant: {
        email: "x@y.com",
        resume: { file: { contentType: "application/pdf", data, fileName: "cv.pdf" } },
      },
    });
    const out = mapIndeedApplication(payload, ids);
    expect(out.resume?.fileName).toBe("cv.pdf");
    expect(out.resume?.contentType).toBe("application/pdf");
    expect(out.resume?.buffer.toString()).toBe("PDF-BYTES");
  });

  it("handles missing optional fields without throwing", () => {
    const payload = parse({ id: "ind-app-3", applicant: { email: "z@z.com" } });
    const out = mapIndeedApplication(payload, ids);
    expect(out.candidate.name).toBe("");
    expect(out.application.cover_note).toBeNull();
    expect(out.application.answers).toEqual([]);
    expect(out.resume).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/indeed/application-mapper.test.ts`
Expected: FAIL — cannot find module `application-mapper`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/indeed/application-mapper.ts`:

```typescript
import type { IndeedApplication } from "./types";

export type MappedApplication = {
  candidate: {
    org_id: string;
    name: string;
    email: string;
    phone: string;
    source: "indeed";
  };
  resume: { buffer: Buffer; fileName: string; contentType: string } | null;
  application: {
    org_id: string;
    job_id: string;
    cover_note: string | null;
    answers: { question: string; answer: string }[];
  };
};

export function mapIndeedApplication(
  payload: IndeedApplication,
  ids: { orgId: string; jobId: string }
): MappedApplication {
  const a = payload.applicant;

  let resume: MappedApplication["resume"] = null;
  const file = a.resume?.file;
  if (file?.data) {
    resume = {
      buffer: Buffer.from(file.data, "base64"),
      fileName: file.fileName || `indeed-resume-${payload.id}`,
      contentType: file.contentType || "application/octet-stream",
    };
  }

  return {
    candidate: {
      org_id: ids.orgId,
      name: a.fullName ?? "",
      email: (a.email ?? "").trim().toLowerCase(),
      phone: a.phoneNumber ?? "",
      source: "indeed",
    },
    resume,
    application: {
      org_id: ids.orgId,
      job_id: ids.jobId,
      cover_note: a.coverletter ? a.coverletter : null,
      answers: (a.questions ?? []).map((q) => ({ question: q.question, answer: q.answer })),
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/indeed/application-mapper.test.ts`
Expected: PASS (3 passing).

- [ ] **Step 5: Commit**

```bash
git add src/lib/indeed/application-mapper.ts tests/indeed/application-mapper.test.ts
git commit -m "feat(indeed): pure inbound application mapper"
```

---

### Task 6: Indeed client (OAuth + Job Sync), sandbox, and selector

**Files:**
- Create: `src/lib/indeed/oauth.ts`
- Create: `src/lib/indeed/client.ts`
- Create: `src/lib/indeed/sandbox.ts`
- Create: `src/lib/indeed/index.ts`
- Modify: `.env.example` (append Indeed vars)

**Interfaces:**
- Consumes: `IndeedJobPayload` (Task 2).
- Produces:
  - `interface IndeedClient { upsertJob(p: IndeedJobPayload): Promise<{ indeedJobId: string }>; expireJob(jobPostingId: string): Promise<void>; }`
  - `getIndeedClient(): IndeedClient` (sandbox unless `INDEED_LIVE==='true'` and creds present).
  - `indeedIsLive(): boolean`.

> No test here — this is thin I/O glue over `fetch`. Correctness lives in the pure mappers (Tasks 4–5) and is exercised end-to-end by the sandbox + `simulateIndeedApplication` (Task 10). The real GraphQL call shape is verified against live Indeed at go-live.

- [ ] **Step 1: Add env vars to `.env.example`**

Append to `.env.example`:

```
# Indeed integration (partner-gated; feature inert unless INDEED_LIVE=true)
INDEED_LIVE=false
INDEED_CLIENT_ID=
INDEED_CLIENT_SECRET=
INDEED_APPLY_SHARED_SECRET=
```

- [ ] **Step 2: Write the OAuth helper**

Create `src/lib/indeed/oauth.ts`:

```typescript
// 2-legged OAuth token fetch + in-memory cache (employer_access, employer.hosted_job).
let cached: { token: string; expiresAt: number } | null = null;

const TOKEN_URL = "https://apis.indeed.com/oauth/v2/tokens";

export async function getIndeedAccessToken(): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAt > now + 60_000) return cached.token;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.INDEED_CLIENT_ID || "",
    client_secret: process.env.INDEED_CLIENT_SECRET || "",
    scope: "employer_access employer.hosted_job",
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Indeed OAuth failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: json.access_token, expiresAt: now + json.expires_in * 1000 };
  return json.access_token;
}

export function resetIndeedTokenCache() {
  cached = null;
}
```

- [ ] **Step 3: Write the real client**

Create `src/lib/indeed/client.ts`:

```typescript
import type { IndeedJobPayload } from "./types";
import { getIndeedAccessToken } from "./oauth";

export interface IndeedClient {
  upsertJob(p: IndeedJobPayload): Promise<{ indeedJobId: string }>;
  expireJob(jobPostingId: string): Promise<void>;
}

const GRAPHQL_URL = "https://apis.indeed.com/graphql";

async function call(query: string, variables: Record<string, unknown>) {
  const token = await getIndeedAccessToken();
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: any; errors?: { message: string }[] };
  if (!res.ok || json.errors?.length) {
    throw new Error(`Indeed Job Sync error: ${res.status} ${JSON.stringify(json.errors ?? "")}`);
  }
  return json.data;
}

// NOTE: GraphQL operation names/shape follow the Job Sync API guide; confirm against
// docs.indeed.com/job-sync-api at go-live. Localized to this file if it shifts.
export const realIndeedClient: IndeedClient = {
  async upsertJob(p) {
    const data = await call(
      `mutation Upsert($input: CreateSourcedJobsInput!) {
         jobs { sourceJobs(input: $input) { jobs { sourcedPostingId } } }
       }`,
      { input: { jobs: [indeedJobInput(p)] } }
    );
    const id =
      data?.jobs?.sourceJobs?.jobs?.[0]?.sourcedPostingId ?? p.jobPostingId;
    return { indeedJobId: String(id) };
  },
  async expireJob(jobPostingId) {
    await call(
      `mutation Expire($input: ExpireSourcedJobsInput!) {
         jobs { expireSourcedJobs(input: $input) { jobs { sourcedPostingId } } }
       }`,
      { input: { sourcedPostingIds: [jobPostingId] } }
    );
  },
};

function indeedJobInput(p: IndeedJobPayload) {
  return {
    sourcedPostingId: p.jobPostingId,
    title: p.title,
    description: p.description,
    employmentType: p.employmentType,
    companyName: p.company,
    location: { city: p.location.city, remote: p.location.remote },
    compensation: p.salary
      ? { min: p.salary.min, max: p.salary.max, currency: "INR" }
      : undefined,
    recruiterEmail: p.contact.email,
    applyUrl: p.applyUrl,
    indeedApply: { postUrl: p.postUrl, screenerQuestions: p.screenerQuestions },
  };
}
```

- [ ] **Step 4: Write the sandbox client**

Create `src/lib/indeed/sandbox.ts`:

```typescript
import type { IndeedClient } from "./client";
import type { IndeedJobPayload } from "./types";

// Deterministic, no-network stand-in used whenever INDEED_LIVE !== "true".
export const sandboxIndeedClient: IndeedClient = {
  async upsertJob(p: IndeedJobPayload) {
    console.log("[indeed:sandbox] upsertJob", p.jobPostingId, p.title);
    return { indeedJobId: `sandbox-${p.jobPostingId}` };
  },
  async expireJob(jobPostingId: string) {
    console.log("[indeed:sandbox] expireJob", jobPostingId);
  },
};
```

- [ ] **Step 5: Write the selector**

Create `src/lib/indeed/index.ts`:

```typescript
import type { IndeedClient } from "./client";
import { realIndeedClient } from "./client";
import { sandboxIndeedClient } from "./sandbox";

export function indeedIsLive(): boolean {
  return (
    process.env.INDEED_LIVE === "true" &&
    !!process.env.INDEED_CLIENT_ID &&
    !!process.env.INDEED_CLIENT_SECRET
  );
}

export function getIndeedClient(): IndeedClient {
  return indeedIsLive() ? realIndeedClient : sandboxIndeedClient;
}

export type { IndeedClient };
```

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit` — expect no new errors.

```bash
git add src/lib/indeed/oauth.ts src/lib/indeed/client.ts src/lib/indeed/sandbox.ts src/lib/indeed/index.ts .env.example
git commit -m "feat(indeed): OAuth + Job Sync client, sandbox, and live/sandbox selector"
```

---

### Task 7: Outbound sync orchestration (`pushJobToIndeed`)

**Files:**
- Create: `src/lib/indeed/sync.ts`

**Interfaces:**
- Consumes: `getIndeedClient` (Task 6), `mapJobToIndeed` (Task 4).
- Produces:
  - `pushJobToIndeed(jobId: string): Promise<void>` — loads the job + org, pushes or expires, writes `indeed_*` state. Best-effort (never throws).
  - `maybePushJobToIndeed(jobId: string): void` — fire-and-forget wrapper for `waitUntil`.

> Plain module (not `"use server"`) so `hire.ts`, the cron, and the action can all import it (gotcha #85 precedent).

- [ ] **Step 1: Write the module**

Create `src/lib/indeed/sync.ts`:

```typescript
import { createAdminSupabase } from "@/lib/supabase/server";
import { getIndeedClient } from "./index";
import { mapJobToIndeed } from "./job-mapper";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://jambahr.com";

/** Push (or expire) one job to Indeed and persist sync state. Never throws. */
export async function pushJobToIndeed(jobId: string): Promise<void> {
  const supabase = createAdminSupabase();
  try {
    const { data: job, error } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", jobId)
      .single();
    if (error || !job) return;
    if (!(job as any).indeed_enabled) return;

    const { data: org } = await supabase
      .from("organizations")
      .select("name, slug, settings")
      .eq("id", (job as any).org_id)
      .single();

    const orgRow = org as any;
    const slug = orgRow?.slug || (job as any).org_id; // organizations.slug — same key /careers/[slug] uses
    const contactEmail = orgRow?.settings?.hire_contact_email || "support@jambahr.com";
    const client = getIndeedClient();

    const status = (job as any).status as string;
    const shouldBeLive = status === "active";

    if (shouldBeLive) {
      const { indeedJobId } = await client.upsertJob(
        mapJobToIndeed(job as any, {
          companyName: orgRow?.name ?? "Company",
          contactEmail,
          applyUrl: `${APP_URL}/careers/${slug}`,
          postUrl: `${APP_URL}/api/webhooks/indeed`,
        })
      );
      await supabase
        .from("jobs")
        .update({
          indeed_job_id: indeedJobId,
          indeed_status: "posted",
          indeed_synced_at: new Date().toISOString(),
          indeed_sync_error: null,
        })
        .eq("id", jobId);
    } else {
      const postingId = (job as any).indeed_job_id || jobId;
      await client.expireJob(postingId);
      await supabase
        .from("jobs")
        .update({
          indeed_status: "expired",
          indeed_synced_at: new Date().toISOString(),
          indeed_sync_error: null,
        })
        .eq("id", jobId);
    }
  } catch (err) {
    console.error("[indeed] pushJobToIndeed failed", jobId, err);
    await supabase
      .from("jobs")
      .update({
        indeed_status: "error",
        indeed_sync_error: err instanceof Error ? err.message : String(err),
      })
      .eq("id", jobId);
  }
}

/** Fire-and-forget — safe to pass to waitUntil(). */
export function maybePushJobToIndeed(jobId: string): void {
  void pushJobToIndeed(jobId);
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit` — expect no new errors.

```bash
git add src/lib/indeed/sync.ts
git commit -m "feat(indeed): pushJobToIndeed sync orchestration"
```

---

### Task 8: Toggle action + wire push into job lifecycle

**Files:**
- Create: `src/actions/indeed.ts`
- Modify: `src/actions/hire.ts` (import + `waitUntil` in `createJob`, `updateJob`, `updateJobStatus`)

**Interfaces:**
- Consumes: `pushJobToIndeed`, `maybePushJobToIndeed` (Task 7).
- Produces: `toggleIndeedPosting(jobId: string, enabled: boolean): Promise<ActionResult<void>>` (admin-only).

- [ ] **Step 1: Write the toggle action**

Create `src/actions/indeed.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { waitUntil } from "@vercel/functions";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import { pushJobToIndeed } from "@/lib/indeed/sync";
import type { ActionResult } from "@/types";

export async function toggleIndeedPosting(
  jobId: string,
  enabled: boolean
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("jobs")
    .update({
      indeed_enabled: enabled,
      indeed_status: enabled ? "pending" : null,
      ...(enabled ? {} : { indeed_sync_error: null }),
    })
    .eq("id", jobId)
    .eq("org_id", user.orgId);
  if (error) return { success: false, error: error.message };

  waitUntil(pushJobToIndeed(jobId));
  revalidatePath("/hire/jobs");
  return { success: true, data: undefined };
}
```

- [ ] **Step 2: Wire push into `createJob` / `updateJob` / `updateJobStatus`**

In `src/actions/hire.ts`, add near the top imports:

```typescript
import { waitUntil } from "@vercel/functions";
import { maybePushJobToIndeed } from "@/lib/indeed/sync";
```

In `createJob`, after the insert succeeds and you have the new id (just before the final `return { success: true, data: { id } }`), add:

```typescript
  // best-effort Indeed sync (no-op unless the job is later opted in)
  waitUntil((async () => { maybePushJobToIndeed((data as any).id); })());
```

In `updateJob`, right before its successful `return`, add:

```typescript
  waitUntil((async () => { maybePushJobToIndeed(id); })());
```

In `updateJobStatus`, right before its successful `return`, add:

```typescript
  waitUntil((async () => { maybePushJobToIndeed(id); })());
```

(`pushJobToIndeed` early-returns unless `indeed_enabled` is true, so these are inert for non-opted-in jobs.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit` — expect no new errors. Confirm `@vercel/functions` is already a dependency:
Run: `node -e "require('@vercel/functions'); console.log('ok')"`
Expected: `ok` (used elsewhere per CLAUDE.md; if missing, `npm i @vercel/functions`).

- [ ] **Step 4: Commit**

```bash
git add src/actions/indeed.ts src/actions/hire.ts
git commit -m "feat(indeed): toggleIndeedPosting + push on job create/update/status"
```

---

### Task 9: Inbound webhook + ingest

**Files:**
- Create: `src/lib/indeed/ingest.ts`
- Create: `src/app/api/webhooks/indeed/route.ts`

**Interfaces:**
- Consumes: `IndeedApplicationSchema` (Task 2), `mapIndeedApplication` (Task 5).
- Produces: `ingestIndeedApplication(payload: IndeedApplication): Promise<"created" | "duplicate" | "unknown_job">` — resolves the job by `indeed_job_id`, upserts candidate, uploads résumé, inserts application.

- [ ] **Step 1: Write the ingest module**

Create `src/lib/indeed/ingest.ts`:

```typescript
import { createAdminSupabase } from "@/lib/supabase/server";
import { mapIndeedApplication } from "./application-mapper";
import type { IndeedApplication } from "./types";

export async function ingestIndeedApplication(
  payload: IndeedApplication
): Promise<"created" | "duplicate" | "unknown_job"> {
  const supabase = createAdminSupabase();

  const indeedJobId = payload.job?.jobId;
  if (!indeedJobId) return "unknown_job";

  const { data: job } = await supabase
    .from("jobs")
    .select("id, org_id")
    .eq("indeed_job_id", indeedJobId)
    .single();
  if (!job) return "unknown_job";

  const mapped = mapIndeedApplication(payload, {
    orgId: (job as any).org_id,
    jobId: (job as any).id,
  });
  if (!mapped.candidate.email) return "unknown_job"; // cannot dedupe without email

  // résumé → documents bucket (best-effort)
  let resumeUrl: string | null = null;
  if (mapped.resume) {
    const ext = mapped.resume.fileName.split(".").pop()?.toLowerCase() || "pdf";
    const path = `indeed/${(job as any).org_id}/${payload.id}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("documents")
      .upload(path, mapped.resume.buffer, {
        contentType: mapped.resume.contentType,
        upsert: true,
      });
    if (!upErr) {
      resumeUrl = supabase.storage.from("documents").getPublicUrl(path).data.publicUrl;
    }
  }

  const candidatePayload: Record<string, unknown> = { ...mapped.candidate };
  if (resumeUrl) candidatePayload.resume_url = resumeUrl;

  const { data: candidate, error: candErr } = await supabase
    .from("candidates")
    .upsert(candidatePayload, { onConflict: "org_id,email" })
    .select("id")
    .single();
  if (candErr || !candidate) throw new Error(candErr?.message || "candidate upsert failed");

  const { error: appErr } = await supabase.from("applications").insert({
    org_id: mapped.application.org_id,
    job_id: mapped.application.job_id,
    candidate_id: (candidate as any).id,
    stage: "applied",
    cover_note: mapped.application.cover_note,
    answers: mapped.application.answers,
  });
  if (appErr) {
    if ((appErr as any).code === "23505") return "duplicate";
    throw new Error(appErr.message);
  }
  return "created";
}
```

- [ ] **Step 2: Write the webhook route**

Create `src/app/api/webhooks/indeed/route.ts`:

```typescript
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { verifyIndeedSignature } from "@/lib/indeed/signature";
import { IndeedApplicationSchema } from "@/lib/indeed/types";
import { ingestIndeedApplication } from "@/lib/indeed/ingest";

export async function POST(req: Request) {
  const body = await req.text();
  const signature = headers().get("x-indeed-signature");
  const secret = process.env.INDEED_APPLY_SHARED_SECRET || "";

  if (!verifyIndeedSignature(body, signature, secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload;
  try {
    payload = IndeedApplicationSchema.parse(JSON.parse(body));
  } catch {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }

  // idempotency via shared webhook_events table
  const supabase = createAdminSupabase();
  const { error: dedupeError } = await supabase
    .from("webhook_events")
    .insert({ id: `indeed_${payload.id}`, event_type: "indeed.application" });
  if (dedupeError?.code === "23505") {
    return NextResponse.json({ status: "duplicate" }, { status: 200 });
  }

  try {
    const result = await ingestIndeedApplication(payload);
    // 200 for created/duplicate/unknown_job — none are retryable
    return NextResponse.json({ status: result }, { status: 200 });
  } catch (err) {
    console.error("[indeed] ingest failed", err);
    return NextResponse.json({ error: "ingest failed" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit` — expect no new errors.

```bash
git add src/lib/indeed/ingest.ts src/app/api/webhooks/indeed/route.ts
git commit -m "feat(indeed): inbound applicant webhook + ingest"
```

---

### Task 10: Reconcile cron + dev simulate action

**Files:**
- Create: `src/app/api/cron/indeed-sync-reconcile/route.ts`
- Modify: `vercel.json` (append cron entry)
- Modify: `src/actions/indeed.ts` (add `simulateIndeedApplication`)

**Interfaces:**
- Consumes: `pushJobToIndeed` (Task 7), `verifyIndeedSignature`/`IndeedApplicationSchema` indirectly via the webhook.
- Produces: cron `GET` handler; `simulateIndeedApplication(jobId: string): Promise<ActionResult<{ status: number }>>` (dev/sandbox only).

- [ ] **Step 1: Write the reconcile cron**

Create `src/app/api/cron/indeed-sync-reconcile/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { pushJobToIndeed } from "@/lib/indeed/sync";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminSupabase();
  // Re-push jobs that errored, never finished, or are enabled with no Indeed id yet.
  const { data: jobs } = await supabase
    .from("jobs")
    .select("id")
    .eq("indeed_enabled", true)
    .or("indeed_status.eq.error,indeed_status.eq.pending,indeed_job_id.is.null");

  let processed = 0;
  for (const j of jobs ?? []) {
    await pushJobToIndeed((j as any).id);
    processed++;
  }
  return NextResponse.json({ ok: true, processed });
}
```

- [ ] **Step 2: Register the cron in `vercel.json`**

Add to the `crons` array in `vercel.json` (after the `loi-expiry` entry):

```json
    {
      "path": "/api/cron/indeed-sync-reconcile",
      "schedule": "45 4 * * *"
    },
```

- [ ] **Step 3: Add the dev simulate action**

Append to `src/actions/indeed.ts`:

```typescript
import { createHmac } from "crypto";
import { indeedIsLive } from "@/lib/indeed/index";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/** Dev/sandbox only: POST a realistic signed application to our own webhook. */
export async function simulateIndeedApplication(
  jobId: string
): Promise<ActionResult<{ status: number }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };
  if (indeedIsLive()) return { success: false, error: "Disabled while INDEED_LIVE=true" };

  const supabase = createAdminSupabase();
  const { data: job } = await supabase
    .from("jobs")
    .select("indeed_job_id")
    .eq("id", jobId)
    .eq("org_id", user.orgId)
    .single();
  const indeedJobId = (job as any)?.indeed_job_id;
  if (!indeedJobId) return { success: false, error: "Job not synced to Indeed yet" };

  const payload = {
    id: `sim-${Date.now()}`,
    job: { jobId: indeedJobId },
    applicant: {
      fullName: "Test Candidate",
      email: `test+${Date.now()}@example.com`,
      phoneNumber: "+919800000000",
      coverletter: "Simulated Indeed application",
      questions: [{ question: "Why this role?", answer: "Testing the pipeline" }],
    },
  };
  const body = JSON.stringify(payload);
  const signature = createHmac("sha1", process.env.INDEED_APPLY_SHARED_SECRET || "")
    .update(body)
    .digest("base64");

  const res = await fetch(`${APP_URL}/api/webhooks/indeed`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-indeed-signature": signature },
    body,
  });
  return { success: true, data: { status: res.status } };
}
```

- [ ] **Step 4: Typecheck + commit**

Run: `npx tsc --noEmit` — expect no new errors.

```bash
git add src/app/api/cron/indeed-sync-reconcile/route.ts vercel.json src/actions/indeed.ts
git commit -m "feat(indeed): reconcile cron + dev simulate-application action"
```

---

### Task 11: UI — "Post to Indeed" toggle + status chip

**Files:**
- Modify: `src/components/hire/jobs-client.tsx` (menu item + chip)

**Interfaces:**
- Consumes: `toggleIndeedPosting` (Task 8); `Job.indeed_enabled` / `Job.indeed_status` (Task 1).

- [ ] **Step 1: Import the action and an icon**

In `src/components/hire/jobs-client.tsx`, add to the existing `@/actions/hire` sibling imports a new import line:

```typescript
import { toggleIndeedPosting } from "@/actions/indeed";
```

And add `Globe` to the existing `lucide-react` import (Indeed has no brand icon in lucide; `Globe` denotes "job boards"):

```typescript
// add Globe to the existing { ... } from "lucide-react"
```

- [ ] **Step 2: Add a handler inside the `JobsClient` component**

Add near the other handlers:

```typescript
  async function handleToggleIndeed(jobId: string, enabled: boolean) {
    setOpenMenuId(null);
    const res = await toggleIndeedPosting(jobId, enabled);
    if (res.success) {
      toast.success(enabled ? "Posting to Indeed…" : "Removed from Indeed");
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }
```

- [ ] **Step 3: Add the menu item + chip**

In the `⋯` dropdown, directly after the existing "Share on LinkedIn" `<a>` block (around line 228), add:

```tsx
                          {job.status === "active" && (
                            <button
                              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted w-full text-left"
                              onClick={() => handleToggleIndeed(job.id, !job.indeed_enabled)}
                            >
                              <Globe className="h-3.5 w-3.5" />
                              {job.indeed_enabled ? "Remove from Indeed" : "Post to Indeed"}
                            </button>
                          )}
```

And where the job card renders its title/meta row, add a status chip when enabled (place beside the existing status/location badges):

```tsx
                  {job.indeed_enabled && (
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border"
                      title={job.indeed_sync_error ?? undefined}
                    >
                      Indeed: {job.indeed_status ?? "pending"}
                    </span>
                  )}
```

- [ ] **Step 4: Verify build + manual check**

Run: `npm run build`
Expected: build succeeds (TS build errors are ignored per `next.config.js`, but the route/JSX must parse).

Manual (sandbox): open `/hire/jobs` as an admin on a Business org → an active job's `⋯` menu shows **Post to Indeed** → click → chip shows `Indeed: posted` (sandbox returns `sandbox-<id>`). Then trigger `simulateIndeedApplication` for that job → a new candidate (`source=indeed`) + application appears in the pipeline.

- [ ] **Step 5: Commit**

```bash
git add src/components/hire/jobs-client.tsx
git commit -m "feat(indeed): Post-to-Indeed toggle + sync status chip on jobs"
```

---

### Task 12: Full suite + docs

**Files:**
- Modify: `CLAUDE.md` (add an Indeed integration subsection under JambaHire)

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: all existing tests still pass + the 3 new Indeed test files (signature, job-mapper, application-mapper) pass.

- [ ] **Step 2: Document the module in CLAUDE.md**

Add a short "Indeed integration" subsection under the JambaHire section summarizing: the five `jobs.indeed_*` columns + migration 068; `src/lib/indeed/*` boundary; `INDEED_LIVE` sandbox vs live + the four env vars; webhook `/api/webhooks/indeed` (HMAC-SHA1 + `webhook_events` dedup); reconcile cron `45 4 * * *`; partner-gating prerequisite; and that applicants land as `source='indeed'` through the normal pipeline.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(hire): document Indeed integration module"
```

---

## Self-Review

**Spec coverage:**
- §3 outbound Job Sync → Tasks 4, 6, 7, 8. ✓
- §3 inbound Indeed Apply → Tasks 2, 3, 5, 9. ✓
- §4 component layout (`src/lib/indeed/*`, webhook, cron, action) → Tasks 2–10. ✓
- §5 schema (5 columns, `source='indeed'`, `webhook_events`, `documents` bucket, env creds) → Tasks 1, 6, 9. ✓
- §6 trigger (toggle + `waitUntil` + reconcile cron) → Tasks 8, 10. ✓
- §7 inbound steps (signature→dedup→resolve→upsert→insert; 401/200/5XX) → Task 9. ✓
- §8 sandbox/flag + `simulateIndeedApplication` + tests → Tasks 6, 10, 3–5. ✓
- §9 error handling (best-effort outbound, idempotent inbound) → Tasks 7, 9. ✓
- §11 gating (Business + admin) → Tasks 8, 11 (existing guards). ✓

**Placeholder scan:** No "TBD"/"add error handling"-style steps; every code step ships complete code. The two "confirm against Indeed docs at go-live" notes (GraphQL op shape in Task 6, field names in Task 2) are deliberate, isolated to one file each, and unavoidable until live credentials exist — not implementation gaps.

**Type consistency:** `IndeedClient` (`upsertJob`/`expireJob`) consistent across Tasks 6–7, 10. `mapJobToIndeed(job, ctx)` and `mapIndeedApplication(payload, ids)` signatures match between definition (Tasks 4–5) and callers (Tasks 7, 9). `IndeedApplicationSchema`/`IndeedApplication` consistent (Tasks 2, 5, 9, 10). `pushJobToIndeed`/`maybePushJobToIndeed` consistent (Tasks 7, 8, 10). `toggleIndeedPosting(jobId, enabled)` consistent (Tasks 8, 11). `Job.indeed_*` fields consistent (Tasks 1, 7, 11).

**Open assumptions — both verified during planning:**
1. Careers slug = top-level `organizations.slug` column (confirmed: `getPublicJobs` at `hire.ts:1251` selects `id, name, slug` and `/careers/[slug]` keys off it). `pushJobToIndeed` reads `org.slug`. The `hire_contact_email` setting is optional with a `support@jambahr.com` fallback.
2. `applications` has a unique constraint covering `(job_id, candidate_id)` — confirmed: `submitApplication` (`hire.ts`) catches Postgres `23505` and returns "already applied", so inbound dedupe behaves identically.
