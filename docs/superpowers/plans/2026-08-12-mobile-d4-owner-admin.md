# Mobile D4 — Owner/Admin Experience (PRD-03) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use `- [ ]`.

**Goal:** Give owners/admins a mobile "approval device" — a unified Approvals inbox (Leave · Regularization · OT · Payroll-checker) plus admin Home situational awareness, People quick-lookup, and lightweight Reports — with approver-side push.

**Architecture:** Extend the existing 5-tab mobile app + `/api/mobile/*` BFF. Admin surfaces render inline (role-gated) on Home + three stacked screens (`/approvals`, `/people/[id]`, `/reports`). Every BFF endpoint composes the existing guarded web server actions, threading `orgIdHint`. Server action guards are the security layer; client role-gating is UX.

**Tech Stack:** Next.js 14 BFF, Supabase, Expo Router (SDK 57), NativeWind, TanStack Query, `expo-local-authentication` (new), `@jambahr/shared` DTOs, push infra from D3.

**Spec:** `docs/superpowers/specs/2026-08-12-mobile-d4-owner-admin-design.md` (binding).

## Global Constraints
- Best-effort admin blocks/push never break the core payload or action (mirror D3 `notify()` swallow / `waitUntil`).
- Every BFF route: `getCurrentUser({ orgIdHint: request.headers.get("x-org-id") })`, `dynamic="force-dynamic"`, 401 no `userId`, 403 no membership; admin routes 403 for `employee`. Route tests required.
- **Multi-org rule:** any composed web mutation MUST thread `orgIdHint`; passing `undefined` on the web path must be byte-identical.
- Admin gate = `isManagerOrAbove` for leave/reg/OT surfaces; `isAdmin` for payroll.
- Payroll = **approve-only** on mobile (no disbursement reject action exists); reject stays on web.
- Salary/PAN/Aadhaar never in any mobile payload. Amounts render "Rs " (ASCII), never ₹.
- No new charting dependency — Reports uses plain-`View` bars. One new native dep total: `expo-local-authentication`.
- No Co-Authored-By trailer. Explicit `git add <paths>` (never `-A`). Migrations applied live via Supabase MCP to project `imjwqktxzahhnfmfbtfc` AND checked into `supabase/migrations/`. Next migration number = **106**.
- `.expo/types` must be ABSENT before mobile typecheck (`rm -rf apps/mobile/.expo/types`).

---

## Stage A — BFF

### Task 1: Thread `orgIdHint` through reg/OT/payroll actions

**Files:**
- Modify: `apps/web/src/actions/attendance-punches.ts` (`approvePunch`, `rejectPunch`)
- Modify: `apps/web/src/actions/overtime.ts` (`approveOvertime`, `rejectOvertime`)
- Modify: `apps/web/src/actions/disbursement.ts` (`approveDisbursement`)
- Test: `apps/web/tests/mobile/approvals-orghint.test.ts`

**Interfaces (Produces):** each action gains an optional trailing `orgIdHint?: string | null`, resolved as `getCurrentUser({ orgIdHint })` (was `getCurrentUser()`). New signatures:
- `approvePunch(punchId, orgIdHint?)`, `rejectPunch(punchId, reason, orgIdHint?)`
- `approveOvertime(recordId, orgIdHint?)`, `rejectOvertime(recordId, reason, orgIdHint?)`
- `approveDisbursement(batchId, orgIdHint?)`

**Steps:**
- [ ] Read each action; confirm it currently calls `getCurrentUser()` with no arg.
- [ ] Write a test asserting each action, called with an explicit `orgIdHint`, resolves the caller against that org (mock `getCurrentUser` to assert it received `{ orgIdHint }`), and that calling with no 2nd/3rd arg (web path) still passes `orgIdHint: undefined`.
- [ ] Add the optional param to each; change the `getCurrentUser()` call to `getCurrentUser({ orgIdHint })`. Nothing else changes.
- [ ] Run the existing action tests (`npx vitest run tests/overtime tests/attendance tests/payroll` as applicable) + the new test — all green.
- [ ] Commit: `feat(actions): optional orgIdHint on punch/OT/disbursement approvals (mobile BFF)`.

