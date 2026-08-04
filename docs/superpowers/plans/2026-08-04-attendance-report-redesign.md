# Attendance Report Redesign — Petpooja-style employee cards

**Date:** 2026-08-04 · **Status:** planned (Amol requested analysis + plan; execution pending go-ahead)
**Reference PDFs:** `docs/reports/attendance-report (51) alpha.pdf` (Petpooja, 5 pages) vs `docs/reports/attendance-tmp-boat-club-…HR JAMBA.pdf` (ours, 20 pages) — same org, same month (TMP Boat Club, July 2026).

## 1. Analysis — why Petpooja reads better

| Dimension | Ours today | Petpooja | Verdict |
|---|---|---|---|
| Structure | TWO sections: org-wide matrix (split into 2 column-chunks of 16 days) + separate per-employee detail list | ONE unit: a full-width **card per employee** — dates as columns, rows = In / Out / Total / Status | Petpooja: everything about one person in one glance, no flipping between sections |
| Page count (same data) | **20 pages** (detail pages mostly whitespace; an all-absent employee burns 28 near-empty lines) | **5 pages** (4 employee cards per page) | Petpooja 4× denser with MORE information |
| Per-day info | Matrix cell: hours+tiny suffix marker OR letter; detail row: pairs + hours + flags | In time, Out time, Total, Status code — all visible per day | Petpooja shows in/out times in the compact view; ours hides them behind the detail section |
| Summary numbers | Only total hours per employee | Header chips: Full Day / Half Day / Absent / Week Off / Leave / Holiday counts | Petpooja answers "how many absents?" instantly; ours makes you count letters |
| Status vocabulary | Hours-with-suffix (`10.4d!`) mixes 3 encodings in one cell | Clean codes: FD / HD / A / WO + icons (⚠ odd punch, ● overridden) | Petpooja's single-purpose Status row is clearer |
| Split days | 16+15 column chunks → month broken across pages, "Total" repeated confusingly | All 31 days in one card width | Petpooja proves 31 columns fit landscape A4 |
| Flags | Text flag column overflows/collides ("Wauto-closed, single punch !") | Small icons in the status cell + one-line legend | Petpooja |
| What ours does BETTER | **Punch source** (device/mobile/web/auto-closed — Petpooja has nothing), multi-pair days, dept grouping, day-state letters incl. leave/holiday from real policy data | — | Keep these as differentiators, presented Petpooja-cleanly |

Root cause of our sprawl: the plan optimized "compact matrix + detailed appendix" as two artifacts; Petpooja collapses them into one per-employee unit that is simultaneously compact AND detailed — which is literally what Amol originally asked for ("compact at the same time detailed").

## 2. Target design (locked direction)

