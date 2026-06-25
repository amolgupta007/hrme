# JambaHR — Contractor / Contingent Workforce Feature Audit

## Purpose
This document is a **codebase audit + planning prompt** for Claude Code. We have a prospective client (a creative agency managing comedians/creative talent) with **~20 full-time employees + 20–30 contractual/freelance creatives**. They currently have **zero HR infrastructure**.

The goal of this exercise is to answer three questions:
1. **What contractor-specific features already exist** in the JambaHR codebase today (readily demoable)?
2. **What is partially built** or could be quickly adapted from existing employee features?
3. **What net-new contractor features should we build**, prioritized by demo/sales value vs. effort?

---

## Instructions for Claude Code

> **Inspect the codebase first. Do not assume.** Follow the standard workflow: plan-first, codebase-first inspection, no execution without approval.

### Step 1 — Audit current state
Search the codebase and produce a table mapping each capability below to one of:
- `READY` — exists and works for contractors today
- `PARTIAL` — exists for employees, needs adaptation (note the file/module)
- `MISSING` — does not exist

For each `PARTIAL`/`READY`, cite the relevant file paths, DB tables, RLS policies, and Clerk role gates.

### Step 2 — Identify the "contractor vs employee" data model gap
Critically check: **does the schema currently distinguish a contractor from an employee?**
- Is there an `employment_type` / `worker_type` enum on the worker/employee table?
- Do payroll, attendance, PF/ESI/PT/TDS, and leave modules branch on that type, or do they assume everyone is a salaried employee?
- This is the single most important finding — flag it explicitly.

### Step 3 — Propose phased build plan
Output a phased plan (Phase 1 = demo-ready quick wins, Phase 2 = depth, Phase 3 = nice-to-have), with effort estimates and which existing modules each builds on.

---

## Capability checklist to audit

### A. Worker classification & data model
- [ ] `worker_type` / `employment_type` field (employee vs contractor vs intern)
- [ ] Contractor-specific profile fields (engagement type, rate type: hourly/daily/monthly/milestone, contract start/end, renewal date)
- [ ] Misclassification guardrails (warn if a contractor is configured like an employee — statutory deductions, leave accrual, etc.)
- [ ] Grouping/tagging of contractors (by project, client, skill — equivalent to WorkMarket's "Labor Clouds")

### B. Onboarding
- [ ] Self-service contractor onboarding (invite link, contractor fills own details)
- [ ] Document collection: PAN, GST registration (if applicable), bank details, cancelled cheque
- [ ] Contract / agreement generation (vs. existing LOI/offer automation in JambaHire)
- [ ] **IP assignment clause** handling — critical for creative work (who owns the comedy/creative output)
- [ ] NDA collection & tracking
- [ ] Bank account / identity verification (penny-drop via RazorpayX?)

### C. Contracts & document lifecycle
- [ ] Contract repository with expiry/renewal alerts
- [ ] Versioning of agreements
- [ ] E-signature flow (or integration hook)
- [ ] Auto-reminders before contract end date

### D. Payments (the core value prop)
- [ ] Contractor payouts **separate from salaried payroll run** (no PF/ESI/PT)
- [ ] **TDS handling: Section 194J (professional/creative) & 194C (contract)** — deduct, track, generate certificate data
- [ ] Flexible pay cycles: monthly / per-project / milestone / per-gig
- [ ] Invoice ingestion or **auto-invoice generation on behalf of contractor** (incl. GST where registered)
- [ ] Bulk payout via RazorpayX (maker-checker) — reuse existing disbursement
- [ ] Payment history / payout statement self-service for contractor
- [ ] Form 16A / TDS certificate generation (year-end equivalent of US 1099-NEC)
- [ ] Active-only billing concept (only pay/track when engaged)

### E. Time / deliverable tracking (lightweight — NOT biometric)
- [ ] Project/assignment-based work tracking
- [ ] Milestone/deliverable status (vs. hour-by-hour attendance)
- [ ] Mobile/web check-in for those who need it (skip biometric — creative talent is remote)
- [ ] Expense submission & reimbursement for contractors

### F. Self-service portal
- [ ] Contractor login (Clerk role: scoped, minimal — NOT employee-level access)
- [ ] Download payout statements, TDS certificates, contracts
- [ ] Update own bank/PAN details
- [ ] Submit invoices/expenses

### G. Reporting & spend visibility
- [ ] Contractor spend by project / client / individual
- [ ] Cost & profitability view (esp. relevant for an agency billing clients)
- [ ] TDS liability summary for compliance
- [ ] Active vs. inactive contractor counts

---

## Recommended NET-NEW features (my suggestions — validate against codebase)

These go beyond a basic checklist and are differentiators for an **agency / creative-talent** client specifically:

1. **Client → Project → Contractor mapping.** Since an agency bills its own clients, link each contractor engagement to an end-client and project. Enables "spend per client" and margin views. *This is the killer feature for an agency and most generic HR tools don't do it well.*

2. **IP & rights ledger.** A structured record of what creative output each contract covers and who owns it (work-for-hire vs. licensed). Searchable. Big trust signal for a creative agency.

3. **Royalty / revenue-share payouts.** Comedians/creatives are sometimes paid on revenue share, not flat fee. A payout type that computes % of a tracked revenue line would be unique.

4. **Engagement renewal pipeline.** Kanban (reuse JambaHire's drag-and-drop) showing contracts approaching expiry → renew / renegotiate / offboard.

5. **TDS auto-section detection.** Suggest 194J vs 194C based on engagement type, with override. Reduces compliance errors for an SMB with no HR team.

6. **Unified "one pay run, two worker types"** — process employees (full statutory) and contractors (TDS-only) in the same disbursement screen but with correctly branched logic. This is what Gusto/OnPay market hardest; matching it is table stakes.

---

## Market reference (what established platforms ship)
For benchmarking only — adapt US concepts (1099-NEC/W-9) to Indian equivalents (Form 16A / PAN+GST):

- **Self-service onboarding** + digital doc collection + identity/bank verification (OnPay, WorkMarket, Gusto)
- **Same dashboard for employees + contractors, separate logic** — auto-disables employee-only features (withholding, benefits, leave) for contractors (OnPay)
- **Flexible/unlimited pay runs** — weekly, milestone, invoice-based (Gusto, Everee, Wrapbook)
- **Auto-generate invoices on behalf of workers**, Net 15 / Net 30 terms (WorkMarket)
- **Year-end tax form generation & e-filing** (1099-NEC ↔ our Form 16A)
- **Contractor agreements, certifications, NDAs collected & stored** (WorkMarket)
- **Spend visibility by project/client/contractor; profitability analysis** (WorkMarket)
- **Misclassification assessment tools** (Deel, Multiplier, Rippling)
- **Contractor grouping** ("Labor Clouds" by skill/geography) (WorkMarket)
- **Project-based payroll for temporary creative teams** — Wrapbook is explicitly built for media/agencies/productions assembling temporary teams; closest analog to this client.

---

## Output expected from this audit
1. The READY / PARTIAL / MISSING capability table with file references.
2. Explicit verdict on the data-model gap (Step 2).
3. A phased build plan with the Phase-1 set being demoable for the agency prospect.
