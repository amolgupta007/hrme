# JambaHR Mobile — Master Plan (iOS first, Android later)

**Owner:** Amol · **Stack decision (confirmed earlier):** React Native + Expo, Expo Router, TypeScript, NativeWind
**Motto for Claude Code:** *Inspect what exists in the web app first → plan → then build.* Every PRD in this folder carries that instruction.

---

## 1. The Repository Decision (answered)

**Recommendation: SAME repository, restructured as a Turborepo monorepo. Not a new repo.**

Why this is the right call for you specifically:

1. **Your "inspection-first" workflow demands it.** Claude Code building the mobile app must be able to read the live web code — Supabase queries, RLS assumptions, Zod schemas, API routes, business logic (attendance pairing, payroll rules). If mobile lives in a separate repo, every Claude Code session starts blind and you end up copy-pasting context. In a monorepo, `inspect apps/web` is one command.
2. **Shared types are the whole game.** Supabase generated types, Zod validators, date/attendance utilities, and constants go into `packages/shared` and are imported by both web and mobile. No drift, no duplicated bug fixes.
3. **Solo founder economics.** One repo = one CI, one CLAUDE.md, one PR history, one place PRDs live (`/docs/prds/` — already your convention).
4. **JambaGeo later** slots in as `apps/jambageo` with zero extra setup.

Target structure:

```
jambahr/  (existing repo, restructured)
├── apps/
│   ├── web/          # current Next.js 14 app moves here
│   └── mobile/       # new Expo app
├── packages/
│   ├── shared/       # types, zod schemas, utils, constants
│   ├── supabase/     # generated DB types, query helpers
│   └── config/       # eslint, tsconfig, tailwind/nativewind tokens
├── docs/prds/        # existing convention, add mobile PRDs here
├── turbo.json
└── CLAUDE.md         # updated with monorepo map + reconcile rule
```

**Risk & mitigation:** restructuring a live production repo is the only real cost. Mitigation: do it as PRD-01, on a branch, with zero functional changes to web — Vercel just gets its Root Directory setting changed to `apps/web`. One evening of work with Claude Code, fully reversible.

**When would a separate repo make sense?** Only if you were hiring a separate mobile team or the mobile app had a different backend. Neither is true.

---

## 2. Step-by-Step Execution Order

### Phase 0 — Business & Account Prerequisites (start NOW, longest lead times)

| # | Step | Notes / lead time |
|---|------|-------------------|
| 0.1 | **Apple Developer Program** — enroll as **Organization** (₹~8,300 / US$99 per year) | Requires a **D-U-N-S number** for your legal entity and a website (jambahr.com ✓). D-U-N-S is free via Dun & Bradstreet India but can take **1–3 weeks** — apply first. If JambaHR is a sole proprietorship, verify D-U-N-S eligibility; an org account (shows "JambaHR" as seller) is far better for B2B credibility than an individual account showing your personal name. |
| 0.2 | **Google Play Console** (for later) — one-time US$25 | New accounts require identity verification and (for personal accounts) a 12-tester/14-day closed test before production. Register early even though Android ships later. |
| 0.3 | **Expo account + EAS** | Free tier works to start; EAS Production plan when build volume grows. |
| 0.4 | **Legal docs** — Privacy Policy (mobile-specific additions), Terms of Service, in-app Account Deletion path | Apple **requires** a privacy policy URL and, since accounts exist, an **in-app account deletion** mechanism. Draft now (PRD-05 has the checklist). |
| 0.5 | **Support URL + marketing assets** | App Store listing needs support URL, screenshots (6.7" + 6.1"), app icon 1024px, description, keywords. |

### Phase 1 — Monorepo Migration & Mobile Foundation (PRD-01)
Restructure repo → scaffold Expo app → auth (Clerk Expo SDK) → role detection → navigation shell → design tokens (NativeWind) → connect to Supabase with RLS-safe client.

### Phase 2 — Staff Self-Service MVP (PRD-02)
Attendance (view + punch + regularization), Payslips, Leave apply/balance, Profile, Push notifications. This is 80% of daily mobile value for your SMB users.

