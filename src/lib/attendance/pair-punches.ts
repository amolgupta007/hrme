/**
 * Pure chronological interval pairing. Sorts punches ascending, pairs
 * (in,out),(in,out)… ; worked = Σ(out−in), break = Σ gaps between pairs.
 * A trailing unpaired punch is danglingInAt (missed clock-out) → needsReview.
 * Direction is derived from sequence, never trusted from the device.
 *
 * No DB, no device, no I/O — the load-bearing math for multi-punch days.
 */
export type PairPunch = { id: string; punched_at: string /* ISO 8601 UTC */ };

export type PairResult = {
  /** Σ(out−in) over closed pairs, whole minutes. */
  workedMinutes: number;
  /** Σ gaps between consecutive pairs, whole minutes. */
  breakMinutes: number;
  /** last−first in whole minutes (0 when < 2 punches). */
  grossSpanMinutes: number;
  intervals: { inAt: string; outAt: string; minutes: number }[];
  /** Unpaired trailing punch on an odd-count day (missed out), else null. */
  danglingInAt: string | null;
  needsReview: boolean;
  pairedStatus: "present" | "incomplete";
};

const ms = (iso: string) => new Date(iso).getTime();
const mins = (a: string, b: string) => Math.round((ms(b) - ms(a)) / 60_000);

export function pairPunches(punches: PairPunch[]): PairResult {
  const empty: PairResult = {
    workedMinutes: 0,
    breakMinutes: 0,
    grossSpanMinutes: 0,
    intervals: [],
    danglingInAt: null,
    needsReview: true,
    pairedStatus: "incomplete",
  };
  if (!punches || punches.length === 0) return empty;

  const sorted = [...punches].sort((a, b) => ms(a.punched_at) - ms(b.punched_at));

  if (sorted.length === 1) {
    return { ...empty, danglingInAt: sorted[0].punched_at };
  }

  const intervals: PairResult["intervals"] = [];
  let workedMinutes = 0;
  for (let i = 0; i + 1 < sorted.length; i += 2) {
    const inAt = sorted[i].punched_at;
    const outAt = sorted[i + 1].punched_at;
    const m = mins(inAt, outAt);
    intervals.push({ inAt, outAt, minutes: m });
    workedMinutes += m;
  }

  let breakMinutes = 0;
  for (let k = 0; k + 1 < intervals.length; k++) {
    breakMinutes += mins(intervals[k].outAt, intervals[k + 1].inAt);
  }

  const danglingInAt = sorted.length % 2 === 1 ? sorted[sorted.length - 1].punched_at : null;
  const grossSpanMinutes = mins(sorted[0].punched_at, sorted[sorted.length - 1].punched_at);

  return {
    workedMinutes,
    breakMinutes,
    grossSpanMinutes,
    intervals,
    danglingInAt,
    needsReview: danglingInAt !== null,
    pairedStatus: danglingInAt !== null ? "incomplete" : "present",
  };
}
