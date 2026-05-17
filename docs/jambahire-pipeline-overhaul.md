# JambaHire Pipeline Overhaul (M1–M5)

> **Shipped 2026-05-17.** Companion to the design doc at `docs/superpowers/plans/2026-05-16-jambahire-pipeline-drag-drop-and-transitions.md` (decisions + milestone log) and the project guide `CLAUDE.md` (schema + gotchas). This file is the **operator/onboarding view** — read this if you need to run, support, or extend the feature.

---

## 1. What it does

`/hire/pipeline` is a drag-and-drop Kanban board for moving candidates through the hiring funnel. Every move is:

- **Audited** (one row per move in `candidate_stage_transitions`).
- **Reviewed before fire** — a Confirm-Send popup shows what emails/actions will dispatch; admin can uncheck per-action or skip all.
- **Permissioned** — admins can move anything; managers can only move candidates on jobs where they're the hiring manager, and only within the interview pipeline.
- **Gated** at sensitive transitions — `screening → shortlisted` waits for the candidate to accept the Letter of Interest; `offer → hired` waits for offer acceptance AND joining date.

---

## 2. Stage flow

```
applied → screening → shortlisted → interview_1 → interview_2 → final_round → offer → hired
                                                                                          ↓ (terminal)
              ↓
           rejected (reachable from any non-hired stage)
```

Stages are stored as `applications.stage` text with a CHECK constraint (migration `012` added `shortlisted`).

---

## 3. Transition behaviour at a glance

| From → To | What happens |
|---|---|
| applied → screening | Optimistic move + Confirm-Send popup with `[✓] Email candidate (acknowledgement)`. Send fires `candidate-ack.tsx`. Skip persists the move without email. |
| screening → shortlisted | **LOI flow.** Popup with `[✓] Send Letter of Interest`. Send calls `sendLOI`; the application's stage **stays as `screening`** with `loi_status='pending'` and an amber chip. Card auto-advances to `shortlisted` only when the candidate clicks accept on `/loi/[token]`. Decline auto-routes to `rejected` with `rejection_reason='LOI declined'`. |
| shortlisted → interview_1 | Plain stage change. (No popup — the next email fires when an interview is actually scheduled.) |
| interview_1 → interview_2 | Optimistic move + popup with `[✓] Email candidate (advancing to Round 2)`. |
| interview_2 → final_round | Optimistic move + popup with `[✓] Email candidate (advancing to Final Round)`. |
| final_round → offer | Optimistic move (no popup; sending the actual offer is a separate flow on the Offers page). |
| offer → hired | **Double-gated wizard.** Client checks `checkOfferToHiredGates` first; on fail toast + rollback. On pass, opens `ConvertToEmployeeDialog` prefilled from offer + candidate. Submit → `convertOfferToHire` creates the `employees` row, advances stage, writes audit, fires Clerk invite + welcome email. |
| hired → anything | **Hard-blocked.** Server + client both refuse. To unmake a hire, terminate the employee from `/dashboard/employees`. |
| any non-hired → rejected | Prompt-first reason modal + email checkbox. Admin types an internal reason (stored in `applications.rejection_reason` + audit `comment`). The candidate email NEVER includes that text — template is chosen by source stage (`rejection-early`, `rejection-postinterview`, or `rejection-postoffer`). |
| backward (any) | Prompt-first comment modal (reason required). Server validates non-empty `comment`. |
| backward FROM offer with offer.status='sent' | Server refuses: "Revoke the offer first from the Offers page". Admin uses `revokeOffer` (separate action) which sends `offer-revoked.tsx` to the candidate. |

---

## 4. Permissions matrix

| Role | Forward | Backward | Reject | Bulk | Drag handle visible? |
|---|---|---|---|---|---|
| owner / admin | all stages | yes (reason required) | yes (reason required) | yes | yes |
| manager | own-job only, screening↔shortlisted↔interview pipeline | no | no | no | yes (on own-job cards only) |
| employee | none | no | no | no | no (no `/hire/*` access at all) |

