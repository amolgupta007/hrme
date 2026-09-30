import { isWeekOff, type WeekOffPolicy } from "./week-off";

/** One attendance_records row, as far as late counting cares. */
export type LateDay = {
  id: string;
  date: string; // IST YYYY-MM-DD
  is_late: boolean;
  late_minutes: number | null;
  late_excused: boolean;
  clock_in_at: string | null;
};

export type LateCountContext = {
  /** The employee's EFFECTIVE week-off (employee > department > org), or null if none configured. */
  weekOff: WeekOffPolicy | null;
  /** Non-optional org holidays (YYYY-MM-DD). */
  holidays: Set<string>;
  /** Days covered by approved leave, including half days. */
  leaveDates: Set<string>;
  /** The policy's go-live date; earlier days never count. */
  evaluateFrom: string | null;
};

/** First and last IST calendar day of a "YYYY-MM" month. */
export function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, "0")}` };
}

/** Every date an approved leave covers, clipped to [from, to]. */
export function expandLeaveDates(
  leaves: Array<{ start_date: string; end_date: string }>,
  from: string,
  to: string
): Set<string> {
  const out = new Set<string>();
  for (const l of leaves) {
    let d = new Date(`${l.start_date > from ? l.start_date : from}T00:00:00Z`);
    const end = new Date(`${l.end_date < to ? l.end_date : to}T00:00:00Z`);
    while (d <= end) {
      out.add(d.toISOString().slice(0, 10));
      d = new Date(d.getTime() + 86_400_000);
    }
  }
  return out;
}

/**
 * The late arrivals that count toward a monthly late policy, oldest first.
 * Lateness itself is decided once, by computeLateness (is_late); this only
 * decides which late days are *countable*: not excused, not a week-off, not a
 * holiday, not on approved leave, and on/after the policy's go-live date.
 */
export function countableLates(days: LateDay[], ctx: LateCountContext): LateDay[] {
  return days
    .filter(
      (d) =>
        d.is_late &&
        !d.late_excused &&
        (!ctx.evaluateFrom || d.date >= ctx.evaluateFrom) &&
        !(ctx.weekOff && isWeekOff(d.date, ctx.weekOff)) &&
        !ctx.holidays.has(d.date) &&
        !ctx.leaveDates.has(d.date)
    )
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
