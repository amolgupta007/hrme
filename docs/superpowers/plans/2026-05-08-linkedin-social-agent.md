# JambaHR LinkedIn Content Agent — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Claude-driven LinkedIn content agent for JambaHR's company page that generates posts + AI images on a schedule, queues them for founder approval inside `/superadmin`, and pushes approved posts to Buffer for publishing.

**Architecture:** Vercel cron triggers a Next.js route that uses `@anthropic-ai/sdk` to draft a post (caption + image prompt), calls a free image-gen API to render the visual, uploads the image to Supabase Storage, and inserts a row into a new `social_posts` table with status `pending_approval`. The founder reviews/edits/regenerates inside `/superadmin/social`, and on approval a server action calls the Buffer MCP-equivalent REST API (server-side; the MCP itself is a dev-time tool) to schedule the post on Buffer's queue for the JambaHR LinkedIn channel. Buffer publishes to LinkedIn at the queue slot.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres + Storage), Clerk (already gates `/superadmin`), `@anthropic-ai/sdk` (already installed), Cloudflare Workers AI Flux Schnell (free image gen — recommended, see §6), Buffer REST API for production posting (MCP for dev/admin only), Resend for approval email notifications, Vercel Cron.

---

## 1. Scope, Goals, Non-Goals

### In scope (v1)
- Single-tenant: JambaHR's own LinkedIn company page (founder-as-marketer use case). Lives under `/superadmin`, not `/dashboard`.
- LinkedIn-only target. Multi-platform (Twitter/Threads) deferred.
- Claude generates: post caption (≤2 800 chars LinkedIn limit), 3–6 hashtags, and a Flux-friendly image prompt (or selects from a small set of brand templates — see §6).
- Free-tier image gen via Cloudflare Workers AI Flux Schnell (one image per post, 1 :1 1024×1024).
- Founder-side approval UI in superadmin: list of pending drafts with caption preview, image preview, edit-in-place caption, regenerate button, approve, reject, schedule slot picker.
- After approval, the post is scheduled to Buffer's queue (default `addToQueue` — Buffer fills its own slot per the channel's posting schedule).
- A pluggable theme bank (markdown file `src/content/social-themes.md` or a `social_themes` table) seeds Claude with topics so consecutive posts don't collide.
- Email digest to `amol@jambahr.com` whenever a new draft lands or a scheduled post fails.

