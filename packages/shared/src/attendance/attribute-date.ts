import { parseHHMM } from "./shift-time";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

type ShiftLike = {
  start_time: string;
  end_time: string;
  is_overnight: boolean;
} | null;

function toIstParts(utcIso: string): { dateStr: string; minutesPastMidnight: number } {
  const utcMs = new Date(utcIso).getTime();
  const ist = new Date(utcMs + IST_OFFSET_MS);
  const dateStr = ist.toISOString().slice(0, 10);
  const minutesPastMidnight = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return { dateStr, minutesPastMidnight };
}

function shiftPreviousDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Returns the ISO date string (YYYY-MM-DD, IST) that this clock-in should be
 * attributed to.
 *
 * For non-overnight shifts (or when no shift is provided), that is simply the
 * IST calendar date of the clock-in timestamp.
 *
 * For overnight shifts, a clock-in that falls in the early-AM window (i.e.
 * before the shift's end time, meaning the shift started on the *previous* IST
 * day) is attributed to the previous IST date.
 */
export function attributedDateForClockIn(clockInAtUtc: string, shift: ShiftLike): string {
  const { dateStr, minutesPastMidnight } = toIstParts(clockInAtUtc);

  if (!shift || !shift.is_overnight) return dateStr;

  const startMin = parseHHMM(shift.start_time);
  const endMin = parseHHMM(shift.end_time);

  // If the clock-in IST time is in the AM window before the shift's end time,
  // the shift started on the previous IST calendar date.
  // Also catch the edge-case where clock-in falls before start AND before noon
  // (handles shifts that start in the PM but the check-in is oddly early AM).
  if (minutesPastMidnight < endMin || (minutesPastMidnight < startMin && minutesPastMidnight < 12 * 60)) {
    return shiftPreviousDay(dateStr);
  }

  return dateStr;
}