### Phase 3 — Owner/Admin Experience (PRD-03)
Approvals inbox (leave / regularization / OT / payroll maker-checker), dashboard cards, employee quick-lookup.

### Phase 4 — Polish, Performance & Design System hardening (PRD-04)
Keka-class UI patterns, offline reads, skeletons, haptics, <2s cold start budget, accessibility.

### Phase 5 — Release & Compliance (PRD-05)
TestFlight beta → App Review (with demo tenant credentials!) → launch. Android follows via the same EAS pipeline (closed test → production).

---

## 3. Subscription / Monetization on Mobile (important — read carefully)

**You do NOT need Apple In-App Purchase, and you should not add it.**

- JambaHR is a **B2B SaaS**: the *organization* buys the subscription on the web; employees and admins merely *log in* on mobile. Apple's guidelines (multiplatform services / business rules) permit apps that unlock content purchased elsewhere for business customers without IAP.
- **Rules to follow in-app:** no "Buy / Upgrade / Pricing" buttons, no links that push users to purchase on the web from inside the iOS app. Login-only. Plan limits can be *displayed* neutrally ("contact your administrator").
- This means **zero 15–30% Apple commission** and no StoreKit work. Same logic applies on Google Play.
- If you ever add a consumer/self-serve tier purchasable *inside* the app, that specific flow would need IAP — keep purchase strictly on web.

---

## 4. Compliance Checklist (summary — full detail in PRD-05)

**India (DPDP Act 2023):** consent notice at signup/login for personal data; purpose limitation; grievance officer contact in privacy policy; data-deletion honoring (ties into account deletion flow); breach notification readiness. Attendance/biometric-adjacent data is sensitive — document what the mobile app collects (it collects punches, not biometric templates — say so explicitly).

**Apple:** Privacy Nutrition Label (declare: identifiers, name, email, phone, attendance/location if used); **Privacy Manifest** (PrivacyInfo.xcprivacy — Expo handles most, audit third-party SDKs); App Tracking Transparency **not needed** (no cross-app tracking — declare "no tracking"); export compliance = standard HTTPS exemption; account deletion in-app; demo credentials for App Review (create a dedicated demo tenant with seeded data).

**Google Play (later):** Data Safety form, target API level currency, account-deletion URL requirement.

**Push notifications:** permission prompt with context (ask after first login, not at cold start); transactional only — marketing pushes need explicit opt-in.

---

## 5. PRD Index (hand these to Claude Code one at a time)

| File | Scope | Session type |
|------|-------|--------------|
| `01-PRD-Monorepo-Foundation.md` | Repo restructure + Expo scaffold + auth + shell | 1–2 sessions |
| `02-PRD-Staff-MVP.md` | Attendance, payslips, leave, profile, push | 3–4 sessions |
| `03-PRD-Owner-Admin.md` | Approvals, dashboard, lookup | 2–3 sessions |
| `04-PRD-Design-System-UX.md` | Keka-class UI, offline, performance | ongoing / paired with 02–03 |
| `05-PRD-Release-Compliance.md` | Store, privacy, review, CI/CD | 1–2 sessions + manual work |

**Session pattern (your established style):** point Claude Code at the PRD file, instruct *investigate → plan → approval gate → build*, one phase per session. Commit these PRDs to `/docs/prds/mobile/` and add one line to CLAUDE.md: "Mobile PRDs are future-state specs; always inspect apps/web and the real schema for divergence before implementing."

---

## 6. One Honest Flag on "iOS first"

Your buyers (SMB owners doing demos) skew iPhone — iOS-first makes sense for *sales*. But your end users (staff punching attendance) in Indian SMBs are overwhelmingly mid-range **Android**. With Expo, both platforms build from the same code, so the real decision is only *which store you polish and submit first*. Recommendation: develop against both simulators from day one, submit iOS first as you want, and follow with the Play Store within 2–4 weeks — the Android closed-testing requirement means you should start that track early anyway.
