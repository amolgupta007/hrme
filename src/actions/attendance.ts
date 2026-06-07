"use server";

import { revalidatePath } from "next/cache";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin, isManagerOrAbove } from "@/lib/current-user";
import type { ActionResult } from "@/types";
import { getActiveShiftForEmployee } from "@/actions/shifts";
import { attributedDateForClockIn } from "@/lib/attendance/attribute-date";

export type AttendanceSettings = {
  standardWorkdayHours: number;
};

const DEFAULT_STANDARD_WORKDAY_HOURS = 8;

export async function getAttendanceSettings(): Promise<ActionResult<AttendanceSettings>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", user.orgId)
    .single();

  if (error) return { success: false, error: error.message };

  const raw = (data as any)?.settings?.attendance?.standard_workday_hours;
  const parsed = typeof raw === "number" && Number.isFinite(raw) ? raw : DEFAULT_STANDARD_WORKDAY_HOURS;
  const standardWorkdayHours = Math.max(1, Math.min(16, Math.round(parsed * 10) / 10));

  return { success: true, data: { standardWorkdayHours } };
}

export async function updateAttendanceSettings(input: {
  standardWorkdayHours: number;
}): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can update attendance settings" };

  const raw = Number(input.standardWorkdayHours);
  if (!Number.isFinite(raw)) {
    return { success: false, error: "Working hours must be a number." };
  }
  if (raw < 1) {
    return { success: false, error: "Working hours must be at least 1." };
  }
  if (raw > 16) {
    return { success: false, error: "Working hours cannot exceed 16." };
  }
  const standardWorkdayHours = Math.round(raw * 10) / 10;

  const supabase = createAdminSupabase();
  const { data: orgRow, error: readErr } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", user.orgId)
    .single();

  if (readErr) return { success: false, error: readErr.message };

  const existing = ((orgRow as any)?.settings ?? {}) as Record<string, any>;
  const existingAttendance = (existing.attendance && typeof existing.attendance === "object" ? existing.attendance : {}) as Record<string, any>;
  const nextSettings = {
    ...existing,
    attendance: {
      ...existingAttendance,
      standard_workday_hours: standardWorkdayHours,
    },
  };

  const { error: writeErr } = await supabase
    .from("organizations")
    .update({ settings: nextSettings })
    .eq("id", user.orgId);

  if (writeErr) return { success: false, error: writeErr.message };

  revalidatePath("/dashboard/attendance");
  return { success: true, data: undefined };
}

export type AttendanceRecord = {
  id: string;
  org_id: string;
  employee_id: string;
  employee_name: string;
  date: string;
  clock_in_at: string | null;
  clock_out_at: string | null;
  total_minutes: number | null;
  ip_address: string | null;
  notes: string | null;
  source: "web" | "device" | "auto_close";
  device_id: string | null;
  auto_closed: boolean;
  shift_id: string | null;
  attributed_date: string | null;
};

export type TodayStatus = {
  record: AttendanceRecord | null;
  isClockedIn: boolean;
  hoursToday: number | null;
};

// ---- Clock In ----
export async function clockIn(ipAddress?: string): Promise<ActionResult<AttendanceRecord>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!user.attendanceEnabled) return { success: false, error: "Attendance is not enabled for your organization" };
  if (!user.employeeId) return { success: false, error: "No employee record found" };

  const supabase = createAdminSupabase();
  const nowUtc = new Date().toISOString();
  const istToday = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Resolve assigned shift for the IST date; null if none assigned.
  const shift = await getActiveShiftForEmployee(user.employeeId, istToday);
  const attributedDate = attributedDateForClockIn(nowUtc, shift);
  const recordDate = attributedDate; // we always set `date` = attributed_date when a shift is in play; identical to istToday when no shift

  // Idempotency: prevent double clock-in for the same (employee, recordDate).
  const { data: existing } = await supabase
    .from("attendance_records")
    .select("*")
    .eq("org_id", user.orgId)
    .eq("employee_id", user.employeeId)
    .eq("date", recordDate)
    .maybeSingle();

  if (existing) {
    if ((existing as any).clock_in_at && !(existing as any).clock_out_at) {
      return { success: false, error: "You are already clocked in" };
    }
    if ((existing as any).clock_out_at) {
      return { success: false, error: "You have already completed attendance for today" };
    }
  }

  const { data, error } = await supabase
    .from("attendance_records")
    .insert({
      org_id: user.orgId,
      employee_id: user.employeeId,
      date: recordDate,
      attributed_date: attributedDate,
      shift_id: shift?.id ?? null,
      clock_in_at: nowUtc,
      ip_address: ipAddress ?? null,
      source: "web" as const,
    })
    .select(`*, employees!employee_id(first_name, last_name)`)
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/attendance");
  return { success: true, data: formatRecord(data) };
}

