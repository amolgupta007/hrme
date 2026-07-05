# PRD 05 — Release, Distribution & Compliance (iOS first, Android later)

**Product:** JambaHR Mobile · **Status:** Ready for Claude Code + manual founder tasks · **Priority:** 5 of 5

---

## Instruction to Claude Code (read first)

> Parts of this PRD are code/config (EAS pipeline, privacy manifest, deletion flow, deep links); parts are founder-manual (accounts, store listings, legal docs). Implement the code parts; generate checklists and draft copy for the manual parts. Inspect existing web privacy policy and terms to keep documents consistent.

---

## 1. Build & release pipeline (code)

- **EAS Build** profiles: `development` (dev client), `preview` (internal/TestFlight), `production`.
- **EAS Submit** configured for App Store Connect; later Play Console.
- **EAS Update** (OTA) for JS-only fixes on `production` channel — document the policy: OTA for bug fixes and copy, store release for native/permission changes.
- Versioning: `runtimeVersion` policy + semantic app version; changelog kept in repo.
- Secrets via EAS environment variables; never in the bundle.
- CI: typecheck + lint + (later) Maestro smoke test on PRs touching `apps/mobile`.

## 2. Apple submission checklist (founder + code)

**Accounts (do first, longest lead time):**
- [ ] D-U-N-S number for the JambaHR legal entity (free, 1–3 weeks)
- [ ] Apple Developer Program — Organization, $99/yr
- [ ] App Store Connect app record, bundle ID `com.jambahr.app`

**In-app requirements (code):**
- [ ] **Account deletion**: in-app path (Profile → Delete account) that actually deletes/initiates deletion. For B2B, an employee's account belongs to the org — acceptable pattern: user-initiated request that removes personal data and notifies the org admin; document the exact behavior in the privacy policy. Design this carefully against RLS/tenant integrity before building.
- [ ] **Privacy Manifest** (`PrivacyInfo.xcprivacy`): declare required-reason APIs; audit every third-party SDK (Clerk, Supabase, Sentry, Expo modules) for their manifests.
- [ ] Sign in works on a fresh install with no crashes; no placeholder screens.
- [ ] **No purchase/pricing UI or purchase links** (keeps us cleanly outside IAP obligations — org subscriptions are bought on the web only).
- [ ] Permission prompt strings (notifications, FaceID, camera if any, location if punch-location flag is on) each state a specific purpose.

**Listing (founder):**
- [ ] Privacy policy URL (updated for mobile), support URL, marketing screenshots (6.7" and 6.1"), 1024px icon, description, keywords, category: Business.
- [ ] **Privacy Nutrition Label**: data collected = name, email, phone, employee ID, attendance records, coarse location (only if flag on), diagnostics (Sentry). Linked to identity: yes. Tracking: **No** (no ATT prompt needed).
- [ ] Export compliance: standard HTTPS encryption → exempt; set `ITSAppUsesNonExemptEncryption = false`.

**App Review survival kit (critical for multi-tenant B2B):**
- [ ] Dedicated **demo tenant** with seeded realistic data, demo staff + demo admin credentials in the Review Notes.
- [ ] Review notes explaining: B2B app, accounts provisioned by employers, subscription purchased on web by organizations — this preempts the two most common B2B rejections (reviewer can't log in; "where do I sign up?").

## 3. India compliance — DPDP Act 2023 (founder + policy copy)

- [ ] Consent notice at first login: what personal data is processed, purpose, grievance contact. Draft copy to be generated.
- [ ] Privacy policy additions: mobile data categories, push tokens, device identifiers, retention, deletion process, grievance officer (name + email).
- [ ] Explicit statement: **the app does not collect or store biometric templates** — fingerprints/faces live only on eSSL/ZKTeco devices; the platform stores punch events. (This matters for both DPDP posture and Apple review questions.)
- [ ] If punch-location flag is offered: consent is per-org AND per-user prompt; purpose-limited; ability to revoke.
- [ ] Data breach response note: Supabase + Vercel sub-processor list documented.

## 4. Beta program

1. Internal: dev builds on your + wife's phones (real dogfooding with your own org).
2. **TestFlight** external group: recruit from friendly customers/prospects (PlayPauseStudio-type early adopters) — up to 10k testers, feedback via TestFlight.
3. Exit criteria to submit: crash-free ≥ 99% over 2 weeks, punch-pairing verified against real biometric devices in a live org, payslip rendering verified across 3 salary structures.

## 5. Android track (starts in parallel, ships 2–4 weeks after iOS)

- [ ] Play Console account + identity verification (do now; lead time).
- [ ] Closed testing requirement (new personal accounts: 12 testers / 14 days) — start the closed test the same week iOS goes to TestFlight so the clock runs concurrently.
- [ ] Data Safety form (mirror the Apple nutrition label), target API level current, account-deletion web URL.
- [ ] Test matrix: low-RAM Android devices (the real user base).

## 6. Post-launch

- Sentry release health dashboards per version; alert on crash-rate regression.
- App version gating: minimum supported version check on launch (server-driven config) so old clients can be force-upgraded when APIs change.
- Store review prompts (`StoreKit` review API) only after a success moment (e.g., 10th successful punch), never on first open.
