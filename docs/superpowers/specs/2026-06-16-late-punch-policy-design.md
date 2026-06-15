# Design Spec — Configurable Late-Punch Policy → Bonus Suppression + WhatsApp/Email Alerts

**Date:** 2026-06-16
**Status:** Approved design, ready for implementation plan
**Module:** Attendance + Payroll + new Notifications (WhatsApp) infra

---

## 1. Problem & Goal

Owners/admins want an **optional, per-org rule**: employees who punch in late more than a
configurable number of days in a calendar month (2 / 3 / 6 / N) become **ineligible for
incentive/bonus** that month. Affected employees are **notified by WhatsApp and email** — both
on each late punch and when the consequence triggers. The whole feature, and the WhatsApp
channel specifically, must be **switchable per organization** and cost nothing when off.

This rides on infrastructure that already exists:
- `shifts.start_time` + `shifts.grace_minutes` already model the on-time boundary (today they're
  stored but never consumed — see infra map).
- `clockIn` already resolves the active shift for an employee at punch time.
- `payroll_line_items` (category `bonus`) is the existing incentive mechanism.
- Resend + React Email is the existing email channel.

The genuinely new infra is **WhatsApp** (none exists today) and a **per-org provider abstraction**.

---

## 2. Locked Decisions

| # | Decision | Choice |
|---|----------|--------|
| D1 | "Late" definition | **Shift `start_time` + `grace_minutes`** (IST). Per-rule `fallback_cutoff_time` for employees with no assigned shift. |
| D2 | Consequence | **Flag bonus-ineligible + block `bonus` line items** in payroll, with an admin override escape hatch. |
| D3 | Rule scope/targeting | Per-org rule that targets **specific departments AND/OR specific employees** via a nested multi-select (select/unselect both). |
| D4 | Threshold period | **Calendar month (IST).** |
| D5 | WhatsApp ownership | **Per-org provider** (BYO). Adapter pattern. v1 concrete adapters: centralized + AiSensy/WATI. Omni adapter is a follow-up once its API is confirmed. Email-only fallback when no provider configured. |
| D6 | Optionality | Two independent switches: `late_policies.enabled` (whole feature) and per-org WhatsApp provider config (channel availability). |
| D7 | Notification moments | (a) on each late punch, (b) when threshold crossed, (c) optional warn at N-1. Non-blocking via `waitUntil`. |

---

## 3. Data Model

### 3.1 New tables

**`late_policies`** — one row per org (the rule)
- `id` uuid pk, `org_id` uuid fk
- `enabled` boolean default false  ← per-org master switch for the feature
- `name` text
- `threshold_days` int (e.g. 3) — late days in the period before consequence
- `period` text default `'calendar_month'` (only value in v1)
- `late_definition` text default `'shift_grace'`
- `fallback_cutoff_time` time null — used when employee has no resolvable shift
- `notify_on_late` boolean default true
- `notify_on_threshold` boolean default true
- `warn_at` int null — if set (e.g. threshold-1), send a warning alert at this count
- `channel_whatsapp` boolean default false
- `channel_email` boolean default true
- `consequence` text default `'block_bonus'` (only value in v1)
- `created_at`, `updated_at` timestamptz
- One policy per org in v1 (unique on `org_id`).

**`late_policy_targets`** — powers the nested dept/employee select
- `id` uuid pk, `org_id` uuid fk, `policy_id` uuid fk (on delete cascade)
- `target_type` text check in (`'department'`, `'employee'`)
- `target_id` uuid — department_id or employee_id
- unique `(policy_id, target_type, target_id)`
- **Resolution:** covered employees = (all active employees in targeted departments) ∪
  (individually targeted employees). Empty target set ⇒ policy applies to nobody.

**`late_policy_flags`** — the monthly verdict payroll reads
- `id` uuid pk, `org_id` uuid fk, `policy_id` uuid fk
- `employee_id` uuid fk
- `month` text (`YYYY-MM`, IST)
- `late_days_count` int
- `status` text check in (`'flagged'`, `'overridden'`) default `'flagged'`
- `override_by` uuid null (fk employees), `override_reason` text null, `overridden_at` timestamptz null
- `created_at`, `updated_at` timestamptz
- unique `(org_id, employee_id, month)`

**`late_punch_notifications`** — idempotency + delivery log
- `id` uuid pk, `org_id` uuid fk
- `attendance_record_id` uuid fk (on delete cascade)
- `employee_id` uuid fk
- `kind` text check in (`'late'`, `'threshold'`, `'warn'`)
- `channel` text check in (`'whatsapp'`, `'email'`)
- `status` text check in (`'sent'`, `'failed'`, `'skipped'`)
- `provider` text null, `provider_message_id` text null, `error` text null
- `created_at` timestamptz
- unique `(attendance_record_id, kind, channel)` ← prevents double-send

