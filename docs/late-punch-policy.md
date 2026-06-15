# Late-Punch Policy — Operator Guide

**Shipped:** 2026-06-16 (`main` @ `c202b81`)
**Tier:** Attendance feature (rides on the existing Attendance module; bonus block requires Payroll/Business)
**Status:** Live, **off by default** per org. Email channel works immediately; WhatsApp needs operator setup (see §7).

Design spec: `docs/superpowers/specs/2026-06-16-late-punch-policy-design.md`
Implementation plan: `docs/superpowers/plans/2026-06-16-late-punch-policy.md`

---

## 1. What it does

An optional, per-org rule: an employee who **punches in late more than N days in a calendar month** (the org picks N — e.g. 2, 3, 6) becomes **ineligible for that month's incentive/bonus**. Affected employees are notified by **WhatsApp and/or email** — on each late punch, and again when they cross the threshold. The rule can target **specific departments and/or specific employees**.

The whole feature is dark until an admin enables it. When disabled, nothing runs in the clock-in path or payroll — zero behaviour change.

---

## 2. How "late" is decided

At clock-in, lateness is computed from data already captured:

- **With an assigned shift:** late ⇔ `clock_in_at` (IST) is after `shift.start_time + shift.grace_minutes`.
- **Without a shift:** late ⇔ `clock_in_at` (IST) is after the rule's **fallback cutoff time** (e.g. `09:30`). If no fallback is set, the punch is not evaluated.
- **Overnight shifts are not evaluated in v1** (boundary-wrap handling is deferred).

The late flag (`is_late`, `late_minutes`) is written onto the `attendance_records` row.

---

## 3. The consequence (bonus block)

- When an employee's late-day count for the IST month reaches the threshold, a row is upserted into **`late_policy_flags`** (`status = 'flagged'`).
- In Payroll, `addPayrollLineItem` **refuses** to add a `category = 'bonus'` line item for a flagged employee that month:
  > *"Employee is bonus-ineligible this month (N late days). Override required."*
- An admin can **override** from the Payroll UI (red "Bonus-ineligible · N late days" badge → reason required). Override flips the flag to `status = 'overridden'`, after which bonuses are allowed and the badge shows "Bonus override applied".
- Only `bonus` line items are blocked — allowances, reimbursements, overtime, and "other" are unaffected. Tax math is unchanged.

---

## 4. Notifications

Two moments, each optional via toggles:

| Kind | When | Email subject |
|------|------|---------------|
| `late` | every late punch (`notify_on_late`) | "Late punch-in recorded" |
| `warn` | optional, when count hits `warn_at` (must be below threshold) | "Late punch-in recorded" |
| `threshold` | the punch that crosses the threshold (`notify_on_threshold`) | "Bonus eligibility update — <Month Year>" |

- Sent **non-blocking** from the clock-in path via `waitUntil` — a notification failure never blocks or slows clock-in.
- **Idempotent**: each `(attendance_record_id, kind, channel)` is claimed in `late_punch_notifications` before sending (claim-then-send), so a retry cannot double-send.
- **Email** always available (Resend, from `support@jambahr.com`). **WhatsApp** only fires when the org has an active provider configured AND the employee has `whatsapp_opt_in = true` AND a phone number on file.
- Candidate/employee-facing messages never contain internal reasons.

---

## 5. Targeting (who the rule covers)

Covered employees = (everyone in the targeted **departments**) ∪ (individually targeted **employees**). An empty target set ⇒ the rule applies to nobody. Configured via a nested multi-select in Settings → Attendance → Late Policy.

---

## 6. Configuration (admin)

