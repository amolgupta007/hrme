# Mobile Phase D — Slice 3 (Push, FlashList, Payslip PDF, Account Deletion) — SCOPING + PLAN

**Date:** 2026-08-11 · **Status:** planned; staged by external dependency (needs Amol's go on the blocked parts)
**Source:** `docs/prds/mobile/02A-PHASE-D-DECISIONS.md` D3 row + `05-PRD-Release-Compliance.md` (account deletion).

## The four D3 items are NOT equal — staged by what blocks them

| Item | Native rebuild? | External dependency | Decision needed | Buildable now? |
|---|---|---|---|---|
| **Payslip PDF** | No (server-rendered) | none | none | ✅ **Yes — fully** |
| **FlashList perf sweep** | Yes (new native dep) | a fresh EAS dev build to test on device | none | ⚠️ Code now, device-verify needs rebuild |
| **Account-deletion flow** | No | Apple requires it before App Store submit (PRD-05) | **Policy: what does "delete my account" mean for a B2B org member?** | ⚠️ After the policy decision |
| **Push notifications** | Yes (`expo-notifications`) | **Apple APNs auth key** (Amol, Apple Dev portal) + FCM (Android) + a fresh EAS build | Its **own mini-PRD** (in-app notification table + which events) | ❌ Blocked — plan separately |

## Stage A — Payslip PDF (buildable now, zero blockers)

Reuse `@react-pdf/renderer` (already in apps/web, v4.5.1 — same pipeline as attendance reports + document templating).
- **NEW** `GET /api/mobile/payslips/[entryId]/pdf` — auth + the SAME org+employee IDOR guard + draft-exclusion as the detail route; renders a payslip PDF (net hero, earnings/deductions, line items, org name) via `renderToBuffer`; streams `application/pdf` with `Content-Disposition: attachment; filename="payslip-<month>.pdf"`. `maxDuration=30`.
- Pure PDF component in `apps/web/src/lib/mobile/payslip-pdf.tsx` (mirror `attendance-pdf.tsx` idioms; Helvetica; mono amounts + Indian grouping via shared `formatINR`; red − deductions).
- Mobile: payslip detail screen gets a "Download / Share PDF" button → opens the authed URL (Bearer + X-Org-Id) via `expo-sharing`/`Linking` or fetches the blob and shares. `expo-sharing` may be a new dep (check; if native, folds into the Stage-B rebuild).
- Tests: route 401/403, IDOR 404, draft 404, 200 pdf; pure component render probe (byte-size + pdftotext, like the reports probe).
- **Ships independently** — a normal PR, no device rebuild required (mobile just opens a URL).

## Stage B — FlashList perf sweep (code now, device-verify on next rebuild)

`npx expo install @shopify/flash-list` (native dep → requires a new EAS dev build to run on device; MMKV/FlashList both need a dev build per 02A). Swap the long scrollable lists to `FlashList` with `estimatedItemSize`:
- People directory, leave requests (Mine + Approvals), payslips list. Keep `expo-image` (already installed) for avatars.
- Lockfile guard after install. Code + typecheck/lint + Metro bundle now; on-device perf verify rides Stage D's rebuild or a standalone EAS build.
- Low-risk, mechanical; bundles naturally with the push rebuild (both need a fresh native build anyway).

## Stage C — Account-deletion flow (needs a POLICY decision first)

Apple requires an in-app account-deletion path for App Store approval (PRD-05). But JambaHR is **B2B** — an employee is an org member; you can't hard-delete the `employees` row (breaks attendance/payroll history, headcount, the admin's records). Options to decide (see the question to Amol):
- **(a) Request-deletion** (recommended, B2B-correct): "Delete my account" → sends a request to the org admin(s) + records it; admin handles offboarding via the existing terminate flow. Satisfies Apple ("a way to initiate deletion") without destroying org data. Small BFF + confirm UI.
- **(b) Self-terminate**: the button terminates the employee's own membership (status='terminated') + revokes their Clerk session. Aggressive; loses nothing Apple needs but lets staff self-exit — probably NOT what an HR product wants.
- **(c) Full data-deletion** (DPDP-max): actually deletes/anonymizes the person's PII. Heavy; likely overkill for v1 and conflicts with statutory payroll retention.

## Stage D — Push notifications (own mini-PRD + Apple APNs + native rebuild — BLOCKED)

Not blind-buildable. Requires, in order:
1. **A mini-PRD** (decisions): a general in-app `notifications` table (none exists — only `late_punch_notifications`); which events push (02A trigger points: leave approved/rejected, payslip paid, doc reminder); per-user push-token storage; opt-in/consent.
2. **`expo-notifications` install + EAS dev build** (native).
3. **Apple APNs auth key** (Amol, Apple Developer portal → Keys → create an APNs key; upload to EAS/Expo) + **FCM server key** for Android (Google, when Android track starts).
4. Then: token registration on sign-in, a `POST` to store tokens, server-side send on the trigger events (via Expo Push API), the in-app notification list screen, and the Home bell (deferred from D2's 2a on purpose).
This is a **slice of its own** — recommend a dedicated plan + PRD once the APNs key exists.

## Recommended order
Stage A (ship now) → Stage C (after the policy pick) → Stage B (bundle with) → Stage D (separate, after Apple APNs). Each stage is its own PR + review.

## "D4" note
There is no D4 slice. The next mobile *phase* is **Owner/Admin (PRD-03)** — approvals dashboards, org lookup, admin surfaces on mobile — a separate 2-3 session phase that gets its own brainstorm + plan when D3 is done.
