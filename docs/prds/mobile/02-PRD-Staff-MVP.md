# PRD 02 — Staff Self-Service MVP

**Product:** JambaHR Mobile · **Status:** Ready for Claude Code · **Priority:** 2 of 5
**Prereqs:** PRD-01 complete

---

## Instruction to Claude Code (read first)

> **Investigate before you build.** For each module below, first inspect the corresponding web implementation in `apps/web` and the Supabase schema: attendance tables (including the Attendance Zone / multi-punch pairing model and biometric punch ingestion — mobile must coexist with device punches, not conflict with them), leave tables and balance logic, payslip storage/PDF generation, notification patterns. Write a per-module plan mapping existing queries → mobile screens. Approval gate before code.

---

## 1. Goal

Ship the screens a staff member opens every single day. Success = an employee can live entirely on mobile for attendance, leave, and payslips.

## 2. Modules

### 2.1 Home (staff)
- Greeting + today's status card: shift (if assigned), punch-in state, hours so far.
- Quick actions row: Punch In/Out · Apply Leave · View Payslip.
- Upcoming: next holiday, pending request statuses.
- This screen must load from cache instantly and revalidate in background.

### 2.2 Attendance
- **Today view:** punch in / punch out button with timestamp confirmation; server time is authoritative. Mobile punches must be recorded with `source = 'mobile'` and flow into the same pairing model as biometric device punches (inspect the multi-punch pairing logic before designing writes).
- **History:** month calendar with day states (present / absent / half-day / week-off / holiday / leave), tap a day for punch detail.
- **Regularization:** request correction for a day (reason + proposed times) → goes to approval queue.
- Optional (flag-gated): capture coarse location on mobile punch if the org enables it — permission prompt with clear purpose text (DPDP consent language).

### 2.3 Leave
- Balance cards per leave type (CL/SL/EL etc. — read types from org config, never hardcode).
- Apply flow: type → dates (half-day support if web has it) → reason → submit.
- My requests list with status; cancel pending requests.

### 2.4 Payslips
- Month list → payslip detail (earnings/deductions summary rendered natively) → download/share PDF (reuse the exact PDF the web generates; no separate template).

### 2.5 Profile
- View personal details, bank (masked), documents list.
- Edit only what web allows employees to self-edit (inspect and match permissions exactly).
- **Account deletion request** entry point (required by Apple — see PRD-05).
- Biometric app-unlock toggle (FaceID/TouchID via `expo-local-authentication`).

### 2.6 Push notifications (Expo Push)
- Ask permission contextually after first successful login, not at cold start.
- Events: payslip published, leave approved/rejected, regularization decided, attendance reminder (org-configurable).
- Deep link every notification to its screen (Expo Router linking config).
- Backend: notification dispatch function (Supabase Edge Function or existing pattern — inspect how web sends emails via Resend and mirror the trigger points).

## 3. Cross-cutting requirements
- All reads through typed helpers in `packages/supabase`; RLS is the security boundary — no service-role key ever ships in the app.
- React Query (TanStack) for caching/revalidation; optimistic UI for punch and leave apply with rollback on failure.
- Empty states, error states, and skeletons for every list.
- All timestamps handled in org timezone (IST default) — inspect web conventions.

## 4. Non-goals
Owner/admin features, payroll editing, shift configuration, JambaGeo tracking.

## 5. Acceptance criteria
- Punch from mobile appears correctly paired in the web attendance view.
- Leave applied on mobile is approvable on web and balance updates reflect on both.
- Payslip PDF opens/shares on iPhone.
- Notification tap lands on the correct screen from a cold start.
- Cold start to interactive Home < 2s on a mid-range device.
