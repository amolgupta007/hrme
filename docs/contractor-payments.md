# Contractor Payments — Feature Guide (Demo / Training)

> **Audience:** sales demos, customer onboarding, and internal training.
> **Status:** Phase 1 shipped to production 2026-06-24. Phase 2 (agreements /
> NDA / IP e-signing) in progress — see the "Coming next" section.
> **Plan tier:** Business. **Who can use it:** org Owners and Admins.

---

## 1. What it does (the pitch)

JambaHR now manages **contractors and freelancers as a first-class worker type**,
not just salaried employees. For an agency running creative talent (comedians,
designers, editors) alongside full-time staff, this means **one platform, two
worker types, correctly separated**:

- Salaried employees → full statutory payroll (PF, Professional Tax, salary TDS).
- Contractors → **professional-fee TDS only (Section 194J / 194C)** — no PF, no
  PT, no salary slabs, no leave accrual.

You onboard a contractor, verify their bank account, and pay them an ad-hoc fee
with the **correct TDS auto-computed and deducted** — money moves from your own
RazorpayX wallet to the contractor, with a **maker-checker approval** in between.

**One-line demo hook:** *"Pay a freelancer ₹50,000 and watch JambaHR deduct the
right ₹5,000 TDS under Section 194J automatically — then a second admin approves
the payout. No spreadsheets, no manual TDS math, no mixing them into your salary
run."*

---

## 2. Before the demo — prerequisites

| Requirement | Where | Notes |
|---|---|---|
| Business plan | Settings → Billing | The **Contractors** sidebar item only appears on Business. |
| Signed in as Owner/Admin | — | Contractors area is admin-only. |
| At least one **contractor employee** | Employees → Add, set **Employment type = Contract** | This is the switch that makes someone a contractor. |
| Contractor's **bank account verified** | Employee's bank section → penny-drop | Payout is blocked until the account is penny-drop **verified/synced**. |
| **RazorpayX connected** (for real money) | Settings → Payroll → RazorpayX | Needed only to actually dispatch. You can demo the whole flow up to approval without it. |

> **Demo tip:** the `test1` demo org is the easiest place to run this. If
> RazorpayX isn't connected, the flow still works end-to-end up to the approval
> click, which then reports "RazorpayX not connected" — fine for a UI walkthrough.

---

## 3. The end-to-end flow (demo script)

Everything lives at **Dashboard → Contractors** (`/dashboard/contractors`).

### Step 1 — Make someone a contractor
Employees → Add employee (or edit an existing one) → set **Employment type =
Contract**. That single field is what routes them into the contractor world: they
are now excluded from salaried payroll runs and won't accrue leave.

### Step 2 — Create an engagement
Contractors page → **Add engagement**. Pick the contract employee and fill:

- **Rate type:** hourly / daily / monthly / **per milestone**
- **Rate amount** (₹)
- **TDS section:** **194J** (professional / technical / creative fees) or
  **194C** (contract work)
- **Payee type:** Individual/HUF or Other (drives the 194C rate)
- **Has PAN?** (no PAN → higher TDS, see §4)
- **Contract start / end / renewal date** (optional)

One active engagement per contractor. This is the contractor's "profile" for pay.

### Step 3 — Verify the bank account
From the employee's bank section, run the **penny-drop** verification (a ₹1 +
name-match check via RazorpayX). The contractor shows a **Bank verified** chip on
the Contractors list once synced. *Payout is blocked for anyone not verified* —
this is a deliberate guardrail.

### Step 4 — Pay the contractor
Contractors page → **Pay contractors**. Select one or more contractors, type the
**gross amount** for each. As you type, a **live TDS preview** shows, per row:

```
Gross ₹50,000  ·  194J @ 10%  ·  TDS ₹5,000  ·  Net ₹45,000
```

The preview uses the **same** section/payee/PAN inputs the server will use, so
**what you see is exactly what's deducted**. Submit → a payout batch is created in
**Awaiting approval**.

### Step 5 — Approve (maker-checker)
The new batch appears in the **Contractor payouts** section. Click **Approve &
pay** → confirm. By default a **different admin** must approve than the one who
created it (maker-checker) — this is the standard money-movement control. On
approval, JambaHR dispatches the payouts via RazorpayX (IMPS), with a
**"Contractor payment"** narration on the bank statement.

### Step 6 — The contractor's view
When the contractor signs in, they get a **deliberately narrowed experience** —
no Leaves, Objectives, Training, or Referrals (none of which apply to a
freelancer). They can see their **profile, bank details, and payout statements**.

---

## 4. TDS, explained simply (training)

JambaHR computes contractor TDS for **FY 2025-26** automatically. You only choose
the **section**; the rate and threshold logic are built in.

| Section | Use it for | Rate | Threshold (no TDS below) |
|---|---|---|---|
| **194J** | Professional / technical / **creative** fees | **10%** | ≤ ₹30,000 per payment |
| **194C** | Contract / works (Individual or HUF payee) | **1%** | < ₹30,000 single **and** < ₹1,00,000 for the year |
| **194C** | Contract / works (company / firm payee) | **2%** | same as above |
| **Any (no PAN)** | Missing PAN → Section 206AA | **20%** | threshold still applies |

