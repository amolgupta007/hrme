import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentUser } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import {
  istDateOf,
  istToday,
  resolveEffectiveWeekOff,
  type ApprovedLeaveLite,
  type HolidayLite,
  type WeekOffOverride,
  type WeekOffPolicy,
} from "@jambahr/shared";
import {
  buildAttendanceMonthPayload,
  type AttendanceRecordRow,
  type PunchEventRow,
} from "@/lib/mobile/attendance-payload";

export const dynamic = "force-dynamic";

/** Org with no configured week-off policy → sensible Sat/Sun default. */
const DEFAULT_WEEK_OFF: WeekOffPolicy = { week_type: 5, off_days: [0, 6], alt_saturday_rule: "none" };

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toWeekOff(row: any): WeekOffOverride | null {
  if (!row) return null;
  return {
    week_type: row.week_type,
    off_days: row.off_days,
    alt_saturday_rule: (row.alt_saturday_rule as WeekOffOverride["alt_saturday_rule"]) ?? "none",
  };
}

/**
 * Mobile BFF: month attendance calendar for the staff Attendance screen. Runs
 * the pure computeMonthCalendar (Task 2) over the month's records + holidays +
 * approved leaves + effective week-off, and returns per-day punch detail for
 * tap-through.
 */
export async function GET(request: NextRequest) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const user = await getCurrentUser({ orgIdHint: request.headers.get("x-org-id") });
  if (!user) {
    return NextResponse.json({ error: "no_membership" }, { status: 403 });
  }

  const employeeId = user.employeeId;
  const monthParam = new URL(request.url).searchParams.get("month");
  const month = monthParam ?? istToday().slice(0, 7);
  if (!MONTH_RE.test(month)) {
    return NextResponse.json({ error: "invalid_month" }, { status: 400 });
  }

  const [yearStr, monStr] = month.split("-");
  const year = Number(yearStr);
  const mon = Number(monStr); // 1-12
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${pad2(lastDay)}`;
  // IST-day → UTC window for punched_at range.
  const startUtc = new Date(`${monthStart}T00:00:00+05:30`).toISOString();
  const nextMonthStart = new Date(Date.UTC(year, mon, 1)).toISOString().slice(0, 10);
  const endUtc = new Date(`${nextMonthStart}T00:00:00+05:30`).toISOString();

  const supabase = createAdminSupabase();

  // Employee's department (for department week-off override precedence).
  let departmentId: string | null = null;
  if (employeeId) {
    const { data: emp } = await supabase
      .from("employees")
      .select("department_id")
      .eq("id", employeeId)
      .eq("org_id", user.orgId)
      .maybeSingle();
    departmentId = (emp as any)?.department_id ?? null;
  }

  const [
    { data: recordRows },
    { data: punchRows },
    { data: holidayRows },
    { data: leaveRows },
    { data: orgPolicyRow },
    { data: empOverrideRow },
  ] = await Promise.all([
    employeeId
      ? supabase
          .from("attendance_records")
          .select(
            "date, clock_in_at, clock_out_at, worked_minutes, total_minutes, source, auto_closed, out_of_zone_count, shifts(half_day_threshold_minutes)",
          )
          .eq("org_id", user.orgId)
          .eq("employee_id", employeeId)
          .gte("date", monthStart)
          .lte("date", monthEnd)
      : Promise.resolve({ data: [] as any[] }),
    employeeId
      ? supabase
          .from("attendance_punch_events")
          .select("punched_at, status")
          .eq("org_id", user.orgId)
          .eq("employee_id", employeeId)
          .gte("punched_at", startUtc)
          .lt("punched_at", endUtc)
          .order("punched_at", { ascending: true })
      : Promise.resolve({ data: [] as any[] }),
    supabase
      .from("holidays")
      .select("date, name, is_optional")
      .eq("org_id", user.orgId)
      .gte("date", monthStart)
      .lte("date", monthEnd),
    employeeId
      ? supabase
          .from("leave_requests")
          .select("start_date, end_date, days, leave_policies(type)")
          .eq("org_id", user.orgId)
          .eq("employee_id", employeeId)
          .eq("status", "approved")
          .lte("start_date", monthEnd)
          .gte("end_date", monthStart)
      : Promise.resolve({ data: [] as any[] }),
    supabase
      .from("week_off_policy")
      .select("week_type, off_days, alt_saturday_rule")
      .eq("org_id", user.orgId)
      .maybeSingle(),
    employeeId
      ? supabase
          .from("employee_week_off_override")
          .select("week_type, off_days, alt_saturday_rule")
          .eq("org_id", user.orgId)
          .eq("employee_id", employeeId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Department override needs departmentId, resolved above from the employee row.
  let deptOverride: WeekOffOverride | null = null;
  if (departmentId) {
    const { data } = await supabase
      .from("department_week_off_override")
      .select("week_type, off_days, alt_saturday_rule")
      .eq("org_id", user.orgId)
      .eq("department_id", departmentId)
      .maybeSingle();
    deptOverride = toWeekOff(data);
  }

  const orgPolicy = toWeekOff(orgPolicyRow) ?? DEFAULT_WEEK_OFF;
  const empOverride = toWeekOff(empOverrideRow);
  const weekOff = resolveEffectiveWeekOff(orgPolicy, deptOverride, empOverride);

  const records: AttendanceRecordRow[] = ((recordRows as any[]) ?? []).map((r) => ({
    date: r.date,
    clock_in_at: r.clock_in_at ?? null,
    clock_out_at: r.clock_out_at ?? null,
    worked_minutes: r.worked_minutes ?? null,
    total_minutes: r.total_minutes ?? null,
    source: r.source ?? null,
    auto_closed: !!r.auto_closed,
    out_of_zone_count: r.out_of_zone_count ?? 0,
    half_day_threshold_minutes: r.shifts?.half_day_threshold_minutes ?? null,
  }));

  // Group punch events by their IST attendance day (istDateOf(punched_at)).
  const punchEventsByDate: Record<string, PunchEventRow[]> = {};
  for (const p of (punchRows as any[]) ?? []) {
    const key = istDateOf(p.punched_at);
    (punchEventsByDate[key] ??= []).push({ punched_at: p.punched_at, status: p.status ?? null });
  }

  const holidays: HolidayLite[] = ((holidayRows as any[]) ?? []).map((h) => ({
    date: h.date,
    name: h.name,
    is_optional: !!h.is_optional,
  }));

  const approvedLeaves: ApprovedLeaveLite[] = ((leaveRows as any[]) ?? []).map((l) => ({
    start_date: l.start_date,
    end_date: l.end_date,
    days: Number(l.days),
    type: l.leave_policies?.type ?? "leave",
  }));

  const payload = buildAttendanceMonthPayload({
    year,
    month: mon,
    records,
    punchEventsByDate,
    holidays,
    approvedLeaves,
    weekOff,
    todayIst: istToday(),
  });

  return NextResponse.json(payload);
}
