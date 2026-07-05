# PRD 01 — Monorepo Migration & Mobile Foundation

**Product:** JambaHR Mobile · **Status:** Ready for Claude Code · **Priority:** 1 of 5
**Prereqs:** none (business account setup runs in parallel)

---

## Instruction to Claude Code (read first)

> **Investigate before you build.** Begin with a read-only inspection pass: map the current repo structure, `package.json`, Next.js app router layout, Supabase client setup, Clerk configuration (Organizations usage, how org_id reaches RLS via JWT), env var inventory, and shared logic candidates (Zod schemas, date utils, attendance/payroll helpers, constants). Produce a written migration plan with a file-move map and wait for approval before executing. Zero functional changes to the web app are permitted in this phase.

---

## 1. Goal

Restructure the existing production repo into a Turborepo monorepo and scaffold the Expo mobile app to a "logged-in shell" state: a user can sign in with their existing JambaHR credentials, the app detects their role, and shows the correct (empty) tab navigation.

## 2. Deliverables

### 2.1 Monorepo restructure
- Move current Next.js app to `apps/web` (git `mv`, preserve history).
- Create `packages/shared` (Zod schemas, TS types, date/util functions extracted from web — extract only what mobile will need; do not over-abstract), `packages/supabase` (generated DB types + typed query helpers), `packages/config` (tsconfig base, eslint, design tokens).
- Add `turbo.json` with `build`, `dev`, `lint`, `typecheck` pipelines.
- Update Vercel project Root Directory to `apps/web` (document the manual dashboard step).
- CI must pass and web must deploy identically before mobile work starts. **Approval gate here.**

### 2.2 Expo app scaffold (`apps/mobile`)
- Expo SDK (latest stable), Expo Router, TypeScript strict, NativeWind v4.
- `expo-secure-store` for token persistence.
- **Auth:** Clerk Expo SDK (`@clerk/clerk-expo`). Reuse the existing Clerk instance; the same JWT template that injects `org_id` for Supabase RLS must work from mobile — verify by inspecting how web builds the Supabase client with the Clerk token, and replicate.
  - Note: a Supabase Auth migration is under consideration separately; isolate all auth code behind a thin `packages/shared/auth` interface so a later swap touches one module.
- **Role detection:** after sign-in, resolve the member's role from Clerk org membership / existing role tables (inspect web for source of truth). Route to Staff tab set or Owner/Admin tab set.
- **Navigation shell:**
  - Staff tabs: Home · Attendance · Leave · Payslips · Profile
  - Owner/Admin tabs: Home · Approvals · People · Reports · Profile
  - Placeholder screens with correct headers only.
- **Design tokens:** port the web Tailwind theme (colors, radii, font scale) into a shared token file consumed by NativeWind so mobile matches brand from day one.
- Environment: `.env` handling via `expo-env`/EAS secrets; document every var.
- Sentry for React Native wired in (you already use Sentry on web — same org, new project).

### 2.3 Documentation
- Update `CLAUDE.md`: monorepo map, "inspect apps/web before mobile changes" rule, command cheatsheet (`turbo dev --filter=mobile`, etc.).
- `apps/mobile/README.md`: run instructions on Windows/WSL (note: iOS simulator requires macOS — document the **Expo Go / development build on a physical iPhone via EAS** path as your primary iOS testing loop, since you develop on Windows).

## 3. Non-goals
No feature screens, no push notifications, no offline logic, no JambaGeo.

## 4. Acceptance criteria
- Web deploys unchanged from `apps/web`.
- `turbo typecheck` green across workspace.
- On a physical device (Expo Go or dev build): sign in with an existing tenant account → correct role-based tab set renders → Supabase query of the signed-in employee's own record succeeds under RLS.
- Sign out works and clears secure storage.

## 5. Risks
- **RLS/JWT from mobile** is the highest-risk unknown — prove it in a spike before building the shell around it.
- Windows dev without macOS: cannot produce iOS builds locally; all iOS binaries come from **EAS Build** (cloud). Budget for build minutes.