**`org_whatsapp_credentials`** — per-org BYO provider config (encrypted)
- `id` uuid pk, `org_id` uuid fk unique
- `provider` text check in (`'omni'`, `'aisensy'`, `'wati'`, `'meta'`, `'centralized'`)
- `api_key_encrypted` text null, `endpoint` text null, `extra_encrypted` jsonb null
  (encrypted via existing `src/lib/crypto/aes-gcm.ts` + `RAZORPAYX_CRED_ENCRYPTION_KEY`)
- `template_map` jsonb — maps internal template keys → provider template names/ids
- `active` boolean default false
- `created_at`, `updated_at` timestamptz

### 3.2 Column additions

- `attendance_records`: `is_late` boolean default false, `late_minutes` int null,
  `late_policy_id` uuid null — set at clock-in.
- `employees`: `whatsapp_opt_in` boolean default false, `whatsapp_opt_in_at` timestamptz null.
  (`employees.phone` already exists from migration 001.)

### 3.3 Migrations (Supabase SQL Editor — Windows gotcha #4)

Numbered after the current max (next free numbers, run in order, idempotent):
1. `0XX_late_policies.sql` — `late_policies` + `late_policy_targets` (+ RLS, Clerk-JWT pattern)
2. `0XX_late_policy_flags.sql` — `late_policy_flags` (+ RLS)
3. `0XX_late_punch_notifications.sql` — log table (+ RLS)
4. `0XX_org_whatsapp_credentials.sql` — credentials table (+ RLS)
5. `0XX_attendance_late_columns.sql` — `attendance_records` + `employees` column adds