**Settings → Attendance → Late Policy** (visible only when attendance is enabled and you're an admin):

- **Enabled** — master switch for the feature
- **Rule name**, **Late days / month before block** (threshold), **Fallback cutoff (no shift)**, **Warn at** (optional, must be below threshold)
- **Notify on each late punch**, **Notify on threshold**, channel toggles **Email** / **WhatsApp**
- **Applies to** — department + employee nested multi-select

Server actions live in `src/actions/late-policy.ts` (`getLatePolicy`, `upsertLatePolicy`, `getLateFlagsForMonth`, `overrideLateFlag`). One policy per org (DB-unique on `org_id`).

---

## 7. WhatsApp setup (operator — required before WhatsApp sends)

WhatsApp is **per-org, bring-your-own (BYO)** via an adapter registry (`src/lib/whatsapp/`). Until configured, the rule runs **email-only with no errors**.

Configure at **Settings → Attendance → WhatsApp provider**: pick provider, paste API key (encrypted at rest), set endpoint + the three template names, mark **Active**, and use **Send test**.

### Provider options
- **AiSensy / WATI** — Indian BSPs. Org plugs in its own key. Concrete adapters ready.
- **Centralized** — JambaHR's own number/account via env vars (the fallback for orgs with nothing of their own). Requires the env vars below.
- **Omni** — **deferred**: `resolveProvider` returns `null` for `omni` until its API surface is confirmed and an adapter is written. The org on Omni stays email-only until then.

### Templates (Meta approval, ~1–2 days)
Three **Utility-category** WhatsApp templates must be pre-approved in the provider/Meta console and mapped in the UI (or via the centralized env vars):
`late_punch_alert`, `bonus_ineligible_alert`, `late_warning`.

### Env vars (centralized adapter only)
```
WHATSAPP_CENTRALIZED_PROVIDER     # "aisensy" | "wati"
WHATSAPP_CENTRALIZED_API_KEY
WHATSAPP_CENTRALIZED_ENDPOINT
WHATSAPP_CENTRALIZED_TPL_LATE         # defaults to "late_punch_alert"
WHATSAPP_CENTRALIZED_TPL_INELIGIBLE   # defaults to "bonus_ineligible_alert"
WHATSAPP_CENTRALIZED_TPL_WARN         # defaults to "late_warning"
```
Per-org BYO credentials live encrypted in `org_whatsapp_credentials` (AES-256-GCM, reusing `RAZORPAYX_CRED_ENCRYPTION_KEY`).

### Cost (India, 2026, indicative)
Utility-category WhatsApp messages run ~₹0.12–0.16 each (not marketing rate). For a 50-person org generating ~80 alerts/month that's ~₹12/month in Meta fees; the dominant cost is the flat BSP subscription (AiSensy ~₹999–2,400/mo or WATI ~₹4,000+/mo) — and only for the centralized fallback that JambaHR runs. BYO orgs pay their own provider.

---

## 8. Cron

`/api/cron/late-policy-reconcile` — daily at **20:00 UTC (01:30 IST)**, Bearer `CRON_SECRET`. A safety net: recomputes the current IST month's late-day counts for every enabled policy and upserts flags it missed. Never re-flags an `overridden` month. Registered in `vercel.json`.

---

## 9. Database (migrations 061–065, applied to live HRme DB)

| Migration | Adds |
|-----------|------|
| `061_late_policies` | `late_policies` (one rule per org) + `late_policy_targets` (dept/employee union) + RLS |
| `062_late_policy_flags` | `late_policy_flags` (monthly verdict, unique on org+employee+month) + RLS |
| `063_late_punch_notifications` | delivery log (unique on record+kind+channel) + RLS |
| `064_org_whatsapp_credentials` | per-org BYO provider config, encrypted key + RLS |
| `065_attendance_late_columns` | `attendance_records.{is_late, late_minutes, late_policy_id}` + `employees.{whatsapp_opt_in, whatsapp_opt_in_at}` |

RLS uses the Clerk-JWT pattern; service-role bypasses by design (same as the rest of the app).

---

## 10. Security note

`loadProviderConfig` (returns a **decrypted** API key) and `dispatchLateNotifications` (sends + handles PII) are **plain `lib/` modules, not `"use server"` files**, on purpose: any `export` in a `"use server"` file becomes a browser-callable RPC endpoint, so server-internal helpers that touch secrets/PII must never live there. Mirrors the `src/lib/payroll/disbursement-reconcile.ts` precedent. Do not move them into `src/actions/`.

---

## 11. v1 limitations / future work

- Overnight shifts not lateness-evaluated.
- Calendar-month period only (no rolling 30-day or pay-cycle).
- Consequence = bonus block only (no automatic penalty deductions).
- Single org-wide rule; targeting selects *who it covers*, not per-department different thresholds.
- Omni WhatsApp adapter not yet built.
- No AI-assistant help article yet (the UI lives under the existing `/dashboard/settings` route, so no route-registry entry is required; a help article is an optional nice-to-have that would need an `embed:help` re-index).
