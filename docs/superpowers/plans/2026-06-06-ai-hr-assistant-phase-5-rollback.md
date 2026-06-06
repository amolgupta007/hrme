# AI HR Assistant — Phase 5: Proactive Insights — Rollback Record

**Date:** 2026-06-06
**Action:** Reverted the entire Phase 5 module from `main` and production.
**Trigger:** User feedback after seeing it in production: *"rollback the insights module, I don't like it."*

## Summary

Phase 5 (proactive insights) was built between 2026-05-22 and 2026-05-25 across 15 commits on `feat/assistant-phase-5-insights`, merged to `main` as `437c98b`, applied to the live Supabase DB (migration 028), and deployed to production aliased to `jambahr.com`. It surfaced up to 3 deterministic rule-based HR alerts/day on the admin/owner dashboard.

On 2026-06-06 the user reviewed it in production and asked for a rollback. The decision was a product/UX preference — *not* a correctness or stability issue. The code had passed 124/124 tests and shipped cleanly.

## What was reverted (commit `bc8b862`)

A single-commit revert restoring all affected files to their state at `17f0c85` (the Phase 5 implementation-plan commit, kept on main). 27 files changed: 4 inserts, 1156 deletions.

| Bucket | Files |
|--------|-------|
| Removed (added) | `src/lib/assistant/insights/**`, `src/actions/assistant-insights.ts`, `src/app/api/cron/assistant-insights/route.ts`, `src/components/dashboard/insights-cards.tsx`, `supabase/migrations/028_assistant_insights.sql`, `tests/assistant/insights/**` |
| Restored (modified) | `CLAUDE.md`, `src/app/dashboard/page.tsx`, `src/lib/assistant/posthog-events.ts`, `vercel.json` |

## What was deliberately kept

| Artifact | Why |
|----------|-----|
| Supabase `assistant_insights` table (live DB) | Empty, idle, harmless. Keeps the door open for a clean re-merge if the user changes their mind. One-liner to drop later: `drop table public.assistant_insights cascade;` |
| `docs/superpowers/plans/2026-05-22-ai-hr-assistant-phase-5-proactive-insights.md` | Implementation plan — kept as historical reference, banner added |
| `docs/superpowers/specs/2026-05-22-ai-hr-assistant-phase-5-design.md` | Design spec — kept as historical reference, banner added |
| `docs/planning/ai-hr-assistant-plan.md` Phase 5 section | Master plan — updated in place with status banner |

## Verification at time of rollback

- Local tests: 81/81 passing (the 43 Phase 5 tests cleanly disappeared with the module)
- `next build`: clean
- Push: `437c98b..bc8b862` on `origin/main`
- Production: revert deployed via both Vercel Git integration auto-deploy and `vercel --prod --yes` CLI deploy (both READY, both running `bc8b862`)
- `jambahr.com` smoke check: HTTP 200

## What to do if you want it back

1. `git revert bc8b862` on main, OR cherry-pick the original Phase 5 commits `17f0c85..437c98b` back.
2. Re-apply migration 028 (file is in `437c98b`, or hand-re-create from the design doc).
3. Re-enable for an org: `update organizations set settings = settings || '{"assistant_enabled": true}'::jsonb where clerk_org_id = '...';`
4. Deploy.

The DB table will still be there. No data was ever persisted in the live table during Phase 5's ~12-day production lifetime — no org had `assistant_enabled` flipped on during the window, and no cron-write occurred (revert removed the cron route before any production cron run).

## Lessons for future feature decisions

- Insights felt complete on paper (124 tests, clean review) but didn't survive first-look in production. User-visible features benefit from a brief "preview in production for an org or two" sanity check *before* full-roll docs/release celebration.
- The 5-phase roadmap (`docs/planning/ai-hr-assistant-plan.md`) is now formally complete: Phases 0/1/2/4 shipped and live; Phase 3 parked by design (OQ-9 read-only-forever); Phase 5 built+reverted. No further phases planned.
