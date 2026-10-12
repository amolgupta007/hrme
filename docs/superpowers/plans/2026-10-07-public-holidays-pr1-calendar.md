# Public Holidays — PR 1: Holiday Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins manage their org's holiday calendar in Settings → Holidays (add, edit, delete, import from a national or Maharashtra preset or from CSV). New orgs get a correct core list for this year and next. Every non-working-day consumer can call a single range-based resolver.

**Architecture:**
- **Pure logic and data** live in `@jambahr/shared/holidays/*`: preset data, the core seed, import merging and CSV parsing, and non-working-day building.
- **Server code:** `apps/web/src/actions/holidays.ts` (server actions) and a plain-module resolver at `apps/web/src/lib/holidays/non-working-days.ts`. Payroll's month helper becomes a thin wrapper over that resolver.
- **UI:** a self-contained `HolidaysSection` mounted in `settings-content.tsx`.

**Tech Stack:** Next.js 14 server actions, Supabase (service-role client), Zod, Radix Dialog, Vitest with `tests/helpers/fake-supabase.ts`.

**Spec:** `docs/superpowers/specs/2026-10-07-public-holidays-design.md`. This plan covers §3 and §4. PRs 2–4 get their own plans after this one merges.

**Adjustments to the spec, found while planning** (the spec is updated to match in Task 10):
1. **Maharashtra 2027 is not in this PR.** The state's GAD hasn't notified 2027 yet, and the lists online are projections that disagree with DoPT (e.g. Gudi Padwa 7 vs 8 Apr). We ship MH 2026, national 2026 and national 2027, and add MH 2027 when it's notified.
2. **New orgs are seeded from a curated core list** of 13 per year (9 mandatory and 4 optional, the same shape as today's seed), not the full 17 DoPT gazetted holidays. Making all 17 Delhi central-government holidays mandatory (Muharram, Milad-un-Nabi, …) would change payroll and lateness for every new private-sector client.
3. **`get/updateHolidaySettings` (the optional-holiday allowance) moves to PR 4**, the only thing that uses it.

## Global Constraints

- Next.js **14.2.x**. No new runtime dependencies.
- Every server action returns `ActionResult<T>` (`@/types`), and calls `getCurrentUser()` first; mutations also require `isAdmin(user.role)`.
- Every query is scoped with `.eq("org_id", user.orgId)`. Updates and deletes filter on both `id` and `org_id`.
- Plain modules (resolver, pure helpers) must **not** have `"use server"` (gotcha #85) or `"use client"` (gotcha #78).
- A failed DB read must throw or return `{ success: false }`. It must never be treated as an empty list (gotcha #102).
- Dates are `YYYY-MM-DD` strings throughout. Weekdays are computed with UTC (`new Date(\`${d}T00:00:00.000Z\`).getUTCDay()`). "Today" is `istToday()` from `@jambahr/shared/attendance/ist`.
- Holiday name: trimmed, 1–80 chars. One holiday per `(org_id, date)` (existing unique constraint).
- Migration **123** is applied to live HRme (`imjwqktxzahhnfmfbtfc`) via Supabase MCP `apply_migration` **before** any code that reads `holidays.source` is deployed.
- Copy is plain English, sentence case, with no "tracking" language.
- Commit messages have **no** `Co-Authored-By` line (user rule). End each with `Claude-Session: https://claude.ai/code/session_01CVEsL8Lz4sUw2JXUwQoHhu`.
- Never use `git add -A`; the repo root has many untracked tooling directories. Add files by path.
- Run test commands from `apps/web`: `npx vitest run <path>`.

## Review Focus

1. **Two preset entries on one date** (15 Aug 2027: Independence Day and Milad-un-Nabi). Import must produce one row, "Independence Day / Milad-un-Nabi", and not fail the whole batch on the unique constraint. The test is in Task 3.
2. **Importing dates the org already has.** Those rows are skipped and reported, while the others are still added. Tests are in Tasks 3 and 5.
3. **A CSV from Excel with DD/MM/YYYY dates, a header row, quoted names containing commas, and blank lines.** Rows parse correctly; bad rows return line-numbered errors and never insert. The test is in Task 3.
4. **A non-admin, or an admin from another org, editing or deleting a holiday by id.** The action returns "Holiday not found" or "Unauthorized" and changes no data. The test is in Task 5.
5. **The payroll month wrapper after the resolver refactor.** The existing `tests/payroll/non-working-days.test.ts` and the engine tests pass unchanged. The parity test is in Task 4.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/123_holidays_admin.sql` (new) | `source`, `created_by`, `updated_at` + trigger |
| `packages/supabase/src/database.types.ts` (modify) | `holidays` Row/Insert/Update gain the 3 columns |
| `packages/shared/src/holidays/presets/2026.ts` (new) | National 2026 (17 gazetted + 34 restricted) + Maharashtra 2026 (23) |
| `packages/shared/src/holidays/presets/2027.ts` (new) | National 2027 (17 gazetted + 32 restricted) |
| `packages/shared/src/holidays/presets.ts` (new) | Types, region labels, `presetFor`, `presetRegionsFor`, `PRESET_YEARS` |
| `packages/shared/src/holidays/core-seed.ts` (new) | `CORE_HOLIDAYS` (13 per year) + `coreSeedRows(todayIst)` |
| `packages/shared/src/holidays/import.ts` (new) | `isValidIsoDate`, `presetToDrafts`, `mergeHolidayDrafts`, `parseHolidayCsv` |
| `packages/shared/src/holidays/non-working.ts` (new) | `eachDate`, `buildNonWorkingDays`, `nonWorkingDateList` |
| `apps/web/src/lib/holidays/non-working-days.ts` (new) | `loadNonWorkingDays` (DB, range-based) |
| `apps/web/src/lib/payroll/non-working-days.ts` (modify) | Becomes a wrapper over the new resolver |
| `apps/web/src/actions/holidays.ts` (new) | list/create/update/delete/getPreset/import |
| `apps/web/src/actions/organizations.ts` (modify) | Seed via `coreSeedRows` |
| `apps/web/src/config/onboarding-seed.ts` (modify) | Remove `DEFAULT_HOLIDAYS_2026` |
| `apps/web/src/components/settings/holidays-section.tsx` (new) | Year tabs, table, row actions |
| `apps/web/src/components/settings/holiday-dialog.tsx` (new) | Add/Edit dialog |
| `apps/web/src/components/settings/holiday-import-dialog.tsx` (new) | Preset + CSV checklist import |
| `apps/web/src/components/settings/settings-content.tsx` (modify) | Mount section; `?section=`/`#hash` opens a section |
| `apps/web/src/app/dashboard/settings/page.tsx` (modify) | Fetch this year's holidays, pass props |
| `packages/shared/src/holidays/nudge.ts` (new) | `holidayNudgeYear(todayIst, nextYearCount)` |
| `apps/web/src/actions/dashboard.ts` (modify) | `holidayNudgeYear` in dashboard data (admins) |
| `apps/web/src/components/dashboard/holiday-nudge-banner.tsx` (new) | Dismissible banner |
| `apps/web/src/app/dashboard/page.tsx` (modify) | Render banner |
| `apps/web/src/lib/assistant/help/articles/manage_holidays.md` (new) | Help article |
| `apps/web/src/lib/assistant/route-registry.ts` (modify) | `manage_holidays` entry |
| Tests (new): `apps/web/tests/holidays/{presets,core-seed,import,non-working,load-non-working-days,actions,nudge}.test.ts` | |
| `apps/web/tests/helpers/fake-supabase.ts` (modify) | `holidays` unique key `(org_id, date)` |

---

### Task 1: Migration 123 and types

**Files:**
- Create: `supabase/migrations/123_holidays_admin.sql`
- Modify: `packages/supabase/src/database.types.ts` (the `holidays:` block near line 3493)

**Interfaces:**
- Produces: `holidays.source` (`'seed'|'preset'|'manual'|'csv'`, default `'manual'`; existing rows become `'seed'`), `holidays.created_by uuid null`, `holidays.updated_at timestamptz`.

- [ ] **Step 1: Write the migration**

```sql
-- 123_holidays_admin.sql
-- Holidays become admin-managed (Settings → Holidays). Until now the only
-- writer was the new-org seed, so every existing row is marked 'seed'.
--   source:     where the row came from — seed | preset | manual | csv
--   created_by: the admin who added it (null for seeded rows)
--   updated_at: maintained by the shared update_updated_at_column() trigger
-- Additive and idempotent.

alter table public.holidays
  add column if not exists source text not null default 'seed',
  add column if not exists created_by uuid references public.employees(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

-- Existing rows were backfilled to 'seed' by the add-column default above;
-- new rows default to 'manual'.
alter table public.holidays alter column source set default 'manual';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'holidays_source_check') then
    alter table public.holidays
      add constraint holidays_source_check check (source in ('seed', 'preset', 'manual', 'csv'));
  end if;
end $$;

drop trigger if exists update_holidays_updated_at on public.holidays;
create trigger update_holidays_updated_at
  before update on public.holidays
  for each row execute function public.update_updated_at_column();
```

- [ ] **Step 2: Apply to live HRme**

Use the Supabase MCP tool `apply_migration` with `project_id: "imjwqktxzahhnfmfbtfc"`, `name: "holidays_admin"` and the SQL above. Then verify:

```sql
select source, count(*) from holidays group by source;
```
Expected: one row, `seed | 117` (9 orgs × 13).

```sql
select tgname from pg_trigger where tgname = 'update_holidays_updated_at';
```
Expected: one row.

- [ ] **Step 3: Update the generated types**

In `packages/supabase/src/database.types.ts`, replace the `holidays` block's `Row`, `Insert` and `Update` with the generator-format version below. Keep `Relationships` and add the `created_by` FK entry to it.

```ts
      holidays: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          id: string
          is_optional: boolean
          name: string
          org_id: string
          source: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date: string
          id?: string
          is_optional?: boolean
          name: string
          org_id: string
          source?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          is_optional?: boolean
          name?: string
          org_id?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "holidays_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holidays_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
```

- [ ] **Step 4: Typecheck the types package**

Run (repo root): `npx turbo typecheck --filter=@jambahr/supabase`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/123_holidays_admin.sql packages/supabase/src/database.types.ts
git commit -m "feat(holidays): migration 123 — source, created_by, updated_at on holidays

Claude-Session: https://claude.ai/code/session_01CVEsL8Lz4sUw2JXUwQoHhu"
```

---

### Task 2: Preset data and core seed

**Files:**
- Create: `packages/shared/src/holidays/presets.ts`, `packages/shared/src/holidays/presets/2026.ts`, `packages/shared/src/holidays/presets/2027.ts`, `packages/shared/src/holidays/core-seed.ts`
- Test: `apps/web/tests/holidays/presets.test.ts`, `apps/web/tests/holidays/core-seed.test.ts`

**Interfaces:**
- Produces:
  - `type HolidayRegion = "national" | "MH"`
  - `type HolidayKind = "gazetted" | "restricted" | "state"`
  - `type HolidayPreset = { region: HolidayRegion; name: string; date: string; kind: HolidayKind }`
  - `PRESET_REGION_LABELS: Record<HolidayRegion, string>`
  - `PRESET_YEARS: number[]`
  - `presetFor(year: number, region: HolidayRegion): HolidayPreset[]`
  - `presetRegionsFor(year: number): HolidayRegion[]`
  - `type SeedHoliday = { name: string; date: string; is_optional: boolean }`
  - `CORE_HOLIDAYS: Record<number, SeedHoliday[]>`
  - `coreSeedRows(todayIst: string): SeedHoliday[]`

- [ ] **Step 1: Write the failing tests**

`apps/web/tests/holidays/presets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PRESET_YEARS, presetFor, presetRegionsFor, type HolidayPreset } from "@jambahr/shared/holidays/presets";

const isRealDate = (d: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const dt = new Date(`${d}T00:00:00.000Z`);
  return dt.toISOString().slice(0, 10) === d;
};

describe("holiday presets", () => {
  it("ships 2026 and 2027", () => {
    expect(PRESET_YEARS).toEqual([2026, 2027]);
    expect(presetRegionsFor(2026)).toEqual(["national", "MH"]);
    expect(presetRegionsFor(2027)).toEqual(["national"]); // MH 2027 not yet notified
    expect(presetRegionsFor(2030)).toEqual([]);
  });

  for (const year of [2026, 2027]) {
    for (const region of presetRegionsFor(year)) {
      it(`${year} ${region}: valid dates inside the year, no duplicates, kinds match region`, () => {
        const rows: HolidayPreset[] = presetFor(year, region);
        expect(rows.length).toBeGreaterThan(0);
        const keys = new Set<string>();
        for (const r of rows) {
          expect(isRealDate(r.date), r.date).toBe(true);
          expect(r.date.startsWith(`${year}-`), r.date).toBe(true);
          expect(r.region).toBe(region);
          expect(r.name.trim().length).toBeGreaterThan(0);
          expect(r.name.length).toBeLessThanOrEqual(80);
          if (region === "national") expect(["gazetted", "restricted"]).toContain(r.kind);
          else expect(r.kind).toBe("state");
          const key = `${r.date}|${r.name}`;
          expect(keys.has(key), key).toBe(false);
          keys.add(key);
        }
      });
    }
  }

  it("national lists carry DoPT's 17 gazetted holidays", () => {
    expect(presetFor(2026, "national").filter((r) => r.kind === "gazetted")).toHaveLength(17);
    expect(presetFor(2027, "national").filter((r) => r.kind === "gazetted")).toHaveLength(17);
  });

  it("spot-checks known dates", () => {
    const find = (y: number, reg: "national" | "MH", name: string) =>
      presetFor(y, reg).find((r) => r.name === name)?.date;
    expect(find(2026, "national", "Diwali")).toBe("2026-11-08");
    expect(find(2026, "national", "Dussehra")).toBe("2026-10-20");
    expect(find(2026, "MH", "Diwali (Bali Pratipada)")).toBe("2026-11-10");
    expect(find(2027, "national", "Diwali (Deepavali)")).toBe("2027-10-29");
  });

  it("returns a copy, so callers can't mutate the shared data", () => {
    const a = presetFor(2026, "national");
    a.pop();
    expect(presetFor(2026, "national").length).toBe(a.length + 1);
  });
});
```

`apps/web/tests/holidays/core-seed.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CORE_HOLIDAYS, coreSeedRows } from "@jambahr/shared/holidays/core-seed";

describe("core seed", () => {
  it("has 13 holidays per year: 9 mandatory, 4 optional, all inside the year", () => {
    for (const [year, rows] of Object.entries(CORE_HOLIDAYS)) {
      expect(rows).toHaveLength(13);
      expect(rows.filter((r) => r.is_optional)).toHaveLength(4);
      for (const r of rows) expect(r.date.startsWith(`${year}-`)).toBe(true);
      expect(new Set(rows.map((r) => r.date)).size).toBe(13);
    }
  });

  it("seeds the rest of this year plus all of next year", () => {
    const rows = coreSeedRows("2026-10-07");
    expect(rows.map((r) => r.date)).toEqual([
      "2026-10-20", "2026-11-08", "2026-12-25",
      ...CORE_HOLIDAYS[2027].map((r) => r.date),
    ]);
  });

  it("includes a holiday that falls today", () => {
    expect(coreSeedRows("2026-12-25")[0].date).toBe("2026-12-25");
  });

  it("only seeds what exists when next year has no list", () => {
    expect(coreSeedRows("2027-12-01").map((r) => r.date)).toEqual(["2027-12-25"]);
    expect(coreSeedRows("2031-01-01")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/holidays/presets.test.ts tests/holidays/core-seed.test.ts`
Expected: FAIL, "Failed to resolve import @jambahr/shared/holidays/presets".

- [ ] **Step 3: Write the preset data**

`packages/shared/src/holidays/presets/2026.ts` (data copied verbatim from the cited notifications):

```ts
import type { HolidayPreset } from "../presets";

// National: DoPT O.M. F.No.12/2/2023-JCA dated 03-07-2025 — Annexure-I (gazetted,
//   Delhi/New Delhi) and Annexure-II (restricted).
//   https://www.govtstaff.com/2025/07/list-of-gazetted-holidays-to-be-observed-in-the-administrative-offices-of-central-government-located-at-delhi-new-delhi-during-the-year-2026.html
//   https://govtstaff.com/2025/07/list-of-restricted-holidays-to-be-observed-in-the-administrative-offices-of-central-government-located-at-delhi-new-delhi-during-the-year-2026.html
// Maharashtra: GAD public-holiday notification for 2026 (NI Act s.25), incl. the
//   additional Bhaubeej holiday; the bank-only 1 Apr closing day is excluded.
//   https://www.keka.com/compliance/public-holiday/maharashtra
//   https://www.sakshipost.com/news/national/maharashtra-govt-issues-2026-public-holiday-list-bhaubeej-earns-additional-holiday

const g = (name: string, date: string): HolidayPreset => ({ region: "national", kind: "gazetted", name, date });
const r = (name: string, date: string): HolidayPreset => ({ region: "national", kind: "restricted", name, date });
const mh = (name: string, date: string): HolidayPreset => ({ region: "MH", kind: "state", name, date });

export const PRESETS_2026: HolidayPreset[] = [
  g("Republic Day", "2026-01-26"),
  g("Holi", "2026-03-04"),
  g("Id-ul-Fitr", "2026-03-21"),
  g("Ram Navami", "2026-03-26"),
  g("Mahavir Jayanti", "2026-03-31"),
  g("Good Friday", "2026-04-03"),
  g("Buddha Purnima", "2026-05-01"),
  g("Id-ul-Zuha (Bakrid)", "2026-05-27"),
  g("Muharram", "2026-06-26"),
  g("Independence Day", "2026-08-15"),
  g("Milad-un-Nabi", "2026-08-26"),
  g("Janmashtami", "2026-09-04"),
  g("Mahatma Gandhi's Birthday", "2026-10-02"),
  g("Dussehra", "2026-10-20"),
  g("Diwali", "2026-11-08"),
  g("Guru Nanak's Birthday", "2026-11-24"),
  g("Christmas Day", "2026-12-25"),

  r("New Year's Day", "2026-01-01"),
  r("Hazarat Ali's Birthday", "2026-01-03"),
  r("Makar Sankranti", "2026-01-14"),
  r("Magha Bihu / Pongal", "2026-01-14"),
  r("Basant Panchami / Sri Panchami", "2026-01-23"),
  r("Guru Ravi Das's Birthday", "2026-02-01"),
  r("Swami Dayananda Saraswati's Birthday", "2026-02-12"),
  r("Maha Shivratri", "2026-02-15"),
  r("Shivaji Jayanti", "2026-02-19"),
  r("Holika Dahan", "2026-03-03"),
  r("Dolyatra", "2026-03-03"),
  r("Chaitra Sukladi / Gudi Padwa / Ugadi / Cheti Chand", "2026-03-19"),
  r("Jamat-ul-Vida", "2026-03-20"),
  r("Easter Sunday", "2026-04-05"),
  r("Vaisakhi / Vishu / Meshadi (Tamil New Year)", "2026-04-14"),
  r("Vaisakhadi (Bengal) / Bahag Bihu (Assam)", "2026-04-15"),
  r("Guru Rabindranath Tagore's Birthday", "2026-05-09"),
  r("Rath Yatra", "2026-07-16"),
  r("Parsi New Year / Navroz", "2026-08-15"),
  r("Onam", "2026-08-26"),
  r("Raksha Bandhan", "2026-08-28"),
  r("Ganesh Chaturthi / Vinayaka Chaturthi", "2026-09-14"),
  r("Dussehra (Saptami)", "2026-10-18"),
  r("Dussehra (Mahashtami)", "2026-10-19"),
  r("Dussehra (Mahanavmi)", "2026-10-20"),
  r("Maharishi Valmiki's Birthday", "2026-10-26"),
  r("Karva Chauth", "2026-10-29"),
  r("Naraka Chaturdasi", "2026-11-08"),
  r("Govardhan Puja", "2026-11-09"),
  r("Bhai Duj", "2026-11-11"),
  r("Chhath Puja", "2026-11-15"),
  r("Guru Teg Bahadur's Martyrdom Day", "2026-11-24"),
  r("Hazarat Ali's Birthday", "2026-12-23"),
  r("Christmas Eve", "2026-12-24"),

  mh("Republic Day", "2026-01-26"),
  mh("Mahashivratri", "2026-02-15"),
  mh("Chhatrapati Shivaji Maharaj Jayanti", "2026-02-19"),
  mh("Holi (Second Day)", "2026-03-03"),
  mh("Gudi Padwa", "2026-03-19"),
  mh("Ramzan Id (Id-ul-Fitr)", "2026-03-21"),
  mh("Ram Navami", "2026-03-26"),
  mh("Mahavir Janmakalyanak", "2026-03-31"),
  mh("Good Friday", "2026-04-03"),
  mh("Dr. Babasaheb Ambedkar Jayanti", "2026-04-14"),
  mh("Maharashtra Din", "2026-05-01"),
  mh("Buddha Pournima", "2026-05-01"),
  mh("Bakri Id (Id-uz-Zuha)", "2026-05-28"),
  mh("Moharrum", "2026-06-26"),
  mh("Independence Day", "2026-08-15"),
  mh("Parsi New Year (Shahenshahi)", "2026-08-15"),
  mh("Id-e-Milad", "2026-08-26"),
  mh("Ganesh Chaturthi", "2026-09-14"),
  mh("Mahatma Gandhi Jayanti", "2026-10-02"),
  mh("Dasara", "2026-10-20"),
  mh("Diwali Amavasya (Laxmi Pujan)", "2026-11-08"),
  mh("Diwali (Bali Pratipada)", "2026-11-10"),
  mh("Bhaubeej", "2026-11-11"),
  mh("Guru Nanak Jayanti", "2026-11-24"),
  mh("Christmas", "2026-12-25"),
];
```

> Note: the MH list above has 25 entries, because Maharashtra Din and Buddha Pournima share 1 May, and Independence Day and Parsi New Year share 15 Aug. That's 23 distinct dates, which import merges (Task 3).

`packages/shared/src/holidays/presets/2027.ts`:

```ts
import type { HolidayPreset } from "../presets";

// National: DoPT O.M. F.No.12/2/2023-JCA dated 16-07-2026 — gazetted (Delhi/New
//   Delhi) and restricted holidays for 2027.
//   https://www.staffnews.in/2026/07/list-of-holidays-for-the-year-2027-gazetted.html
//   https://www.staffnews.in/2026/07/list-of-restricted-holidays-for-the-year-2027.html
// Maharashtra 2027: not yet notified by GAD (as of 2026-10-07) — add when it is.

const g = (name: string, date: string): HolidayPreset => ({ region: "national", kind: "gazetted", name, date });
const r = (name: string, date: string): HolidayPreset => ({ region: "national", kind: "restricted", name, date });

export const PRESETS_2027: HolidayPreset[] = [
  g("Republic Day", "2027-01-26"),
  g("Id-ul-Fitr", "2027-03-10"),
  g("Holi", "2027-03-23"),
  g("Good Friday", "2027-03-26"),
  g("Ram Navami", "2027-04-15"),
  g("Mahavir Jayanti", "2027-04-19"),
  g("Id-ul-Zuha (Bakrid)", "2027-05-17"),
  g("Buddha Purnima", "2027-05-20"),
  g("Muharram", "2027-06-16"),
  g("Independence Day", "2027-08-15"),
  g("Milad-un-Nabi", "2027-08-15"),
  g("Janmashtami (Vaishnav)", "2027-08-25"),
  g("Mahatma Gandhi's Birthday", "2027-10-02"),
  g("Dussehra (Vijaya Dashmi)", "2027-10-09"),
  g("Diwali (Deepavali)", "2027-10-29"),
  g("Guru Nanak's Birthday", "2027-11-14"),
  g("Christmas Day", "2027-12-25"),

  r("New Year's Day", "2027-01-01"),
  r("Makar Sankranti / Magha Bihu", "2027-01-14"),
  r("Pongal / Guru Gobind Singh's Birthday", "2027-01-15"),
  r("Basant Panchami / Sri Panchami", "2027-02-11"),
  r("Shivaji Jayanti", "2027-02-19"),
  r("Guru Ravi Das's Birthday", "2027-02-20"),
  r("Swami Dayananda Saraswati's Birthday", "2027-03-02"),
  r("Jamat-ul-Vida", "2027-03-05"),
  r("Maha Shivratri", "2027-03-06"),
  r("Holika Dahan / Dolyatra", "2027-03-22"),
  r("Easter Sunday", "2027-03-28"),
  r("Chaitra Sukladi / Gudi Padwa / Ugadi / Cheti Chand", "2027-04-07"),
  r("Vaisakhi / Vishu / Meshadi (Tamil New Year)", "2027-04-14"),
  r("Vaisakhadi (Bengal) / Bahag Bihu (Assam)", "2027-04-15"),
  r("Guru Rabindranath Tagore's Birthday", "2027-05-09"),
  r("Rath Yatra", "2027-07-05"),
  r("Parsi New Year / Navroz", "2027-08-15"),
  r("Raksha Bandhan", "2027-08-17"),
  r("Ganesh Chaturthi / Vinayaka Chaturthi", "2027-09-04"),
  r("Onam", "2027-09-12"),
  r("Dussehra (Saptami)", "2027-10-06"),
  r("Dussehra (Mahashtami)", "2027-10-07"),
  r("Dussehra (Mahanavmi)", "2027-10-08"),
  r("Maharishi Valmiki's Birthday", "2027-10-15"),
  r("Karva Chauth", "2027-10-18"),
  r("Naraka Chaturdasi", "2027-10-28"),
  r("Govardhan Puja", "2027-10-30"),
  r("Bhai Duj", "2027-10-31"),
  r("Chhath Puja", "2027-11-04"),
  r("Guru Teg Bahadur's Martyrdom Day", "2027-11-24"),
  r("Hazarat Ali's Birthday", "2027-12-12"),
  r("Christmas Eve", "2027-12-24"),
];
```

- [ ] **Step 4: Write `presets.ts`**

```ts
// Plain module — curated public-holiday presets that admins import from
// Settings → Holidays. One data file per year; a state or a year is added as
// data, no code change. Every file cites the notification it was copied from.

import { PRESETS_2026 } from "./presets/2026";
import { PRESETS_2027 } from "./presets/2027";

export type HolidayRegion = "national" | "MH";
export type HolidayKind = "gazetted" | "restricted" | "state";
export type HolidayPreset = { region: HolidayRegion; name: string; date: string; kind: HolidayKind };

export const PRESET_REGION_LABELS: Record<HolidayRegion, string> = {
  national: "National (central government)",
  MH: "Maharashtra",
};

const REGION_ORDER: HolidayRegion[] = ["national", "MH"];

const BY_YEAR: Record<number, HolidayPreset[]> = {
  2026: PRESETS_2026,
  2027: PRESETS_2027,
};

export const PRESET_YEARS: number[] = Object.keys(BY_YEAR).map(Number).sort((a, b) => a - b);

export function presetFor(year: number, region: HolidayRegion): HolidayPreset[] {
  return (BY_YEAR[year] ?? []).filter((p) => p.region === region).map((p) => ({ ...p }));
}

export function presetRegionsFor(year: number): HolidayRegion[] {
  const present = new Set((BY_YEAR[year] ?? []).map((p) => p.region));
  return REGION_ORDER.filter((r) => present.has(r));
}
```

- [ ] **Step 5: Write `core-seed.ts`**

```ts
// Plain module — the holidays a brand-new org starts with: a curated core of
// 13 a year (9 mandatory, 4 optional), NOT the full DoPT gazetted list, so a
// new private-sector client isn't given 17 mandatory Delhi holidays. Admins
// import the rest from a preset in Settings → Holidays.

export type SeedHoliday = { name: string; date: string; is_optional: boolean };

const m = (name: string, date: string): SeedHoliday => ({ name, date, is_optional: false });
const o = (name: string, date: string): SeedHoliday => ({ name, date, is_optional: true });

export const CORE_HOLIDAYS: Record<number, SeedHoliday[]> = {
  2026: [
    m("New Year's Day", "2026-01-01"),
    m("Republic Day", "2026-01-26"),
    m("Holi", "2026-03-03"),
    o("Eid ul-Fitr", "2026-03-21"),
    o("Good Friday", "2026-04-03"),
    m("Ambedkar Jayanti", "2026-04-14"),
    o("Eid ul-Adha", "2026-05-27"),
    m("Independence Day", "2026-08-15"),
    o("Janmashtami", "2026-09-04"),
    m("Gandhi Jayanti", "2026-10-02"),
    m("Dussehra", "2026-10-20"),
    m("Diwali", "2026-11-08"),
    m("Christmas", "2026-12-25"),
  ],
  2027: [
    m("New Year's Day", "2027-01-01"),
    m("Republic Day", "2027-01-26"),
    o("Eid ul-Fitr", "2027-03-10"),
    m("Holi", "2027-03-23"),
    o("Good Friday", "2027-03-26"),
    m("Ambedkar Jayanti", "2027-04-14"),
    o("Eid ul-Adha", "2027-05-17"),
    m("Independence Day", "2027-08-15"),
    o("Janmashtami", "2027-08-25"),
    m("Gandhi Jayanti", "2027-10-02"),
    m("Dussehra", "2027-10-09"),
    m("Diwali", "2027-10-29"),
    m("Christmas", "2027-12-25"),
  ],
};

/** Core holidays from `todayIst` (inclusive) to the end of next year, where lists exist. */
export function coreSeedRows(todayIst: string): SeedHoliday[] {
  const year = Number(todayIst.slice(0, 4));
  const thisYear = (CORE_HOLIDAYS[year] ?? []).filter((h) => h.date >= todayIst);
  const nextYear = CORE_HOLIDAYS[year + 1] ?? [];
  return [...thisYear, ...nextYear].map((h) => ({ ...h }));
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/holidays/presets.test.ts tests/holidays/core-seed.test.ts`
Expected: PASS (all).

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/holidays/presets.ts packages/shared/src/holidays/presets/2026.ts packages/shared/src/holidays/presets/2027.ts packages/shared/src/holidays/core-seed.ts apps/web/tests/holidays/presets.test.ts apps/web/tests/holidays/core-seed.test.ts
git commit -m "feat(holidays): national 2026/2027 + Maharashtra 2026 presets and the new-org core seed

Claude-Session: https://claude.ai/code/session_01CVEsL8Lz4sUw2JXUwQoHhu"
```

---

### Task 3: Import helpers (merge and CSV)

**Files:**
- Create: `packages/shared/src/holidays/import.ts`
- Test: `apps/web/tests/holidays/import.test.ts`

**Interfaces:**
- Consumes: `HolidayPreset` (Task 2).
- Produces:
  - `type HolidayDraft = { name: string; date: string; isOptional: boolean }`
  - `isValidIsoDate(s: string): boolean`
  - `presetToDrafts(rows: HolidayPreset[]): HolidayDraft[]`. Restricted entries are optional; gazetted and state entries are mandatory.
  - `mergeHolidayDrafts(drafts: HolidayDraft[], existingDates: ReadonlySet<string>): { rows: HolidayDraft[]; skipped: string[] }`
  - `parseHolidayCsv(text: string): { drafts: HolidayDraft[]; errors: { line: number; message: string }[] }`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { isValidIsoDate, mergeHolidayDrafts, parseHolidayCsv, presetToDrafts } from "@jambahr/shared/holidays/import";

describe("isValidIsoDate", () => {
  it("accepts real dates and rejects overflow and junk", () => {
    expect(isValidIsoDate("2027-02-28")).toBe(true);
    expect(isValidIsoDate("2027-02-29")).toBe(false);
    expect(isValidIsoDate("2027-2-1")).toBe(false);
    expect(isValidIsoDate("")).toBe(false);
  });
});

describe("presetToDrafts", () => {
  it("restricted → optional, gazetted/state → mandatory", () => {
    expect(
      presetToDrafts([
        { region: "national", kind: "gazetted", name: "Holi", date: "2027-03-23" },
        { region: "national", kind: "restricted", name: "Easter Sunday", date: "2027-03-28" },
        { region: "MH", kind: "state", name: "Gudi Padwa", date: "2026-03-19" },
      ])
    ).toEqual([
      { name: "Holi", date: "2027-03-23", isOptional: false },
      { name: "Easter Sunday", date: "2027-03-28", isOptional: true },
      { name: "Gudi Padwa", date: "2026-03-19", isOptional: false },
    ]);
  });
});

describe("mergeHolidayDrafts", () => {
  it("joins two holidays on one date into one row, mandatory if either is", () => {
    const { rows, skipped } = mergeHolidayDrafts(
      [
        { name: "Independence Day", date: "2027-08-15", isOptional: false },
        { name: "Milad-un-Nabi", date: "2027-08-15", isOptional: false },
        { name: "Parsi New Year / Navroz", date: "2027-08-15", isOptional: true },
      ],
      new Set()
    );
    expect(skipped).toEqual([]);
    expect(rows).toEqual([
      { name: "Independence Day / Milad-un-Nabi / Parsi New Year / Navroz", date: "2027-08-15", isOptional: false },
    ]);
  });

  it("is optional only when every holiday on that date is optional", () => {
    const { rows } = mergeHolidayDrafts(
      [
        { name: "Holika Dahan", date: "2026-03-03", isOptional: true },
        { name: "Dolyatra", date: "2026-03-03", isOptional: true },
      ],
      new Set()
    );
    expect(rows[0].isOptional).toBe(true);
  });

  it("skips dates the org already has, keeps the rest, sorts by date", () => {
    const { rows, skipped } = mergeHolidayDrafts(
      [
        { name: "Christmas", date: "2026-12-25", isOptional: false },
        { name: "Diwali", date: "2026-11-08", isOptional: false },
        { name: "Bhaubeej", date: "2026-11-11", isOptional: false },
      ],
      new Set(["2026-11-08"])
    );
    expect(skipped).toEqual(["2026-11-08"]);
    expect(rows.map((r) => r.date)).toEqual(["2026-11-11", "2026-12-25"]);
  });

  it("drops a repeated identical name and caps the joined name at 80 chars", () => {
    const long = "A".repeat(50);
    const { rows } = mergeHolidayDrafts(
      [
        { name: long, date: "2027-01-01", isOptional: false },
        { name: long, date: "2027-01-01", isOptional: false },
        { name: "B".repeat(50), date: "2027-01-01", isOptional: false },
      ],
      new Set()
    );
    expect(rows[0].name.length).toBeLessThanOrEqual(80);
    expect(rows[0].name.startsWith(long)).toBe(true);
  });
});

describe("parseHolidayCsv", () => {
  it("handles a header, Excel DD/MM/YYYY dates, quoted commas, blank lines", () => {
    const csv = [
      "Name,Date,Optional",
      "Diwali,08/11/2026,no",
      "",
      '"Diwali, Lakshmi Pujan",2026-11-09,yes',
      "Bhaubeej,11-11-2026,",
    ].join("\r\n");
    const { drafts, errors } = parseHolidayCsv(csv);
    expect(errors).toEqual([]);
    expect(drafts).toEqual([
      { name: "Diwali", date: "2026-11-08", isOptional: false },
      { name: "Diwali, Lakshmi Pujan", date: "2026-11-09", isOptional: true },
      { name: "Bhaubeej", date: "2026-11-11", isOptional: false },
    ]);
  });

  it("works without a header row", () => {
    expect(parseHolidayCsv("Holi,2027-03-23,mandatory").drafts).toEqual([
      { name: "Holi", date: "2027-03-23", isOptional: false },
    ]);
  });

  it("reports line-numbered errors and never returns the bad rows", () => {
    const { drafts, errors } = parseHolidayCsv(
      ["name,date,optional", ",2026-11-08,no", "Holi,2026-02-30,no", "Diwali,2026-11-08,maybe", "Ok,2026-12-25,no"].join("\n")
    );
    expect(drafts).toEqual([{ name: "Ok", date: "2026-12-25", isOptional: false }]);
    expect(errors).toEqual([
      { line: 2, message: "Name is required" },
      { line: 3, message: "Date must be a real date (YYYY-MM-DD or DD/MM/YYYY)" },
      { line: 4, message: 'Optional must be yes or no (got "maybe")' },
    ]);
  });

  it("rejects names over 80 characters", () => {
    const { errors } = parseHolidayCsv(`${"x".repeat(81)},2026-12-25,no`);
    expect(errors).toEqual([{ line: 1, message: "Name must be 80 characters or fewer" }]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/holidays/import.test.ts`
Expected: FAIL, "Failed to resolve import @jambahr/shared/holidays/import".

- [ ] **Step 3: Implement `import.ts`**

```ts
// Plain module — turns preset selections or an uploaded CSV into holiday rows.
// One holiday per (org, date): several holidays on one date are joined into a
// single row ("Independence Day / Milad-un-Nabi"), mandatory if any is.

import type { HolidayPreset } from "./presets";

export type HolidayDraft = { name: string; date: string; isOptional: boolean };

const MAX_NAME = 80;

export function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function presetToDrafts(rows: HolidayPreset[]): HolidayDraft[] {
  return rows.map((r) => ({ name: r.name, date: r.date, isOptional: r.kind === "restricted" }));
}

export function mergeHolidayDrafts(
  drafts: HolidayDraft[],
  existingDates: ReadonlySet<string>
): { rows: HolidayDraft[]; skipped: string[] } {
  const byDate = new Map<string, HolidayDraft[]>();
  for (const d of drafts) {
    const list = byDate.get(d.date) ?? [];
    list.push(d);
    byDate.set(d.date, list);
  }
  const rows: HolidayDraft[] = [];
  const skipped: string[] = [];
  for (const date of [...byDate.keys()].sort()) {
    if (existingDates.has(date)) {
      skipped.push(date);
      continue;
    }
    const group = byDate.get(date)!;
    const names = [...new Set(group.map((g) => g.name.trim()).filter(Boolean))];
    let name = names[0] ?? "";
    for (const n of names.slice(1)) {
      if (`${name} / ${n}`.length > MAX_NAME) break;
      name = `${name} / ${n}`;
    }
    rows.push({ name: name.slice(0, MAX_NAME), date, isOptional: group.every((g) => g.isOptional) });
  }
  return { rows, skipped };
}

/** Splits one CSV line, honouring double-quoted fields ("a, b" and "" escapes). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** YYYY-MM-DD, or DD/MM/YYYY and DD-MM-YYYY (how Excel exports Indian dates). */
function normaliseDate(raw: string): string | null {
  if (isValidIsoDate(raw)) return raw;
  const m = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return isValidIsoDate(iso) ? iso : null;
}

const YES = new Set(["yes", "y", "true", "1", "optional"]);
const NO = new Set(["", "no", "n", "false", "0", "mandatory"]);

export function parseHolidayCsv(text: string): {
  drafts: HolidayDraft[];
  errors: { line: number; message: string }[];
} {
  const drafts: HolidayDraft[] = [];
  const errors: { line: number; message: string }[] = [];
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  lines.forEach((raw, idx) => {
    const line = idx + 1;
    if (!raw.trim()) return;
    const [nameRaw = "", dateRaw = "", optRaw = ""] = splitCsvLine(raw);
    if (idx === 0 && nameRaw.toLowerCase() === "name" && dateRaw.toLowerCase() === "date") return;
    const name = nameRaw.trim();
    if (!name) return void errors.push({ line, message: "Name is required" });
    if (name.length > MAX_NAME) return void errors.push({ line, message: "Name must be 80 characters or fewer" });
    const date = normaliseDate(dateRaw);
    if (!date) return void errors.push({ line, message: "Date must be a real date (YYYY-MM-DD or DD/MM/YYYY)" });
    const opt = optRaw.toLowerCase();
    if (!YES.has(opt) && !NO.has(opt)) {
      return void errors.push({ line, message: `Optional must be yes or no (got "${optRaw}")` });
    }
    drafts.push({ name, date, isOptional: YES.has(opt) });
  });
  return { drafts, errors };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/holidays/import.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/holidays/import.ts apps/web/tests/holidays/import.test.ts
git commit -m "feat(holidays): preset/CSV import helpers — merge per date, Excel dates, line errors

Claude-Session: https://claude.ai/code/session_01CVEsL8Lz4sUw2JXUwQoHhu"
```

---

### Task 4: Range-based non-working-days resolver (payroll becomes a wrapper)

**Files:**
- Create: `packages/shared/src/holidays/non-working.ts`, `apps/web/src/lib/holidays/non-working-days.ts`
- Modify: `apps/web/src/lib/payroll/non-working-days.ts`
- Test: `apps/web/tests/holidays/non-working.test.ts`, `apps/web/tests/holidays/load-non-working-days.test.ts` (and the existing `tests/payroll/non-working-days.test.ts` must pass **unchanged**)

**Interfaces:**
- Consumes: `isWeekOff`, `resolveEffectiveWeekOff`, `WeekOffPolicy` from `@jambahr/shared/attendance/week-off`.
- Produces:
  - `type NonWorkingDays = { holidays: Map<string, string>; weekOffs: Set<string>; hasWeekOff: boolean }`
  - `eachDate(from: string, to: string): string[]`
  - `buildNonWorkingDays(input: { from: string; to: string; holidays: { date: string; name: string }[]; weekOff: WeekOffPolicy | null }): NonWorkingDays`
  - `nonWorkingDateList(d: NonWorkingDays): string[]` (sorted union)
  - `loadNonWorkingDays(supabase, { orgId, employees: { id: string; department_id: string | null }[], from, to }): Promise<Map<string, NonWorkingDays>>`. It reads mandatory holidays only; PR 4 adds approved claims here.
  - `loadNonWorkingDates` (payroll) keeps its exact signature and return shape `Map<string, { dates: string[]; hasWeekOff: boolean }>`.

- [ ] **Step 1: Write the failing pure test**

`apps/web/tests/holidays/non-working.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildNonWorkingDays, eachDate, nonWorkingDateList } from "@jambahr/shared/holidays/non-working";

describe("eachDate", () => {
  it("is inclusive and crosses month ends", () => {
    expect(eachDate("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(eachDate("2026-11-02", "2026-11-01")).toEqual([]);
  });
});

describe("buildNonWorkingDays", () => {
  const satSun = { week_type: 5 as const, off_days: [0, 6] };

  it("splits holidays and week-offs inside the range", () => {
    const d = buildNonWorkingDays({
      from: "2026-11-06",
      to: "2026-11-11",
      holidays: [
        { date: "2026-11-08", name: "Diwali" },
        { date: "2026-11-10", name: "Bali Pratipada" },
        { date: "2026-12-25", name: "Christmas" }, // outside the range
      ],
      weekOff: satSun,
    });
    expect([...d.holidays]).toEqual([["2026-11-08", "Diwali"], ["2026-11-10", "Bali Pratipada"]]);
    expect([...d.weekOffs]).toEqual(["2026-11-07", "2026-11-08"]);
    expect(d.hasWeekOff).toBe(true);
    expect(nonWorkingDateList(d)).toEqual(["2026-11-07", "2026-11-08", "2026-11-10"]);
  });

  it("with no week-off policy only holidays count", () => {
    const d = buildNonWorkingDays({ from: "2026-11-01", to: "2026-11-30", holidays: [], weekOff: null });
    expect(d.weekOffs.size).toBe(0);
    expect(d.hasWeekOff).toBe(false);
  });
});
```

- [ ] **Step 2: Write the failing DB test**

`apps/web/tests/holidays/load-non-working-days.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "../helpers/fake-supabase";
import { loadNonWorkingDays } from "@/lib/holidays/non-working-days";
import { loadNonWorkingDates } from "@/lib/payroll/non-working-days";

const db = () => ({
  holidays: [
    { org_id: "A", date: "2026-11-08", name: "Diwali", is_optional: false },
    { org_id: "A", date: "2026-11-11", name: "Bhai Duj", is_optional: true },
    { org_id: "B", date: "2026-11-10", name: "Other org", is_optional: false },
  ],
  week_off_policy: [{ org_id: "A", week_type: 5, off_days: [0, 6], alt_saturday_rule: "none", effective_from: "2026-01-01" }],
  employee_week_off_override: [{ org_id: "A", employee_id: "e2", week_type: 6, off_days: [1], alt_saturday_rule: "none" }],
  department_week_off_override: [],
});

describe("loadNonWorkingDays", () => {
  it("resolves per employee: mandatory holidays only, own org only, employee override wins", async () => {
    const out = await loadNonWorkingDays(createFakeSupabase(db()) as any, {
      orgId: "A",
      employees: [{ id: "e1", department_id: null }, { id: "e2", department_id: null }],
      from: "2026-11-07",
      to: "2026-11-11",
    });
    const e1 = out.get("e1")!;
    expect([...e1.holidays.keys()]).toEqual(["2026-11-08"]); // optional Bhai Duj and org B excluded
    expect([...e1.weekOffs]).toEqual(["2026-11-07", "2026-11-08"]);
    const e2 = out.get("e2")!;
    expect([...e2.weekOffs]).toEqual(["2026-11-09"]); // Monday off via override
  });

  it("throws when a query fails instead of reporting no holidays", async () => {
    const failing = {
      from: (t: string) => {
        const b: any = createFakeSupabase(db()).from(t);
        if (t !== "holidays") return b;
        const chain: any = new Proxy(b, {
          get: (target, p) =>
            p === "then"
              ? (res: any) => Promise.resolve({ data: null, error: { message: "boom" } }).then(res)
              : typeof target[p] === "function"
                ? (...a: any[]) => (target[p](...a), chain)
                : target[p],
        });
        return chain;
      },
    };
    await expect(
      loadNonWorkingDays(failing as any, { orgId: "A", employees: [{ id: "e1", department_id: null }], from: "2026-11-01", to: "2026-11-30" })
    ).rejects.toThrow("holidays: boom");
  });
});

describe("payroll wrapper parity", () => {
  it("loadNonWorkingDates returns the month's sorted dates + hasWeekOff, as before", async () => {
    const out = await loadNonWorkingDates(createFakeSupabase(db()) as any, {
      orgId: "A",
      month: "2026-11",
      employees: [{ id: "e1", department_id: null }],
    });
    const e1 = out.get("e1")!;
    expect(e1.hasWeekOff).toBe(true);
    expect(e1.dates).toContain("2026-11-08");
    expect(e1.dates).not.toContain("2026-11-11");
    expect(e1.dates).toEqual([...e1.dates].sort());
    expect(e1.dates).toHaveLength(9); // 9 weekend days in Nov 2026 (8 Nov is both a Sunday and Diwali)
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run tests/holidays/non-working.test.ts tests/holidays/load-non-working-days.test.ts`
Expected: FAIL, unresolved imports.

- [ ] **Step 4: Implement the shared pure module**

`packages/shared/src/holidays/non-working.ts`:

```ts
// Plain module — the one definition of an employee's non-working days in a
// date range: holidays (as supplied) + their effective week-off. The DB loader
// (apps/web/src/lib/holidays/non-working-days.ts) decides WHICH holidays count
// (mandatory today; + approved optional claims in PR 4).

import { isWeekOff, type WeekOffPolicy } from "../attendance/week-off";

export type NonWorkingDays = {
  holidays: Map<string, string>; // date → name
  weekOffs: Set<string>;
  hasWeekOff: boolean;
};

const DAY_MS = 86_400_000;

export function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  const end = Date.parse(`${to}T00:00:00.000Z`);
  for (let t = Date.parse(`${from}T00:00:00.000Z`); t <= end; t += DAY_MS) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

export function buildNonWorkingDays(input: {
  from: string;
  to: string;
  holidays: { date: string; name: string }[];
  weekOff: WeekOffPolicy | null;
}): NonWorkingDays {
  const holidays = new Map<string, string>();
  for (const h of [...input.holidays].sort((a, b) => a.date.localeCompare(b.date))) {
    if (h.date >= input.from && h.date <= input.to) holidays.set(h.date, h.name);
  }
  const weekOffs = new Set<string>();
  if (input.weekOff) {
    for (const d of eachDate(input.from, input.to)) if (isWeekOff(d, input.weekOff)) weekOffs.add(d);
  }
  return { holidays, weekOffs, hasWeekOff: input.weekOff !== null };
}

export function nonWorkingDateList(d: NonWorkingDays): string[] {
  return [...new Set([...d.holidays.keys(), ...d.weekOffs])].sort();
}
```

- [ ] **Step 5: Implement the DB loader**

`apps/web/src/lib/holidays/non-working-days.ts`:

```ts
// Plain module — NOT "use server" (gotcha #85): takes raw org/employee ids.
//
// Each employee's non-working days in [from, to]: the org's MANDATORY holidays
// plus their effective week-off (employee > department > org). Every consumer
// (payroll, leave counting, late counting, reports) reads through this so they
// all agree on what a holiday is. A failed query throws — an outage must never
// read as "no holidays" (gotcha #102).

import { resolveEffectiveWeekOff, type WeekOffPolicy } from "@jambahr/shared/attendance/week-off";
import { buildNonWorkingDays, type NonWorkingDays } from "@jambahr/shared/holidays/non-working";

type Supabase = { from: (table: string) => any };

const toPolicy = (r: any): WeekOffPolicy | null =>
  r ? { week_type: r.week_type, off_days: r.off_days ?? [], alt_saturday_rule: r.alt_saturday_rule ?? "none" } : null;

export async function loadNonWorkingDays(
  supabase: Supabase,
  params: { orgId: string; employees: { id: string; department_id: string | null }[]; from: string; to: string },
): Promise<Map<string, NonWorkingDays>> {
  const { orgId, employees, from, to } = params;
  const out = new Map<string, NonWorkingDays>();
  if (employees.length === 0) return out;
  const ids = employees.map((e) => e.id);
  const deptIds = [...new Set(employees.map((e) => e.department_id).filter(Boolean))] as string[];

  const [holidays, orgWeekOff, empOverrides, deptOverrides] = await Promise.all([
    supabase.from("holidays").select("date, name").eq("org_id", orgId).eq("is_optional", false).gte("date", from).lte("date", to),
    supabase
      .from("week_off_policy")
      .select("week_type, off_days, alt_saturday_rule, effective_from")
      .eq("org_id", orgId)
      .lte("effective_from", to)
      .order("effective_from", { ascending: false })
      .limit(1),
    supabase.from("employee_week_off_override").select("employee_id, week_type, off_days, alt_saturday_rule").eq("org_id", orgId).in("employee_id", ids),
    deptIds.length
      ? supabase.from("department_week_off_override").select("department_id, week_type, off_days, alt_saturday_rule").eq("org_id", orgId).in("department_id", deptIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const [name, res] of [["holidays", holidays], ["week_off_policy", orgWeekOff], ["employee_week_off_override", empOverrides], ["department_week_off_override", deptOverrides]] as const) {
    if (res.error) throw new Error(`${name}: ${res.error.message}`);
  }

  const holidayRows = ((holidays.data ?? []) as { date: string; name: string }[]).map((h) => ({ date: h.date, name: h.name }));
  const orgPolicy = toPolicy(((orgWeekOff.data ?? []) as any[])[0]);
  const empOv = new Map(((empOverrides.data ?? []) as any[]).map((o) => [o.employee_id, toPolicy(o)]));
  const deptOv = new Map(((deptOverrides.data ?? []) as any[]).map((o) => [o.department_id, toPolicy(o)]));

  for (const e of employees) {
    const employeeOverride = empOv.get(e.id) ?? null;
    const departmentOverride = e.department_id ? (deptOv.get(e.department_id) ?? null) : null;
    const weekOff = orgPolicy
      ? resolveEffectiveWeekOff(orgPolicy, departmentOverride, employeeOverride)
      : (employeeOverride ?? departmentOverride);
    out.set(e.id, buildNonWorkingDays({ from, to, holidays: holidayRows, weekOff }));
  }
  return out;
}
```

- [ ] **Step 6: Make payroll's helper a wrapper**

Replace the entire body of `apps/web/src/lib/payroll/non-working-days.ts` with:

```ts
// Plain module — NOT "use server" (gotcha #85): takes raw org/employee ids.
//
// Each employee's non-working days in a pay month (effective week-off —
// employee > department > org — plus non-optional holidays). The engine uses
// them so joining on the month's first working day pays the whole month.
// A thin month wrapper over the shared resolver in lib/holidays.

import type { WeekOffPolicy } from "@jambahr/shared/attendance/week-off";
import { daysInMonth } from "@jambahr/shared/payroll/engine";
import { buildNonWorkingDays, nonWorkingDateList } from "@jambahr/shared/holidays/non-working";
import { loadNonWorkingDays } from "@/lib/holidays/non-working-days";

type Supabase = { from: (table: string) => any };

const monthBounds = (month: string) => ({
  from: `${month}-01`,
  to: `${month}-${String(daysInMonth(month)).padStart(2, "0")}`,
});

/** Dates of `month` (YYYY-MM-DD) that are a week-off under `weekOff` or a holiday. */
export function nonWorkingDatesInMonth(month: string, weekOff: WeekOffPolicy | null, holidays: ReadonlySet<string>): string[] {
  const { from, to } = monthBounds(month);
  return nonWorkingDateList(
    buildNonWorkingDays({ from, to, holidays: [...holidays].map((date) => ({ date, name: "" })), weekOff }),
  );
}

/**
 * Non-working dates per employee. `hasWeekOff` is false for employees with no
 * week-off at any level — their proration falls back to the joining date.
 */
export async function loadNonWorkingDates(
  supabase: Supabase,
  params: { orgId: string; month: string; employees: { id: string; department_id: string | null }[] },
): Promise<Map<string, { dates: string[]; hasWeekOff: boolean }>> {
  const { from, to } = monthBounds(params.month);
  const resolved = await loadNonWorkingDays(supabase, { orgId: params.orgId, employees: params.employees, from, to });
  const out = new Map<string, { dates: string[]; hasWeekOff: boolean }>();
  for (const [id, d] of resolved) out.set(id, { dates: nonWorkingDateList(d), hasWeekOff: d.hasWeekOff });
  return out;
}
```

- [ ] **Step 7: Run the new and existing tests**

Run: `npx vitest run tests/holidays/non-working.test.ts tests/holidays/load-non-working-days.test.ts tests/payroll`
Expected: PASS. `tests/payroll/non-working-days.test.ts` and every engine test pass with no edits.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/holidays/non-working.ts apps/web/src/lib/holidays/non-working-days.ts apps/web/src/lib/payroll/non-working-days.ts apps/web/tests/holidays/non-working.test.ts apps/web/tests/holidays/load-non-working-days.test.ts
git commit -m "refactor(holidays): one range-based non-working-days resolver; payroll wraps it

Claude-Session: https://claude.ai/code/session_01CVEsL8Lz4sUw2JXUwQoHhu"
```

---

### Task 5: Holiday server actions

**Files:**
- Create: `apps/web/src/actions/holidays.ts`
- Modify: `apps/web/tests/helpers/fake-supabase.ts` (add `holidays: [["org_id", "date"]]` to `UNIQUE`)
- Test: `apps/web/tests/holidays/actions.test.ts`

**Interfaces:**
- Consumes: `HolidayDraft`, `isValidIsoDate`, `mergeHolidayDrafts`, `presetToDrafts` (Task 3); `presetFor`, `HolidayRegion`, `HolidayPreset` (Task 2).
- Produces (all `"use server"`):
  - `type HolidaySource = "seed" | "preset" | "manual" | "csv"`
  - `type HolidayRow = { id: string; name: string; date: string; is_optional: boolean; source: HolidaySource }`
  - `type HolidayPresetRow = HolidayPreset & { alreadyAdded: boolean }`
  - `listHolidays(year: number): Promise<ActionResult<HolidayRow[]>>`
  - `createHoliday(input: { name: string; date: string; isOptional: boolean }): Promise<ActionResult<HolidayRow>>`
  - `updateHoliday(id: string, input: { name: string; date: string; isOptional: boolean }): Promise<ActionResult<void>>`
  - `deleteHoliday(id: string): Promise<ActionResult<void>>`
  - `getHolidayPreset(year: number, region: HolidayRegion): Promise<ActionResult<HolidayPresetRow[]>>`
  - `importHolidays(drafts: HolidayDraft[], source: "preset" | "csv"): Promise<ActionResult<{ added: number; skipped: string[] }>>`

- [ ] **Step 1: Add the unique key to the fake**

In `apps/web/tests/helpers/fake-supabase.ts`, add `holidays: [["org_id", "date"]],` as the last entry of the `UNIQUE` object.

- [ ] **Step 2: Write the failing tests**

`apps/web/tests/holidays/actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeDb } from "../helpers/fake-supabase";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let db: FakeDb;
vi.mock("@/lib/supabase/server", () => ({ createAdminSupabase: () => createFakeSupabase(db) }));

let currentUser: any;
const asUser = (orgId: string, employeeId: string, role: string) => {
  currentUser = { orgId, employeeId, role, clerkUserId: `clerk-${employeeId}` };
};
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: vi.fn(async () => currentUser),
  isAdmin: (role: string) => role === "owner" || role === "admin",
  isManagerOrAbove: (role: string) => ["owner", "admin", "manager"].includes(role),
}));

import {
  listHolidays,
  createHoliday,
  updateHoliday,
  deleteHoliday,
  getHolidayPreset,
  importHolidays,
} from "../../src/actions/holidays";

const H = (id: string, org_id: string, date: string, name: string, is_optional = false) => ({
  id, org_id, date, name, is_optional, source: "seed", created_by: null,
});

beforeEach(() => {
  db = {
    holidays: [
      H("h1", "A", "2026-11-08", "Diwali"),
      H("h2", "A", "2027-01-26", "Republic Day"),
      H("h3", "B", "2026-11-10", "Other org"),
    ],
  };
  asUser("A", "admin-a", "admin");
});

describe("listHolidays", () => {
  it("returns only the caller's org and the requested year, for any role", async () => {
    asUser("A", "emp-a", "employee");
    const res = await listHolidays(2026);
    expect(res).toEqual({ success: true, data: [{ id: "h1", name: "Diwali", date: "2026-11-08", is_optional: false, source: "seed" }] });
  });
  it("rejects a signed-out caller", async () => {
    currentUser = null;
    expect(await listHolidays(2026)).toEqual({ success: false, error: "Not authenticated" });
  });
});

describe("createHoliday", () => {
  it("admin adds a manual holiday stamped with created_by", async () => {
    const res = await createHoliday({ name: "  Bhaubeej ", date: "2026-11-11", isOptional: false });
    expect(res.success).toBe(true);
    const row = db.holidays.find((h) => h.date === "2026-11-11")!;
    expect(row).toMatchObject({ org_id: "A", name: "Bhaubeej", source: "manual", created_by: "admin-a" });
  });
  it("a clash returns a friendly message", async () => {
    const res = await createHoliday({ name: "Lakshmi Pujan", date: "2026-11-08", isOptional: false });
    expect(res).toEqual({ success: false, error: "There's already a holiday on 8 Nov 2026" });
  });
  it("employees and managers can't add", async () => {
    asUser("A", "mgr-a", "manager");
    expect(await createHoliday({ name: "X", date: "2026-12-01", isOptional: false })).toEqual({ success: false, error: "Unauthorized" });
  });
  it("validates name and date", async () => {
    expect((await createHoliday({ name: "", date: "2026-12-01", isOptional: false })).success).toBe(false);
    expect((await createHoliday({ name: "X", date: "2026-02-30", isOptional: false })).success).toBe(false);
  });
});

describe("updateHoliday / deleteHoliday", () => {
  it("updates the caller's own row", async () => {
    expect(await updateHoliday("h1", { name: "Diwali (Laxmi Pujan)", date: "2026-11-08", isOptional: false })).toEqual({ success: true, data: undefined });
    expect(db.holidays.find((h) => h.id === "h1")!.name).toBe("Diwali (Laxmi Pujan)");
  });
  it("another org's id is 'not found' and nothing changes", async () => {
    expect(await updateHoliday("h3", { name: "Hacked", date: "2026-11-10", isOptional: false })).toEqual({ success: false, error: "Holiday not found" });
    expect(await deleteHoliday("h3")).toEqual({ success: false, error: "Holiday not found" });
    expect(db.holidays.find((h) => h.id === "h3")!.name).toBe("Other org");
  });
  it("moving onto an existing date is a friendly clash", async () => {
    db.holidays.push(H("h4", "A", "2026-12-25", "Christmas"));
    expect(await updateHoliday("h4", { name: "Christmas", date: "2026-11-08", isOptional: false })).toEqual({
      success: false,
      error: "There's already a holiday on 8 Nov 2026",
    });
  });
  it("deletes the caller's own row; employees can't", async () => {
    asUser("A", "emp-a", "employee");
    expect(await deleteHoliday("h1")).toEqual({ success: false, error: "Unauthorized" });
    asUser("A", "admin-a", "admin");
    expect(await deleteHoliday("h1")).toEqual({ success: true, data: undefined });
    expect(db.holidays.some((h) => h.id === "h1")).toBe(false);
  });
});

describe("getHolidayPreset", () => {
  it("marks dates the org already has", async () => {
    const res = await getHolidayPreset(2026, "national");
    if (!res.success) throw new Error(res.error);
    expect(res.data.find((r) => r.name === "Diwali")!.alreadyAdded).toBe(true);
    expect(res.data.find((r) => r.name === "Christmas Day")!.alreadyAdded).toBe(false);
  });
  it("is admin-only", async () => {
    asUser("A", "emp-a", "employee");
    expect(await getHolidayPreset(2026, "national")).toEqual({ success: false, error: "Unauthorized" });
  });
});

describe("importHolidays", () => {
  it("merges same-date entries, skips existing dates, stamps source", async () => {
    const res = await importHolidays(
      [
        { name: "Independence Day", date: "2027-08-15", isOptional: false },
        { name: "Milad-un-Nabi", date: "2027-08-15", isOptional: false },
        { name: "Republic Day", date: "2027-01-26", isOptional: false }, // already there
      ],
      "preset"
    );
    expect(res).toEqual({ success: true, data: { added: 1, skipped: ["2027-01-26"] } });
    expect(db.holidays.find((h) => h.date === "2027-08-15")).toMatchObject({
      org_id: "A",
      name: "Independence Day / Milad-un-Nabi",
      source: "preset",
      created_by: "admin-a",
    });
  });
  it("rejects invalid drafts before writing anything", async () => {
    const before = db.holidays.length;
    const res = await importHolidays([{ name: "X", date: "bad", isOptional: false }], "csv");
    expect(res.success).toBe(false);
    expect(db.holidays.length).toBe(before);
  });
  it("is admin-only", async () => {
    asUser("A", "emp-a", "employee");
    expect(await importHolidays([], "csv")).toEqual({ success: false, error: "Unauthorized" });
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run tests/holidays/actions.test.ts`
Expected: FAIL, "Cannot find module ../../src/actions/holidays".

- [ ] **Step 4: Implement the actions**

`apps/web/src/actions/holidays.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import { presetFor, type HolidayPreset, type HolidayRegion } from "@jambahr/shared/holidays/presets";
import { isValidIsoDate, mergeHolidayDrafts, type HolidayDraft } from "@jambahr/shared/holidays/import";
import type { ActionResult } from "@/types";

export type HolidaySource = "seed" | "preset" | "manual" | "csv";
export type HolidayRow = { id: string; name: string; date: string; is_optional: boolean; source: HolidaySource };
export type HolidayPresetRow = HolidayPreset & { alreadyAdded: boolean };

const draftSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80, "Name must be 80 characters or fewer"),
  date: z.string().refine(isValidIsoDate, "Enter a real date"),
  isOptional: z.boolean(),
});

const REVALIDATE = ["/dashboard/settings", "/dashboard/leaves", "/dashboard", "/dashboard/attendance"];
const revalidateAll = () => REVALIDATE.forEach((p) => revalidatePath(p));

/** "8 Nov 2026" — matches how dates read elsewhere in Settings. */
function prettyDate(iso: string): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
}

const clashMessage = (date: string) => `There's already a holiday on ${prettyDate(date)}`;

const toRow = (r: any): HolidayRow => ({
  id: r.id, name: r.name, date: r.date, is_optional: !!r.is_optional, source: (r.source ?? "seed") as HolidaySource,
});

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" as const };
  if (!isAdmin(user.role)) return { error: "Unauthorized" as const };
  return { user };
}

export async function listHolidays(year: number): Promise<ActionResult<HolidayRow[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return { success: false, error: "Invalid year" };
  const { data, error } = await createAdminSupabase()
    .from("holidays")
    .select("id, name, date, is_optional, source")
    .eq("org_id", user.orgId)
    .gte("date", `${year}-01-01`)
    .lte("date", `${year}-12-31`)
    .order("date", { ascending: true });
  if (error) return { success: false, error: "Couldn't load holidays" };
  return { success: true, data: ((data ?? []) as any[]).map(toRow).sort((a, b) => a.date.localeCompare(b.date)) };
}

export async function createHoliday(input: HolidayDraft): Promise<ActionResult<HolidayRow>> {
  const auth = await requireAdmin();
  if ("error" in auth) return { success: false, error: auth.error };
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  const { name, date, isOptional } = parsed.data;
  const { data, error } = await createAdminSupabase()
    .from("holidays")
    .insert({ org_id: auth.user.orgId, name, date, is_optional: isOptional, source: "manual", created_by: auth.user.employeeId ?? null })
    .select("id, name, date, is_optional, source")
    .single();
  if (error) return { success: false, error: error.code === "23505" ? clashMessage(date) : "Couldn't add the holiday" };
  revalidateAll();
  return { success: true, data: toRow(data) };
}

export async function updateHoliday(id: string, input: HolidayDraft): Promise<ActionResult<void>> {
  const auth = await requireAdmin();
  if ("error" in auth) return { success: false, error: auth.error };
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  const { name, date, isOptional } = parsed.data;
  const sb = createAdminSupabase();
  const { data: clash } = await sb
    .from("holidays").select("id").eq("org_id", auth.user.orgId).eq("date", date).neq("id", id).maybeSingle();
  if (clash) return { success: false, error: clashMessage(date) };
  const { data, error } = await sb
    .from("holidays")
    .update({ name, date, is_optional: isOptional })
    .eq("id", id)
    .eq("org_id", auth.user.orgId)
    .select("id");
  if (error) return { success: false, error: error.code === "23505" ? clashMessage(date) : "Couldn't save the holiday" };
  if (!data || data.length === 0) return { success: false, error: "Holiday not found" };
  revalidateAll();
  return { success: true, data: undefined };
}

export async function deleteHoliday(id: string): Promise<ActionResult<void>> {
  const auth = await requireAdmin();
  if ("error" in auth) return { success: false, error: auth.error };
  const sb = createAdminSupabase();
  const { data: found } = await sb.from("holidays").select("id").eq("id", id).eq("org_id", auth.user.orgId).maybeSingle();
  if (!found) return { success: false, error: "Holiday not found" };
  const { error } = await sb.from("holidays").delete().eq("id", id).eq("org_id", auth.user.orgId);
  if (error) return { success: false, error: "Couldn't delete the holiday" };
  revalidateAll();
  return { success: true, data: undefined };
}

async function existingDates(orgId: string, from: string, to: string): Promise<Set<string> | null> {
  const { data, error } = await createAdminSupabase()
    .from("holidays").select("date").eq("org_id", orgId).gte("date", from).lte("date", to);
  if (error) return null;
  return new Set(((data ?? []) as { date: string }[]).map((r) => r.date));
}

export async function getHolidayPreset(year: number, region: HolidayRegion): Promise<ActionResult<HolidayPresetRow[]>> {
  const auth = await requireAdmin();
  if ("error" in auth) return { success: false, error: auth.error };
  const have = await existingDates(auth.user.orgId, `${year}-01-01`, `${year}-12-31`);
  if (!have) return { success: false, error: "Couldn't load your holidays" };
  return { success: true, data: presetFor(year, region).map((p) => ({ ...p, alreadyAdded: have.has(p.date) })) };
}

export async function importHolidays(
  drafts: HolidayDraft[],
  source: "preset" | "csv",
): Promise<ActionResult<{ added: number; skipped: string[] }>> {
  const auth = await requireAdmin();
  if ("error" in auth) return { success: false, error: auth.error };
  const parsed = z.array(draftSchema).max(400, "Import at most 400 holidays at a time").safeParse(drafts);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  if (parsed.data.length === 0) return { success: true, data: { added: 0, skipped: [] } };

  const dates = parsed.data.map((d) => d.date).sort();
  const have = await existingDates(auth.user.orgId, dates[0], dates[dates.length - 1]);
  if (!have) return { success: false, error: "Couldn't load your holidays" };
  const { rows, skipped } = mergeHolidayDrafts(parsed.data, have);
  if (rows.length === 0) return { success: true, data: { added: 0, skipped } };

  const { error } = await createAdminSupabase()
    .from("holidays")
    .insert(rows.map((r) => ({
      org_id: auth.user.orgId, name: r.name, date: r.date, is_optional: r.isOptional, source, created_by: auth.user.employeeId ?? null,
    })));
  if (error) {
    return {
      success: false,
      error: error.code === "23505"
        ? "Someone added holidays on some of these dates just now. Refresh and try again."
        : "Couldn't import the holidays",
    };
  }
  revalidateAll();
  return { success: true, data: { added: rows.length, skipped } };
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run tests/holidays/actions.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/actions/holidays.ts apps/web/tests/holidays/actions.test.ts apps/web/tests/helpers/fake-supabase.ts
git commit -m "feat(holidays): admin holiday actions — list/create/update/delete, preset + CSV import

Claude-Session: https://claude.ai/code/session_01CVEsL8Lz4sUw2JXUwQoHhu"
```

---

### Task 6: Seed new orgs from the core list

**Files:**
- Modify: `apps/web/src/actions/organizations.ts` (imports near line 13; seed near line 99)
- Modify: `apps/web/src/config/onboarding-seed.ts` (delete `DEFAULT_HOLIDAYS_2026` and its comment)

**Interfaces:**
- Consumes: `coreSeedRows(todayIst)` (Task 2); `istToday()` from `@jambahr/shared/attendance/ist`.

`coreSeedRows` is already covered by Task 2's tests, and `createOrganization` has no unit-test harness (it needs Clerk). So this task is verified by typecheck plus a grep, and by the browser check in Task 10.

- [ ] **Step 1: Change the import in `organizations.ts`**

Replace:
```ts
import { DEFAULT_LEAVE_POLICIES, DEFAULT_HOLIDAYS_2026 } from "@/config/onboarding-seed";
```
with:
```ts
import { DEFAULT_LEAVE_POLICIES } from "@/config/onboarding-seed";
import { coreSeedRows } from "@jambahr/shared/holidays/core-seed";
import { istToday } from "@jambahr/shared/attendance/ist";
```

- [ ] **Step 2: Change the seed insert**

Replace:
```ts
  await supabase
    .from("holidays")
    .insert(DEFAULT_HOLIDAYS_2026.map((h) => ({ ...h, org_id: orgId })));
```
with:
```ts
  // Rest of this year + next year from the curated core list; admins import
  // more (national / state presets) from Settings → Holidays.
  const seedHolidays = coreSeedRows(istToday());
  if (seedHolidays.length > 0) {
    await supabase
      .from("holidays")
      .insert(seedHolidays.map((h) => ({ ...h, org_id: orgId, source: "seed" })));
  }
```

- [ ] **Step 3: Remove the old constant**

In `apps/web/src/config/onboarding-seed.ts`, delete the line `// Dates per the central-government 2026 holiday list.` (if present) and the whole `export const DEFAULT_HOLIDAYS_2026 = [ … ];` block. Then change the file's header comment sentence "which seeds the same policies + holidays" to "which seeds these policies (holidays come from `@jambahr/shared/holidays/core-seed`)".

- [ ] **Step 4: Verify nothing else references it**

Run (repo root): `grep -rn "DEFAULT_HOLIDAYS_2026" apps packages --include=*.ts --include=*.tsx`
Expected: no output.

Run: `npx turbo typecheck --filter=@jambahr/shared`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/actions/organizations.ts apps/web/src/config/onboarding-seed.ts
git commit -m "feat(holidays): new orgs seeded with the core list for the rest of this year and next

Claude-Session: https://claude.ai/code/session_01CVEsL8Lz4sUw2JXUwQoHhu"
```

---

### Task 7: Settings → Holidays UI

**Files:**
- Create: `apps/web/src/components/settings/holiday-dialog.tsx`, `apps/web/src/components/settings/holiday-import-dialog.tsx`, `apps/web/src/components/settings/holidays-section.tsx`
- Modify: `apps/web/src/components/settings/settings-content.tsx`, `apps/web/src/app/dashboard/settings/page.tsx`

**Interfaces:**
- Consumes: all Task 5 actions and types; `presetToDrafts`, `parseHolidayCsv`, `HolidayDraft` (Task 3); `PRESET_YEARS`, `PRESET_REGION_LABELS`, `presetRegionsFor`, `HolidayRegion` (Task 2); `isWeekOff`, `WeekOffPolicy` (`@jambahr/shared/attendance/week-off`).
- Produces:
  - `HolidaysSection({ initialYear: number; initialHolidays: HolidayRow[]; weekOffPolicy: WeekOffPolicy | null })`
  - `HolidayDialog({ open, onOpenChange, editing: HolidayRow | null, defaultYear: number, onSaved: () => void })`
  - `HolidayImportDialog({ open, onOpenChange, year: number, onImported: () => void })`

UI is verified in the browser in Task 10. The logic it calls is already unit-tested.

- [ ] **Step 1: Write `holiday-dialog.tsx`**

```tsx
"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Label from "@radix-ui/react-label";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createHoliday, updateHoliday, type HolidayRow } from "@/actions/holidays";

const inputCn =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: HolidayRow | null;
  defaultYear: number;
  onSaved: () => void;
};

export function HolidayDialog({ open, onOpenChange, editing, defaultYear, onSaved }: Props) {
  const [name, setName] = React.useState("");
  const [date, setDate] = React.useState("");
  const [isOptional, setIsOptional] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setDate(editing?.date ?? "");
    setIsOptional(editing?.is_optional ?? false);
  }, [open, editing]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const input = { name, date, isOptional };
    const res = editing ? await updateHoliday(editing.id, input) : await createHoliday(input);
    setSaving(false);
    if (!res.success) return void toast.error(res.error);
    toast.success(editing ? "Holiday updated" : "Holiday added");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-background p-6 shadow-lg">
          <div className="mb-5 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold">{editing ? "Edit holiday" : "Add holiday"}</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close"><X className="h-4 w-4" /></Button>
            </Dialog.Close>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label.Root htmlFor="holiday-name" className="text-sm font-medium">Name</Label.Root>
              <input id="holiday-name" className={inputCn} value={name} maxLength={80}
                onChange={(e) => setName(e.target.value)} placeholder="e.g. Diwali" required />
            </div>
            <div className="space-y-1.5">
              <Label.Root htmlFor="holiday-date" className="text-sm font-medium">Date</Label.Root>
              <input id="holiday-date" type="date" className={inputCn} value={date}
                min={`${defaultYear - 1}-01-01`} max={`${defaultYear + 2}-12-31`}
                onChange={(e) => setDate(e.target.value)} required />
            </div>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={isOptional}
                onChange={(e) => setIsOptional(e.target.checked)} />
              <span>
                <span className="font-medium">Optional holiday</span>
                <span className="block text-muted-foreground">Shown on the calendar, but a normal working day unless someone takes it.</span>
              </span>
            </label>
            {editing && editing.date < new Date().toISOString().slice(0, 10) && (
              <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                This date has passed. Reports update now, late marks re-count overnight, and locked payroll runs don&apos;t change.
              </p>
            )}
            <div className="flex justify-end gap-3 pt-1">
              <Dialog.Close asChild><Button type="button" variant="outline">Cancel</Button></Dialog.Close>
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Add holiday"}</Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 2: Write `holiday-import-dialog.tsx`**

```tsx
"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { getHolidayPreset, importHolidays } from "@/actions/holidays";
import { PRESET_REGION_LABELS, presetRegionsFor, type HolidayRegion } from "@jambahr/shared/holidays/presets";
import { parseHolidayCsv, presetToDrafts, type HolidayDraft } from "@jambahr/shared/holidays/import";

type Item = HolidayDraft & { key: string; selected: boolean; alreadyAdded: boolean; note?: string };
type Mode = "preset" | "csv";

const fmt = (iso: string) =>
  new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export function HolidayImportDialog({ open, onOpenChange, year, onImported }: {
  open: boolean; onOpenChange: (o: boolean) => void; year: number; onImported: () => void;
}) {
  const regions = presetRegionsFor(year);
  const [mode, setMode] = React.useState<Mode>(regions.length ? "preset" : "csv");
  const [region, setRegion] = React.useState<HolidayRegion | null>(regions[0] ?? null);
  const [items, setItems] = React.useState<Item[]>([]);
  const [csvErrors, setCsvErrors] = React.useState<{ line: number; message: string }[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setMode(regions.length ? "preset" : "csv");
    setRegion(regions[0] ?? null);
    setItems([]);
    setCsvErrors([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, year]);

  React.useEffect(() => {
    if (!open || mode !== "preset" || !region) return;
    let cancelled = false;
    setLoading(true);
    getHolidayPreset(year, region).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (!res.success) return void toast.error(res.error);
      const drafts = presetToDrafts(res.data);
      setItems(res.data.map((p, i) => ({
        ...drafts[i],
        key: `${p.date}|${p.name}`,
        alreadyAdded: p.alreadyAdded,
        selected: !p.alreadyAdded && p.kind !== "restricted",
        note: p.kind === "restricted" ? "Restricted" : undefined,
      })));
    });
    return () => { cancelled = true; };
  }, [open, mode, region, year]);

  async function onFile(file: File) {
    const { drafts, errors } = parseHolidayCsv(await file.text());
    setCsvErrors(errors);
    setItems(drafts.map((d, i) => ({ ...d, key: `${i}|${d.date}`, selected: true, alreadyAdded: false })));
  }

  const toggle = (key: string, patch: Partial<Item>) =>
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  const chosen = items.filter((i) => i.selected && !i.alreadyAdded);

  async function submit() {
    setSaving(true);
    const res = await importHolidays(chosen.map(({ name, date, isOptional }) => ({ name, date, isOptional })), mode);
    setSaving(false);
    if (!res.success) return void toast.error(res.error);
    const { added, skipped } = res.data;
    toast.success(skipped.length
      ? `Added ${added} holiday${added === 1 ? "" : "s"}; ${skipped.length} date${skipped.length === 1 ? " was" : "s were"} already on your calendar`
      : `Added ${added} holiday${added === 1 ? "" : "s"}`);
    onOpenChange(false);
    onImported();
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl bg-background p-6 shadow-lg">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold">Import {year} holidays</Dialog.Title>
            <Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Close"><X className="h-4 w-4" /></Button></Dialog.Close>
          </div>

          <div className="mb-4 flex flex-wrap gap-2" role="tablist">
            {regions.map((r) => (
              <Button key={r} size="sm" variant={mode === "preset" && region === r ? "default" : "outline"}
                onClick={() => { setMode("preset"); setRegion(r); }}>
                {PRESET_REGION_LABELS[r]}
              </Button>
            ))}
            <Button size="sm" variant={mode === "csv" ? "default" : "outline"} onClick={() => { setMode("csv"); setItems([]); }}>
              Upload CSV
            </Button>
          </div>

          {mode === "csv" && (
            <div className="mb-3 space-y-2 text-sm">
              <p className="text-muted-foreground">
                Columns: <code>name,date,optional</code>. Dates as 2026-11-08 or 08/11/2026; optional as yes or no.
              </p>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2">
                <Upload className="h-4 w-4" /> Choose a .csv file
                <input type="file" accept=".csv,text/csv" className="sr-only"
                  onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
              </label>
              {csvErrors.length > 0 && (
                <ul className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
                  {csvErrors.map((er) => <li key={er.line}>Line {er.line}: {er.message}</li>)}
                </ul>
              )}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
            {loading ? (
              <p className="p-4 text-sm text-muted-foreground">Loading…</p>
            ) : items.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">{mode === "csv" ? "No rows yet." : "No preset for this year."}</p>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((it) => (
                  <li key={it.key} className={cn("flex items-center gap-3 px-3 py-2 text-sm", it.alreadyAdded && "opacity-50")}>
                    <input type="checkbox" className="h-4 w-4 accent-primary" aria-label={`Include ${it.name}`}
                      checked={it.selected && !it.alreadyAdded} disabled={it.alreadyAdded}
                      onChange={(e) => toggle(it.key, { selected: e.target.checked })} />
                    <span className="w-24 shrink-0 tabular-nums text-muted-foreground">{fmt(it.date)}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {it.name}
                      {it.alreadyAdded && <span className="ml-2 text-xs">· already added</span>}
                      {!it.alreadyAdded && it.note && <span className="ml-2 text-xs text-muted-foreground">· {it.note}</span>}
                    </span>
                    {!it.alreadyAdded && (
                      <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                        <input type="checkbox" className="h-3.5 w-3.5 accent-primary" checked={it.isOptional}
                          onChange={(e) => toggle(it.key, { isOptional: e.target.checked })} />
                        Optional
                      </label>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">Holidays on the same date are combined into one.</p>
            <div className="flex gap-2">
              <Dialog.Close asChild><Button variant="outline">Cancel</Button></Dialog.Close>
              <Button onClick={submit} disabled={saving || chosen.length === 0 || (mode === "csv" && csvErrors.length > 0)}>
                {saving ? "Importing…" : `Import ${chosen.length}`}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 3: Write `holidays-section.tsx`**

```tsx
"use client";

import * as React from "react";
import { Plus, Pencil, Trash2, Download, PartyPopper } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DestructiveDialog } from "@/components/ui/destructive-dialog";
import { HolidayDialog } from "@/components/settings/holiday-dialog";
import { HolidayImportDialog } from "@/components/settings/holiday-import-dialog";
import { deleteHoliday, listHolidays, type HolidayRow } from "@/actions/holidays";
import { isWeekOff, type WeekOffPolicy } from "@jambahr/shared/attendance/week-off";

type Props = { initialYear: number; initialHolidays: HolidayRow[]; weekOffPolicy: WeekOffPolicy | null };

const fmt = (iso: string) =>
  new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const weekday = (iso: string) =>
  new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });

export function HolidaysSection({ initialYear, initialHolidays, weekOffPolicy }: Props) {
  const years = [initialYear - 1, initialYear, initialYear + 1];
  const [year, setYear] = React.useState(initialYear);
  const [rows, setRows] = React.useState<HolidayRow[]>(initialHolidays);
  const [loading, setLoading] = React.useState(false);
  const [editing, setEditing] = React.useState<HolidayRow | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<HolidayRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const load = React.useCallback(async (y: number) => {
    setLoading(true);
    const res = await listHolidays(y);
    setLoading(false);
    if (res.success) setRows(res.data);
    else toast.error(res.error);
  }, []);

  React.useEffect(() => {
    if (year !== initialYear) load(year);
    else setRows(initialHolidays);
  }, [year, initialYear, initialHolidays, load]);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    const res = await deleteHoliday(pendingDelete.id);
    setDeleting(false);
    setPendingDelete(null);
    if (!res.success) return void toast.error(res.error);
    toast.success("Holiday deleted");
    load(year);
  }

  const mandatory = rows.filter((r) => !r.is_optional).length;

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Holidays</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Mandatory holidays are days off for everyone. Optional ones show on the calendar but are normal working days.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <Download className="mr-1.5 h-4 w-4" /> Import
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="mr-1.5 h-4 w-4" /> Add holiday
          </Button>
        </div>
      </div>

      <div className="mb-3 flex gap-1" role="tablist" aria-label="Year">
        {years.map((y) => (
          <Button key={y} role="tab" aria-selected={y === year} size="sm" variant={y === year ? "secondary" : "ghost"} onClick={() => setYear(y)}>
            {y}
          </Button>
        ))}
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-8 text-center">
          <PartyPopper className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No holidays for {year} yet.</p>
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>Import from a list</Button>
        </div>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            {mandatory} mandatory · {rows.length - mandatory} optional
          </p>
          <ul className="divide-y divide-border">
            {rows.map((h) => {
              const onWeekOff = weekOffPolicy ? isWeekOff(h.date, weekOffPolicy) : false;
              return (
                <li key={h.id} className="flex items-center gap-4 py-3">
                  <div className="w-16 shrink-0 text-sm font-medium tabular-nums">{fmt(h.date)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium">{h.name}</p>
                      <span className={h.is_optional
                        ? "rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                        : "rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"}>
                        {h.is_optional ? "Optional" : "Mandatory"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {weekday(h.date)}{onWeekOff ? " · already a week-off" : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit ${h.name}`}
                      onClick={() => { setEditing(h); setFormOpen(true); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                      aria-label={`Delete ${h.name}`} onClick={() => setPendingDelete(h)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <HolidayDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} defaultYear={year} onSaved={() => load(year)} />
      <HolidayImportDialog open={importOpen} onOpenChange={setImportOpen} year={year} onImported={() => load(year)} />
      <DestructiveDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => { if (!o) setPendingDelete(null); }}
        title={pendingDelete ? `Delete "${pendingDelete.name}"?` : ""}
        description="It stops being a holiday from today in reports and lateness. Locked payroll runs don't change."
        confirmLabel="Delete holiday"
        loading={deleting}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
```

- [ ] **Step 4: Mount it in `settings-content.tsx`**

1. Add `PartyPopper` to the `lucide-react` import list.
2. Add imports:
   ```tsx
   import { HolidaysSection } from "@/components/settings/holidays-section";
   import type { HolidayRow } from "@/actions/holidays";
   ```
3. Add to `SettingsContentProps`:
   ```ts
   holidays: HolidayRow[];
   holidayYear: number;
   ```
   Destructure `holidays` and `holidayYear` in the function signature. `weekOffPolicy` is already a prop.
4. Directly after `const [openSection, setOpenSection] = …`, add:
   ```tsx
   // Deep links: /dashboard/settings?section=holidays or #holidays open that section.
   React.useEffect(() => {
     const fromQuery = new URLSearchParams(window.location.search).get("section");
     const fromHash = window.location.hash.replace(/^#/, "");
     const target = fromQuery || fromHash;
     if (target) setOpenSection(target);
   }, []);
   ```
5. Add a summary next to the other summaries:
   ```tsx
   const holidaySummary =
     holidays.length === 0
       ? `None for ${holidayYear}`
       : `${holidays.length} in ${holidayYear}`;
   ```
6. Insert the section directly **after** the Leave Policies `</CollapsibleSection>`:
   ```tsx
   <CollapsibleSection
     title="Holidays"
     icon={<PartyPopper className="h-5 w-5 text-muted-foreground" />}
     summary={holidaySummary}
     isOpen={openSection === "holidays"}
     onToggle={() => toggle("holidays")}
   >
     <HolidaysSection initialYear={holidayYear} initialHolidays={holidays} weekOffPolicy={weekOffPolicy} />
   </CollapsibleSection>
   ```

- [ ] **Step 5: Feed it from `settings/page.tsx`**

1. Add imports:
   ```ts
   import { listHolidays } from "@/actions/holidays";
   import { istToday } from "@jambahr/shared/attendance/ist";
   ```
2. Before the big `Promise.all`, add `const holidayYear = Number(istToday().slice(0, 4));`.
3. Append `listHolidays(holidayYear)` as the **last** element of the `Promise.all` array, and `holidaysResult` as the last destructured name.
4. After `const weekOffPolicy = …`, add `const holidays = holidaysResult.success ? holidaysResult.data : [];`.
5. Pass `holidays={holidays}` and `holidayYear={holidayYear}` to `<SettingsContent …>`.

- [ ] **Step 6: Typecheck and lint**

Run (repo root): `npx turbo typecheck --filter=@jambahr/shared`. Expected: PASS.
Run (apps/web): `npx tsc --noEmit -p . 2>&1 | grep -E "holiday|settings-content|settings/page"`. Expected: no output (the app has ~129 known unrelated errors, gotcha #3; none may be in these files).
Run (apps/web): `npm run lint`. Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/settings/holiday-dialog.tsx apps/web/src/components/settings/holiday-import-dialog.tsx apps/web/src/components/settings/holidays-section.tsx apps/web/src/components/settings/settings-content.tsx apps/web/src/app/dashboard/settings/page.tsx
git commit -m "feat(holidays): Settings → Holidays — year tabs, add/edit/delete, preset + CSV import

Claude-Session: https://claude.ai/code/session_01CVEsL8Lz4sUw2JXUwQoHhu"
```

---

### Task 8: Year-end nudge

**Files:**
- Create: `packages/shared/src/holidays/nudge.ts`, `apps/web/src/components/dashboard/holiday-nudge-banner.tsx`
- Modify: `apps/web/src/actions/dashboard.ts`, `apps/web/src/app/dashboard/page.tsx`
- Test: `apps/web/tests/holidays/nudge.test.ts`

**Interfaces:**
- Produces:
  - `holidayNudgeYear(todayIst: string, nextYearCount: number): number | null`. Returns next year from 1 November onward when that year has 0 holidays; otherwise `null`.
  - `DashboardData.holidayNudgeYear: number | null`. Filled only for admins.
  - `HolidayNudgeBanner({ year }: { year: number })`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { holidayNudgeYear } from "@jambahr/shared/holidays/nudge";

describe("holidayNudgeYear", () => {
  it("nudges from 1 November when next year is empty", () => {
    expect(holidayNudgeYear("2026-11-01", 0)).toBe(2027);
    expect(holidayNudgeYear("2026-12-31", 0)).toBe(2027);
  });
  it("stays quiet before November or once next year has holidays", () => {
    expect(holidayNudgeYear("2026-10-31", 0)).toBeNull();
    expect(holidayNudgeYear("2026-11-15", 3)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/holidays/nudge.test.ts`. Expected: FAIL (unresolved import).

- [ ] **Step 3: Implement `nudge.ts`**

```ts
// Plain module — when admins should be reminded to set up next year's holidays.
/** Next year from 1 November onward if it has no holidays yet; otherwise null. */
export function holidayNudgeYear(todayIst: string, nextYearCount: number): number | null {
  const month = Number(todayIst.slice(5, 7));
  if (month < 11 || nextYearCount > 0) return null;
  return Number(todayIst.slice(0, 4)) + 1;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/holidays/nudge.test.ts`. Expected: PASS.

- [ ] **Step 5: Add it to dashboard data**

In `apps/web/src/actions/dashboard.ts`:
1. Add imports `import { holidayNudgeYear as computeHolidayNudgeYear } from "@jambahr/shared/holidays/nudge";` and `import { istToday } from "@jambahr/shared/attendance/ist";`.
2. In the `DashboardData` type, add `holidayNudgeYear: number | null;` after `showInsightsCard: boolean;`.
3. Just before the final `return {` of `getDashboardData`, add:
   ```ts
   // Year-end reminder to set up next year's holidays (admins, from 1 Nov).
   let holidayNudgeYear: number | null = null;
   if (isAdmin(role)) {
     const todayIst = istToday();
     if (Number(todayIst.slice(5, 7)) >= 11) {
       const next = Number(todayIst.slice(0, 4)) + 1;
       const { count, error } = await supabase
         .from("holidays")
         .select("id", { count: "exact", head: true })
         .eq("org_id", orgId)
         .gte("date", `${next}-01-01`)
         .lte("date", `${next}-12-31`);
       // A failed count shows nothing rather than a false "set up" prompt.
       if (!error) holidayNudgeYear = computeHolidayNudgeYear(todayIst, count ?? 0);
     }
   }
   ```
4. Add `holidayNudgeYear,` to the returned object.

- [ ] **Step 6: Write the banner**

`apps/web/src/components/dashboard/holiday-nudge-banner.tsx`:

```tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const key = (year: number) => `jambahr:holiday-nudge-dismissed:${year}`;

export function HolidayNudgeBanner({ year }: { year: number }) {
  const [show, setShow] = React.useState(false);

  React.useEffect(() => {
    try {
      setShow(window.sessionStorage.getItem(key(year)) !== "1");
    } catch {
      setShow(true);
    }
  }, [year]);

  if (!show) return null;

  const dismiss = () => {
    try { window.sessionStorage.setItem(key(year), "1"); } catch { /* storage blocked: hide for this view */ }
    setShow(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
      <CalendarPlus className="h-4 w-4 shrink-0 text-primary" />
      <p className="min-w-0 flex-1">
        <span className="font-medium">Set up your {year} holidays</span>
        <span className="text-muted-foreground"> so leave, attendance and payroll know which days are off.</span>
      </p>
      <Button asChild size="sm">
        <Link href="/dashboard/settings?section=holidays">Set up holidays</Link>
      </Button>
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="rounded p-1 text-muted-foreground hover:bg-muted">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
```

- [ ] **Step 7: Render it on the dashboard**

In `apps/web/src/app/dashboard/page.tsx`:
1. Add `import { HolidayNudgeBanner } from "@/components/dashboard/holiday-nudge-banner";`.
2. Directly above `{/* Announcements waiting for this person's acknowledgement */}`, add:
   ```tsx
   {data.holidayNudgeYear !== null && <HolidayNudgeBanner year={data.holidayNudgeYear} />}
   ```

- [ ] **Step 8: Typecheck and commit**

Run (apps/web): `npx tsc --noEmit -p . 2>&1 | grep -E "holiday|dashboard"`. Expected: no output.

```bash
git add packages/shared/src/holidays/nudge.ts apps/web/tests/holidays/nudge.test.ts apps/web/src/components/dashboard/holiday-nudge-banner.tsx apps/web/src/actions/dashboard.ts apps/web/src/app/dashboard/page.tsx
git commit -m "feat(holidays): year-end nudge for admins to set up next year's holidays

Claude-Session: https://claude.ai/code/session_01CVEsL8Lz4sUw2JXUwQoHhu"
```

---

### Task 9: Assistant help article

**Files:**
- Create: `apps/web/src/lib/assistant/help/articles/manage_holidays.md`
- Modify: `apps/web/src/lib/assistant/route-registry.ts` (after the `configure_leave_policy` entry), `apps/web/tests/assistant/help-loader.test.ts` (count 63 → 64)

- [ ] **Step 1: Bump the count so the test fails**

In `apps/web/tests/assistant/help-loader.test.ts`, change `expect(listHelpArticles().length).toBe(63);` to `toBe(64)`.
Run: `npx vitest run tests/assistant`. Expected: FAIL (63 ≠ 64).

- [ ] **Step 2: Write the article**

```markdown
---
id: manage_holidays
title: Manage company holidays
summary: How an admin adds, edits, deletes and imports the company's public holidays for the year.
route_key: manage_holidays
allowed_roles: [owner, admin]
plan_tier: starter
keywords: [holiday, public holiday, holiday calendar, diwali, festival, optional holiday, restricted holiday, import holidays, holiday list]
---
Holidays are company-wide. Mandatory holidays are days off for everyone; optional holidays show on the calendar but are normal working days.

1. Open **Settings** from the left sidebar.
2. Open the **Holidays** section, below Leave Policies.
3. Pick the year at the top of the list.
4. Click **Import** to add a ready-made list (National, or your state), tick the holidays you observe, and click **Import**.
5. Click **Add holiday** to add a day of your own, such as an extra Diwali day.
6. Use the pencil to rename a holiday, move it, or mark it optional; use the bin to delete it.

There's one holiday per date. Holidays on the same date are combined into one. Changing a past holiday updates reports straight away and late marks overnight; locked payroll runs don't change.
```

- [ ] **Step 3: Add the registry entry**

After the `configure_leave_policy: { … },` block in `route-registry.ts`:

```ts
  manage_holidays: {
    path: "/dashboard/settings",
    params: { section: "holidays" },
    label: "Manage holidays",
    description: "Add, edit, delete or import the company's public holidays.",
    required_role: "admin",
    required_plan: "starter",
  },
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/assistant`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/assistant/help/articles/manage_holidays.md apps/web/src/lib/assistant/route-registry.ts apps/web/tests/assistant/help-loader.test.ts
git commit -m "docs(holidays): assistant help article + route for managing holidays

Claude-Session: https://claude.ai/code/session_01CVEsL8Lz4sUw2JXUwQoHhu"
```

---

### Task 10: Verify, update the docs, open the PR

**Files:**
- Modify: `docs/superpowers/specs/2026-10-07-public-holidays-design.md` (the three adjustments), `CLAUDE.md` (new section), `docs/changelog/` (current file)

- [ ] **Step 1: Full suite**

Run (repo root): `npm run test && npm run lint && npx turbo typecheck --filter=@jambahr/shared --filter=mobile`
Expected: all PASS. If anything fails, fix it before continuing; don't skip.

- [ ] **Step 2: Browser check on TestOrg** (localhost uses prod Supabase; the dev identity is TestOrg)

Start `npm run dev` (repo root) and sign in as the TestOrg admin. Then:
1. `/dashboard/settings?section=holidays` opens the Holidays section showing 2026 (13 rows). Weekday hints say "already a week-off" on weekend dates; 8 Nov 2026 is a Sunday.
2. **Add** "Bhaubeej" on 2026-11-11 and see it appear. Adding a second holiday on 2026-11-08 shows "There's already a holiday on 8 Nov 2026".
3. **Edit** it to optional and see the badge change. **Delete** it and see it disappear.
4. **2027 tab:** it's empty, so click **Import**, then National. Gazetted holidays are pre-ticked; restricted ones are unticked and marked "Restricted". Import, and 15 Aug shows as "Independence Day / Milad-un-Nabi".
5. Run **Import → Maharashtra** on the 2026 tab. Existing dates are greyed out as "already added". Import the rest, and the toast reports the count.
6. **Upload CSV** with a bad row and see the line-numbered error; Import stays disabled.
7. **Clean up:** delete the 2027 rows and the Maharashtra rows you added (TestOrg returns to 13 rows for 2026).
8. Sign in as a non-admin: `/dashboard/settings` redirects to `/dashboard`.

Record each check's result in the PR description.

- [ ] **Step 3: Update the spec with the three adjustments**

In `docs/superpowers/specs/2026-10-07-public-holidays-design.md`:
- **§2 D5:** change "v1 ships National + Maharashtra for 2026 and 2027" to "v1 ships National 2026 + 2027 and Maharashtra 2026; Maharashtra 2027 is added once GAD notifies it".
- **§4 Seeding:** replace the first bullet with "`DEFAULT_HOLIDAYS_2026` is deleted. `createOrganization` seeds the curated core list (`@jambahr/shared/holidays/core-seed`, 13 a year: 9 mandatory and 4 optional) from today to the end of next year, with `source='seed'`. It is not the full DoPT gazetted list, which would give a private-sector client 17 mandatory Delhi holidays."
- **§4 Actions table:** move the `get/updateHolidaySettings` row to §7 Actions.

- [ ] **Step 4: Update CLAUDE.md and the changelog**

Add to `CLAUDE.md` before "## Client references + changelog":

```markdown
## Public holidays (PR 1, branch `feat/public-holidays`)

Admins manage the org's holiday calendar at **Settings → Holidays** (`holidays-section.tsx`). Spec: `docs/superpowers/specs/2026-10-07-public-holidays-design.md`.
- **Org-wide, one holiday per date** (`UNIQUE(org_id, date)`). `is_optional` = shown but a working day (claims arrive in PR 4). Migration **123** adds `source` (seed/preset/manual/csv), `created_by`, `updated_at`.
- **Presets** in `@jambahr/shared/holidays/presets` (one data file per year, source cited): National 2026/2027 (DoPT gazetted + restricted), Maharashtra 2026. Add a state or year as data only. Import merges same-date entries ("Independence Day / Milad-un-Nabi").
- **New orgs** get `coreSeedRows(today)` (13/yr core list, rest of this year + next), NOT the full gazetted list.
- **One resolver:** `loadNonWorkingDays` (`src/lib/holidays/non-working-days.ts`, plain module) = mandatory holidays + effective week-off per employee for any range; payroll's `loadNonWorkingDates` wraps it. PRs 2–4 move leave counting, reports, late counting and the roster onto it.
- **Year-end nudge:** admins see "Set up your {next year} holidays" from 1 Nov when next year is empty.
- Live data fix 2026-10-07 (PR #68): five wrong seeded 2026 dates corrected in 6 orgs; Medialoop/PlayPause/Sakura seeded.
```

Add an entry to the newest file in `docs/changelog/` in the same style as its existing entries: PR number, commit, migration 123, and how it was verified (Step 2).

- [ ] **Step 5: Commit and open the PR**

```bash
git add docs/superpowers/specs/2026-10-07-public-holidays-design.md docs/superpowers/plans/2026-10-07-public-holidays-pr1-calendar.md CLAUDE.md docs/changelog
git commit -m "docs(holidays): spec adjustments, CLAUDE.md section, changelog

Claude-Session: https://claude.ai/code/session_01CVEsL8Lz4sUw2JXUwQoHhu"
git push -u origin feat/public-holidays
gh pr create --title "feat(holidays): Settings → Holidays — admin calendar, national + Maharashtra presets, one non-working-days resolver" --body-file pr-body.md
```

Before running it, write `pr-body.md` in the scratchpad directory (not the repo) with these sections, filled from what actually happened:
- **What:** one line per task 1–9.
- **Migration:** "123 applied to live HRme on <date from Task 1 Step 2>; 117 rows backfilled to `seed`."
- **Verified:** the eight Step 2 checks, each marked ✅ or ❌ with a note. Any ❌ blocks the PR.
- **Spec adjustments:** the three numbered items at the top of this plan.
- **Next:** "PRs 2–4 (leave counting, roster/visibility, optional claims) follow, each with its own plan."
- The footer: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`, a blank line, then `https://claude.ai/code/session_01CVEsL8Lz4sUw2JXUwQoHhu`.

- [ ] **Step 6: After merging**

Run `npm run embed:help` against production (needs `VOYAGE_API_KEY`, gotcha #64/#70), so the assistant can answer "how do I add holidays". If the key is still missing locally (see the backlog memory), say so in the PR rather than skipping silently.