RLS enabled on all; service-role bypasses by design (gotcha #5).

---

## 4. Lateness Computation (clock-in flow)

Hook into the **existing `clockIn` server action** in `src/actions/attendance.ts`, after the
`attendance_records` row is inserted:

1. **Resolve policy:** load the org's `late_policies` where `enabled = true`; check the employee
   is in the resolved target set (`late_policy_targets`). If no enabled policy or employee not
   targeted → return as today (zero behaviour change).
2. **Compute lateness:**
   - If a shift resolved at clock-in: `boundary = shift.start_time + grace_minutes`.
   - Else: `boundary = fallback_cutoff_time` (skip if null).
   - `is_late = clock_in_at (IST) > boundary`; `late_minutes = max(0, diff)`.
   - Persist `is_late`, `late_minutes`, `late_policy_id` on the record.
3. **Count + flag:** count this employee's `is_late = true` rows for the IST month
   (by `attributed_date`/`date`). If `count >= threshold_days` → upsert `late_policy_flags`
   row (`status='flagged'` unless already `'overridden'` — never re-flag an overridden month).
4. **Notify (via `waitUntil`, non-blocking):**
   - If `notify_on_late` → `kind='late'`.
   - If just crossed threshold this punch and `notify_on_threshold` → `kind='threshold'`.
   - If `warn_at` set and `count == warn_at` → `kind='warn'`.
   - Each (record, kind, channel) guarded by `late_punch_notifications` unique constraint.

**Safety-net cron** `/api/cron/late-policy-reconcile` (daily, Bearer `CRON_SECRET`): recompute
flags for the current IST month across enabled orgs and retry `status='failed'` notifications.
Idempotent; mirrors `attendance-auto-clockout` structure.

---

## 5. Payroll Integration (the consequence)

In `addPayrollLineItem` (`src/actions/payroll.ts`), when `category === 'bonus'`:
1. Derive the run's `month` from the payroll run.
2. Look up `late_policy_flags` for `(org_id, employee_id, month)`.
3. If a row exists with `status='flagged'` → **reject** with
   `"Employee is bonus-ineligible this month (N late days). Override required."`
   unless the caller passes `override: true`.
4. Overriding writes `late_policy_flags.status='overridden'` + `override_by`/`override_reason`/
   `overridden_at` (admin-only).

Tax math unchanged. `recomputeEntryFromLineItems` is unaffected.

**Payroll UI:** flagged entries show a red **"Bonus-ineligible — N late days"** badge with an
admin **Override** action (reason required) that flips the flag and unblocks bonus entry.

---

## 6. WhatsApp Provider Abstraction

`src/lib/whatsapp/` — a thin **provider registry** behind one interface:

```ts
interface WhatsAppProvider {
  sendTemplate(input: {
    to: string;                       // E.164 phone
    templateKey: "late_punch_alert" | "bonus_ineligible_alert" | "late_warning";
    variables: Record<string, string>;
  }): Promise<{ ok: boolean; providerMessageId?: string; error?: string }>;
}
```

- **v1 concrete adapters:** `centralized` (JambaHR's own number, env-configured),
  `aisensy`, `wati`.
- **Follow-up adapter:** `omni` — added once its API surface (endpoint/auth/template format) is
  confirmed. Interface and per-org config already accommodate it.
- **Resolution at send time:** load `org_whatsapp_credentials` for the org → decrypt key →
  instantiate the matching adapter → map internal `templateKey` via `template_map`. If no active
  provider for the org → skip WhatsApp, log `status='skipped'`, still send email.
- **Templates:** 3 pre-approved **Utility-category** templates per provider account
  (`late_punch_alert`, `bonus_ineligible_alert`, `late_warning`).
- **Consent gate:** only send WhatsApp if `employees.whatsapp_opt_in = true` and a phone exists.
- Email always available (reuses Resend); two new React Email templates:
  `late-punch-alert.tsx`, `bonus-ineligible-alert.tsx`.

### 6.1 Cost (India, 2026)

- **Meta per-message (Utility):** ~₹0.12–0.16/message (transactional category — *not* marketing
  rate ~₹0.78). Worked example: a 50-person org generating ~80 alerts/month ≈ **~₹12/month**.
- **BSP platform subscription** (only for the centralized fallback that *you* run):
  AiSensy ~₹999–2,400/month flat, or WATI ~₹4,000+/month. This flat fee dominates; per-message
  cost is negligible at SMB scale.
- **BYO orgs (Omni etc.) pay their own provider** — zero marginal cost to JambaHR.

---

## 7. Optionality

- `late_policies.enabled = false` (default) → nothing runs in `clockIn` or payroll. Feature dark.
- No `org_whatsapp_credentials` active row → WhatsApp channel unavailable; rule runs **email-only**
  with no errors.
- Provider is per-org, so the Omni org uses Omni, others use email now, centralized lights up
  later without schema changes.

---

## 8. Settings UI

New **"Late Policy"** card in **Settings → Attendance** (`src/components/settings/`), rendered only
when `attendanceEnabled && isAdmin`, following the existing `CollapsibleSection`/card pattern:
- Enable toggle, rule name, `threshold_days`, `fallback_cutoff_time`, `warn_at`.
- Notification toggles (`notify_on_late`, `notify_on_threshold`) + channel toggles
  (`channel_email`, `channel_whatsapp`).
- **Nested multi-select** for targets: departments and employees in one control with
  select/unselect for both (grouped list; checking a department covers its members,
  individual employees addable on top).
- Separate **WhatsApp provider** sub-card: provider dropdown + credential fields (encrypted on
  save) + template-name mapping + a "Send test message" button.

Profile UI gains a **WhatsApp opt-in** toggle + phone field surfacing (consent capture).

---

## 9. New Infra / Setup Checklist

1. WhatsApp BSP account(s) + verified WhatsApp Business number + **3 approved Utility templates**
   (Meta approval ~1–2 days). Per-org for BYO; one for the centralized fallback.
2. **Env vars:** `WHATSAPP_CENTRALIZED_PROVIDER`, `WHATSAPP_CENTRALIZED_API_KEY`,
   `WHATSAPP_CENTRALIZED_ENDPOINT`, centralized template names. (Per-org creds live encrypted in DB.)
   Reuse existing `RAZORPAYX_CRED_ENCRYPTION_KEY` for at-rest encryption.
3. **5 migrations** via Supabase SQL Editor.
4. **Employee phone + WhatsApp opt-in** capture in profile UI.
5. **1 new cron** (`/api/cron/late-policy-reconcile`) registered in `vercel.json` (`CRON_SECRET` set).
6. **Settings → Attendance** "Late Policy" card + WhatsApp provider sub-card.

---

## 10. Out of Scope (v1)

- Omni concrete adapter (follow-up; interface ready).
- Rolling-30-day or pay-cycle periods (only calendar month).
- Auto-deduction / penalty line items (only bonus-block).
- Per-department *different* thresholds (single org rule; targeting only selects who it covers).
- Monthly summary digest alert (can add later as a 4th `kind`).
- Half-day / early-leave penalties (only late punch-in).

---

## 11. Testing Strategy

- **Unit:** lateness boundary math (shift+grace, fallback, overnight edge), month counting,
  target resolution (dept ∪ employee), threshold-crossing detection, idempotent notification keys.
- **Integration:** `clockIn` sets `is_late`/flags correctly; `addPayrollLineItem` blocks/overrides
  bonus for flagged employees; provider registry resolves + falls back to email.
- **Manual:** end-to-end with the demo org (toggle policy, simulate late punches, verify
  flag + payroll block + email; WhatsApp via test-send once a provider is wired).