### Task 2: Shared approvals DTO + pure merge

**Files:**
- Create: `packages/shared/src/mobile/approvals.ts` (DTOs + pure `buildApprovalsPayload`)
- Export from `packages/shared/src/index.ts`
- Test: `apps/web/tests/mobile/approvals-merge.test.ts`

**Interfaces (Produces):**
```ts
export type MobileApprovalType = 'leave' | 'regularization' | 'ot' | 'payroll';
export interface MobileApprovalItem { id: string; type: MobileApprovalType; who: string; what: string; when: string; impact: string; meta: Record<string, unknown>; }
export interface MobileApprovalsResponse { items: MobileApprovalItem[]; counts: { leave: number; regularization: number; ot: number; payroll: number; total: number }; }
// pure: given already-normalized per-type arrays, concat, sort by `when` desc, compute counts.
export function buildApprovalsPayload(input: { leave: MobileApprovalItem[]; regularization: MobileApprovalItem[]; ot: MobileApprovalItem[]; payroll: MobileApprovalItem[] }): MobileApprovalsResponse;
```

**Steps:**
- [ ] Test: given 2 leave + 1 ot + 1 payroll items with mixed `when`, output is sorted newest-first and counts = `{leave:2, regularization:0, ot:1, payroll:1, total:4}`.
- [ ] Implement the pure function + types; export from the barrel.
- [ ] `cd packages/shared && npx tsc --noEmit` clean; run the test.
- [ ] Commit: `feat(shared): MobileApproval DTOs + buildApprovalsPayload`.

### Task 3: `GET /api/mobile/approvals`

**Files:**
- Create: `apps/web/src/app/api/mobile/approvals/route.ts`
- Create: `apps/web/src/lib/mobile/approvals-sources.ts` (per-type fetch→normalize, plain module)
- Test: `apps/web/tests/mobile/approvals-route.test.ts`

**Interfaces (Consumes):** `buildApprovalsPayload`, the D2 leave-approvals query (mirror `apps/web/src/app/api/mobile/leave/approvals/route.ts`), `listPunchEvents` (pending, manager-scoped), pending `ot_records` (org-scoped, OT-enabled only), disbursement batches `awaiting_approval` (admin + RazorpayX only). Manager scope via `getManagerScopedEmployeeIds` / `managerIdsOf`.

**Normalization (each source → `MobileApprovalItem`):**
- leave: `impact = "balance N→M"` (reuse the D2 balance derivation), `meta.days`.
- regularization: `who = employee name`, `what = "Manual punch"`, `impact = "<in/out> <HH:MM> <date>"`, `meta.punchAt`.
- ot: `what = "Overtime"`, `impact = "<h>h · Rs <amt>"`, `meta.minutes`.
- payroll: `who = "Payroll <month>"`, `impact = "<headcount> staff · Rs <total>"`, `meta = {headcount, totalPaise, exceptions}`.