**Worked examples:**
- Comedian, ₹50,000 creative fee, 194J, has PAN → **₹5,000 TDS**, net ₹45,000.
- Vendor (individual), ₹50,000 contract, 194C → **₹500 TDS** (1%), net ₹49,500.
- Same vendor but a registered company → **₹1,000 TDS** (2%).
- Any contractor without PAN → **₹10,000 TDS** (20%) regardless of section.

---

## 5. What's deliberately separated from salaried payroll

This is a key trust point for the demo:

- Contractors **never enter a salaried payroll run** — no PF, no Professional
  Tax, no salary-slab TDS, no Form-16 salary math applied to them.
- Contractors **don't accrue leave**.
- Contractor payouts are a **separate ad-hoc run**, not the monthly cycle.
- They still ride the **same secure rails** — penny-drop bank verification,
  RazorpayX disbursement, and maker-checker approval as salaried payroll.

---

## 6. Agreements, NDA & IP assignment (Phase 2 — shipped)

JambaHR now captures **who owns the creative output** via contractor agreements
and e-signatures.

### What it does

When you're about to pay a contractor, you can send them a **signed agreement**
covering three types:

- **Service agreement** — standard engagement terms (IP ownership: work-for-hire
  or licensed).
- **NDA** — confidentiality agreement (IP ownership not applicable).
- **IP assignment** — explicit intellectual property transfer (IP ownership:
  work-for-hire or licensed).

The contractor receives a **magic link** (no login required), reads the
agreement, and **types their full legal name to sign**. JambaHR records the
**typed signature, IP address, browser, and timestamp** as proof of signing.

**The agency talking point:** capture whether the comedian/designer owns their
own work (licensed) or whether you own all output as work-for-hire before the
first payment leaves your wallet.

### Demo steps

#### Step 1 — Send agreement

From **Dashboard → Contractors**, find the engagement and click **Send agreement**.

The dialog opens with:
- **Agreement type:** pick Service agreement, NDA, or IP assignment
- **IP ownership** (hidden for NDA): pick **Work-for-hire** (you own all output)
  or **Licensed** (contractor owns work, grants you a license)
- **Agreement body:** auto-generated template text. Edit it if needed (e.g.
  custom terms, payment milestones).
- **Expiry days** (optional): how long the contractor has to sign before the
  link expires (default: 30 days).

Click **Send**. The contractor gets an **email with a signing link**.

#### Step 2 — Contractor signs

The contractor opens the link (no login required) and lands on a **public signing
page** (`/agreements/[token]`). They:
1. Read the agreement terms
2. Type their **full legal name** in the signature field
3. Click **Sign**

JambaHR records the signature, IP address, browser user-agent, and exact
timestamp.

#### Step 3 — Track agreement status

Back on the **Contractors page**, each engagement now shows **agreement status
chips**:

```
Service · Signed          ← latest service agreement is signed
NDA · Sent               ← NDA is unsigned, awaiting signature
IP Assignment · Declined ← contractor declined the IP assignment
```

A subtle amber **"No signed agreement"** hint appears if no agreement is signed
yet — this is an **advisory signal only** (doesn't block payouts in Phase 2).

### Versioning and superseding

If you **re-send the same agreement type** to a contractor:
- If the prior version was **unsigned**, it is **superseded** (new version
  replaces it).
- If the prior version was **signed**, the new version is added as a separate
  record (signed history is preserved).

This lets you update terms without losing the audit trail.

---

## 7. Current limitations (set expectations honestly)

- **194C annual aggregate isn't tracked across payments yet.** TDS is computed
  **per payment**. A 194C contractor paid repeated sub-₹30,000 amounts won't have
  TDS auto-deducted even after crossing the ₹1,00,000 yearly threshold — verify
  aggregate liability manually for recurring 194C contractors. (Phase 3.)
- **No Form 16A / TDS certificate generation yet.** (Phase 3.)
- **No contractor invoices or expense submission yet.** (Phase 3.)
- **Agreements don't block payouts yet.** (Phase 3 — soft signal only in Phase
  2.)
- **Interactive end-to-end run** with live RazorpayX still pending a manual QA
  pass.

---

## 8. Coming next (Phase 3)

- 194C annual-aggregate TDS tracking + **Form 16A** generation + TDS liability
  summary.
- Contractor **invoice & expense** submission with approval.
- **Flexible pay cycles** (per-project / milestone) and contract-renewal reminders.
- Agreement hard-block for unsigned contracts before payout.

---

## 9. Demo cheat-sheet (talking points)

- *"Employment type = Contract is the only switch — everything else branches off
  it automatically."*
- *"The TDS you see in the preview is the TDS that's deducted — no surprises."*
- *"Contractors share the same bank-verification and maker-checker controls as
  your salaried payroll, but with none of the statutory salary deductions."*
- *"Your money, your RazorpayX wallet — JambaHR never holds the funds."*
- *"One platform for 20 full-timers and 30 freelancers, correctly separated."*
- *"Capture who owns the comedy — work-for-hire or licensed — and get it signed
  before the first payout."*
