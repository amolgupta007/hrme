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
