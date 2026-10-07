// Plain module — when admins should be reminded to set up next year's holidays.
/** Next year from 1 November onward if it has no holidays yet; otherwise null. */
export function holidayNudgeYear(todayIst: string, nextYearCount: number): number | null {
  const month = Number(todayIst.slice(5, 7));
  if (month < 11 || nextYearCount > 0) return null;
  return Number(todayIst.slice(0, 4)) + 1;
}
