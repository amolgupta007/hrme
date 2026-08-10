# JambaHR Mobile — Design Spec (from "Jambahr iOS app design" Claude Design project)

Source of truth: `docs/design/mobile/jambahr-ios.dc.html` (imported 2026-07-17 from
claude.ai/design project `96ef2191-b1d6-47be-89ad-a78b132a4c5b`, file "JambaHR iOS.dc.html",
authored by Amol). This markdown is the implementer-facing distillation; when in doubt,
open the HTML in a browser.

**Adoption decision (2026-07-17):** Slice D1 adopts the **design language** (§tokens,
§type, §metrics, §components, §usage rules) for the Home + Attendance screens on the
EXISTING Phase C tab structure. The design's 5-tab IA (Home / Leaves / People / Grow /
More) and its 9 wireframes are the **D2+ target IA** — the design predates the attendance
module and has no punch/calendar surface, so D1 does not restructure tabs. Revisit IA at
D2 planning.

## Color tokens (light mode, v1)

| Token | Hex | Use |
|---|---|---|
| brand/primary | `#17806D` | CTAs, active tab, links |
| brand/pressed | `#0E5E4F` | pressed state |
| brand/tint | `#E7F3F0` | selected rows, chips, secondary-button bg |
| ink/900 | `#0B1220` | headings, primary text |
| ink/600 | `#5B6472` | secondary text |
| ink/400 | `#9AA1AB` | placeholders, inactive icons |
| bg/canvas | `#F7F7F4` | screen background |
| bg/card | `#FFFFFF` | cards, sheets, bars |
| border/default | `#E7E9EC` | hairlines, card strokes |
| status/success | `#1E9E63` (tint `#E5F6EA`, text-on-tint `#177245`) | Approved, Completed, present |
| status/warning | `#B45309` (tint `#FBF0D9`, text-on-tint `#8A5A06`) | Pending, Manager badge |
| status/danger | `#DC2626` (tint `#FDE8E8`, text-on-tint `#B91C1C`) | Overdue, Rejected, absent, deductions |
| status/info | `#3B63D8` (tint `#E8EEFC`, text-on-tint `#2A4BB5`) | Admin badge, Sent |
| hire/accent | `#5B5BD6` (tint `#EDEDFB`) | JambaHire module ONLY |

## Typography (SF Pro / system font)

largeTitle 34/41 w700 · title2 22/28 w700 · headline 17/22 w600 · body 17/22 w400 ·
subhead 15/20 w400 (ink/600) · footnote 13/18 w400 (ink/600) ·
caption 11/13 w600 letter-spaced UPPERCASE (ink/600) · stat 28/34 w800 (unit suffix 15/400 ink/600) ·
money: monospace (SF Mono / ui-monospace) 17 w600, Indian digit grouping (₹2,51,200), deductions
in danger red with leading −.

## Metrics (4pt grid: 4·8·12·16·20·24·32)

- Screen margin **16pt**
- Card: radius **16pt**, padding **16pt**, border 1pt `#E7E9EC`, no shadow (or y1 blur3 @6%)
- Primary button: **50pt** tall, radius **14pt**, 17pt semibold; secondary = brand/tint bg + brand/pressed text; tertiary = 44pt, radius 12, 1pt border, white bg; destructive = danger/tint bg + danger text
- Chip/badge: **24pt** tall pill, 13pt medium on tint bg; count badge: 20pt round, solid danger bg, white 12pt bold
- List row: ≥ **56pt**, avatar 40pt (round, brand/tint bg + brand/pressed initials), inset divider (left-inset past avatar), chevron ink/400
- Segmented filter: container `#EFF1F3` radius 10 padding 2; active segment white, radius 8, subtle shadow, 13pt semibold
- Input: 44pt, radius 12, 1pt border; focused: 1.5pt brand/primary border
- Stat card: title 15/600 + optional type chip; stat number 28/800 with "/ total" suffix; 6pt progress bar (track `#EFF1F3`, fill brand/primary, pill radius); footnote below
- Nav bar 44pt + large title; tab bar 49pt + home indicator; hit targets **44×44pt minimum everywhere**

## Usage rules (verbatim intent)

1. **Green is the only brand color.** One primary CTA per screen. JambaHire indigo appears only inside the hiring module — never mixed on one screen.
2. **Status colors always sit on their tint**, never as solid fills — except the Approved pill and count badges. Red reserved for overdue/rejected/deductions, not decoration.
3. **Money is monospaced**, Indian grouping, deductions in danger red with leading −. Cards on `#F7F7F4` canvas; avoid stacked shadows.

## D1 screen mapping (Home + Attendance on existing tabs)

- **Home** (from WF-Home, adapted to D1 data): greeting `Hi {firstName} 👋` + date + org name, avatar top-right; horizontal stat strip (leave left / pending items); two quick-action buttons (primary "Punch in/out", tertiary "Apply leave" stub); "Needs attention"-style pending card; next-holiday card. TodayCard = stat-card pattern (shift name in caption style, live hours in stat style, punch state chip).
- **Attendance month calendar** (no wireframe exists — apply the language): month header title2, ‹ › as 44pt hit targets; day cells with state colors ON TINTS (present=success tint, half_day=warning tint, absent=danger tint, week_off/holiday=ink/400 on `#EFF1F3` / info tint for holiday, leave=info tint, today ringed 1.5pt brand/primary, future=plain); legend of chips; day-detail bottom sheet = card with grabber (36×4 `#bbb` pill), punch pairs as list rows, source chips, monospace hours.
- **Tab bar**: keep Phase C tabs for D1; style active=brand/primary, inactive=ink/400, 10pt labels, count badges solid danger.

## Token plumbing note

`@jambahr/config/tokens` stays the single source for the web-drift-tested theme.
The mobile palette above ships as a NEW export (`mobilePalette`) in `@jambahr/config/tokens`
consumed only by `apps/mobile` (web drift test untouched). Design primary `#17806D`
intentionally differs from web teal `#2e8a7d` per the approved design.
