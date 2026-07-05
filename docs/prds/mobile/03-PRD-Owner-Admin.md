# PRD 03 — Owner / Admin Experience

**Product:** JambaHR Mobile · **Status:** Ready for Claude Code · **Priority:** 3 of 5
**Prereqs:** PRD-01, PRD-02

---

## Instruction to Claude Code (read first)

> **Investigate before you build.** Inspect the web dashboard (note the earlier UX review: actionable content was buried — mobile must not repeat this), the approval flows (leave, regularization, OT, payroll maker-checker), and role/permission checks. Confirm which roles map to the admin tab set. Plan → approval gate → build.

---

## 1. Goal

The owner's phone becomes the approval device. Everything that blocks an employee should be clearable from a lock-screen notification in under 15 seconds. Deep configuration stays web-only (parity rule).

## 2. Modules

### 2.1 Approvals inbox (the centerpiece)
- Unified list across request types with type chips: Leave · Regularization · OT · Payroll (checker).
- Card shows who / what / when / impact (e.g., leave balance after approval).
- Swipe or one-tap Approve / Reject with optional comment; batch-select for leave.
- Payroll maker-checker: checker sees run summary (headcount, total payout, exceptions) → approve/reject. **Approval action re-authenticates with device biometric** for payroll only.
- Push notification for every new pending item, deep-linked.

### 2.2 Home (owner/admin)
- Today: present/absent/late counts, pending approvals count (tap → inbox), payroll run status when in cycle.
- Follow the web UX-review principle: actionable first, vanity metrics later.

### 2.3 People (quick lookup)
- Search employee → mini profile: contact (tap-to-call/WhatsApp), today's attendance, leave balance, recent requests.
- No editing in v1 — link out "edit on web".

### 2.4 Reports (lightweight)
- Attendance summary for a date range (present %, late count) and leave summary. Charts native and simple; export/deep analysis stays on web.

## 3. Non-goals
Shift master config, salary structure config, geofence setup, org settings, employee CRUD.

## 4. Acceptance criteria
- A leave request created on mobile (staff) can be approved on mobile (owner) end-to-end, with both parties receiving correct push notifications.
- Payroll checker approval on mobile is recorded identically to web (same audit fields).
- Role-permission checks verified: a staff account can never reach admin routes (test both client guard and RLS).
