"use server";

import { revalidatePath } from "next/cache";
import { waitUntil } from "@vercel/functions";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin, isManagerOrAbove } from "@/lib/current-user";
import { getManagerScopedEmployeeIds } from "@/lib/attendance/manager-scope";
import type { ActionResult } from "@/types";
import { getActiveShiftForEmployee } from "@/actions/shifts";
import { attributedDateForClockIn } from "@/lib/attendance/attribute-date";
import { recomputeAttendanceDay } from "@/lib/attendance/adms-ingest";
import { isTooSoonToClockOut } from "@/lib/attendance/clock-out-guard";
import { computeLateness } from "@/lib/attendance/lateness";
import { resolveCoveredEmployeeIds } from "@/lib/attendance/late-policy-targets";
import { planNotificationKinds } from "@/lib/attendance/late-policy-notify";
import { dispatchLateNotifications } from "@/lib/attendance/late-policy-dispatch";

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
  source: "web" | "device" | "auto_close" | "mobile";
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
  // The rollup row is keyed on the ACTUAL IST calendar date of the punch — the
  // same convention the mobile/ADMS event paths use (recomputeAttendanceDay
  // windows events by their real punched_at). Phase-1 overnight attribution to
  // the prior IST date is preserved as the `attributed_date` METADATA stamped
  // below; the row's `date` follows the event stream. For the rare early-AM
  // overnight web clock-in this makes `date` the actual IST date rather than the
  // prior date — an intentional, documented consequence of unifying web onto the
  // event stream (matching how mobile/ADMS already handle overnight).
  const istToday = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Resolve assigned shift for the IST date; null if none assigned.
  const shift = await getActiveShiftForEmployee(user.employeeId, istToday);
  const attributedDate = attributedDateForClockIn(nowUtc, shift);

  // Idempotency: prevent double clock-in. Read the current rollup for today.
  const { data: existing } = await supabase
    .from("attendance_records")
    .select("clock_in_at, clock_out_at")
    .eq("org_id", user.orgId)
    .eq("employee_id", user.employeeId)
    .eq("date", istToday)
    .maybeSingle();

  if (existing) {
    if ((existing as any).clock_in_at && !(existing as any).clock_out_at) {
      return { success: false, error: "You are already clocked in" };
    }
    if ((existing as any).clock_out_at) {
      return { success: false, error: "You have already completed attendance for today" };
    }
  }

  // Web clockIn is now an EVENT-STREAM writer (like mobile/ADMS): append a
  // neutral 'web' punch event and re-derive the daily rollup via
  // recomputeAttendanceDay, instead of writing attendance_records directly. This
  // removes the last-writer-wins contention with the device/mobile rollup upsert
  // (CLAUDE.md "Known web gaps"; 02A §5.2). location_id is null (web has no site);
  // 'web' events are zone-exempt in computeDailyAttendance so a zone-assigned
  // employee's web punch still counts.
  const { error: insertErr } = await supabase.from("attendance_punch_events").insert({
    org_id: user.orgId,
    employee_id: user.employeeId,
    device_id: null,
    location_id: null,
    punched_at: nowUtc,
    source: "web",
    punch_type: null, // direction is derived (first-in/last-out), never trusted
    status: "approved",
    created_by: user.employeeId,
    raw_payload: { web: true, ip_address: ipAddress ?? null },
    // Cast: generated Supabase types predate migrations 086/102 (status/punch_type/
    // source values) → insert arg infers `never` (gotcha #3). Same idiom as the
    // mobile punch route.
  } as never);
  if (insertErr) return { success: false, error: insertErr.message };

  await recomputeAttendanceDay(supabase, user.orgId, user.employeeId, istToday);

  // recomputeAttendanceDay derives the rollup from events but does NOT carry the
  // web-only side fields: shift_id + attributed_date (used by OT / auto-clockout /
  // reports) and the request IP have no home on attendance_punch_events (no
  // ip_address column — migration 078). Stamp them on the rollup row in one
  // targeted update AFTER recompute. These columns are absent from recompute's
  // upsert payload, so subsequent recomputes retain them.
  const { data, error } = await supabase
    .from("attendance_records")
    .update({
      shift_id: shift?.id ?? null,
      attributed_date: attributedDate,
      ip_address: ipAddress ?? null,
    } as never)
    .eq("org_id", user.orgId)
    .eq("employee_id", user.employeeId)
    .eq("date", istToday)
    .select(`*, employees!employee_id(first_name, last_name)`)
    .single();

  if (error) return { success: false, error: error.message };

  waitUntil(
    evaluateLatePolicyForClockIn({
      orgId: user.orgId,
      employeeId: user.employeeId,
      attendanceRecordId: (data as any).id,
      clockInAtUtc: nowUtc,
      recordDate: istToday,
      shift: shift ? { start_time: shift.start_time, grace_minutes: shift.grace_minutes, is_overnight: shift.is_overnight } : null,
    }).catch((e) => console.error("late-policy eval failed", e)),
  );

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
    .select("clock_in_at, clock_out_at")
    .eq("org_id", user.orgId)
    .eq("employee_id", user.employeeId)
    .eq("date", today)
    .maybeSingle();

  if (!existing || !(existing as any).clock_in_at) {
    return { success: false, error: "You have not clocked in today" };
  }
  if ((existing as any).clock_out_at) {
    return { success: false, error: "You have already clocked out today" };
  }
  // An OUT event within 60s of the IN event (both null-location web punches)
  // would be collapsed by dedupePunches — success-reported but silently no-op'd.
  // Block until the dedupe window has passed (see clock-out-guard.ts).
  if (isTooSoonToClockOut((existing as any).clock_in_at, Date.now())) {
    return { success: false, error: "Please wait a minute before clocking out" };
  }

  const nowUtc = new Date().toISOString();

  // Event-stream writer: append a 'web' out event; recomputeAttendanceDay pairs
  // it with the clock-in event to derive clock_out_at + total_minutes (gross
  // span) — no direct attendance_records write. shift_id / attributed_date / IP
  // stamped at clock-in are retained (absent from recompute's upsert payload).
  const { error: insertErr } = await supabase.from("attendance_punch_events").insert({
    org_id: user.orgId,
    employee_id: user.employeeId,
    device_id: null,
    location_id: null,
    punched_at: nowUtc,
    source: "web",
    punch_type: null,
    status: "approved",
    created_by: user.employeeId,
    raw_payload: { web: true, clock_out: true },
  } as never);
  if (insertErr) return { success: false, error: insertErr.message };

  await recomputeAttendanceDay(supabase, user.orgId, user.employeeId, today);

  const { data, error } = await supabase
    .from("attendance_records")
    .select(`*, employees!employee_id(first_name, last_name)`)
    .eq("org_id", user.orgId)
    .eq("employee_id", user.employeeId)
    .eq("date", today)
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
  } else if (isAdmin(user.role)) {
    // Admins/owners: org-wide, optional single-employee filter.
    if (filters?.employeeId) query = query.eq("employee_id", filters.employeeId);
  } else {
    // Managers: scoped to their reports (dept members ∪ direct reports) ∪ self.
    const scoped = new Set<string>();
    if (user.employeeId) {
      scoped.add(user.employeeId);
      for (const id of await getManagerScopedEmployeeIds(user.orgId, user.employeeId)) {
        scoped.add(id);
      }
    }
    if (filters?.employeeId) {
      if (!scoped.has(filters.employeeId)) return { success: false, error: "Unauthorized" };
      query = query.eq("employee_id", filters.employeeId);
    } else {
      query = query.in("employee_id", [...scoped]);
    }
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

  // Managers see only their reports (dept members ∪ direct reports) ∪ self;
  // admins/owners see the whole org.
  let scopedIds: string[] | null = null;
  if (user.role === "manager") {
    const scoped = new Set<string>();
    if (user.employeeId) {
      scoped.add(user.employeeId);
      for (const id of await getManagerScopedEmployeeIds(user.orgId, user.employeeId)) {
        scoped.add(id);
      }
    }
    scopedIds = [...scoped];
  }

  let employeeCountQuery = supabase
    .from("employees")
    .select("*", { count: "exact", head: true })
    .eq("org_id", user.orgId)
    .eq("status", "active");
  let recordsQuery = supabase
    .from("attendance_records")
    .select(`*, employees!employee_id(first_name, last_name)`)
    .eq("org_id", user.orgId)
    .eq("date", today);
  if (scopedIds !== null) {
    employeeCountQuery = employeeCountQuery.in("id", scopedIds);
    recordsQuery = recordsQuery.in("employee_id", scopedIds);
  }

  const [{ count: totalEmployees }, { data: todayRecords }] = await Promise.all([
    employeeCountQuery,
    recordsQuery,
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
    source: (raw.source ?? "web") as "web" | "device" | "auto_close" | "mobile",
    device_id: raw.device_id ?? null,
    auto_closed: !!raw.auto_closed,
    shift_id: raw.shift_id ?? null,
    attributed_date: raw.attributed_date ?? null,
  };
}

// --- Late policy evaluation (runs after a successful clock-in, via waitUntil) ---
async function evaluateLatePolicyForClockIn(args: {
  orgId: string;
  employeeId: string;
  attendanceRecordId: string;
  clockInAtUtc: string;
  recordDate: string;
  shift: { start_time: string; grace_minutes: number; is_overnight: boolean } | null;
}): Promise<void> {
  const supabase = createAdminSupabase();

  const { data: policy } = await supabase
    .from("late_policies").select("*").eq("org_id", args.orgId).eq("enabled", true).maybeSingle();
  if (!policy) return;
  const p = policy as any;

  const { data: targets } = await supabase
    .from("late_policy_targets").select("target_type, target_id").eq("policy_id", p.id);
  const { data: emps } = await supabase
    .from("employees").select("id, department_id").eq("org_id", args.orgId);
  const covered = resolveCoveredEmployeeIds({ targets: (targets ?? []) as any, employees: (emps ?? []) as any });
  if (!covered.has(args.employeeId)) return;

  const lateness = computeLateness({
    clockInAtUtc: args.clockInAtUtc,
    shift: args.shift,
    fallbackCutoff: p.fallback_cutoff_time,
  });
  if (!lateness.evaluated) return;

  await supabase
    .from("attendance_records")
    .update({ is_late: lateness.isLate, late_minutes: lateness.lateMinutes, late_policy_id: p.id } as any)
    .eq("id", args.attendanceRecordId);

  if (!lateness.isLate) return;

  const month = args.recordDate.slice(0, 7);
  const monthStart = `${month}-01`;
  const { count: newCountRaw } = await supabase
    .from("attendance_records")
    .select("id", { count: "exact", head: true })
    .eq("org_id", args.orgId).eq("employee_id", args.employeeId).eq("is_late", true)
    .gte("date", monthStart).lte("date", args.recordDate);
  const newCount = newCountRaw ?? 1;
  const prevCount = Math.max(0, newCount - 1);

  if (newCount >= p.threshold_days) {
    const { data: existingFlag } = await supabase
      .from("late_policy_flags").select("id, status").eq("org_id", args.orgId)
      .eq("employee_id", args.employeeId).eq("month", month).maybeSingle();
    if (existingFlag) {
      if ((existingFlag as any).status !== "overridden") {
        await supabase.from("late_policy_flags")
          .update({ late_days_count: newCount, updated_at: new Date().toISOString() } as any)
          .eq("id", (existingFlag as any).id);
      }
    } else {
      await supabase.from("late_policy_flags").insert({
        org_id: args.orgId, policy_id: p.id, employee_id: args.employeeId, month,
        late_days_count: newCount, status: "flagged",
      } as any);
    }
  }

  const kinds = planNotificationKinds({
    policy: { threshold_days: p.threshold_days, warn_at: p.warn_at, notify_on_late: p.notify_on_late, notify_on_threshold: p.notify_on_threshold },
    isLate: true, prevCount, newCount,
  });
  if (kinds.length === 0) return;

  const { data: emp } = await supabase
    .from("employees").select("first_name, last_name, email, phone, whatsapp_opt_in").eq("id", args.employeeId).single();
  const { data: org } = await supabase.from("organizations").select("name").eq("id", args.orgId).single();
  const e = emp as any;
  const istTime = new Date(new Date(args.clockInAtUtc).getTime() + 5.5 * 3600 * 1000).toISOString().slice(11, 16);
  const monthLabel = new Date(`${month}-01T00:00:00Z`).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

  await dispatchLateNotifications({
    orgId: args.orgId,
    orgName: (org as any)?.name ?? "your organization",
    attendanceRecordId: args.attendanceRecordId,
    employee: {
      id: args.employeeId, name: `${e.first_name} ${e.last_name}`.trim(),
      email: e.email ?? null, phone: e.phone ?? null, whatsappOptIn: !!e.whatsapp_opt_in,
    },
    kinds,
    channels: { email: p.channel_email, whatsapp: p.channel_whatsapp },
    data: { clockInTime: istTime, lateMinutes: lateness.lateMinutes, lateDaysThisMonth: newCount, thresholdDays: p.threshold_days, monthLabel },
  });
}
