# Contractors Demo — PlayPause Studios

> **Demo org:** PlayPause Studios (slug `test1`) — a creative firm that manages
> creators & artists (comedians, editors, designers, producers) alongside its
> full-time team.
> **Audience:** client demo / sales walkthrough.
> **Module:** Contractors (Business plan, Owner/Admin only).
> **Seed script:** `scripts/seed-contractors-demo.sql` (idempotent — re-run to reset).

---

## 1. The pitch (say this first)

> "A creative studio doesn't just have salaried staff — it runs on freelancers:
> comedians, editors, designers, production houses. Today you probably pay them
> on a handshake: no signed contract, TDS worked out in a spreadsheet, money
> pushed from a personal bank app, and no clarity on who owns the work. JambaHR
> turns all of that into one clean, compliant flow — **a signed agreement, the
> correct TDS auto-deducted, a two-person approval, and a full record** — without
> mixing freelancers into your salary payroll."

**One-liner:** *"Pay a creator ₹1,20,000 and watch JambaHR deduct exactly
₹12,000 TDS under Section 194J automatically — then a second admin approves the
payout. No spreadsheets, no manual tax, no PF/PT confusion."*

---

## 2. What's in the demo (the seeded roster)

Go to **Dashboard → Contractors** (`/dashboard/contractors`). You'll see 6
creators, each chosen to show a different tax + IP situation:

| Creator | Role | Rate | TDS section | PAN | On a ₹ payment → TDS → **Net** | Agreement |
|---|---|---|---|---|---|---|
| **Aarav Kapoor** | Stand-up Comedian | ₹1,20,000 / mo | 194J · 10% | ✓ | ₹1,20,000 → ₹12,000 → **₹1,08,000** | Service · **licensed** · ✅ signed |
| **Zoya Sheikh** | Video Editor | ₹80,000 / mo | 194J · 10% | ✓ | ₹80,000 → ₹8,000 → **₹72,000** | IP assignment · **work-for-hire** · ✅ signed |
| **Dev Malhotra** | Graphic Designer | ₹60,000 / milestone | 194J · 10% | ✓ | ₹60,000 → ₹6,000 → **₹54,000** | NDA · 🟡 **sent (pending)** |
| **FrameForge Studios Pvt Ltd** | Production house (company) | ₹6,00,000 / milestone | 194C · 2% | ✓ | ₹6,00,000 → ₹12,000 → **₹5,88,000** | Service · work-for-hire · ✅ signed |
| **Meera Joshi** | Videographer | ₹15,000 / day | 194C · 1% | ✓ | ₹45,000 → ₹450 → **₹44,550** | Service · ✅ signed |
| **Kabir Sen** | Music Producer | ₹90,000 / milestone | **No PAN → 20%** | ✗ | ₹90,000 → ₹18,000 → **₹72,000** | IP assignment · licensed · 🔴 **declined** |

All six have a **verified bank beneficiary** (green "Bank verified" chip).

**Payment history:** one **completed payout batch** from last month (28 May
2026) — paid **Aarav + Zoya + FrameForge**, net **₹7,68,000** disbursed,
**₹32,000 TDS** withheld, initiated by **Aanya Khanna** and approved by **Priya
Rao** (maker-checker).

---

## 3. The walkthrough (click-by-click)

### Scene 1 — "Your freelance roster, formalised"
1. Open **Dashboard → Contractors**. Point out the roster — each row shows the
   rate, the **TDS section badge**, and the **bank-verified** chip.
2. Note: *"These are contractors, not employees. The only switch was **Employment
   type = Contract** when they were added — that automatically keeps them out of
   your salary payroll, off PF/PT, and out of leave accrual."*

### Scene 2 — "The right tax, automatically" (the headline)
1. Click **Pay contractors**.
2. Select **Dev Malhotra** (he's *not* in the historical batch, so he's a clean
   live demo). Type gross **₹60,000**.
3. Point at the **live preview**: `194J @ 10% · TDS ₹6,000 · Net ₹54,000`.
   *"You only pick the section — JambaHR knows the rate, the threshold, and even
   the no-PAN penalty. What you see is exactly what's deducted."*
4. (Optional contrast) Add **Kabir Sen**, gross **₹90,000** → preview shows
   **20%** (`No PAN — §206AA`), TDS ₹18,000. *"Kabir hasn't given a PAN, so the
   law requires 20% — the system enforces it so you're never under-deducting."*
5. Click **Submit** → a payout batch is created in **Awaiting approval**.

### Scene 3 — "Two people, not one" (maker-checker)
- Show the **Contractor payouts** section: the new batch is *Awaiting approval*,
  and the old one is **Completed** (Aanya → Priya, ₹7,68,000).
