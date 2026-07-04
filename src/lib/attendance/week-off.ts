export type AltSaturdayRule = "none" | "odd_off" | "even_off";

export type WeekOffPolicy = {
  week_type: 5 | 6;
  off_days: number[]; // 0=Sun..6=Sat
  alt_saturday_rule?: AltSaturdayRule; // Phase 2 optional
};

export type WeekOffOverride = {
  week_type: 5 | 6;
  off_days: number[];
  alt_saturday_rule?: AltSaturdayRule;
};

export const WEEK_DAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
] as const;

export function isAltSaturdayOff(dateStr: string, rule: AltSaturdayRule): boolean {
  if (rule === "none") return false;
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  if (d.getUTCDay() !== 6) return false; // not Saturday
  const dom = d.getUTCDate();
  const nthSaturday = Math.floor((dom - 1) / 7) + 1; // 1, 2, 3, 4, 5
  if (rule === "odd_off") return nthSaturday % 2 === 1;
  if (rule === "even_off") return nthSaturday % 2 === 0;
  return false;
}

export function isWeekOff(dateStr: string, policy: WeekOffPolicy, override?: WeekOffOverride): boolean {
  const effective = override ?? policy;
  const day = new Date(`${dateStr}T00:00:00.000Z`).getUTCDay();
  if (effective.off_days.includes(day)) return true;
  if (effective.alt_saturday_rule && isAltSaturdayOff(dateStr, effective.alt_saturday_rule)) return true;
  return false;
}

/**
 * Resolve the effective week-off policy for one employee, applying precedence:
 * employee override > department override > org policy. Each override FULLY
 * replaces the level below it (not a merge). Returns the winning policy.
 */
export function resolveEffectiveWeekOff(
  policy: WeekOffPolicy,
  departmentOverride?: WeekOffOverride | null,
  employeeOverride?: WeekOffOverride | null
): WeekOffPolicy {
  return employeeOverride ?? departmentOverride ?? policy;
}