### Out of scope (defer)
- Per-customer-org social agents (multi-tenant). The schema isolates this org via a single `org_id` constant for now — easy to extend.
- Multi-platform (Twitter/IG/Threads).
- Analytics ingestion (impressions/CTR/likes from LinkedIn or Buffer).
- A/B testing variants of a single post.
- Comment/reply automation.
- Video posts.
- Threaded LinkedIn carousels (the Buffer schema supports `documents`, but that's v2).

### Constraints (must respect)
- **Buffer free tier**: 3 channels, **10 scheduled posts max** at any time, 100 ideas, 0 team members. Generation cadence must keep pending+scheduled ≤10 to avoid push errors.
- **Bootstrap budget**: zero new paid services. Cloudflare Workers AI free tier (10k requests/day) is the recommended image source.
- **Existing patterns**: Cron auth via `Bearer ${CRON_SECRET}` (matches all 6 existing crons), `createAdminSupabase()` for DB, Resend with `FOUNDER_EMAIL_FROM` for founder-side emails, react-email templates in `src/components/emails/`.

---

## 2. File Structure

### New files
| Path | Responsibility |
|------|---------------|
| `supabase/migrations/008_social_agent.sql` | Migration: `social_posts`, `social_themes`, `social_agent_runs` tables + storage bucket bootstrap. |
| `src/lib/social/buffer.ts` | Thin HTTP client for Buffer's REST API (`createPost`, `listPosts`, `deletePost`, `getChannel`). Server-side only. |
| `src/lib/social/anthropic.ts` | Wraps Anthropic SDK with the system prompt + theme seeding for caption/prompt generation. |
| `src/lib/social/image-gen.ts` | Cloudflare Workers AI Flux Schnell client → bytes → Supabase Storage upload → public URL. |
| `src/lib/social/themes.ts` | Read theme bank, pick next theme using `social_agent_runs.last_theme` to avoid repeats. |
| `src/lib/social/types.ts` | Shared TS types: `SocialPost`, `SocialPostStatus`, `BufferChannelConfig`, etc. |
| `src/actions/social.ts` | Server actions: `listPendingPosts`, `getPost`, `updateDraft`, `regenerateImage`, `regenerateCaption`, `approveAndSchedule`, `rejectPost`. All admin-only via existing superadmin auth. |
| `src/app/api/cron/social-agent-generate/route.ts` | Cron handler: generate next batch of drafts. |
| `src/app/api/cron/social-agent-publish-check/route.ts` | Cron handler: reconcile Buffer post statuses → DB (mark `published` / `failed`). |
| `src/app/superadmin/social/page.tsx` | Server page: pending queue + scheduled queue + recent published. |
| `src/app/superadmin/social/[id]/page.tsx` | Detail/edit page for a single draft. |
| `src/components/superadmin/social/social-queue.tsx` | Client wrapper rendering tabs for the three columns. |
| `src/components/superadmin/social/draft-editor.tsx` | Edit caption + alt text, regenerate buttons, approve modal. |
| `src/components/superadmin/social/post-preview-card.tsx` | LinkedIn-styled preview (avatar, name, caption, image). |
| `src/components/emails/social-draft-ready.tsx` | React Email: "X new drafts ready for review" digest. |
| `src/components/emails/social-publish-failed.tsx` | React Email: alert when Buffer reports an error. |
| `src/content/social-themes.md` | Seed theme bank (frontmatter list). |

### Modified files
| Path | Change |
|------|--------|
| `vercel.json` | Add 2 cron entries (`social-agent-generate`, `social-agent-publish-check`). |
| `src/app/superadmin/dashboard/page.tsx` | Add a "Social Agent" card linking to `/superadmin/social` with a count badge. |
| `.env.example` | Document `ANTHROPIC_API_KEY` (already used), `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_TOKEN`, `BUFFER_ACCESS_TOKEN`, `BUFFER_ORG_ID`, `BUFFER_LINKEDIN_CHANNEL_ID`, `SOCIAL_AGENT_ENABLED`. |
| `CLAUDE.md` | New section under "Cron Jobs" + a "Social Agent" subsection like Attendance has. |

### Storage
- New bucket: `social-media-images` (public-read, since LinkedIn fetches the image URL Buffer hands it).

---

## 3. Database Schema

`supabase/migrations/008_social_agent.sql` (run via Supabase SQL Editor — same convention as every other post-001 migration):

```sql
-- Themes: seed list the agent rotates through
CREATE TABLE social_themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,           -- short brief Claude reads
  audience TEXT NOT NULL,              -- e.g. "founder/HR-lead at 10-500 person company"
  example_hooks JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_social_themes_active_lastused ON social_themes (is_active, last_used_at NULLS FIRST);

-- Drafts and their lifecycle
CREATE TABLE social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval','approved','scheduled','publishing','published','failed','rejected')),
  platform TEXT NOT NULL DEFAULT 'linkedin' CHECK (platform IN ('linkedin')),
  theme_id UUID REFERENCES social_themes(id) ON DELETE SET NULL,
  caption TEXT NOT NULL,
  hashtags TEXT[] NOT NULL DEFAULT '{}',
  image_prompt TEXT,
  image_url TEXT,                      -- Supabase Storage public URL
  image_alt_text TEXT,
  buffer_post_id TEXT,                 -- Buffer's post id once scheduled
  buffer_channel_id TEXT,              -- the LinkedIn channel id (denormalised for forensics)
  scheduled_for TIMESTAMPTZ,           -- only set if customScheduled; null for queue mode
  error_message TEXT,
  approved_at TIMESTAMPTZ,
  approved_by TEXT,                    -- clerk user id
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  published_at TIMESTAMPTZ,
  generated_by_run_id UUID,            -- FK below
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_social_posts_status ON social_posts (status, created_at DESC);
CREATE INDEX idx_social_posts_buffer ON social_posts (buffer_post_id) WHERE buffer_post_id IS NOT NULL;

-- One row per cron tick, for forensics + theme rotation
CREATE TABLE social_agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by TEXT NOT NULL CHECK (triggered_by IN ('cron','manual')),
  drafts_generated INT NOT NULL DEFAULT 0,
  errors JSONB,                        -- array of {step, message}
  duration_ms INT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

-- updated_at trigger (function already exists in this DB per CLAUDE.md note)
CREATE TRIGGER trg_social_posts_updated
  BEFORE UPDATE ON social_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

**Why no `org_id`?** v1 is single-tenant (JambaHR itself). The agent generates posts for one LinkedIn page. If we extend to per-customer in v2, add `org_id UUID REFERENCES organizations(id)` and an RLS policy. RLS not enabled now since access is gated by superadmin auth and only the admin Supabase client touches these tables.

**Storage**: create the bucket via SQL or Supabase Dashboard:
```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('social-media-images','social-media-images', true)
  ON CONFLICT (id) DO NOTHING;
```

**Theme seed** (in same migration):
```sql
INSERT INTO social_themes (slug, title, description, audience) VALUES
  ('compliance-india', 'Indian HR compliance bites', 'Bite-sized explainers on PF, ESI, gratuity, PT, TDS — what owners get wrong', 'small-business owners and HR leads, India'),
  ('hiring-tips', 'Hiring a small team', 'Practical hiring playbooks for 10-50 employee orgs', 'first-time founders/HR'),
  ('hr-tooling', 'JambaHR feature spotlights', 'Show-not-tell of one feature with a real workflow', 'HR-curious owners evaluating tools'),
  ('founder-pov', 'Building JambaHR in public', 'Founder POV: what we shipped this week, what we learned', 'startup-curious LinkedIn audience'),
  ('payroll-explainers', 'Payroll the right way', 'Demystify CTC, payslips, statutory deductions', 'small-business owners running payroll themselves'),
  ('leave-policy-design', 'Designing leave policies', 'How to set sick/casual/earned leave for an Indian SMB', 'HR-leads and founders');
```

---

## 4. Server Actions API (`src/actions/social.ts`)

All actions:
- `"use server"` at top
- Auth via the superadmin cookie check (mirror what `src/app/superadmin/dashboard/page.tsx` does — see Task 1 step 1 below; we'll lift that into a `requireSuperadmin()` helper if it doesn't already exist).
- Use `createAdminSupabase()`.
- Return `ActionResult<T>`.
- `revalidatePath("/superadmin/social")` after mutations.

| Action | Args | Returns |
|--------|------|---------|
| `listPosts(filter: 'pending'\|'scheduled'\|'published'\|'rejected'\|'all')` | filter | `SocialPost[]` |
| `getPost(id)` | id | `SocialPost \| null` |
| `updateDraft(id, { caption?, hashtags?, imageAlt? })` | partial | `SocialPost` |
| `regenerateCaption(id, instruction?: string)` | id, optional steer | `SocialPost` |
| `regenerateImage(id, instruction?: string)` | id, optional steer | `SocialPost` |
| `approveAndSchedule(id, mode: 'queue'\|'customScheduled', dueAt?: ISO)` | | `SocialPost` (status → `scheduled`, `buffer_post_id` set) |
| `rejectPost(id, reason)` | | `SocialPost` (status → `rejected`) |
| `manualGenerate(themeId?: UUID)` | | `SocialPost` (creates one immediate draft for testing) |

Regenerate actions free-retry — no quota counter. Cloudflare free tier is generous enough that a few retries per post are fine; we'll log to `social_agent_runs` so abuse becomes visible.

---

## 5. Anthropic Prompt Strategy (`src/lib/social/anthropic.ts`)

- **Model**: `claude-sonnet-4-6` (better prose than the haiku used for JD generation, cheaper than opus). Caching disabled at v1 (each post is unique, low volume).
- **System prompt** (constant, defined in this file):
  - Brand voice: founder-led, "Indian HR", concrete > abstract, never AI-cliché ("In today's fast-paced world…").
  - Length cap: 1 200 chars (LinkedIn organic sweet spot, well under the 2 800 hard limit).
  - Structure: hook (≤80 chars) → 1-2 short paragraphs → 1 question or CTA.
  - Hashtag count: 3–6, lowercase camel like `#hrCompliance`.
  - Output format: strict JSON with `caption`, `hashtags[]`, `imagePrompt`, `imageAltText`.
- **User message**: theme description + last 3 captions for that theme (so Claude doesn't repeat itself) + optional instruction string from regenerate.
- **JSON parsing**: wrap in try/catch, retry once with "respond with JSON only" suffix; surface error in `social_agent_runs.errors`.

---

## 6. Image Generation (`src/lib/social/image-gen.ts`)

**Recommended: Cloudflare Workers AI Flux Schnell** via the REST API (no Worker required).

- Endpoint: `POST https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`
- Auth: `Authorization: Bearer ${CLOUDFLARE_AI_TOKEN}`
- Body: `{ prompt, num_steps: 4 }` → returns `{ result: { image: <base64 png> } }`
- Free tier: 10 000 neurons/day on the Workers Free plan; Flux Schnell ≈ 50 neurons per image → ~200 images/day budget. 1 post/day = ~30 posts/month. Plenty.
- Steps in `image-gen.ts`:
  1. Call Cloudflare → base64 → `Buffer.from(b64, 'base64')`.
  2. Upload to `social-media-images` bucket as `<post_id>.png` with `contentType: 'image/png'`.
  3. Get public URL via `supabase.storage.from('social-media-images').getPublicUrl(path)`.
  4. Return URL.

**Fallback / alternatives** (do NOT implement v1; recorded for clarifying-questions §13):
- **Pollinations.ai** — `https://image.pollinations.ai/prompt/{encoded}` — no API key, no quota, but no SLA, watermarks possible, sometimes 503. Acceptable as a free retry path.
- **Together.ai FLUX Schnell** — paid after $1 credit.
- **fal.ai FLUX Schnell** — $0.003 / image, very fast, $0 free credits (no longer truly free).

**Branding overlay (deferred to v2)**: a sharp/canvas pass to drop the JambaHR wordmark into the bottom-right. v1 ships raw Flux output and the founder visually approves before posting.

---

## 7. Buffer Integration (`src/lib/social/buffer.ts`)

The Buffer **MCP server** is great for dev-time inspection from this Claude Code session (we already verified `get_account` works). For **production code that the cron runs**, we use Buffer's REST API directly — MCP servers are not callable from Vercel runtime.

- Buffer Publish API base: `https://api.bufferapp.com/2/...` (legacy v2) **or** the GraphQL API at `https://api.buffer.com/graphql` (matches what the MCP introspects).
- Auth: `Authorization: Bearer ${BUFFER_ACCESS_TOKEN}` — generate at `https://publish.buffer.com/settings/api`.
- v1 uses GraphQL (matches MCP's surface; less endpoint sprawl). Helpers:
  - `createLinkedInPost({ channelId, text, imageUrl, imageAlt, mode, dueAt })` → `mutation createPost`.
  - `getPostStatus(postId)` → `query post(id)` to map Buffer's `status` (`scheduled`/`sent`/`error`) onto our `social_posts.status`.
  - `deleteBufferPost(postId)` → for "unschedule" support.
- All calls return `{ success: true, data } | { success: false, error }`; errors include rate-limit (429) and 4xx body.

**Buffer free-tier guard**: before calling `createPost`, action checks `select count(*) from social_posts where status in ('scheduled','publishing')` — if ≥ 9 (one slot free), reject with a clear "Buffer queue full — wait for next post to publish" error. This avoids the soft cap surprise.

---

## 8. Cron Routes

Pattern matches `onboarding-nudges` exactly (Bearer `CRON_SECRET` check, `createAdminSupabase`, structured response).

### `src/app/api/cron/social-agent-generate/route.ts`
- **Schedule**: `0 4 * * 1,3,5` UTC = 9:30 IST Mon/Wed/Fri (3 drafts/week → comfortably under Buffer's 10-slot cap).
- Logic:
  1. Insert `social_agent_runs` row, `triggered_by='cron'`.
  2. If `SOCIAL_AGENT_ENABLED !== 'true'` → return 200 no-op. (Kill switch.)
  3. Pick next theme: oldest `last_used_at` among `is_active = true`.
  4. Fetch last 3 captions for that theme (for prompt context).
  5. Call `anthropic.ts → generateDraft(theme, recentCaptions)`.
  6. Call `image-gen.ts → renderAndUpload(post.id, imagePrompt)`.
  7. INSERT `social_posts` with `status='pending_approval'`, theme_id, caption, hashtags, image_url, alt text, generated_by_run_id.
  8. UPDATE `social_themes.last_used_at = now()` for that theme.
  9. Send `social-draft-ready` email to `FOUNDER_EMAIL_FROM` recipient (`amol@jambahr.com`).
  10. UPDATE the run row with `drafts_generated`, `duration_ms`, `finished_at`.
- On any step error: log into `social_agent_runs.errors`, return 500 (Vercel retries automatically).

### `src/app/api/cron/social-agent-publish-check/route.ts`
- **Schedule**: `*/30 * * * *` (every 30 min) — reconciles Buffer state.
- Logic:
  1. Fetch `social_posts where status in ('scheduled','publishing')` AND `buffer_post_id is not null`.
  2. For each, call Buffer `getPostStatus`.
  3. Map: `sent` → `published` (set `published_at`), `error` → `failed` (set `error_message`, send `social-publish-failed` email).

### `vercel.json` additions
```json
{ "path": "/api/cron/social-agent-generate", "schedule": "0 4 * * 1,3,5" },
{ "path": "/api/cron/social-agent-publish-check", "schedule": "*/30 * * * *" }
```

---

## 9. Superadmin UI

Existing `/superadmin` is cookie-auth (see `src/app/api/superadmin/login/route.ts`). The new pages reuse that gate.

### `/superadmin/social/page.tsx` (server)
- Three sections in tabs: **Pending review** (default) · **Scheduled** · **History**.
- Each card shows: theme badge, caption excerpt (first 140 chars), image thumb, generated time, status pill.
- Click → `/superadmin/social/[id]`.
- Action buttons on the card: Quick approve (queue mode, no edits), Reject.

### `/superadmin/social/[id]/page.tsx` (server → client editor)
- Left column: editable caption (textarea, character counter), editable hashtags (chips), editable alt text.
- Right column: LinkedIn-styled preview card (`post-preview-card.tsx`) re-renders live as caption changes.
- Below: regenerate caption (with optional steer text), regenerate image (with optional steer text), approve (mode + optional dueAt), reject (with reason).
- Sticky footer: "Last saved" + "Approve & Schedule" CTA.

### `/superadmin/dashboard/page.tsx` (modify)
- Add a "Social Agent" card with: pending count, scheduled count, last published date, link to `/superadmin/social`.

---

## 10. Email Notifications

Two new react-email templates in `src/components/emails/`:

- `social-draft-ready.tsx` — "🆕 N new LinkedIn drafts" digest. Sent at end of every successful generate run. Lists each draft with theme + caption hook + a "Review" link to `/superadmin/social/<id>`.
- `social-publish-failed.tsx` — "❌ LinkedIn post failed" alert. Sent from publish-check cron when Buffer reports `error`. Includes `error_message`, link to draft, link to retry.

Both go from `FOUNDER_EMAIL_FROM` (`amol@jambahr.com`) to the same — single-recipient until v2.

---

## 11. Environment Variables

Add to `.env.local` and document in `.env.example`:

| Var | Source | Purpose |
|-----|--------|---------|
| `ANTHROPIC_API_KEY` | already exists | Claude content generation |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → Workers AI | Image gen |
| `CLOUDFLARE_AI_TOKEN` | Cloudflare → My Profile → API Tokens (Workers AI Read) | Image gen |
| `BUFFER_ACCESS_TOKEN` | publish.buffer.com/settings/api | Posting |
| `BUFFER_ORG_ID` | from `get_account` MCP call (already obtained: `69cf9e321c3d1fa55c0e7fa9`) | Posting |
| `BUFFER_LINKEDIN_CHANNEL_ID` | obtain via `list_channels` (Task 1) | Posting |
| `SOCIAL_AGENT_ENABLED` | manual | Kill switch (default `false` until first happy-path test) |
| `CRON_SECRET` | already exists | Vercel Cron auth |

---

## 12. Tasks (commit-by-commit)

> Each task ends in one commit. Run `npm run build` and `npm run lint` before each commit (existing build is already green per recent commits). DB tasks include the SQL the user runs in Supabase Dashboard.

### Task 1: Inspect Buffer state, capture channel ID

**Files:** none (read-only)

- [ ] Run Buffer MCP `list_channels(organizationId='69cf9e321c3d1fa55c0e7fa9')` and confirm a LinkedIn channel exists named for JambaHR. Record its `id` for `BUFFER_LINKEDIN_CHANNEL_ID` (will be added to env in Task 11).
- [ ] Run `get_channel(channelId)` and capture the posting schedule (timezone, days, slots). Note this in §1 of the plan if it changes the cadence.
- [ ] Run `list_posts({ organizationId, channelIds: [linkedInChannelId], status: ['scheduled','draft','needs_approval'] })` to confirm a clean queue.
- [ ] No commit — this is reconnaissance.

### Task 2: Migration `008_social_agent.sql`

**Files:**
- Create: `supabase/migrations/008_social_agent.sql`

- [ ] Write the migration with exact SQL from §3.
- [ ] Run via Supabase Dashboard SQL Editor (split into statements if needed; the trigger function `update_updated_at_column()` already exists per CLAUDE.md note 7).
- [ ] Verify three new tables + bucket exist via `select * from social_themes limit 1` (returns 6 seeded themes).
- [ ] Commit: `feat(social): add migration for social agent tables and theme seeds`.

### Task 3: Buffer client `src/lib/social/buffer.ts`

**Files:**
- Create: `src/lib/social/buffer.ts`
- Create: `src/lib/social/types.ts`

- [ ] Define `SocialPost`, `SocialPostStatus`, `BufferCreatePostArgs`, `BufferPostResponse` in `types.ts`.
- [ ] Implement `createLinkedInPost`, `getPostStatus`, `deleteBufferPost`, `getChannelInfo` using `fetch` against `https://api.buffer.com/graphql` with the GraphQL queries that mirror the MCP's `create_post`/`get_post`/`delete_post`/`get_channel`.
- [ ] Each helper returns `ActionResult<T>`. No throwing.
- [ ] Add a `try { fetch } catch` wrapper that maps to `{ success: false, error: 'Buffer unreachable' }`.
- [ ] Commit: `feat(social): add Buffer GraphQL client`.

### Task 4: Anthropic generator `src/lib/social/anthropic.ts`

**Files:**
- Create: `src/lib/social/anthropic.ts`
- Create: `src/content/social-themes.md` (optional — only if we move themes to file later; v1 reads from DB, so skip this file unless §13 Q9 redirects)

- [ ] Implement `generateDraft({ theme, recentCaptions, instruction? })`.
- [ ] System prompt as defined in §5.
- [ ] Strict JSON parsing with one retry.
- [ ] Returns `{ caption, hashtags, imagePrompt, imageAltText }` or `ActionResult` error.
- [ ] Commit: `feat(social): add Claude content generator`.

### Task 5: Image gen `src/lib/social/image-gen.ts`

**Files:**
- Create: `src/lib/social/image-gen.ts`

- [ ] Implement `renderAndUpload(postId, prompt)`.
- [ ] Call Cloudflare Workers AI REST endpoint per §6.
- [ ] Decode base64 → Buffer → Supabase Storage upload to `social-media-images/<postId>.png`.
- [ ] Return public URL.
- [ ] On Cloudflare error, return `ActionResult` error (cron route logs it; no Pollinations fallback in v1).
- [ ] Commit: `feat(social): add Cloudflare Flux image generator`.

### Task 6: Theme rotation `src/lib/social/themes.ts`

**Files:**
- Create: `src/lib/social/themes.ts`

- [ ] `pickNextTheme()` — selects active theme with oldest `last_used_at` (NULL first).
- [ ] `getRecentCaptionsForTheme(themeId, n=3)`.
- [ ] `markThemeUsed(themeId)`.
- [ ] Commit: `feat(social): add theme rotation helpers`.

### Task 7: Server actions `src/actions/social.ts`

**Files:**
- Create: `src/actions/social.ts`

- [ ] Lift `requireSuperadmin()` from existing superadmin pages into a small helper if it isn't already shared (or inline the cookie check matching `superadmin/dashboard/page.tsx`).
- [ ] Implement all 8 actions per §4.
- [ ] `approveAndSchedule` checks Buffer queue capacity (§7) before calling `createLinkedInPost`.
- [ ] `revalidatePath('/superadmin/social')` after every mutation.
- [ ] Commit: `feat(social): add server actions for draft management`.

### Task 8: Generation cron route

**Files:**
- Create: `src/app/api/cron/social-agent-generate/route.ts`

- [ ] Implement per §8.1, copying the auth pattern from `onboarding-nudges/route.ts`.
- [ ] Manual smoke test: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/social-agent-generate` (after `SOCIAL_AGENT_ENABLED=true`). Expect 1 row in `social_posts` with `status='pending_approval'` and an image URL.
- [ ] Commit: `feat(social): add generation cron route`.

### Task 9: Publish-check cron route + email templates

**Files:**
- Create: `src/app/api/cron/social-agent-publish-check/route.ts`
- Create: `src/components/emails/social-draft-ready.tsx`
- Create: `src/components/emails/social-publish-failed.tsx`

- [ ] Implement per §8.2.
- [ ] Wire `social-draft-ready.tsx` send-side into the generate cron (Task 8 — circle back if not done).
- [ ] Commit: `feat(social): add publish-check cron and email templates`.

### Task 10: Superadmin UI (list page)

**Files:**
- Create: `src/app/superadmin/social/page.tsx`
- Create: `src/components/superadmin/social/social-queue.tsx`
- Create: `src/components/superadmin/social/post-preview-card.tsx`
- Modify: `src/app/superadmin/dashboard/page.tsx`

- [ ] Server page fetches three sets (pending/scheduled/published-history) and passes to client tabs.
- [ ] Card with quick-approve and reject. Quick-approve uses queue mode, no dueAt.
- [ ] Add "Social Agent" card to superadmin dashboard.
- [ ] Commit: `feat(social): add superadmin social queue page`.

### Task 11: Superadmin UI (detail/edit page)

**Files:**
- Create: `src/app/superadmin/social/[id]/page.tsx`
- Create: `src/components/superadmin/social/draft-editor.tsx`

- [ ] Editable caption textarea with live character count (warn at 1 200, hard cap 2 800).
- [ ] Editable hashtags (chip input, lowercase enforcement).
- [ ] Regenerate caption + image buttons (open small modal for steer text).
- [ ] Approve modal: choose `Queue` (Buffer auto-slot) or `Specific time` (date+time picker, IST default).
- [ ] Reject modal: required reason textarea.
- [ ] Commit: `feat(social): add draft editor and approval flow`.

### Task 12: Wire env vars + vercel.json + docs

**Files:**
- Modify: `vercel.json`
- Modify: `.env.example`
- Modify: `CLAUDE.md` (Cron Jobs table + new "Social Agent" subsection)

- [ ] Add the two cron entries to `vercel.json`.
- [ ] Document all 7 env vars in `.env.example`.
- [ ] Add a "Social Agent" subsection to CLAUDE.md mirroring the Attendance one.
- [ ] Commit: `docs(social): wire crons, env vars, and CLAUDE.md`.

### Task 13: End-to-end smoke

**Files:** none

- [ ] Set `SOCIAL_AGENT_ENABLED=false` in production. Set `=true` only locally.
- [ ] Trigger `/api/cron/social-agent-generate` once locally → confirm draft + image.
- [ ] Open `/superadmin/social/<id>`, edit caption, regenerate image once, approve in Queue mode.
- [ ] Verify `social_posts.status='scheduled'` and `buffer_post_id` set; verify Buffer's web UI shows the post in the JambaHR LinkedIn queue.
- [ ] Wait for the publish-check cron (or hit it manually) → confirm transition to `published` once Buffer publishes.
- [ ] If everything green, set `SOCIAL_AGENT_ENABLED=true` in production env.
- [ ] No commit.

---

## 13. Risks, Edge Cases, Future Work

- **Buffer free-tier 10-slot cap.** Mitigation: capacity guard in `approveAndSchedule` + 3 generations/week cadence. Monitor: a Sentry alert if capacity-reject fires more than twice in a row.
- **Cloudflare Workers AI quota burn**: 200 imgs/day budget vs 1 img/post. Even with 5 regenerates per draft we're at < 5% of quota.
- **LinkedIn caption length**: hard cap is 3 000 chars. We cap at 2 800 to leave room for hashtag overflow.
- **Hashtag formatting**: LinkedIn renders camelCase well — stick with `#hrCompliance` not `#HRCompliance` or all-lowercase.
- **Image aspect ratio**: 1 :1 1024×1024 is safe for the LinkedIn feed. (16 :9 cinema feels native too — see Q11.)
- **Idempotency**: `social-agent-publish-check` is idempotent (re-checks `status` filter). The generate cron is *not* idempotent — Vercel retries on 500. We accept that and rely on the manual approval gate.
- **Theme exhaustion**: 6 themes × ~3 posts/week ≈ 18 posts before any theme repeats. Add more themes via `INSERT INTO social_themes …` (no migration needed).
- **Failure to parse JSON from Claude**: one retry then fail with logged error. Founder sees a "regenerate" button and a "raw output" toggle on the detail page.
- **No undo on Buffer publish**: once `published`, `deleteBufferPost` deletes from Buffer's history but does NOT unpublish from LinkedIn (LinkedIn-only delete). We expose a "Open in LinkedIn" link on `published` rows — manual delete via LinkedIn if needed.
- **Buffer MCP at runtime**: not callable from Vercel functions. We use the Buffer GraphQL REST API in production. The MCP stays a dev/admin tool for ad-hoc inspection.

---

## 14. Clarifying Questions

> The original brief was truncated mid-sentence around "LinkedIn Company Page" → "lng permissions, or just analytics" — I couldn't see the full 14-point structure you intended. I've drafted around the natural sections; flag any that should change.

1. **Brief truncation**: was there a specific 14-point structure you wanted me to follow? If yes, paste/re-paste it and I'll restructure.
2. **Single-tenant vs multi-tenant**: I assumed v1 is JambaHR's own LinkedIn page, gated behind `/superadmin` (founder-only). Confirm — or do you want every paying customer to have their own social agent on `/dashboard/social`?
3. **Buffer channel**: I have your org id (`69cf9e321c3d1fa55c0e7fa9`) but didn't run `list_channels` (you interrupted that call). Want me to run it now to capture the LinkedIn channel id, or hold until you're ready to set env vars?
4. **Image generation provider**: I'm recommending Cloudflare Workers AI Flux Schnell (truly free, 200 imgs/day). Memory shows you previously aligned on this. Confirm — or evaluate Pollinations.ai (no key, no quota, but flaky) instead?
5. **Image aspect ratio**: 1 :1 1024×1024 (safe, LinkedIn-native), 16 :9 1280×720 (more "thumbnail" feel), or 4 :5 1080×1350 (more vertical real estate)?
6. **Brand overlay**: ship raw Flux images in v1 and add a JambaHR wordmark in v2, or block v1 on overlay?
7. **Cadence**: I picked Mon/Wed/Fri 9 :30 IST (3 posts/week) to stay safely under Buffer's 10-slot cap. Acceptable, or daily, or 2/week?
8. **Approval mode**: Buffer's `addToQueue` (Buffer fills its next available slot per the channel's posting schedule) vs `customScheduled` (we pick a time)? I'm defaulting to queue mode with `customScheduled` available as an opt-in.
9. **Theme storage**: DB table (current plan, editable from `/superadmin/social/themes` later) vs markdown file in `src/content/social-themes.md` (git-versioned, redeploy to change)?
10. **Regenerate quota**: I assumed free-retry (no counter) since Cloudflare/Anthropic are cheap at this volume. Lock in, or add a soft cap (e.g., "5 regens per draft") for cost discipline?
11. **Approval notification channel**: email digest to `amol@jambahr.com` only (current plan), or also Slack/Telegram/in-app toast?
12. **Sentiment guardrails**: do you want a Claude self-review pass that filters out controversial/political content before drafts hit the queue, or trust the founder's manual approval as the only gate?
13. **`stripe_*` analogy**: should approved-but-not-yet-published posts count against any per-org limit, or are they just tracked freely for now?
14. **Naming**: `/superadmin/social` vs `/superadmin/marketing` vs `/superadmin/social-agent`?

---

> **Note**: this plan is intentionally exhaustive — designed to be executed commit-by-commit by a fresh agent or you. Once you confirm the answers above (especially Q1 if there was a specific structure I missed, Q2 single/multi-tenant, and Q4 image provider), I'll start executing from Task 1.
