"use server";

// Dashboard "who's working from home" + "celebrations" cards. Visible to every
// signed-in member of the org — it's the same information colleagues would
// share in a team channel. Birthdays never expose the year or age.
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/current-user";
import { normalizeWfhPolicy } from "@jambahr/shared/attendance/wfh";
import { upcomingCelebrations, type Celebration } from "@jambahr/shared/people/celebrations";
import type { ActionResult } from "@/types";

export type UpcomingPerson = { id: string; name: string; avatarUrl: string | null };

export type TeamUpcoming = {
  wfhEnabled: boolean;
  /** Days (today … +7) with at least one approved WFH, oldest first. */
  wfhDays: { date: string; people: UpcomingPerson[] }[];
  celebrations: Celebration[];
  orgName: string;
};

const WFH_WINDOW_DAYS = 7;
const CELEBRATION_WINDOW_DAYS = 14;

const DAY_MS = 86_400_000;
const istToday = () => new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
const addDays = (d: string, n: number) =>
  new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

export async function getTeamUpcoming(): Promise<ActionResult<TeamUpcoming>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  const supabase = createAdminSupabase();
  const today = istToday();

  const [{ data: org }, { data: people, error: peopleErr }, { data: wfhRows }] = await Promise.all([
    supabase.from("organizations").select("settings").eq("id", user.orgId).maybeSingle(),
    supabase
      .from("employees")
      .select("id, first_name, last_name, avatar_url, date_of_birth, date_of_joining, work_arrangement, status")
      .eq("org_id", user.orgId)
      .not("status", "in", "(terminated,inactive)"),
    supabase
      .from("wfh_requests")
      .select("employee_id, date")
      .eq("org_id", user.orgId)
      .eq("status", "approved")
      .gte("date", today)
      .lte("date", addDays(today, WFH_WINDOW_DAYS)),
  ]);
  if (peopleErr) return { success: false, error: peopleErr.message };

  const rows = (people ?? []) as Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    date_of_birth: string | null;
    date_of_joining: string | null;
    work_arrangement: string | null;
  }>;
  const byId = new Map(
    rows.map((p) => [
      p.id,
      {
        id: p.id,
        name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Unnamed",
        avatarUrl: p.avatar_url,
        remote: p.work_arrangement === "remote",
      },
    ]),
  );

  const days = new Map<string, UpcomingPerson[]>();
  for (const r of (wfhRows ?? []) as Array<{ employee_id: string; date: string }>) {
    const p = byId.get(r.employee_id);
    if (!p || p.remote) continue;
    if (!days.has(r.date)) days.set(r.date, []);
    days.get(r.date)!.push({ id: p.id, name: p.name, avatarUrl: p.avatarUrl });
  }
  const wfhDays = [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => ({ date, people: list.sort((a, b) => a.name.localeCompare(b.name)) }));

  const celebrations = upcomingCelebrations(
    rows.map((p) => ({
      id: p.id,
      name: byId.get(p.id)!.name,
      avatarUrl: p.avatar_url,
      dateOfBirth: p.date_of_birth,
      dateOfJoining: p.date_of_joining,
    })),
    today,
    CELEBRATION_WINDOW_DAYS,
  );

  return {
    success: true,
    data: {
      wfhEnabled: normalizeWfhPolicy((org as { settings?: unknown } | null)?.settings).enabled,
      wfhDays,
      celebrations,
      orgName: user.orgName ?? "the team",
    },
  };
}