**One card per employee**, 4 cards per landscape-A4 page, dates as columns (all days of the month/range in one strip, no chunking for ≤31 days):

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ RAVINDRA LOHAR   Sales Support · SALES SUPPORT        Full 22 · Half 2 · Abs 3 · WO 4 ·  │
│                                                        Leave 0 · Hol 0 ·  Total 280.0 h  │
├──────┬────┬────┬────┬────┬────┬────┬────┬────┬────┬────┬────┬────┬────┬─── … ──┬────────┤
│ Date │ 01 │ 02 │ 03 │ 04 │ 05 │ 06 │ 07 │ 08 │ 09 │ 10 │ 11 │ 12 │ 13 │   …   │   31   │
│      │Wed │Thu │Fri │Sat │Sun │Mon │Tue │Wed │Thu │Fri │Sat │Sun │Mon │   …   │  Fri   │
│ In   │10:57│11:10│ – │11:11│ – │10:28│ …                                                 │
│ Out  │17:56│20:17│ – │20:33│ – │20:21│ …                                                 │
│ Total│ 7.0│ 9.1│ – │ 9.4│ – │ 9.9│ …                                                    │
│ Statu│ FDᵈ│ FDᵈ│ A │ FDᵐ│ WO │ FDᵈ⚠│ …                                                  │
└──────┴────┴────┴────┴────┴────┴────┴────┴────┴────┴──────────────────────────────────────┘
```

- **Header row**: employee name (bold), designation/department, then summary chips: `Full Day : n · Half Day : n · Absent : n · Week Off : n · Leave : n · Holiday : n · Total : n h`.
- **Rows**: Date (day number + weekday), **In** (first-in IST, HH:MM), **Out** (last-out), **Total** (hours, 1 decimal), **Status**.
- **Status codes**: `FD` full day · `HD` half day · `A` absent · `WO` week-off · `H` holiday · `L` leave · `–` future. Source shown as a small suffix on the Status code (`ᵈ ᵐ ʷ` + `*` auto-closed — our differentiator, rendered as a small second-font Text, plain letters if superscript-look fails). `!` marks a single/odd punch. Worked-on-off-day shows the hours in Total AND the state code (e.g. `WO` with 9.5 in Total) — fixes today's "worked holiday hours invisible" complaint in the same stroke.
- **Multi-pair days**: In = first-in, Out = last-out (matches the daily rollup). Pair-level breakdown drops out of the PDF (it lives in the web Punch Timeline and stays in the **CSV** `punch_pairs` column — no data loss, just relocated).
- **Page chrome**: org name centered + "Attendance Report" subtitle, `From: dd-mm-yyyy To: dd-mm-yyyy` top-right, one-line legend bottom-left, `Page X of Y` bottom-right (react-pdf `render={({pageNumber, totalPages})}` fixed footer).
- **Ordering**: by department then name (dept shown in each card header — no separate dept section bands needed).
- **Ranges > 31 days**: card repeats per calendar month (a 92-day range = up to 3 strips per employee, stacked in the same card order) — never chunk mid-month.
- **Empty-ish employees**: an all-absent employee is ONE card row-strip (5 text rows), not 28 lines — the density win comes free.

## 3. New capability required: half-day classification (web report parity with Petpooja)

Our current lib has no `half_day` state (that exists only in mobile's `computeMonthCalendar`). Add it:
- Fetch adds `shift_id → shifts(half_day_threshold_minutes, total_hours)` to the attendance-records select (embed idiom `shifts!shift_id(...)` — verify FK name).
- Classification: worked minutes > 0 AND < threshold → `HD`; ≥ threshold → `FD`. No shift/threshold on the record → `FD` (skip half-day classification, same rule the mobile spec uses).
- Summary chips count FD/HD separately; `Absent` counts A days; totals unchanged.

## 4. What does NOT change

Data action signatures, route contract/auth/validation (401/403/400/500, 92-day cap), pagination, CSV columns (CSV keeps `punch_pairs`; gains a `status_code` column), Reports tab UI (preview table can later gain the chip counts — optional, not required), all RBAC.

## 5. Implementation tasks (SDD, ~half day)

1. **Lib**: extend `ReportDay` with `firstIn`/`lastOut` (IST HH:MM), `statusCode` (`FD|HD|A|WO|H|L|–`), half-day classification (threshold from new optional `halfDayThresholdMinutes` input on the record row); per-employee `summary` counts {fullDays, halfDays, absents, weekOffs, leaves, holidays}. Extend `csvRows` with `status_code`. TDD: threshold boundary (at/above/below), no-shift fallback, worked-on-WO/H day keeps hours + off-state code, summary count math.
2. **Fetch**: add the shifts embed to the records select; thread threshold into the lib input. (Verify embed disambiguation need like `departments!department_id`.)
3. **PDF rewrite** (`attendance-pdf.tsx`): employee-card component per §2; delete the old matrix + detail sections; fixed footer with Page X of Y + legend; probe render (byte-size + `pdftotext` glyph check — superscript source letters must survive WinAnsi, else fall back to plain small letters).
4. **Gates**: reports test suite updated, full suite, lint, build; regenerate the TMP Boat Club July PDF and eyeball against the Petpooja reference side-by-side before PR.

## 6. Risks

- 31 columns × 5 rows per card at readable size: Petpooja proves the width works; our font floor is ~5.5pt for In/Out times — the render probe must confirm legibility at 100% zoom.
- react-pdf has no `colspan`; the card grid is nested `View` rows with fixed-percentage widths — keep a single shared column-width constant so Date/In/Out/Total/Status rows align.
- `totalPages` fixed-footer render prop forces two-pass layout in react-pdf — supported, but verify it doesn't blow the 60s route budget at 500 employees (worst case ~125 pages; probe with a synthetic 100-employee dataset).