- *"Money never moves on one person's say-so. A different admin approves before
  it's sent — the same control your salary payroll uses."*
- **To approve live you need a second admin login** (e.g., sign in as Priya Rao)
  — or just use the **already-completed** batch to tell the story. On approval,
  JambaHR dispatches via RazorpayX from the client's **own** wallet. *(In this
  demo org RazorpayX isn't connected, so approval will report "RazorpayX not
  connected" — that's expected; explain the money would flow on a live account.)*

### Scene 4 — "Who owns the work?" (agreements & IP — the creative-firm clincher)
1. On a creator row, show the **agreement chips**:
   - **Zoya** → *IP assignment · work-for-hire · Signed* → *"We own every edit she delivers."*
   - **Aarav** → *Service · licensed · Signed* → *"He keeps ownership of his comedy and licenses it to us."*
   - **Dev** → *NDA · Sent* → still pending the creator's signature.
   - **Kabir** → *IP assignment · Declined* → he said no; it's on record.
2. Click **Send agreement** on someone to show the dialog: pick type (Service /
   NDA / IP assignment), **IP ownership** (work-for-hire vs licensed), editable
   body, expiry. *"One magic link, no login — the creator types their name to
   sign, and we capture the signature, IP address, browser, and timestamp as
   proof."*
3. **Live e-sign (optional, great moment):** open Dev's pending NDA in a second
   tab — **`/agreements/ppstudios-demo-nda-dev`** — read it, type "Dev Malhotra",
   click **Sign**. Back on the Contractors page, his chip flips to **Signed**.

### Scene 5 — "Separate from payroll" (trust point)
- *"None of this touches your monthly salary run. Contractors get
  professional-fee TDS only — no PF, no Professional Tax, no salary slabs, no
  Form-16 salary math, no leave. But they ride the same secure rails: bank
  verification, RazorpayX disbursement, and maker-checker approval."*

---

## 4. TDS cheat-sheet (FY 2025-26 — what JambaHR computes)

| Section | Use it for | Rate | No TDS below |
|---|---|---|---|
| **194J** | Professional / technical / **creative** fees | **10%** | ≤ ₹30,000 per payment |
| **194C** | Contract / works — Individual / HUF payee | **1%** | < ₹30k single **and** < ₹1L for the year |
| **194C** | Contract / works — company / firm payee | **2%** | same as above |
| **§206AA** | Any contractor **without PAN** | **20%** | threshold still applies |

These exact rules drive the live preview (`src/lib/contractor/tds.ts`).

---

## 5. Be honest about limits (if asked)

- **194C annual aggregate isn't auto-tracked yet** — TDS is per-payment. A 194C
  contractor paid repeated sub-₹30k amounts won't auto-deduct after crossing
  ₹1L/year; verify those manually. *(On the roadmap.)*
- **No Form 16A / TDS certificate generation yet.** *(Roadmap.)*
- **No contractor invoices / expense submission yet.** *(Roadmap.)*
- **Agreements are advisory** — a missing/declined agreement does **not** block a
  payout in this version (it's a visible signal, not a hard gate).

---

## 6. Demo hygiene / reset

- **Reset the data:** re-run `scripts/seed-contractors-demo.sql` (idempotent — it
  deletes the seeded rows by fixed UUID and re-inserts). Safe to run repeatedly.
- **Don't click "re-verify / penny-drop"** on the seeded bank accounts — they use
  placeholder encrypted values for display only (last-4 shown is real-looking;
  the encrypted blob is a stub). Bank verification should be demoed on a fresh
  account if needed.
- The completed batch is **illustrative history** — don't hit "retry" on it.
- **Revert the org name** (if you ever need "Krishna Group" back):
  `UPDATE organizations SET name='Krishna Group' WHERE slug='test1';`
- The seeded contractors are `*.demo@…` emails and live under the **Creators &
  Talent** department, so they're easy to spot.
- **Departments are themed as a creative studio:** Creators & Talent, Talent
  Management, Content Production, Marketing & Brand, Partnerships & Brand Deals,
  Studio Operations, Legal & Rights, Finance & HR.
- The owner/admin demo account (`amolgupta007@gmail.com`) shows as **Harry**.
  Note: the dashboard **avatar/UserButton** name comes from Clerk, not Supabase —
  if it still shows the old name there, update it in the Clerk profile (Profile
  page); all directory/employee surfaces use the Supabase name and already show
  "Harry".

---

## 7. Prerequisites recap

- **Business plan** (the Contractors sidebar item only shows on Business) and you
  must be signed in as **Owner/Admin**.
- For a **live approval**, have a second admin login ready (e.g., Priya Rao) or
  toggle single-person approval in Settings → Payroll → RazorpayX; otherwise lean
  on the pre-seeded completed batch to tell the maker-checker story.
