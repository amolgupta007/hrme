# PRD 04 — Mobile Design System, UX & Performance

**Product:** JambaHR Mobile · **Status:** Ready for Claude Code · **Priority:** runs alongside PRDs 02–03

---

## Instruction to Claude Code (read first)

> **Investigate before you build.** Inspect the web design system (Tailwind config, shadcn usage, brand colors, the bear mascot assets) so mobile feels like the same product. Where reference screenshots are provided in `/docs/design-refs/` (Amol will drop Keka / greytHR / Darwinbox screenshots there), treat them as *pattern inspiration only — never copy layouts, icons, or copy verbatim.*

---

## 1. Design direction

Benchmark class: **Keka**, greytHR, Darwinbox mobile apps — the standard Indian SMB users already know. Patterns worth adopting from that class (as patterns, not copies):

- **Bottom tab bar, max 5 tabs**, center emphasis on the highest-frequency action.
- **Card-first home** with one dominant "today" card and a horizontal quick-actions row.
- **Big single-purpose punch button** with immediate state feedback (color flip + haptic + timestamp).
- **Calendar heat view** for attendance history (color-coded day cells).
- Status chips with consistent color semantics (pending amber, approved green, rejected red) shared with web.
- **Bottom sheets** for apply/approve flows instead of full-page pushes where the form is short.
- JambaHR personality: the bear mascot appears in empty states and onboarding — friendly, not childish.

## 2. Component library (`packages/ui-mobile` or `apps/mobile/components/ui`)
Build once, reuse across JambaHR mobile and future JambaGeo:
`Button, Card, StatusChip, Avatar, ListRow, BottomSheet, CalendarMonth, StatCard, EmptyState (with mascot), Skeleton, Toast, SegmentedControl, FormField (with zod-driven errors)`.
NativeWind styling from shared tokens; dark mode support from day one (tokens, not hardcoded colors).

## 3. Navigation & ease-of-use rules
- Any daily task reachable in ≤ 2 taps from Home.
- Thumb-zone: primary actions in the bottom half of the screen.
- Never dead-end: every error state offers retry or a way out.
- Pull-to-refresh on every list; haptic feedback on punch, approve, submit.
- Text: minimum 14pt body, supports OS font scaling (many users set large fonts).
- Language: keep copy simple; structure strings for future Hindi/Marathi localization (i18n keys from day one, English-only content for now).

## 4. Performance budgets (the "fast mobile app" requirement)
- Cold start → interactive Home: **< 2s** mid-range device.
- Screen transition: < 300ms; list scroll 60fps (use FlashList for long lists).
- Hermes engine (Expo default) + New Architecture enabled.
- Images via `expo-image` with caching; bundle size audited each release.
- Offline: last-fetched attendance/leave/payslip lists render from React Query persistence when offline, with an offline banner; writes queue only for punch (single retry policy) — everything else requires connectivity with a clear message.

## 5. Quality gates
- Crash-free sessions ≥ 99% (Sentry).
- VoiceOver pass on the five core flows.
- Test on: iPhone SE-class small screen + 6.7" large; low-end Android (for the later launch) from the start so perf issues surface early.
