# Mobile D4 — Owner/Admin Experience (PRD-03) — Design Spec

**Date:** 2026-08-12 · **Status:** approved (brainstorm), ready for writing-plans
**Source PRD:** `docs/prds/mobile/03-PRD-Owner-Admin.md` · **Prereqs:** D1/D2/D3 shipped.
**Scope decision:** whole PRD-03 in one phase (all 4 approval types incl. payroll biometric + admin Home + People lookup + Reports). Home-first: inbox is a stacked screen, **no new tab**. Admin Home **augments** (keeps the personal punch card).

## Goal
The owner's phone becomes the approval device: any pending item (leave, regularization, OT, payroll) is clearable in seconds from a deep-linked push. Deep configuration stays web-only (parity rule / non-goals).

## Non-goals (web-only, unchanged)
Shift master config, salary-structure config, geofence setup, org settings, employee CRUD. Reports export / deep analysis. No employee editing on mobile.

## Architecture
Extends the existing mobile app (5-tab IA: Home · Leaves · People · Grow · More) and the BFF pattern (`/api/mobile/*`, `getCurrentUser({ orgIdHint: x-org-id })`, `dynamic="force-dynamic"`). Admin surfaces render **inline, role-gated** on Home + three **stacked** screens (`/approvals`, `/people/[id]`, `/reports`). Every new BFF endpoint **composes the existing guarded web actions**, threading `orgIdHint` (D2 multi-org rule: composing a cookie-bound action from mobile silently targets the first-membership org). Server-side action guards are the real security layer; client role-gating is UX only.

**Roles:** admin surfaces show for `isManagerOrAbove` (manager/admin/owner). Per-type gating below. Staff (`employee`) never see admin routes and are rejected server-side.

## ① Approvals inbox (centerpiece)
Stacked route `apps/mobile/src/app/approvals.tsx`, reached from the admin-Home Pending card and from the `approval_pending` push deep-link.

**`GET /api/mobile/approvals`** — merges pending items across 4 types into one normalized DTO, newest-first, with type chips:
```
MobileApprovalItem = {
  id: string;              // the underlying row id (leave_request / punch_event / ot_record / disbursement_batch)
  type: 'leave' | 'regularization' | 'ot' | 'payroll';
  who: string;             // employee name (payroll: "Payroll run <month>")
  what: string;            // short summary
  when: string;            // ISO created/submitted timestamp
  impact: string;          // leave: "balance 8→5"; reg: punch time+date; ot: "3.5h · Rs 1,240"; payroll: "24 staff · Rs 8,40,000"
  meta: Record<string, unknown>; // type-specific extras (e.g. payroll: {headcount, totalPaise, exceptions})
}
MobileApprovalsResponse = { items: MobileApprovalItem[]; counts: { leave: number; regularization: number; ot: number; payroll: number; total: number } }
```
Sourcing (all admin/manager-scoped, `orgIdHint`-correct):
- **leave** → pending `leave_requests` in the caller's manager scope (reuse the D2 `/api/mobile/leave/approvals` logic; `managerIdsOf` / `getManagerScopedEmployeeIds`).
- **regularization** → pending `attendance_punch_events` (source `listPunchEvents` filtered to pending, manager-scoped).
- **ot** → pending `ot_records` (org-scoped; OT master toggle must be enabled).
- **payroll** → disbursement batches in `awaiting_approval` for the org (`getDisbursementBatchByRun` / a list), admin-only, **only when RazorpayX is configured**; manual "Mark Paid" orgs surface no payroll items.

**`POST /api/mobile/approvals/decide`** `{ type, id, action: 'approve'|'reject', comment? }` → routes to the matching web action:
- leave → `approveLeave(id, orgIdHint)` / `rejectLeave(id, comment, orgIdHint)` (already take `orgIdHint` from D2).
- regularization → `approvePunch(id, orgIdHint)` / `rejectPunch(id, comment, orgIdHint)`.
- ot → `approveOvertime(id, orgIdHint)` / `rejectOvertime(id, comment, orgIdHint)`.
- payroll → `approveDisbursement(batchId, orgIdHint)`. **Approve-only in v1** — there is no disbursement reject/cancel action today; payroll **reject stays on web**. The mobile payroll card shows Approve + a "Reject on web" affordance, no mobile reject path.

**Multi-org correctness (required):** `approvePunch`/`rejectPunch`/`approveOvertime`/`rejectOvertime`/`approveDisbursement` currently resolve the org via the cookie (`getCurrentUser()` with no hint) — composing them from mobile would silently target a multi-org user's first-membership org (D2 Task-3 bug class). Add an optional trailing `orgIdHint?: string | null` to each (mirror the D2 leave actions: `getCurrentUser({ orgIdHint })`, `orgIdHint ?? cookie`); passing `undefined` on the web path is byte-identical. This is part of the BFF task, not a separate refactor.

Each web action keeps its own guard (manager-scope for leave/reg/ot; admin + **different-admin maker-checker** for payroll). BFF re-checks role before dispatch. `reject` requires a comment for leave/reg (mirror web).

**Batch:** leave supports multi-select approve (PRD); the client calls `decide` per selected id in sequence (reuses the single endpoint — no separate batch endpoint). Other types are single-action.

