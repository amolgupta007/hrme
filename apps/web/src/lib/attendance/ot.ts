// src/lib/attendance/ot.ts

export function computeDailyOvertimeMinutes(
  workedMinutes: number | null | undefined,
  shiftMinutes: number | null | undefined,
): number {
  if (!workedMinutes || !shiftMinutes) return 0;
  return Math.max(0, workedMinutes - shiftMinutes);
}

export function computeWeeklyOvertimeMinutes(
  totalWorkedMinutes: number,
  weeklyThresholdHours: number,
): number {
  const threshold = weeklyThresholdHours * 60;
  return Math.max(0, totalWorkedMinutes - threshold);
}

/** Returns the hourly rate in paise (integer). */
export function computeHourlyRate(
  grossMonthlyRupees: number,
  workingDays: number,
  shiftHours: number,
): number {
  if (workingDays <= 0 || shiftHours <= 0) return 0;
  return Math.round((grossMonthlyRupees * 100) / (workingDays * shiftHours));
}
