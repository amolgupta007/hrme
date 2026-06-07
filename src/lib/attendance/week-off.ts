export type WeekOffPolicy = {
  week_type: 5 | 6;
  off_days: number[]; // 0=Sun..6=Sat
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

export function isWeekOff(dateStr: string, policy: WeekOffPolicy): boolean {
  const day = new Date(`${dateStr}T00:00:00.000Z`).getUTCDay();
  return policy.off_days.includes(day);
}