A job's "owner" is `jobs.hiring_manager_id`. Set it in the JobDialog (M5 added the picker). Server source of truth: `src/lib/hire/permissions.ts → canMoveStage`.

---

## 5. Confirm-Send popup (M3)

`src/components/hire/confirm-transition-dialog.tsx` is the single popup that handles every gated transition. Inputs:

- `commentLabel` + `commentRequired` — surfaces a textarea (required for backward and reject)
- `actions: TransitionAction[]` — per-action checkboxes (default checked), each represents one email or side-effect

Outputs:

- **Send** → user-confirmed subset dispatched via `dispatchStageTransitionSideEffects(transitionId, enabledKeys)`. Per-action results land in `candidate_stage_transitions.side_effects_status` JSONB (`sent` / `skipped_by_user` / `failed`).
- **Skip All** → no actions fire; audit captures skipped state. Stage move still persists.
- **Cancel** → for prompt-first flows (backward, reject) nothing persists. For post-move flows (forward with actions) the stage stays moved.

---

## 6. Letter of Interest (LOI) sub-system (M4)

**Schema columns on `applications`** (migration `014`):
- `loi_sent_at`, `loi_status` (pending/accepted/declined/expired), `loi_responded_at`, `loi_token` (UNIQUE partial index), `loi_expires_at` (default `loi_sent_at + 7d`)

**Trigger:** admin drags `screening → shortlisted`. `sendLOI` (server) generates a 32-byte base64url token, sets `loi_status='pending'`, sends `loi-invite.tsx` via Resend.

**Public route:** `src/app/loi/[token]/page.tsx` (added to middleware public matcher). Renders accept/decline buttons. Handles `?response=accept|decline` querystring for one-click from email CTAs.

**Server action:** `respondToLOI(token, response)`:
- `accept` → `loi_status='accepted'`, `loi_responded_at=now()`, application stage → `shortlisted`. Writes audit row (candidate actor). Sends `manager-shortlist-notify.tsx` to all org admins.
- `decline` → `loi_status='declined'`, `loi_responded_at=now()`, application stage → `rejected`, `rejection_reason='LOI declined'`. Writes audit row (candidate actor). Syncs referral if applicable.

**Cron:** `/api/cron/loi-expiry` daily at `15 4 * * *` UTC (9:45am IST) flips pending → expired for rows where `loi_expires_at < now()`. No email sent on expiry — admin can resend manually.

**UI behaviour:**
- LOI-pending cards show amber `LOI pending` chip with expiry-date tooltip.
- LOI-pending cards have **drag handle locked**; dropdown move to `shortlisted` returns an error toast.
- LOI-accepted cards land in Shortlisted with green `LOI accepted` chip.
- LOI-declined cards appear in Rejected with red `LOI declined` chip.

---

## 7. Offer → Hire conversion (M5)

**Server entry point:** `convertOfferToHire(applicationId, payload)` in `src/actions/hire.ts`.

**Steps (in order):**
1. Fetch application + linked offer + candidate + org.
2. Call `checkOfferToHiredGates(offer)` — shared with the client. Reject on:
   - Gate A: `offer.status !== 'accepted'`
   - Gate B: `today < offer.joining_date` (IST, day-precision)
3. Check `organizations.max_employees` headroom (same rule as `addEmployee`).
4. Check no existing employee with the candidate's email in this org.
5. Insert `employees` row with payload (start_date, department, designation, employment_type, reporting_manager, role).
6. Advance `applications.stage` to `hired`. **If this fails, roll back the employees insert.**
7. Write `candidate_stage_transitions` row (direction='forward', actor='admin', comment='Converted to employee {Name}').
8. Sync referral to `hired`.
9. Fire Clerk org invitation (non-fatal — admin can resend from `/dashboard/employees`).
10. Send `hire-onboarding-handoff.tsx` welcome email (non-fatal).

**Client wizard:** `ConvertToEmployeeDialog` opens on a successful drag → Hired. Lazy-loads `getHirePrefillData` to get the offer + candidate + departments + potential managers. All fields prefilled; admin can edit before submit.

---

## 8. Offer revocation (M5)

