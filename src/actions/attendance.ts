"use server";

import { revalidatePath } from "next/cache";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isManagerOrAbove } from "@/lib/current-user";
import type { ActionResult } from "@/types";

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
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Check if already clocked in today
  const { data: existing } = await supabase
    .from("attendance_records")
    .select("*")
    .eq("org_id", user.orgId)
    .eq("employee_id", user.employeeId)
    .eq("date", today)
    .single();

  if (existing) {
    if ((existing as any).clock_in_at && !(existing as any).clock_out_at) {
      return { success: false, error: "You are already clocked in" };
    }
    if ((existing as any).clock_out_at) {
      return { success: false, error: "You have already completed attendance for today" };
    }
  }

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("attendance_records")
    .insert({
      org_id: user.orgId,
      employee_id: user.employeeId,
      date: today,
      clock_in_at: now,
      ip_address: ipAddress ?? null,
    })
    .select(`*, employees!employee_id(first_name, last_name)`)
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/attendance");
  return { success: true, data: formatRecord(data) };
}

// ---- Clock Out ----
export async function clockOut(): Promise<ActionResult<AttendanceRecord>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!user.attendanceEnabled) return { success: false, error: "Attendance is not enabled" };
  if (!user.employeeId) return { success: false, error: "No employee record found" };

  const supabase = createAdminSupabase();
  const today = new Date().toISOString().slice(0, 10);

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
    .update({ clock_out_at: now, total_minutes: totalMinutes })
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
  const today = new Date().toISOString().slice(0, 10);

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
  const today = new Date().toISOString().slice(0, 10);

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
  };
}
