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