`revokeOffer(offerId, reason)` server action:
- Admin only. Requires non-empty internal reason.
- Refuses if offer is already `accepted` / `declined` / `revoked`.
- Sets `offer.status='revoked'`, stores reason in `response_note`.
- Sends `offer-revoked.tsx` to candidate (no internal reason text per design rule).
- Returns success even if email fails (logged as warning).

Currently invoked from the Offers page (where admin sees the offer surface). A future M5.1 polish could surface this from the pipeline card directly.

---

## 9. Audit log + activity timeline (M2)

**Table:** `candidate_stage_transitions` (migration `013`).

| Column | Purpose |
|---|---|
| `org_id`, `application_id` | Tenant + subject scope. |
| `from_stage`, `to_stage` | Move snapshot. `from_stage` is NULL for `direction='initial'` (backfill). |
| `direction` | `forward / backward / reject / undo / initial` |
| `actor_id` | FK → employees. NULL for `system` or `candidate` actor types. |
| `actor_type` | `admin / manager / system / candidate` |
| `comment` | Required on backward + reject; populated with "Candidate accepted/declined the LOI" for candidate-actor rows. |
| `side_effects_status` | JSONB map of action key → `sent` / `skipped_by_user` / `failed`. Populated by the Confirm-Send popup. |
| `undone_at` | Reserved for the future Undo affordance (not wired in M2). |

**Backfill:** `scripts/backfill-stage-transitions.sql` (idempotent). Inserts one synthetic `direction='initial'` row per existing application at its current stage so the timeline UI isn't empty for legacy records.

**Read API:** `getApplicationTransitions(applicationId)` hydrates actor names in one round trip.

**UI surface:** Click the candidate name on any pipeline card → `ApplicationDetailDialog` opens → `ApplicationTimeline` renders the chrono history. Newest first. Each row shows actor, direction icon, from→to stage chips, relative time, and the optional comment in a muted italic block.

---

## 10. Email templates

All transition emails send from `NOREPLY_EMAIL` (`noreply@jambahr.com`) with reply-to `FROM_EMAIL` (`support@jambahr.com`). Rendered via `@react-email/render` and dispatched via Resend. Templates live in `src/components/emails/`.

| Template | Sent when |
|---|---|
| `candidate-ack.tsx` | applied → screening (admin confirms in popup) |
| `interview-next-round.tsx` | interview_1 → interview_2 OR interview_2 → final_round |
| `rejection-early.tsx` | rejected from applied / screening / shortlisted |
| `rejection-postinterview.tsx` | rejected from interview_1 / interview_2 / final_round |
| `rejection-postoffer.tsx` | rejected from offer (rare; admin rescinding) |
| `loi-invite.tsx` | screening → shortlisted drag (admin confirms in popup) |
| `manager-shortlist-notify.tsx` | candidate accepts LOI (auto-fires inside `respondToLOI`; goes to all org admins) |
| `hire-onboarding-handoff.tsx` | `convertOfferToHire` succeeds (auto-fires, non-fatal) |
| `offer-revoked.tsx` | `revokeOffer` succeeds (auto-fires, non-fatal) |

**Design rule:** **Candidate-facing rejection/revoke emails must NEVER include `rejection_reason` text.** The internal reason is for hiring debriefs only — see `memory/feedback_rejection_email_internal_reason.md` and `CLAUDE.md` gotcha #48.

---

## 11. Migrations + cron (run order)

**On a fresh JambaHire deployment**, run via Supabase Dashboard SQL Editor in order:

1. `supabase/migrations/012_application_stage_add_shortlisted.sql`
2. `supabase/migrations/013_candidate_stage_transitions.sql`
3. `scripts/backfill-stage-transitions.sql` — one-shot, idempotent
4. `supabase/migrations/014_application_loi_columns.sql`
5. `supabase/migrations/015_jobs_hiring_manager.sql`
6. `supabase/migrations/017_offers_revoked_status.sql`

