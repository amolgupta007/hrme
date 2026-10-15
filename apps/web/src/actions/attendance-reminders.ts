"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import {
  activeReminderFor,
  istClock,
  isValidReminderTime,
  minutesOfDay,
  normalizeReminderSettings,
  serializeReminderSettings,
  type AttendanceReminderSettings,
  type ReminderKind,
} from "@jambahr/shared/attendance/reminders";
import { loadReminderCandidates } from "@/lib/attendance/reminders-dispatch";
import type { ActionResult } from "@/types";

export type ReminderEmployeeOption = { id: string; name: string; department: string | null };

/** Settings → Attendance → Reminders. Admin only. */
export async function getAttendanceReminderSettings(): Promise<
  ActionResult<{ settings: AttendanceReminderSettings; employees: ReminderEmployeeOption[]; attendanceEnabled: boolean }>
> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };

  const supabase = createAdminSupabase();
  const [{ data: org, error }, { data: emps }, { data: depts }] = await Promise.all([
    supabase.from("organizations").select("settings").eq("id", user.orgId).single(),
    supabase
      .from("employees")
      .select("id, first_name, last_name, department_id")
      .eq("org_id", user.orgId)
      .not("status", "in", "(terminated,inactive)")
      .order("first_name"),
    supabase.from("departments").select("id, name").eq("org_id", user.orgId),
  ]);
  if (error) return { success: false, error: error.message };
  const deptName = new Map(((depts ?? []) as Array<{ id: string; name: string }>).map((d) => [d.id, d.name]));
  const settings = (org as any)?.settings ?? {};
  return {
    success: true,
    data: {
      settings: normalizeReminderSettings(settings),
      attendanceEnabled: settings.attendance_enabled === true,
      employees: ((emps ?? []) as any[]).map((e) => ({
        id: e.id,
        name: `${e.first_name ?? ""} ${e.last_name ?? ""}`.replace(/\s+/g, " ").trim(),
        department: e.department_id ? deptName.get(e.department_id) ?? null : null,
      })),
    },
  };
}

const timeSchema = z.string().refine(isValidReminderTime, "Pick a time in 5-minute steps");
const settingsSchema = z.object({
  enabled: z.boolean(),
  clockIn: z.object({ enabled: z.boolean(), time: timeSchema }),
  clockOut: z.object({ enabled: z.boolean(), time: timeSchema }),
  email: z.boolean(),
  inApp: z.boolean(),
  excludedEmployeeIds: z.array(z.string().uuid()).max(1000),
});

export async function updateAttendanceReminderSettings(
  input: AttendanceReminderSettings
): Promise<ActionResult<AttendanceReminderSettings>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can change reminders" };
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.errors[0]?.message ?? "Invalid settings" };
  const next = parsed.data;
  if (next.enabled && !next.clockIn.enabled && !next.clockOut.enabled) {
    return { success: false, error: "Turn on at least one reminder, or switch reminders off" };
  }
  if (next.enabled && !next.email && !next.inApp) {
    return { success: false, error: "Choose email, in-app, or both" };
  }

  const supabase = createAdminSupabase();
  // Excluded people must belong to this org — never store another tenant's ids.
  if (next.excludedEmployeeIds.length) {
    const { data: found } = await supabase
      .from("employees")
      .select("id")
      .eq("org_id", user.orgId)
      .in("id", next.excludedEmployeeIds);
    if ((found ?? []).length !== new Set(next.excludedEmployeeIds).size) {
      return { success: false, error: "Unknown employee in the exclude list" };
    }
  }

  const { data: org, error: readErr } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", user.orgId)
    .single();
  if (readErr) return { success: false, error: readErr.message };
  const existing = ((org as any)?.settings ?? {}) as Record<string, any>;
  const existingAttendance = (existing.attendance && typeof existing.attendance === "object" ? existing.attendance : {}) as Record<string, any>;
  const { error: writeErr } = await supabase
    .from("organizations")
    .update({ settings: { ...existing, attendance: { ...existingAttendance, reminders: serializeReminderSettings(next) } } as any })
    .eq("id", user.orgId);
  if (writeErr) return { success: false, error: writeErr.message };

  revalidatePath("/dashboard/settings");
  return { success: true, data: normalizeReminderSettings({ attendance: { reminders: serializeReminderSettings(next) } }) };
}

/**
 * For the web notifications bell: which reminder applies to the signed-in
 * person right now, if any. Cheap early exits; any failed read → null (the
 * bell just shows nothing — it never blocks the page).
 */
export async function getMyAttendanceReminder(): Promise<ReminderKind | null> {
  try {
    const user = await getCurrentUser();
    if (!user?.employeeId || !user.attendanceEnabled) return null;
    const supabase = createAdminSupabase();
    const { data: org } = await supabase.from("organizations").select("settings").eq("id", user.orgId).single();
    const settings = normalizeReminderSettings((org as any)?.settings);
    if (!settings.enabled || !settings.inApp) return null;
    const { date, minutes } = istClock(new Date());
    const earliest = Math.min(
      settings.clockIn.enabled ? minutesOfDay(settings.clockIn.time) : 1440,
      settings.clockOut.enabled ? minutesOfDay(settings.clockOut.time) : 1440
    );
    if (minutes < earliest) return null;

    const { data: me } = await supabase
      .from("employees")
      .select("id, first_name, email, department_id")
      .eq("id", user.employeeId)
      .eq("org_id", user.orgId)
      .single();
    if (!me) return null;
    const candidates = await loadReminderCandidates(supabase, {
      orgId: user.orgId,
      date,
      employees: [me as any],
      excludedIds: new Set(settings.excludedEmployeeIds),
    });
    const c = candidates.get(user.employeeId);
    return c ? activeReminderFor(settings, minutes, c) : null;
  } catch {
    return null;
  }
}
