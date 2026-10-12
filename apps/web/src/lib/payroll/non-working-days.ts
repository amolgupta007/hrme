// Plain module — NOT "use server" (gotcha #85): takes raw org/employee ids.
//
// Each employee's non-working days in a pay month (effective week-off —
// employee > department > org — plus non-optional holidays). The engine uses
// them so joining on the month's first working day pays the whole month.
// A thin month wrapper over the shared resolver in lib/holidays.

import type { WeekOffPolicy } from "@jambahr/shared/attendance/week-off";
import { daysInMonth } from "@jambahr/shared/payroll/engine";
import { buildNonWorkingDays, nonWorkingDateList } from "@jambahr/shared/holidays/non-working";
import { loadNonWorkingDays } from "@/lib/holidays/non-working-days";

type Supabase = { from: (table: string) => any };

const monthBounds = (month: string) => ({
  from: `${month}-01`,
  to: `${month}-${String(daysInMonth(month)).padStart(2, "0")}`,
});

/** Dates of `month` (YYYY-MM-DD) that are a week-off under `weekOff` or a holiday. */
export function nonWorkingDatesInMonth(month: string, weekOff: WeekOffPolicy | null, holidays: ReadonlySet<string>): string[] {
  const { from, to } = monthBounds(month);
  return nonWorkingDateList(
    buildNonWorkingDays({ from, to, holidays: [...holidays].map((date) => ({ date, name: "" })), weekOff }),
  );
}

/**
 * Non-working dates per employee. `hasWeekOff` is false for employees with no
 * week-off at any level — their proration falls back to the joining date.
 */
export async function loadNonWorkingDates(
  supabase: Supabase,
  params: { orgId: string; month: string; employees: { id: string; department_id: string | null }[] },
): Promise<Map<string, { dates: string[]; hasWeekOff: boolean }>> {
  const { from, to } = monthBounds(params.month);
  const resolved = await loadNonWorkingDays(supabase, { orgId: params.orgId, employees: params.employees, from, to });
  const out = new Map<string, { dates: string[]; hasWeekOff: boolean }>();
  for (const [id, d] of resolved) out.set(id, { dates: nonWorkingDateList(d), hasWeekOff: d.hasWeekOff });
  return out;
}
