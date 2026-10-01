// Plain module (NOT "use server" — gotcha #85): today's clock-in sessions for
// one employee, read straight from the punch-event stream. Used by the web
// clock-in/out actions and the Today card.
import type { createAdminSupabase } from "@/lib/supabase/server";
import {
  resolveTimekeepingMode,
  splitPunchesForTimekeeping,
  type TimekeepingMode,
} from "@jambahr/shared/attendance/timekeeping";
import { deriveWorkSessions, type WorkSessionSummary } from "@jambahr/shared/attendance/sessions";

const DAY_MS = 24 * 60 * 60 * 1000;

export type TodaySessions = WorkSessionSummary & {
  mode: TimekeepingMode;
  /** True when clocking in again after a clock-out is allowed (web_app mode). */
  multiSession: boolean;
};

export async function loadTodaySessions(
  supabase: ReturnType<typeof createAdminSupabase>,
  orgId: string,
  employeeId: string,
  istDate: string,
): Promise<TodaySessions> {
  const start = new Date(`${istDate}T00:00:00+05:30`);
  const [{ data: org }, { data: events }] = await Promise.all([
    supabase.from("organizations").select("settings").eq("id", orgId).maybeSingle(),
    supabase
      .from("attendance_punch_events")
      .select("punched_at, source, status")
      .eq("org_id", orgId)
      .eq("employee_id", employeeId)
      .gte("punched_at", start.toISOString())
      .lt("punched_at", new Date(start.getTime() + DAY_MS).toISOString()),
  ]);

  const mode = resolveTimekeepingMode((org as any)?.settings, istDate);
  const approved = ((events ?? []) as Array<{ punched_at: string; source: string | null; status: string | null }>)
    .filter((e) => (e.status ?? "approved") === "approved");
  const { timekeeping } = splitPunchesForTimekeeping(approved, mode);

  return { ...deriveWorkSessions(timekeeping), mode, multiSession: mode === "web_app" };
}