**Steps:**
- [ ] Test: 401 (no userId); 403 not raised for manager but payroll items excluded when not admin / no RazorpayX; a manager sees only in-scope leave/reg/ot; response shape = `MobileApprovalsResponse`; empty for `employee`.
- [ ] Implement `approvals-sources.ts` (4 fetchers, each best-effort → `[]` on error so one source can't blank the inbox) + the route calling `buildApprovalsPayload`.
- [ ] `cd apps/web && npx vitest run tests/mobile/approvals-route.test.ts` green; `tests/mobile/` sweep green.
- [ ] Commit: `feat(push): GET /api/mobile/approvals unified inbox`.

### Task 4: `POST /api/mobile/approvals/decide`

**Files:**
- Create: `apps/web/src/app/api/mobile/approvals/decide/route.ts`
- Test: `apps/web/tests/mobile/approvals-decide-route.test.ts`

**Interfaces (Consumes):** Task-1 actions (with `orgIdHint`) + `approveLeave`/`rejectLeave` (already take it). Body: `{ type: MobileApprovalType, id: string, action: 'approve'|'reject', comment?: string }`. Passes `request.headers.get("x-org-id")` as `orgIdHint` to each. `reject` requires `comment` for leave/reg. **Payroll `reject` → 400 "reject on web".**

**Steps:**
- [ ] Test: 401/403 (employee); each `{type, action}` dispatches the correct action with `orgIdHint` (mock the actions, assert call args); payroll reject → 400; leave reject without comment → 400; admin-only enforced for payroll.
- [ ] Implement the router (switch on `type`), Zod-validate the body.
- [ ] Tests green (route + `tests/mobile/` sweep).
- [ ] Commit: `feat(push): POST /api/mobile/approvals/decide`.

### Task 5: Admin block on Home payload

**Files:**
- Modify: `apps/web/src/lib/mobile/home-payload.ts` (add optional `adminHome`)
- Modify: `apps/web/src/app/api/mobile/home/route.ts` (compute for `isManagerOrAbove`)
- Modify: `packages/shared/src/mobile/types.ts` (`MobileHomeResponse.adminHome?`)
- Test: `apps/web/tests/mobile/home-admin.test.ts`

**Interfaces (Produces):** `adminHome?: { today: {present:number;absent:number;late:number}; pendingApprovals: {total:number; byType:{leave;regularization;ot;payroll}}; payroll: {status:'none'|'draft'|'processing'|'awaiting_approval'|'paid'; month?:string} | null }`. Best-effort: on any error the whole block is `undefined` (Home never breaks). `pendingApprovals` reuses Task-3 counts.

**Steps:**
- [ ] Test: `employee` → no `adminHome`; manager → block present with counts; a thrown sub-query → block `undefined`, rest of Home intact.
- [ ] Implement; wire into the existing `Promise.all`, guarded.
- [ ] `tests/mobile/` sweep + `packages/shared` typecheck green.
- [ ] Commit: `feat(push): admin Home block (today counts, pending, payroll status)`.

### Task 6: `GET /api/mobile/directory/[id]` mini-profile

**Files:**
- Create: `apps/web/src/app/api/mobile/directory/[id]/route.ts`
- Add DTO `MobilePersonProfile` to `packages/shared/src/mobile/directory.ts` (or the existing directory DTO file)
- Test: `apps/web/tests/mobile/person-profile-route.test.ts`

**Interfaces (Produces):** `MobilePersonProfile = { id; name; role; department?; phone?; personalEmail?; whatsappOptIn:boolean; todayAttendance: {status; clockIn?; clockOut?} | null; leaveBalance: {type; remaining}[]; recentRequests: {type; status; when}[] }`. **No salary/PAN/Aadhaar.** Admin/manager-scoped; the target must be in the caller's org (else 404, IDOR guard like the payslip route).

**Steps:**
- [ ] Test: 401/403 (employee); cross-org id → 404; salary/PAN absent from payload; happy path shape.
- [ ] Implement (compose directory + attendance-today + leave-balance-by-aggregation + recent leave_requests).
- [ ] Tests green.
- [ ] Commit: `feat(push): GET /api/mobile/directory/[id] admin mini-profile`.

### Task 7: `GET /api/mobile/reports/{attendance,leave}`

**Files:**
- Create: `apps/web/src/app/api/mobile/reports/attendance/route.ts`
- Create: `apps/web/src/app/api/mobile/reports/leave/route.ts`
- DTOs in `packages/shared/src/mobile/reports.ts`
- Test: `apps/web/tests/mobile/reports-route.test.ts`

**Interfaces (Produces):** attendance → `{ range:{from,to}; presentPct:number; lateCount:number; perDay:{date; present; late}[] }`; leave → `{ range; totalDays:number; byType:{type; days}[] }`. Admin-scoped; enforce a ≤92-day range (400 otherwise, mirror web Reports).

**Steps:**
- [ ] Test: 401/403; >92-day range → 400; happy shapes.
- [ ] Implement (compose existing attendance-report / insights aggregation, range-paginated).
- [ ] Tests green.
- [ ] Commit: `feat(push): GET /api/mobile/reports attendance+leave summaries`.

---

## Stage B — migration + native dep

### Task 8: `approval_pending` migration + `expo-local-authentication`

**Files:**
- Create: `supabase/migrations/106_notifications_approval_pending.sql` (add `'approval_pending'` to `notifications.type` CHECK; drop+recreate the constraint)
- Modify: `apps/mobile/package.json` + `package-lock.json` (`expo-local-authentication`)
- Modify: `apps/mobile/app.json` (plugin + iOS `NSFaceIDUsageDescription`)

**Steps:**
- [ ] Write migration 106; apply live via Supabase MCP; confirm the CHECK includes `approval_pending`.
- [ ] `cd apps/mobile && npx expo install expo-local-authentication`; add the plugin + `NSFaceIDUsageDescription` ("Confirm it's you to approve payroll") to app.json.
- [ ] Lockfile guard: no Linux binaries pruned (`git diff package-lock.json | grep '^-' | grep -iE 'linux|darwin'` empty).
- [ ] `rm -rf apps/mobile/.expo/types && npx turbo typecheck lint --filter=mobile` green; `npx expo export --platform ios` bundles.
- [ ] Commit: `feat(mobile): approval_pending migration + expo-local-authentication`.

---

## Stage C — mobile UI

### Task 9: Mobile data hooks

**Files:**
- Create: `apps/mobile/src/lib/approvals.ts` (`useApprovals()`, `useDecide()`), `apps/mobile/src/lib/person.ts` (`usePerson(id)`), `apps/mobile/src/lib/reports.ts` (`useReports(range)`)
- Create: `apps/mobile/src/lib/biometric.ts` (`confirmBiometric(): Promise<boolean>` wrapping `expo-local-authentication`)

**Interfaces (Produces):** `useApprovals` → `MobileApprovalsResponse`; `useDecide` mutation POSTs `/api/mobile/approvals/decide`, invalidates approvals + home queries; `confirmBiometric` = `hasHardwareAsync`+`isEnrolledAsync`→`authenticateAsync`; returns false if unavailable (caller shows "approve on web").

**Steps:**
- [ ] Implement hooks mirroring `apps/mobile/src/lib/leave.ts` / `notifications.ts` idioms (useMobileQuery/useMobileMutation).
- [ ] `rm -rf apps/mobile/.expo/types && npx turbo typecheck lint --filter=mobile` green.
- [ ] Commit: `feat(mobile): approvals/person/reports/biometric hooks`.

### Task 10: Admin Home block

**Files:**
- Modify: `apps/mobile/src/components/home-screen.tsx` (render `adminHome` cards for managers, above personal cards)
- Create: `apps/mobile/src/components/admin/admin-home-cards.tsx`

**Steps:**
- [ ] Render Today counts strip + a prominent **Pending approvals (N)** card → `router.push('/approvals')` + payroll-status card (only when `payroll.status` is mid-cycle). Personal cards stay below. Manager-gated on `me.role`.
- [ ] Typecheck/lint/bundle green.
- [ ] Commit: `feat(mobile): admin Home situational cards`.

### Task 11: `/approvals` inbox screen

**Files:**
- Create: `apps/mobile/src/app/approvals.tsx`, `apps/mobile/src/components/approvals/approvals-screen.tsx`, `.../approval-card.tsx`
- Register `approvals` in the root Stack (`_layout.tsx`, `headerShown:true, title:"Approvals"`)

**Steps:**
- [ ] FlashList of items with type chips; per-card Approve/Reject (reject opens a comment sheet for leave/reg). Leave supports multi-select → batch approve (loop `decide`). Payroll card shows run summary; **Approve runs `confirmBiometric()` first** → on false, toast "approve on web"; reject hidden for payroll (shows "Reject on web").
- [ ] Empty state; pull-to-refresh; optimistic removal on success.
- [ ] Typecheck/lint/bundle green.
- [ ] Commit: `feat(mobile): unified approvals inbox screen`.

### Task 12: `/people/[id]` mini-profile

**Files:**
- Create: `apps/mobile/src/app/people/[id].tsx`, `apps/mobile/src/components/people/person-profile-screen.tsx`
- Modify: `apps/mobile/src/components/people-screen.tsx` (row tap → `router.push('/people/'+id)` for managers)
- Register in root Stack.

**Steps:**
- [ ] Render contact (tap-to-call `Linking.openURL('tel:')`, WhatsApp `wa.me` when opted-in), today's attendance, leave balance, recent requests, "Edit on web" link. No edit controls.
- [ ] Typecheck/lint/bundle green.
- [ ] Commit: `feat(mobile): people mini-profile screen`.

### Task 13: `/reports` screen

**Files:**
- Create: `apps/mobile/src/app/reports.tsx`, `apps/mobile/src/components/reports/reports-screen.tsx`, `.../bar-chart.tsx` (plain-View bars)
- Entry from admin Home or More; register in root Stack.

**Steps:**
- [ ] Range presets (7d/30d/this-month); attendance summary (present %, late count, per-day bars) + leave summary (by-type bars). Hand-rolled `View` bars, no chart dep.
- [ ] Typecheck/lint/bundle green.
- [ ] Commit: `feat(mobile): lightweight reports screen`.

---

## Stage D — approver-side push

### Task 14: `approval_pending` triggers + deep-link

**Files:**
- Modify: `apps/web/src/actions/leaves.ts` (`requestLeave` → notify manager(s)-of-record + admins)
- Modify: `apps/web/src/actions/attendance-punches.ts` (pending punch created → notify manager(s))
- Modify: `apps/web/src/actions/overtime.ts` (compute→pending → notify admins)
- Modify: `apps/web/src/actions/disbursement.ts` (`initiateDisbursement` → awaiting_approval → notify checker admins)
- Modify: `apps/web/src/lib/mobile/notify.ts` (add `notifyApprovalPending(...)` wrapper)
- Modify: `apps/mobile/src/lib/notifications.ts` (`routeForNotificationType('approval_pending') → '/approvals'`)
- Test: `apps/web/tests/mobile/notify-approval.test.ts`

**Steps:**
- [ ] Test: `notifyApprovalPending` inserts a `notifications` row with `type:'approval_pending'`, `data.approvalType` set, and calls sendPush; a thrown insert still resolves.
- [ ] Implement the wrapper + wire the 4 best-effort triggers (own try/catch, never block the core action). Add the mobile route mapping.
- [ ] `cd apps/web && npx vitest run tests/mobile/notify-approval.test.ts` + `tests/leaves tests/overtime` sweep green; mobile typecheck green.
- [ ] Commit: `feat(push): approver-side approval_pending notifications + deep-link`.

---

## Stage E — device pass (checkpoint, not a code task)
On the EAS rebuild (from Task 8), on a **clean device** (D3 born-sandbox finding): mobile-created staff leave approved on mobile owner end-to-end + push both ways; reg/OT approve+reject; payroll biometric gate + audit-field parity with web; admin Home counts; People mini-profile; Reports. Staff account sees empty inbox + every `decide` rejected (403).

## Self-review notes
- Spec coverage: inbox (T2-4), biometric (T9,T11), admin Home (T5,T10), People (T6,T12), Reports (T7,T13), push (T14), migration+native (T8), multi-org (T1). Payroll approve-only + no salary + Rs-formatting carried as Global Constraints.
- Type consistency: `MobileApprovalItem`/`MobileApprovalsResponse` defined T2, consumed T3/T4/T9/T11; `adminHome` shape defined T5, consumed T10.
