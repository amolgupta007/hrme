/**
 * Upcoming birthdays and work anniversaries — pure, no I/O.
 * Birthdays expose day + month only (never year or age). Anniversaries need at
 * least one full year. A 29 Feb date falls on 28 Feb in non-leap years.
 */

export type CelebrationKind = "birthday" | "anniversary";

export type Celebration = {
  employeeId: string;
  name: string;
  avatarUrl: string | null;
  kind: CelebrationKind;
  /** The upcoming occurrence, YYYY-MM-DD. */
  date: string;
  /** 0 = today. */
  daysAway: number;
  /** Anniversaries only: completed years on `date`. */
  years: number | null;
};

export type CelebrationPerson = {
  id: string;
  name: string;
  avatarUrl: string | null;
  dateOfBirth: string | null;
  dateOfJoining: string | null;
};

const DAY_MS = 86_400_000;
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const utc = (d: string) => Date.parse(`${d}T00:00:00Z`);

/** The next occurrence (today or later) of a month/day, from `today`. */
function nextOccurrence(source: string, today: string): string {
  const [, m, d] = source.split("-").map(Number);
  const year = Number(today.slice(0, 4));
  for (const y of [year, year + 1]) {
    const day = m === 2 && d === 29 && !isLeap(y) ? 28 : d;
    const candidate = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (candidate >= today) return candidate;
  }
  return `${year + 1}-${source.slice(5)}`;
}

export function upcomingCelebrations(
  people: CelebrationPerson[],
  today: string,
  windowDays: number,
): Celebration[] {
  const out: Celebration[] = [];
  const add = (p: CelebrationPerson, kind: CelebrationKind, source: string) => {
    if (!/^\d{4}-\d{2}-\d{2}/.test(source)) return;
    const date = nextOccurrence(source.slice(0, 10), today);
    const daysAway = Math.round((utc(date) - utc(today)) / DAY_MS);
    if (daysAway < 0 || daysAway > windowDays) return;
    let years: number | null = null;
    if (kind === "anniversary") {
      years = Number(date.slice(0, 4)) - Number(source.slice(0, 4));
      if (years < 1) return; // joined this year — not an anniversary yet
    }
    out.push({ employeeId: p.id, name: p.name, avatarUrl: p.avatarUrl, kind, date, daysAway, years });
  };
  for (const p of people) {
    if (p.dateOfBirth) add(p, "birthday", p.dateOfBirth);
    if (p.dateOfJoining) add(p, "anniversary", p.dateOfJoining);
  }
  return out.sort(
    (a, b) =>
      a.daysAway - b.daysAway ||
      (a.kind === b.kind ? 0 : a.kind === "birthday" ? -1 : 1) ||
      a.name.localeCompare(b.name),
  );
}
