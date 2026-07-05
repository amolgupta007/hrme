import { parseHHMM } from "@/lib/attendance/shift-time";

export type LatenessShift = {
  start_time: string;
  grace_minutes: number;
  is_overnight: boolean;
} | null;

export type LatenessResult = { evaluated: boolean; isLate: boolean; lateMinutes: number };

function istMinutesPastMidnight(clockInAtUtc: string): number {
  const istMs = new Date(clockInAtUtc).getTime() + 5.5 * 3600 * 1000;
  const d = new Date(istMs);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/**
 * Determine whether a clock-in is "late".
 * v1: overnight shifts are NOT evaluated (boundary wrap is a Phase-2 concern).
 */
export function computeLateness(params: {
  clockInAtUtc: string;
  shift: LatenessShift;
  fallbackCutoff: string | null;
}): LatenessResult {
  const { clockInAtUtc, shift, fallbackCutoff } = params;

  let boundaryMin: number | null = null;
  if (shift) {
    if (shift.is_overnight) return { evaluated: false, isLate: false, lateMinutes: 0 };
    boundaryMin = parseHHMM(shift.start_time) + (shift.grace_minutes ?? 0);
  } else if (fallbackCutoff) {
    boundaryMin = parseHHMM(fallbackCutoff);
  }

  if (boundaryMin === null) return { evaluated: false, isLate: false, lateMinutes: 0 };

  const nowMin = istMinutesPastMidnight(clockInAtUtc);
  const diff = nowMin - boundaryMin;
  return { evaluated: true, isLate: diff > 0, lateMinutes: diff > 0 ? diff : 0 };
}
