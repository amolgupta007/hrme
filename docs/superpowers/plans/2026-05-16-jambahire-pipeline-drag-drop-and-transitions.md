# JambaHire Pipeline — Drag-Drop + Transition Automation

**Status:** Phase 6 decisions locked (2026-05-16). M1 cleared to start. One small clarification pending — see top of Phase 6.
**Author:** Claude (planning pass)
**Date:** 2026-05-16
**Scope:** Replace dropdown-based stage moves with drag-drop, add a `shortlisted` stage, and trigger automated side-effects (emails, UI unlocks, LOI flow, offer-gated hiring) on every stage transition.

---

## Phase 1 — Audit (current state)

### 1.1 Pipeline UI
**File:** `src/components/hire/pipeline-client.tsx` (client component, ~340 lines)

- 7 visible Kanban columns plus a hidden "Rejected" bucket (toggle: `showRejected`).
- `STAGES` constant (lines 11–19) defines the column order and per-column color tokens.
- Each card renders a `<select>` element (line ~331) bound to `app.stage`, calling `handleMove(app.id, newStage)` on `onChange`. Disabled for non-admins. Disabled on the "Hired" column (the select isn't rendered at all when `stage.value === "hired"`).
- Bulk move: top toolbar `<select>` + checkbox-driven `selected: Set<string>` → calls `bulkUpdateApplicationStage`.
- Filters: search, time-range (7/30/90/all), `showRejected` toggle. Funnel analytics chart at top.
- **No drag handlers anywhere.** No `draggable`, no `pointer` listeners, no dnd library.

### 1.2 Stage enum + schema
**File:** `src/actions/hire.ts:17–25`

```ts
// CURRENT
export type ApplicationStage =
  | "applied"
  | "screening"
  | "interview_1"
  | "interview_2"
  | "final_round"
  | "offer"
  | "hired"
  | "rejected";

// TARGET (M1 ships this — adds "shortlisted")
export type ApplicationStage =
  | "applied"
  | "screening"
  | "shortlisted"   // NEW — manager-approved, LOI pending/accepted
  | "interview_1"
  | "interview_2"
  | "final_round"
  | "offer"
  | "hired"
  | "rejected";
```

`applications` table is **not** in `001_initial_schema.sql`. Per `CLAUDE.md` it was created via the Supabase SQL Editor with these relevant columns:
- `stage` TEXT CHECK (in the enum above — **constraint must be dropped + recreated to allow `shortlisted`** in M1's migration)
- `rejection_reason` TEXT (set by `rejectApplication`)
- `updated_at` TIMESTAMPTZ (touched on every update)
- `job_id`, `candidate_id`, `org_id` (FK)

**No `stage_changed_at`, no `screener_id`, no `loi_*` columns yet.**

`offers` table (per audit grep at `src/actions/hire.ts:738`) already has `status TEXT CHECK (in 'draft'|'sent'|'accepted'|'declined'|'expired')` — this is what gates the `offer → hired` drag (Phase 3.5). No schema change needed for the offer-gate; M5 just adds `'revoked'` to the enum.

### 1.3 Server actions (mutation surface)
**File:** `src/actions/hire.ts`

| Function | Line | Guard | Side effects today |
|---|---|---|---|
| `updateApplicationStage(id, stage)` | 403 | `isAdmin` only | UPDATE row; `syncReferralFromApplicationStage(id, stage)`; `revalidatePath("/hire/pipeline")` |
| `bulkUpdateApplicationStage(ids[], stage)` | 452 | `isAdmin` | Batch UPDATE; parallel referral sync per id |
| `rejectApplication(id, reason)` | 429 | `isAdmin` | UPDATE stage='rejected' + reason; referral sync |
| `createOffer` / `sendOffer` / `respondToOffer` | 1039 / 1150 / 1261 | admin / public-token | `respondToOffer` with `accepted` writes `stage='hired'` to the linked application |

**No emails are sent on any stage change today.** Only `sendOffer` sends mail (via Resend + `offer-letter.tsx` template).

### 1.4 Email infrastructure
- **Provider:** Resend (`resend@^3.5.0`)
- **Helper:** `src/lib/resend.ts` exports `resend` client + three sender constants (`FROM_EMAIL`, `FOUNDER_EMAIL_FROM`, `NOREPLY_EMAIL_FROM`).
- **Templates:** `src/components/emails/*.tsx` — 21 React-Email templates already exist. Closest analogs for new work: `offer-letter.tsx`, `referral-invite.tsx`, `leave-status.tsx`.
- **Rendering:** `@react-email/render` (must stay in `next.config.js → serverComponentsExternalPackages`).
- **Pattern in hire.ts (line ~1180):** dynamic `await import("@/lib/resend")` inside the action, then `resend.emails.send({ from, to, subject, react: <Template ...props /> })`. This avoids loading React-Email on every cold start.

### 1.5 RBAC
- **`getCurrentUser()`** returns `{ role, plan, jambaHireEnabled, … }` (`src/lib/current-user.ts`).
- **`requireJambaHireAccess()`** (`src/lib/jambahire-access.ts`) — admin/owner only, gated on `organizations.settings.jambahire_enabled`. The `/hire/*` layout and every read action call it.
- **Stage moves today:** `isAdmin(user.role)` — owner|admin only. Managers/employees cannot move cards.
- **Interviewers** (any role): `requireInterviewerAccess(scheduleId?)` for `/dashboard/my-interviews` feedback. Slim projection — no salary, no other candidates.

### 1.6 Audit log
**None.** Confirmed via grep — no `audit_*`, `*_history`, `*_transitions`, `activity_log` files or tables. The only "history" surface is `updated_at` on each row.

### 1.7 Referral sync (already wired)
`src/lib/referrals/sync.ts` — `syncReferralFromApplicationStage(applicationId, newStage)` maps fine-grained stages → coarse referral statuses via `src/lib/referrals/status.ts`. Skips rows already in `rejected`/`withdrawn`/`hired`. Swallows errors. **This is the prior art for "any new transition side-effect" — same shape.**

### 1.8 Drag-drop library status
None installed. `package.json` has zero dnd packages.

---

## Phase 2 — Drag-Drop Plan

### 2.1 Library recommendation: `@dnd-kit/core` + `@dnd-kit/sortable`

**Why:**
- **Active maintenance** (react-beautiful-dnd is archived; @hello-pangea/dnd is a community fork). dnd-kit is the de-facto modern choice and Vercel-friendly.
- **Lean** — `@dnd-kit/core` is ~10kb gzipped. Tree-shakeable. Zero dependencies.
- **Accessible by default** — built-in keyboard sensor (Space to grab, arrows to move, Enter to drop), screen-reader announcements, focus management. react-dnd does not.
- **Pointer + touch sensors first-class** — `TouchSensor` handles mobile without extra config; supports `activationConstraint` (e.g. 5px drag to start) to avoid hijacking tap-to-open.
- **Works inside Radix Dialog / scrollable containers** — known pain point for legacy libs.

**Rejected alternatives:** react-dnd (heavy, HTML5 backend doesn't do touch well), @hello-pangea/dnd (works but archived upstream lineage, less flexible), native HTML5 DnD (no touch, brittle).

### 2.2 Component structure

```
PipelineClient (existing)
├── DndContext (sensors: Pointer + Touch + Keyboard, collisionDetection: closestCorners)
│   ├── For each stage:
│   │   └── DroppableColumn (id = `column:${stage.value}`)
│   │       └── SortableContext (items = card ids, strategy = vertical)
│   │           └── For each application:
│   │               └── DraggableCard (id = `card:${app.id}`)
│   └── DragOverlay  // floating preview while dragging
└── (existing toolbar, filters, bulk-move, funnel)
```

- **`DroppableColumn`** is a thin wrapper around the existing column `<div>` using `useDroppable({ id })`. No visual change unless `isOver`, then add a 2px primary-colored ring.
- **`DraggableCard`** wraps the current card markup via `useDraggable({ id })`. Adds a drag handle icon (`GripVertical` from lucide) at top-left, visible on hover. Whole card is draggable on desktop; on touch, only the handle is, to preserve tap-to-open.
- **`DragOverlay`** renders a stripped-down card preview (name + role) so cursor-relative positioning is correct even across scroll containers.

### 2.3 Optimistic update + rollback

```
onDragEnd(event):
  1. Parse from = event.active.data.current.fromStage, to = event.over.data.current.toStage.
  2. If from === to → no-op.
  3. Push optimistic patch: setApplications(prev => prev.map(a => a.id === id ? { ...a, stage: to } : a)).
  4. await updateApplicationStage(id, to).
  5. On success → toast + revalidatePath fires from server action.
  6. On failure → revert with the previously-captured prev state, toast.error(result.error).
```

Hold `prevApplications` in a ref to enable clean rollback even if the user has done other UI things in the ~200ms while the action is in flight.

### 2.4 Keep the dropdown? Yes — as fallback.

- **Mobile <480px** — Kanban becomes unusable horizontally. Show the dropdown.
- **Reduced motion / keyboard-only** — dnd-kit's keyboard sensor is solid, but the dropdown is a faster path for a screen reader. Keep it.
- **a11y label** — drag handle has `aria-label="Drag to move {{name}} to another stage"`. Cards are also focusable, with `aria-grabbed`.
- The dropdown stays exactly as today; drag-drop is additive.

### 2.5 Touch behavior

- `TouchSensor` with `activationConstraint: { delay: 200, tolerance: 8 }` — long-press initiates drag, short tap opens the candidate detail (when we add it). Prevents accidental drags when scrolling vertically inside a column.
- Horizontal column scroll uses native overflow — dnd-kit's auto-scroll handles cross-column drag near edges.

### 2.6 Bulk drag (optional, M1 stretch)

If `selected.size > 1` and the user starts dragging a selected card, treat it as a bulk move (use existing `bulkUpdateApplicationStage`). Visual: drag overlay shows "{N} candidates". If not selected, single-card move.

---

## Phase 3 — Transition Action Matrix

**Stage enum (target, M1):** `applied → screening → shortlisted → interview_1 → interview_2 → final_round → offer → hired`; plus terminal `rejected` reachable from any stage.

**Why insert `shortlisted` between `screening` and `interview_1`:** it captures the meaningful gate — "candidate has explicitly confirmed interest in interviewing." Before that, they're just internally screened. **The LOI is the bridge into `shortlisted`**: admin drags `screening → shortlisted`, system fires the LOI, card holds in `screening` with a `pending` chip, and only on candidate accept does the card actually land in `shortlisted`. Decline auto-routes to rejected. This way every card in the `shortlisted` column is a real interview candidate, not a maybe.

### 3.1 Forward transitions

**Note on confirmation:** every drop that triggers side-effects (emails, token generation, system notifications) opens the **Confirm Send popup** before any action fires. See Phase 4.4 for the popup's UX. The "Trigger actions" column below lists what gets queued for review — none of it goes out until the admin clicks Send.

| From → To | Trigger actions (queued — admin must click Send to fire) | Email template (all new unless noted; all use `NOREPLY_EMAIL_FROM` with reply-to `FROM_EMAIL`) | Manager UI unlocked | Required fields | Notifications |
|---|---|---|---|---|---|
| `applied → screening` | Assign screener (`screener_id` FK → employees). Set `screened_at = now()`. | **`candidate-ack.tsx`** — to candidate. "Thanks for applying, we're reviewing." | "Add screening notes" textarea on candidate detail. | `screener_id` (required; default to current admin). | None internal. |
| `screening → shortlisted` (LOI-gated) | **Popup actions:** (1) Generate LOI token + set `loi_expires_at = now() + 7d`. (2) Send LOI email to candidate. Admin can uncheck the email to skip (rare — e.g. they want to call the candidate first then send manually later). On Send: `loi_sent_at = now()`, `loi_status = 'pending'`. **Card stays in `screening` column visually** with chip. Auto-advance to `shortlisted` only when candidate clicks Accept on `/loi/[token]`. Decline → auto-move to `rejected`. | **`loi-invite.tsx`** — to candidate. Includes accept/decline link `/loi/[token]`. | None until LOI accepted. | `hiring_manager_id` must be set on the job — block drag with friendly toast if missing. | Admin toast on Send ("LOI sent — waiting for candidate"). |
| LOI accepted (system, not a drag) | Set `loi_status='accepted'`, `loi_responded_at = now()`, `shortlisted_at = now()`. Card auto-advances from `screening` to `shortlisted`. Notify hiring manager. | **`manager-shortlist-notify.tsx`** — to hiring manager. "{Candidate} accepted the LOI for {Role}, please schedule Interview 1." | "Schedule Interview 1" CTA enables on the shortlisted card. | — (system-triggered by public `respondToLOI` action) | Admin in-app toast ("Candidate accepted — moved to Shortlisted"). |
| `shortlisted → interview_1` | Pure scheduling state change. Set `interview_round_started_at = now()` (or rely on `interview_schedules` rows). | **`interview-invite.tsx`** (new) — to candidate, "interview is scheduled for {date/time}, here's the calendar link." Fires when the actual `interview_schedules` row is created via the existing scheduling dialog, NOT on the drag itself. | "Schedule Interview 1" dialog (already exists). | At least one `interview_schedules` row for round 1. | Email each scheduled interviewer (existing path). |
| `interview_1 → interview_2` | Require at least one submitted `interview_feedback` row for the prior interview with `recommendation ≠ 'reject'`. | **`interview-next-round.tsx`** — to candidate, "you're advancing to round 2". | "Schedule Interview 2" CTA appears on candidate detail. | Prior round must have ≥1 feedback row. | Email each scheduled interviewer for the new round when scheduled (existing path). |
| `interview_2 → final_round` | Same as above (feedback gate). | Reuse `interview-next-round.tsx` with `roundLabel="Final"`. | "Schedule Final Round" CTA. | Same. | Same. |
| `final_round → offer` | Auto-create a `draft` offer row pre-filled from job's `salary_min/max`. Open offer composer modal. | None on entry — `sendOffer` already sends `offer-letter.tsx`. | "Create Offer" composer auto-opens. | `ctc`, `joining_date`, `position_title` (validated by `createOffer`). | None until `sendOffer` is fired. |
| `offer → hired` | **Double-gated** — see Phase 3.5. On entry: kick off onboarding handoff (create `employees` row, seed leave balances, send welcome email). | **`hire-onboarding-handoff.tsx`** — to candidate, "welcome to the team, here's what's next." Internal: new **`internal-hire-notify.tsx`** to HR. | "Convert to Employee" wizard auto-opens (pre-filled). | All wizard fields valid + gates pass. | Hiring manager + HR. |

### 3.2 Backward transitions

**Policy:** Allowed, but require a comment (audit-only). No email. No UI unlocks (since downstream artifacts may exist).

| Move | Behavior |
|---|---|
| Any later stage → earlier stage | Modal: "Reason for moving back?" textarea required. Inserts row in `candidate_stage_transitions` with `direction='backward'` and the comment. **Does not delete** downstream artifacts (interviews, offers) — they stay; admin can manually cancel them. Stage UI on the card shows a warning chip "Moved back from {prev}" until next forward move. |
| `hired → anything` | Blocked. Hard rule. (Would leave a dangling `employees` row.) Admin must terminate the employee first. |
| `offer → final_round` (and offer was sent) | Modal warns: "Active offer will be revoked." On confirm, set `offers.status='revoked'` (new enum value) + send `offer-revoked.tsx` to candidate. |

### 3.3 Rejection (any → `rejected`)

| Source stage | Email template (stage-aware) | Required fields |
|---|---|---|
| `applied` / `screening` | **`rejection-early.tsx`** — neutral, brief. "Not moving forward at this time." | `rejection_reason` (internal, never in email). |
| `interview_1` / `interview_2` / `final_round` | **`rejection-postinterview.tsx`** — warmer, references "after our conversation". Optional: include 1-line feedback if `share_feedback=true`. | `rejection_reason` + optional `external_feedback` text. |
| `offer` | **`rejection-postoffer.tsx`** — rare path (admin rescinding). Requires extra confirmation modal. | `rejection_reason` + acknowledgment checkbox "I understand this revokes the offer." Also revokes the linked offer. |

All rejections: write `rejection_reason`, set `rejected_at = now()`, record transition row, send email. **Existing `rejectApplication(id, reason)` becomes the entry point** — extended to dispatch the right template based on `previous_stage`.

### 3.4 LOI flow specifics (new sub-system)

**Trigger:** drag from `screening → shortlisted`. The card visually stays in the `screening` column until the candidate responds — only on accept does it land in `shortlisted`. This means every card in the `shortlisted` column is a real, confirmed interview candidate.

**Schema additions on `applications`:**
- `loi_sent_at` TIMESTAMPTZ
- `loi_status` TEXT CHECK (in 'pending' | 'accepted' | 'declined' | 'expired') DEFAULT NULL
- `loi_responded_at` TIMESTAMPTZ
- `loi_token` TEXT UNIQUE — 32-byte URL-safe `crypto.randomBytes(32).toString('base64url')` (matches referrals/offers pattern)
- `loi_expires_at` TIMESTAMPTZ (default `loi_sent_at + 7d` — **hardcoded in v1**; per-org override deferred to v2 per decided Q4)

**Template:** `loi-invite.tsx` (new). Sent from `NOREPLY_EMAIL_FROM`, reply-to `FROM_EMAIL`. Body: role + company + "we'd like to invite you to the interview process" + two buttons → `/loi/[token]?response=accept` and `?response=decline`.

**Public route:** `src/app/loi/[token]/page.tsx` — no auth, no Clerk. Mirrors `/offers/[token]` pattern. Add `/loi(.*)` to public routes in `middleware.ts`. Renders accept/decline UI with a confirmation step. Submits to `respondToLOI(token, 'accepted'|'declined')` server action.

**Conditional CTA logic:**
- `loi_status IS NULL` and stage is `screening` → no chip; admin drag to `shortlisted` initiates the LOI.
- `loi_status = 'pending'` (card sits in `screening` visually) → amber "LOI pending — sent {{relative_time}}" chip. Card is **not draggable** to other columns while pending (admin must wait or explicitly cancel via context menu). Resend-LOI link visible to admin (rate-limited to once per 24h).
- `loi_status = 'accepted'` (card now in `shortlisted`) → green "LOI accepted ✓" chip stays for 7 days then fades.
- `loi_status = 'declined'` → card auto-moves to `rejected` with prefilled reason "LOI declined". Red "LOI declined" chip persists on the rejected card.
- `loi_status = 'expired'` → amber "LOI expired" chip on the screening card. Admin can resend (regenerates token + resets timer) or drag to rejected.
- `loi_status IS NULL` **and** stage is past `screening` → backfill state for pre-cutover rows. Treat as accepted (admin manually advanced). UI hides the LOI chip entirely.

**LOI cancel path:** admin right-click → "Cancel pending LOI" reverts `loi_status` to NULL, clears token. Useful if LOI was sent to the wrong candidate. Logged in audit table.

**Cron sweep:** existing `vercel.json` pattern. New `/api/cron/loi-expiry` daily — flip `pending → expired` where `loi_expires_at < now()`. Email admin on expiry.

### 3.5 Offer → Hired gates (new — per decided Q5 + Q7)

The `offer → hired` drag is **double-gated**. Both gates must pass; otherwise the drag is rejected on the server (and the client rolls back) with a friendly toast.

**Gate A — Offer status flag (Q5):**
- Reads `offers.status` for the offer linked to this application.
- Allow drag only when `offers.status === 'accepted'`.
- **Card chip rendering in the Offer column** — every card surfaces the offer state at a glance:
  - `draft` → grey "Offer draft" chip + "Send" CTA.
  - `sent` → blue "Offer sent {{relative_time}}" chip + "Resend" link.
  - `accepted` → green "Offer accepted ✓ Joining {{joining_date}}" chip — the only state where the Hired column accepts the drop.
  - `declined` → red "Offer declined" chip + suggest rejection.
  - `expired` → amber chip + "Renew" link (regenerates token, resets `sent_at`).
- **Multiple offers per application:** if more than one offer row exists (admin sent two), use the most recent non-declined one. (Edge case — flag in PR for review.)

**Gate B — Joining date (Q7):**
- Allow drag only when `today >= offer.joining_date` (compared in IST, day-precision — not timestamp).
- Block earlier with toast: `"Cannot mark hired until {{joining_date}}. Update the offer's joining date if you want to hire earlier."`
- **No upper bound** — if admin forgot and is marking hired 3 days late, that's fine. The audit log captures the actual hire date.
- "First day" interpretation: same as `joining_date`. No separate concept.
- Override: admin can edit the offer (changing `joining_date`) to unblock. No bypass flag — keeps the audit clean.

**Combined behavior:**
- Both gates pass → drag succeeds → onboarding handoff fires (see 3.1 row for `offer → hired`).
- Either gate fails → toast with the specific reason, card rolls back to Offer column. Audit row written with `direction='blocked'`, `comment='gate_a_offer_not_accepted'` or `'gate_b_before_joining_date'`. (Yes, we log blocked attempts — useful telemetry.)

**Card UI affordance:** when both gates pass, the Hired column shows a faint green outline on hover-with-drag-in-progress, signaling the drop is valid. When either gate fails, the column outline is amber, and the cursor preview shows a small lock icon. (Nice-to-have polish — defer to M5 if time-constrained.)

---

## Phase 4 — Architecture Calls

### 4.1 Sync vs async action execution → **two-step: sync stage update, deferred side-effects on Send**

- **Step 1 (sync, on drop):** stage update + audit row insert. ~50ms server, optimistic on client. Always runs.
- **Step 2 (deferred, on Send click in popup):** `dispatchStageTransitionSideEffects({ transitionId, enabledActions })` runs the user-confirmed subset. Awaited inside the popup so the user sees per-item success/fail.
- **Why split:** the user must approve every email (per Phase 4.4 confirm popup). The DB state should never be in limbo waiting on user attention — stage moves immediately and feels responsive; side-effects wait for explicit consent.
- **Failure mode:** if an action fails during Send (Resend down, bad email address), the popup shows a red ✗ next to that item with the error. User can dismiss or retry individually. The `candidate_stage_transitions.side_effects_status` JSONB captures the final state. A "Retry side-effects" admin action on the transition row in the activity timeline allows re-running failed items.
- **No floating promises** — every side-effect is awaited inside the popup's Send handler. Simpler error reporting, no orphan async work.

### 4.2 Email templates: hardcoded vs tenant-editable → **hardcoded for v1**

- Ship all 8 new templates as compiled React-Email components.
- Org name, role title, candidate name, dates are templated via props.
- **Defer** WYSIWYG/editable templates to a later milestone — none of our existing templates support this yet, and bolting it on for ATS-only would be inconsistent.
- Future direction: add an `email_templates` table keyed by `(org_id, template_key)`, fall back to hardcoded when no override. Not in scope here.

### 4.3 Idempotency on repeated drags

- Server action checks `existing.stage === newStage` early — returns `{ success: true }` with a "no-op" flag, no audit row, no side-effects.
- Drag-drop client also skips dispatch if `from === to`.
- Belt + braces: protects against double-fire from sloppy taps and from optimistic-rollback racing the user's next action.

### 4.4 Confirm-before-fire popup → **explicit Send dialog per drop** (no undo, no defer)

**Why this pattern:** the user's explicit call — every outbound side-effect (email, LOI generation, employee creation, cron scheduling) must be reviewed before it fires. Silent dispatch with undo was rejected in favor of preview-then-confirm. This trades a tiny bit of friction for high trust — admins always know exactly which emails went out.

**Flow:**
1. User drops card on a new column.
2. Stage update fires immediately (optimistic, persisted, audit row written).
3. If the transition has **zero side-effects** (e.g., backward move, system-internal change), no popup — just toast "Moved to {{stage}}".
4. If the transition has **side-effects**, a `<Dialog>` opens with:
   - **Title:** `Confirm send for {{candidate name}} → {{stage}}`
   - **Body:** itemized checklist of every queued action (one row per side-effect):
     - `[✓] Email candidate (loi-invite.tsx) — "Letter of Interest for {{role}}"`
     - `[✓] Generate LOI token (expires {{date}})`
     - `[✓] Notify hiring manager ({{name}})`
   - Each item has a checkbox (default checked). Admin can uncheck specific actions to skip them.
   - Optional `<textarea>` for a comment to attach to the audit row.
   - Two buttons: **Send** (primary) and **Skip all** (secondary, ghost variant).
5. **Send** → `dispatchStageTransitionSideEffects({ transitionId, enabledActions })` runs the checked items. Toast "Sent {{N}} actions". Each action's status written to `candidate_stage_transitions.side_effects_status` JSONB.
6. **Skip all** → no side-effects fire. Audit row updated with `side_effects_status: { skipped_by: '{{user_id}}', reason: '{{comment}}' }`. Toast "Stage updated. No emails sent."
7. **Dismiss (X / Esc / overlay click)** → treated as Skip all but with `reason: 'dismissed_without_confirmation'`.

**Bulk moves:** one consolidated popup. Body shows `Confirm send for {{N}} candidates → {{stage}}` with a collapsible per-candidate breakdown. Checkbox-tree: top-level checkbox toggles all instances of an action (e.g., uncheck "Email candidates" to skip all emails); per-candidate checkboxes available in the expanded view.

**System-triggered transitions (no popup):**
- LOI accept via public `/loi/[token]` → manager-shortlist-notify auto-fires. The admin already opted in when they sent the LOI; no second confirmation needed.
- LOI expiry cron → admin-notify auto-fires.
- LOI decline via public `/loi/[token]` → rejection auto-fires with the standard early-rejection template.
- These bypass the popup because there's no live admin user to interact with.

**Component:** `src/components/hire/confirm-transition-dialog.tsx` (new) — reusable. Takes `{ transitionId, candidateName, stageLabel, actions: Action[] }`. Renders the checklist, handles state, calls back into `dispatchStageTransitionSideEffects`.

**Idempotency:** once the popup is closed (Send or Skip), the transition is final. Re-dragging the same card back-and-forth creates new transition rows + new popups (each independent).

**`→ hired` exception:** the popup is replaced by the full convert-to-employee wizard (M5). The wizard is the confirmation step; no separate Send dialog.

### 4.5 Multi-tenant template overrides → **not in v1** (see 4.2)

### 4.6 `candidate_stage_transitions` audit table

```sql
CREATE TABLE candidate_stage_transitions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  application_id  UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  from_stage      TEXT,  -- nullable for the initial "applied" insert
  to_stage        TEXT NOT NULL,
  direction       TEXT NOT NULL CHECK (direction IN ('forward', 'backward', 'reject', 'undo', 'initial')),
  actor_id        UUID REFERENCES employees(id) ON DELETE SET NULL,  -- nullable for system/public-token actions
  actor_type      TEXT NOT NULL CHECK (actor_type IN ('admin','manager','system','candidate')),
  comment         TEXT,  -- required when direction='backward' or 'reject'
  side_effects_status JSONB NOT NULL DEFAULT '{}'::jsonb,
  undone_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cst_application ON candidate_stage_transitions(application_id, created_at DESC);
CREATE INDEX idx_cst_org ON candidate_stage_transitions(org_id, created_at DESC);
-- RLS: enable; admin/owner SELECT all in org; service role bypasses (matches every other JambaHire table).
```

Powers the activity feed (M2) and the per-candidate timeline view.

### 4.7 Per-role transition permissions

| Role | Forward | Backward | Reject | Drag UI? |
|---|---|---|---|---|
| owner / admin | All transitions, all stages | Yes (with reason) | Yes (with reason) | Yes |
| manager | Only on candidates for jobs they hire for (`jobs.hiring_manager_id = me`): `screening → interview_1`, `interview_1 → interview_2`, `interview_2 → final_round`. Cannot move into `offer` or `hired`. | No | No | Yes (constrained columns) |
| employee | None | No | No | No (no `/hire/*` access at all) |
| interviewer (any role) | None | No | No | No |

Adds **`jobs.hiring_manager_id` FK → employees** (new column). Today's check is admin-only — this is the first manager-level write surface in JambaHire and worth flagging.

---

## Phase 5 — Milestones (shippable increments)

Each milestone is a separate PR. Approval gates between milestones.

### M1 — Drag-drop + add `shortlisted` stage (UX + minimal schema)
**Scope:** Visual + interaction. Adds `shortlisted` to the enum. No new emails, no audit, no LOI yet, no transitions side-effects. Keep dropdown on all viewports (per decided Q2).
**Files:**
- Migration `012_application_stage_add_shortlisted.sql` — drop + recreate the `applications.stage` CHECK constraint to include `'shortlisted'`. Done via Supabase SQL Editor per project convention.
- `package.json` — add `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`
- `src/actions/hire.ts` — extend `ApplicationStage` union with `"shortlisted"`. No logic changes — `updateApplicationStage` accepts any valid stage.
- `src/components/hire/pipeline-client.tsx` — wrap in `DndContext`, add droppable wrappers, draggable wrappers, drag overlay, optimistic update + rollback. Add the `shortlisted` column between Screening and Interview 1 (color: warm yellow `bg-amber-50`/`bg-amber-200`).
- `src/components/hire/candidates-client.tsx` — handle the new stage value in the per-candidate stage display.
**Complexity:** S (~1.5 days — slightly up from original estimate due to enum migration + UI placement).
**Risk:** Touch behavior on real iOS. Need device test. Backfilling existing apps is a no-op (no current row uses `shortlisted`).
**Acceptance:**
- Desktop: card drag between columns updates stage, persists, optimistic.
- Mobile: dropdown still works on every card; drag works via long-press handle.
- a11y: keyboard sensor moves cards (Space → arrow keys → Space to drop).
- Failure of `updateApplicationStage` rolls back the card to original column.
- New `Shortlisted` column renders between Screening and Interview 1 with correct color and is empty for existing orgs.
- Admin-only (per decided Q11) — managers still see read-only kanban.

### M2 — Audit log + activity feed + bulk drag
**Scope:** `candidate_stage_transitions` table + write-on-transition + render timeline on the candidate detail drawer. Also pulls in bulk drag from Phase 2.6 (deferred from M1 per decided Q12).
**Files:**
- New migration `013_candidate_stage_transitions.sql` (run via Supabase SQL Editor)
- `src/actions/hire.ts` — `updateApplicationStage`, `bulkUpdateApplicationStage`, `rejectApplication` all write a transition row; new `getApplicationTransitions(applicationId)`
- `src/components/hire/application-timeline.tsx` — new component, vertical timeline (lucide `Clock` icons)
- Wire into existing candidate detail (`src/components/hire/candidates-client.tsx`)
- Bulk drag wiring in `pipeline-client.tsx` (dragging a selected card moves all selected; overlay shows count)
- Backfill script `scripts/backfill-stage-transitions.sql` — inserts one synthetic `direction='initial'` row per existing application at its current stage (per decided Q10)
**Complexity:** M (~2 days).
**Risk:** Backfill is a one-shot — run before deploying the timeline UI so the page doesn't render empty for legacy apps.
**Acceptance:** Every drag, drop, dropdown move, bulk move, and reject writes a row. Timeline renders in chrono order. Backward moves require a comment (modal). Bulk drag of N selected cards writes N transition rows + shows toast `Moved {N} candidates to {stage}`.

### M3 — Confirm Send popup + email infra + top 3 transition emails
**Scope:** Templates + dispatch helper + the confirm-before-fire popup + send the 3 highest-value emails. **No LOI yet, no employee creation.**
**Files:**
- `src/components/emails/candidate-ack.tsx`, `interview-next-round.tsx`, `rejection-early.tsx`, `rejection-postinterview.tsx`
- `src/components/hire/confirm-transition-dialog.tsx` (new) — Radix Dialog wrapping the checklist of queued actions. Per-item checkboxes (default checked), optional comment textarea, Send + Skip all buttons. Bulk variant supports checkbox-tree.
- `src/lib/hire/transitions.ts` (new) — `planStageTransitionSideEffects({ application, fromStage, toStage })` returns an `Action[]` (the queue presented to the admin). `dispatchStageTransitionSideEffects({ transitionId, enabledActions })` runs the user-confirmed subset. Idempotent. Writes per-item status to `candidate_stage_transitions.side_effects_status`.
- Wire `updateApplicationStage` + `bulkUpdateApplicationStage` + `rejectApplication` to **return** the planned action list to the client so the popup can render. Side-effects no longer auto-fire — they wait for the popup's Send.
- Update `pipeline-client.tsx` — on successful drop, open the popup with the planned actions. Toast-undo pattern from earlier draft is **dropped**.
**Complexity:** M (~2.5 days, up from 2 to account for the popup component).
**Risk:** UX feels heavier than today's silent dropdown — but trades for full auditability. Test with a real admin before locking copy.
**Acceptance:**
- Drag to Screening → popup shows `[✓] Email candidate (candidate-ack)`. Send fires the email. Skip leaves the stage updated, no email.
- Drag to Interview 2 → popup shows `[✓] Email candidate (interview-next-round)`. Same.
- Drag to Rejected from any stage → popup shows `[✓] Email candidate ({{stage-aware-template}})` + required `rejection_reason` textarea (form validation blocks Send until filled).
- Bulk drag of 5 candidates to Screening → one popup, top-level "Email candidates (5)" toggle, per-card breakdown in expandable accordion.
- Unchecking an action and clicking Send → audit row records `side_effects_status: { 'email-candidate': 'skipped_by_user' }`.
- Dismiss popup via Esc/X → treated as Skip all, audit notes `dismissed_without_confirmation`.
- Action failures (Resend down) → popup item shows red ✗ with error, others continue, Retry available from timeline.

### M4 — LOI public accept/decline + conditional scheduling UI
**Scope:** Full LOI sub-system (Phase 3.4). Also wires the `screening → shortlisted` manager-notify email.
**Files:**
- Migration `014_application_loi_columns.sql`
- `src/components/emails/loi-invite.tsx`, `manager-shortlist-notify.tsx`
- `src/app/loi/[token]/page.tsx` (public, unauthenticated)
- `middleware.ts` — add `/loi(.*)` to the public matcher
- `src/actions/hire.ts` — `respondToLOI(token, response)`; `sendLOI(applicationId)`; `updateApplicationStage` now handles `shortlisted → interview_1` by generating LOI token + sending invite instead of advancing directly. Card stays in `shortlisted` column with `loi_status='pending'` chip.
- `src/components/hire/pipeline-client.tsx` — chip rendering + disabled CTAs based on `loi_status`
- New cron `/api/cron/loi-expiry` + entry in `vercel.json`
**Complexity:** L (~3 days).
**Risk:** Behavioral change — admin dragging from Screening to Shortlisted no longer instantly advances. The card stays put with an amber "LOI pending" chip until the candidate responds. Needs a UX walkthrough in PR description with an inline screenshot.
**Acceptance:** Drag from Screening to Shortlisted triggers LOI email + card stays in Screening visually (with pending chip). Candidate clicks accept → card auto-advances to Shortlisted + manager-shortlist-notify email fires. Decline → card auto-moves to Rejected with reason "LOI declined" (no manager email). Expiry cron flips state to expired. LOI cancel (admin right-click) clears pending state.

### M5 — Offer-gated hiring + remaining transitions + permissions
**Scope:** Hiring-manager assignment, offer-status gate + joining-date gate on `offer → hired` (Phase 3.5), offer-revocation on backward, hire-onboarding-handoff (employee creation + leave seeding + Clerk invite per decided Q7), per-role permissions (per decided Q6), `screener_id`, manager-scoped drag.
**Files:**
- Migration `015_jobs_hiring_manager.sql` (adds `jobs.hiring_manager_id` FK → employees)
- Migration `016_applications_screener.sql` (adds `applications.screener_id`, `screened_at`, `shortlisted_at`, `rejected_at`)
- Migration `017_offers_revoked_status.sql` (adds `'revoked'` to the offer status enum)
- `src/components/emails/rejection-postoffer.tsx`, `hire-onboarding-handoff.tsx`, `offer-revoked.tsx`, `internal-hire-notify.tsx`
- `src/actions/hire.ts` — `convertOfferToHire(applicationId, payload)` (creates `employees` row, seeds leaves, sends welcome, fires Clerk invite). Hooked into the `offer → hired` drag. **Enforces both gates server-side** (offer.status === 'accepted' AND today >= joining_date in IST).
- `src/components/hire/convert-to-employee-dialog.tsx` (new wizard, pre-filled from offer + candidate)
- `src/components/hire/offer-status-chip.tsx` (new — surfaces draft/sent/accepted/declined/expired with relative time)
- `src/lib/hire/permissions.ts` — `canMoveStage(role, from, to, job, employeeId)` matrix per Phase 4.7
- `src/lib/hire/gates.ts` — `checkOfferToHiredGates(application, offer): { ok: true } | { ok: false, reason: 'gate_a' | 'gate_b', message: string }` (single source of truth, reused by drag server action AND the dialog's submit button)
- `src/components/hire/pipeline-client.tsx` — hide drag affordances per permissions matrix; render Offer-column chip; show lock/check visual on Hired column when dragging an Offer card
**Complexity:** L (~4 days, up from 3 due to offer-gate + date-gate + chip work).
**Risk:** Employee creation already has shape via the existing onboarding flow — reuse `addEmployee` + leave-policy seeding from Clerk webhook helpers. Don't duplicate. The Clerk invite path needs the org's Clerk org_id — already on `organizations.clerk_org_id`.
**Acceptance:**
- Manager logs in, sees only own-job candidates draggable in screening↔shortlisted↔interview columns.
- Drag to Offer auto-opens composer.
- Offer card chip correctly reflects `draft`/`sent`/`accepted`/`declined`/`expired` with relative time.
- Drag from Offer to Hired before `joining_date` → toast `"Cannot mark hired until {date}"` + rollback.
- Drag from Offer to Hired when `offer.status !== 'accepted'` → toast `"Candidate hasn't accepted the offer yet"` + rollback.
- Both gates pass → convert-to-employee wizard auto-opens, all fields prefilled. Submit → `employees` row created, leave balances seeded, welcome email sent, Clerk invite fired.
- Backward move from Offer (when `status='sent'`) prompts revoke confirmation + sends `offer-revoked.tsx`.
- `hired → anything` drag is hard-blocked with toast `"Terminate the employee first"`.

---

## Phase 6 — Decisions (locked 2026-05-16) + one remaining clarification

### Remaining clarification — please confirm before M1 starts

**Where does `shortlisted` sit?** Confirmed: inserted between `screening` and `interview_1`:

`applied → screening → shortlisted → interview_1 → interview_2 → final_round → offer → hired`

**LOI fires on `screening → shortlisted` drag** (per your 2026-05-16 clarification). Card visually stays in Screening with an amber "LOI pending" chip until the candidate responds. On accept → card lands in Shortlisted + hiring manager notified. On decline → card auto-moves to Rejected. This guarantees every Shortlisted card is a real, candidate-confirmed interview lead.

### Locked decisions

| # | Decision | Where it lands in the plan |
|---|---|---|
| 1 | Keep current 7 stages **and add `shortlisted`** (placement above, pending confirmation) | Phase 1.2 (enum), Phase 3 (matrix), M1 (migration) |
| 2 | Keep dropdown fallback on **all viewports** (not just mobile) | Phase 2.4, M1 acceptance |
| 3 | All new candidate emails from **`NOREPLY_EMAIL_FROM`** with reply-to **`FROM_EMAIL`** | Phase 3.1 table header, all template specs |
| 4 | LOI expiry **hardcoded 7 days** in v1; per-org override deferred to v2 (flagged in followups) | Phase 3.4, M4 |
| 5 | **Offer-status flag** on Offer cards + gate `offer → hired` drag on `offers.status === 'accepted'` | Phase 3.5 Gate A, M5 |
| 6 | Manager scope by **`jobs.hiring_manager_id`** (explicit FK column) | Phase 4.7, M5 |
| 7 | Auto-create `employees` row + Clerk invite on hired; **`offer → hired` drag gated on `today >= offer.joining_date`** (IST, day-precision) | Phase 3.5 Gate B, M5 |
| 8 | Audit table RLS — copy `009_jambahire_rls.sql` pattern | Phase 4.6, M2 migration |
| 9 | **Confirm Send popup** per drop — explicit checklist + Send/Skip buttons; replaces the earlier defer-and-undo pattern | Phase 4.4 (rewritten), Phase 4.1, M3 |
| 10 | Backfill `candidate_stage_transitions` with one synthetic `direction='initial'` row per existing application | M2 acceptance |
| 11 | M1 ships **admin-only** drag; manager drag waits for M5 | M1 acceptance |
| 12 | **Defer bulk drag to M2** (keeps M1 lean) | M1, M2 scope |

### Followups parked for v2 (logged but not in this plan)

- LOI expiry as an org-level setting (Q4 follow-up)
- WYSIWYG email template editor per-tenant (Phase 4.2)
- Multi-offer-per-application edge case clarification (Phase 3.5)
- SLA timers using the new audit table

---

## Out of scope (explicit non-goals)

- Job board / careers page redesign
- Candidate self-serve reschedule
- AI screening / résumé scoring
- WYSIWYG email editor
- SLA timers (e.g. "candidate sat in Screening for 7 days") — natural M6 follow-up using the new audit table
- Slack/Teams notifications — could layer on top of `dispatchStageTransitionSideEffects` in a future milestone

---

**Next step:** confirm the `shortlisted` placement (top of Phase 6), then M1 can open as its own PR.
