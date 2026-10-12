// Comp-off rules — plain module (gotcha #78/#85): the request dialog, the
// leaves table and requestLeave all import it.
//
// Comp-off is a leave type with no balance. Each request redeems ONE worked
// week-off or holiday (`comp_off_worked_date`) for at most one day off, so the
// approver can check it against attendance and the DB can stop the same day
// being claimed twice.

export const COMP_OFF_TYPE = "comp_off";

export function isCompOff(type: string | null | undefined): boolean {
  return type === COMP_OFF_TYPE;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "Sat 4 Oct 2026" — the worked day as shown in the UI and emails. Built by
 * hand: Intl's en-IN output varies by ICU build ("Sat, 4 Oct, 2026").
 */
export function formatWorkedDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[weekday]} ${d} ${MONTHS[m - 1]} ${y}`;
}

export type CompOffRequestInput = {
  startDate: string;
  endDate: string;
  days: number;
  workedDate: string | null | undefined;
  reason: string | null | undefined;
  todayIst: string;
  /**
   * Whether the worked date is a week-off / non-optional holiday for this
   * employee. `null` = can't tell (no week-off policy at any level and not a
   * holiday) — allowed, and the approver judges from attendance.
   */
  workedDayIsNonWorking: boolean | null;
};

/** Returns the first rule the request breaks, or null when it's valid. */
export function validateCompOffRequest(input: CompOffRequestInput): string | null {
  const { startDate, endDate, days, workedDate, reason, todayIst, workedDayIsNonWorking } = input;
  if (!workedDate || !/^\d{4}-\d{2}-\d{2}$/.test(workedDate)) return "Pick the day you worked";
  if (!reason?.trim()) return "Add a reason — what you worked on";
  if (startDate !== endDate) return "A comp-off is for one day — pick a single date";
  if (days !== 0.5 && days !== 1) return "A comp-off is a full or half day";
  if (workedDate > todayIst) return "The day you worked can't be in the future";
  if (workedDate >= startDate) return "Take the comp-off after the day you worked";
  if (workedDayIsNonWorking === false) {
    return `${formatWorkedDate(workedDate)} was a working day for you — comp-off is for working a week-off or holiday`;
  }
  return null;
}

export type WorkedDayAttendance = {
  clock_in_at: string | null;
  clock_out_at: string | null;
  total_minutes: number | null;
  device_first_seen_at: string | null;
  device_last_seen_at: string | null;
};

const istTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

/**
 * What attendance shows for the worked day, for the approver:
 * "Clocked 10:02–18:40 (8h 38m)", "Device 09:58–18:45", or "No attendance recorded".
 */
export function describeWorkedDayAttendance(record: WorkedDayAttendance | null | undefined): string {
  if (!record) return "No attendance recorded";
  if (record.clock_in_at) {
    if (!record.clock_out_at) return `Clocked in ${istTime(record.clock_in_at)}, no clock-out`;
    const mins = record.total_minutes ?? 0;
    return `Clocked ${istTime(record.clock_in_at)}–${istTime(record.clock_out_at)}${mins > 0 ? ` (${duration(mins)})` : ""}`;
  }
  if (record.device_first_seen_at) {
    const last = record.device_last_seen_at;
    return last && last !== record.device_first_seen_at
      ? `Device ${istTime(record.device_first_seen_at)}–${istTime(last)}`
      : `Device ${istTime(record.device_first_seen_at)}`;
  }
  return "No attendance recorded";
}