**Payroll biometric:** on a payroll **approve** tap, the client runs `expo-local-authentication` `authenticateAsync()` FIRST; only on success does it POST `decide`. If no biometric enrolled → fall back to device passcode; if neither is available → block payroll-approve on mobile with "approve on web" (leave/reg/OT are unaffected — no biometric). Payroll card shows the run summary (headcount, total payout, exceptions) before the action.

## ② Admin Home (augment)
Extend the home payload with an admin block for `isManagerOrAbove`:
```
adminHome?: {
  today: { present: number; absent: number; late: number };
  pendingApprovals: { total: number; byType: { leave; regularization; ot; payroll } };
  payroll: { status: 'none' | 'draft' | 'processing' | 'awaiting_approval' | 'paid'; month?: string } | null;
}
```
Home screen (`home-screen.tsx`) renders, for admins, ABOVE the personal cards: a Today counts strip, a prominent **Pending approvals (N)** card → `/approvals`, and a payroll-status card **only when a run is mid-cycle**. Personal Today/punch card stays below (augment). Actionable-first per the web UX-review lesson. Best-effort: admin block defaults to zeros/null on error, never breaks Home.

## ③ People lookup
People tab → tap an employee → stacked `apps/mobile/src/app/people/[id].tsx` mini-profile:
- contact (tap-to-call `tel:`, WhatsApp `wa.me` when opted-in), today's attendance, leave balance, recent requests.
- **No editing** — an "Edit on web" link. **Salary never in the payload.**
`GET /api/mobile/directory/[id]` returns the mini-profile (admin/manager-scoped; IDOR-guarded to the caller's org). Reuses directory/attendance/leave aggregation already used by staff endpoints.

## ④ Reports (lightweight)
Stacked `apps/mobile/src/app/reports.tsx` (entry from admin Home or More): attendance summary (present %, late count) + leave summary over a selectable date range (presets: 7d/30d/this-month). **Simple hand-rolled bar charts** (plain `View` bars — NO new charting dependency). Export/deep analysis stays web.
`GET /api/mobile/reports/attendance?from=&to=` + `GET /api/mobile/reports/leave?from=&to=` — admin-scoped, compose the existing attendance-report / insights aggregation (range-paginated; respect the 92-day cap like the web Reports tab).

## Push (approver-side)
New notification `type: 'approval_pending'` with `data.approvalType ∈ leave|regularization|ot|payroll`, fired **best-effort** when a pending item is created, deep-linked to `/approvals`:
- `requestLeave` → notify the requester's manager(s)-of-record + org admins.
- pending `attendance_punch_events` created (manual punch / regularization) → notify manager(s).
- OT computed → `pending` → notify admins.
- `initiateDisbursement` → `awaiting_approval` → notify the checker(s) (admins other than the maker).
Reuses the D3 `notify()`/`sendPush` helpers + `notifications` table (add `approval_pending` to the type CHECK via a small migration) and `routeForNotificationType('approval_pending') → '/approvals'` on mobile. Delivery verification rides the clean-device push check (D3 finding).

## Permissions & security
- Client: admin sections/screens render only for `isManagerOrAbove`; payroll actions only for `isAdmin`.
- Server (authoritative): `GET /approvals` returns only in-scope items; `decide` dispatches through the existing action guards (manager-scope / admin / different-admin maker-checker). A staff caller gets an empty inbox and every `decide` is rejected. RLS remains advisory (service-role bypass, gotcha #5).
- **Acceptance criterion test:** a staff account can never reach admin routes — verified at the BFF (403/empty) and by the composed action guards.

## Testing
- BFF route tests: 401 (no userId), 403 (staff), role-gating per type, each `decide` routes to the correct action, `orgIdHint` threaded, IDOR on `/people/[id]`, payroll only for admins + RazorpayX orgs.
- Pure unit tests: the 4-type → `MobileApprovalItem` normalization/merge + counts.
- Device pass (on the EAS rebuild): leave/reg/OT approve+reject end-to-end; payroll biometric gate; admin Home counts; People mini-profile; Reports; approver push deep-link. Acceptance: a mobile-created staff leave is approved on mobile owner end-to-end with correct push both ways; payroll checker approval records identical audit fields to web.

## Native / build
- **One new native dep:** `expo-local-authentication` → EAS rebuild (bundles with the pending D3 push/FlashList rebuild). Lockfile guard (Windows-regen gotcha). No charting dep.
- **One small migration:** add `'approval_pending'` to the `notifications.type` CHECK.

## Build sequence (one phase, staged in the plan)
A) BFF — `/approvals` (list) + `/approvals/decide` + admin-home block + `/directory/[id]` mini + `/reports/*`, with route tests + DTO-merge unit tests.
B) Migration (`approval_pending`) + `expo-local-authentication` install + app config → EAS rebuild.
C) Mobile UI — admin Home block, `/approvals` inbox (chips, swipe/tap approve-reject, leave batch, payroll biometric), `/people/[id]` mini-profile, `/reports`.
D) Approver-side push triggers (4 sources) + `approval_pending` deep-link.
E) Device pass on a clean device (rides the D3 push clean-device verification).