// Phase-1 limitation: clockOut still matches by today's IST date. Overnight
// shifts clocking out the next morning is a Phase 2 follow-up (the lookup
// needs to widen to attributed_date = yesterday in that case).
// ---- Clock Out ----
export async function clockOut(): Promise<ActionResult<AttendanceRecord>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!user.attendanceEnabled) return { success: false, error: "Attendance is not enabled" };
  if (!user.employeeId) return { success: false, error: "No employee record found" };

  const supabase = createAdminSupabase();
  const today = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: existing } = await supabase
    .from("attendance_records")
    .select("*")
    .eq("org_id", user.orgId)
    .eq("employee_id", user.employeeId)
    .eq("date", today)
    .single();

  if (!existing || !(existing as any).clock_in_at) {
    return { success: false, error: "You have not clocked in today" };
  }
  if ((existing as any).clock_out_at) {
    return { success: false, error: "You have already clocked out today" };
  }

  const now = new Date().toISOString();
  const clockInTime = new Date((existing as any).clock_in_at).getTime();
  const totalMinutes = Math.floor((Date.now() - clockInTime) / 60000);

  const { data, error } = await supabase
    .from("attendance_records")
    .update({ clock_out_at: now, total_minutes: totalMinutes, source: "web" as const })
    .eq("id", (existing as any).id)
    .select(`*, employees!employee_id(first_name, last_name)`)
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/attendance");
  return { success: true, data: formatRecord(data) };
}

// ---- Get today's status for current employee ----
export async function getTodayStatus(): Promise<ActionResult<TodayStatus>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!user.employeeId) return { success: true, data: { record: null, isClockedIn: false, hoursToday: null } };

  const supabase = createAdminSupabase();
  const today = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data } = await supabase
    .from("attendance_records")
    .select(`*, employees!employee_id(first_name, last_name)`)
    .eq("org_id", user.orgId)
    .eq("employee_id", user.employeeId)
    .eq("date", today)
    .single();

  if (!data) return { success: true, data: { record: null, isClockedIn: false, hoursToday: null } };

  const record = formatRecord(data);
  const isClockedIn = !!record.clock_in_at && !record.clock_out_at;
  const hoursToday = record.total_minutes ? record.total_minutes / 60 : null;

  return { success: true, data: { record, isClockedIn, hoursToday } };
}

// ---- List attendance (my own or team for managers) ----
export async function listAttendance(filters?: {
  employeeId?: string;
  from?: string;
  to?: string;
}): Promise<ActionResult<AttendanceRecord[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();

  let query = supabase
    .from("attendance_records")
    .select(`*, employees!employee_id(first_name, last_name)`)
    .eq("org_id", user.orgId)
    .order("date", { ascending: false })
    .order("clock_in_at", { ascending: false });

  // Non-managers can only see their own records
  if (!isManagerOrAbove(user.role)) {
    if (!user.employeeId) return { success: true, data: [] };
    query = query.eq("employee_id", user.employeeId);
  } else if (filters?.employeeId) {
    query = query.eq("employee_id", filters.employeeId);
  }

  if (filters?.from) query = query.gte("date", filters.from);
  if (filters?.to) query = query.lte("date", filters.to);

  const { data, error } = await query.limit(100);
  if (error) return { success: false, error: error.message };

  return { success: true, data: (data ?? []).map(formatRecord) };
}

// ---- Team today overview (managers/admins) ----
export async function getTeamTodayAttendance(): Promise<ActionResult<{
  present: number;
  absent: number;
  total: number;
  records: AttendanceRecord[];
}>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isManagerOrAbove(user.role)) return { success: false, error: "Unauthorized" };

  const supabase = createAdminSupabase();
  const today = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [{ count: totalEmployees }, { data: todayRecords }] = await Promise.all([
    supabase
      .from("employees")
      .select("*", { count: "exact", head: true })
      .eq("org_id", user.orgId)
      .eq("status", "active"),
    supabase
      .from("attendance_records")
      .select(`*, employees!employee_id(first_name, last_name)`)
      .eq("org_id", user.orgId)
      .eq("date", today),
  ]);

  const records = (todayRecords ?? []).map(formatRecord);
  const present = records.filter((r) => r.clock_in_at).length;
  const total = totalEmployees ?? 0;

  return {
    success: true,
    data: { present, absent: total - present, total, records },
  };
}

// ---- Helper ----
function formatRecord(raw: any): AttendanceRecord {
  const emp = raw.employees;
  const name = emp ? `${emp.first_name} ${emp.last_name}` : "Unknown";
  return {
    id: raw.id,
    org_id: raw.org_id,
    employee_id: raw.employee_id,
    employee_name: name,
    date: raw.date,
    clock_in_at: raw.clock_in_at ?? null,
    clock_out_at: raw.clock_out_at ?? null,
    total_minutes: raw.total_minutes ?? null,
    ip_address: raw.ip_address ?? null,
    notes: raw.notes ?? null,
    source: (raw.source ?? "web") as "web" | "device" | "auto_close",
    device_id: raw.device_id ?? null,
    auto_closed: !!raw.auto_closed,
    shift_id: raw.shift_id ?? null,
    attributed_date: raw.attributed_date ?? null,
  };
}