(`016` was reserved for screener_id columns but skipped — the audit timeline captures everything we'd have used those fields for.)

**Cron added to `vercel.json`:**
- `/api/cron/loi-expiry` at `15 4 * * *` UTC (9:45am IST). Requires `CRON_SECRET` env var (already set for the existing nudge/billing crons).

---

## 12. Common ops questions

**"A move toasted 'You don't have permission'."** The user is a manager and either (a) the job has no `hiring_manager_id` set, or (b) the target stage is outside the manager-allowed pipeline (offer/hired/rejected). Fix: set hiring_manager_id on the job, or have an admin do the move.

**"Why didn't an email go out when I dragged to Screening?"** The admin clicked Skip All or unchecked the email action in the popup. Check `candidate_stage_transitions.side_effects_status` JSONB on the matching row — it will say `"email-candidate-ack": "skipped_by_user"`.

**"LOI link won't accept — says 'expired'."** Check `applications.loi_expires_at`. If past, the cron has flipped status to `expired`. Admin can drag screening → shortlisted again to generate a fresh token.

**"Drag → Hired fails with 'No offer exists'."** Wizard is gated. Create + send an offer first via the Offers page. Once accepted (and joining_date has arrived), the drag will open the wizard.

**"Drag → Hired wizard succeeded but no Clerk invite arrived."** Clerk invite is non-fatal — logged as a warning. Resend manually from `/dashboard/employees` or check Clerk's webhook logs.

**"Backward move from Offer column failed."** The linked offer is in `status='sent'`. Admin must explicitly revoke it from the Offers page first (which sends `offer-revoked.tsx`), then the backward move is allowed.

**"Hired candidate needs to be moved back."** Hard-blocked. Terminate the employee in `/dashboard/employees`. (Future M5.1 could allow an admin "convert back" affordance — currently out of scope.)

---

## 13. Where to look in the code

| Concern | File |
|---|---|
| Stage enum + types | `src/actions/hire.ts` (`ApplicationStage`, `Application`, `Offer`, `Job`) |
| Direction inference | `src/lib/hire/stage-direction.ts` |
| Action planner (Confirm-Send) | `src/lib/hire/transitions.ts` |
| Permissions | `src/lib/hire/permissions.ts` |
| Offer→Hired gates | `src/lib/hire/gates.ts` |
| Kanban UI | `src/components/hire/pipeline-client.tsx` |
| Unified Confirm-Send popup | `src/components/hire/confirm-transition-dialog.tsx` |
| Timeline | `src/components/hire/application-detail-dialog.tsx` + `application-timeline.tsx` |
| Convert wizard | `src/components/hire/convert-to-employee-dialog.tsx` |
| Offer chip | `src/components/hire/offer-status-chip.tsx` |
| Public LOI page | `src/app/loi/[token]/page.tsx` |
| LOI cron | `src/app/api/cron/loi-expiry/route.ts` |
| Email templates | `src/components/emails/*.tsx` |

---

## 14. What's NOT shipped (future work)

These items were planned but deferred — pick them up as M5.1 / M6 when prioritised:

- **Per-org LOI expiry config** — currently hardcoded 7 days. Move to `organizations.settings.loi_expiry_days` with a per-job override.
- **Auto-revoke on backward-from-sent-offer** — admin currently has to revoke from Offers page first. A unified popup that does revoke + backward in one step would be smoother.
- **`internal-hire-notify.tsx`** — HR-side notification when a hire happens. Currently only the candidate gets `hire-onboarding-handoff`.
- **Per-candidate breakdown in bulk popup** — bulk forward currently fires the same action set across all selected; per-row toggles would help when the batch is mixed.
- **Hover lock/check visual on Hired column** — visual feedback during drag-in-progress would tell admin "this drop is valid" before they release.
- **Manager-hire** — `convertOfferToHire` is admin-only. Granting hiring managers the wizard for their own jobs is a permissions tweak.
- **Resend-LOI affordance on the card** — currently requires re-dragging or admin Supabase edit.
- **Undo on the audit row** — `undone_at` column exists but no UI wired.
- **Stage-aware rejection email opt-out per candidate** — useful for sensitive industries where blanket emails are inappropriate.
