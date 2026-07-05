# Session: Mobile PRD-01 — Phase A (Investigation & Migration Plan only)

## Context
We are starting the JambaHR mobile app (React Native + Expo, iOS first).
All mobile PRDs live in `docs/prds/mobile/` (00 to 05). Read
`00-MASTER-PLAN.md` and `01-PRD-Monorepo-Foundation.md` fully before
anything else. Treat PRDs as future-state specs — always reconcile
against the real codebase; where they diverge, the codebase is the
truth and you must flag the divergence to me.

## Your task in THIS session (investigation only — NO code changes)
1. Map the current repo: structure, package.json, Next.js app router
   layout, build/deploy config (Vercel), env var inventory.
2. Document exactly how auth works today: Clerk Organizations setup,
   the JWT template, and how org_id reaches Supabase RLS. This is the
   highest-risk item for mobile — identify precisely what a Clerk Expo
   client must replicate.
3. Identify extraction candidates for `packages/shared` and
   `packages/supabase`: Zod schemas, generated DB types, date/attendance
   utils, constants. List each file with a keep/move/copy verdict and
   which modules (attendance pairing, leave, payslips) mobile will need.
4. Inspect the attendance write path (biometric ADMS ingestion +
   multi-punch pairing) enough to state how a future mobile punch with
   source='mobile' must be inserted so it pairs correctly.
5. Produce `docs/prds/mobile/01A-MIGRATION-PLAN.md` containing:
   - Turborepo target structure (apps/web, apps/mobile, packages/*)
   - Exact file-move map (git mv commands, history-preserving)
   - Vercel config change needed (root directory → apps/web)
   - Risk list with mitigations, and a rollback plan
   - Step-by-step execution checklist for Phase B, split into
     commits, with a verification step after each commit

## Rules
- Plan-first: do NOT modify, move, or create any source files except
  the plan document above.
- Zero functional changes to the web app are permitted in PRD-01 at all.
- End the session by presenting the plan and asking for my approval.
  Phase B (execution) happens in a separate session after I approve.