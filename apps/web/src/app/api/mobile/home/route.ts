import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentUser, isAdmin, isManagerOrAbove } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getManagerScopedEmployeeIds } from "@/lib/attendance/manager-scope";
import { istToday, type MobileHolidayLite } from "@jambahr/shared";
import {
  buildHomePayload,
  resolvePendingApprovals,
  type AnnouncementRow,
  type LeavePolicyUsage,
  type TodayRecordLite,
} from "@/lib/mobile/home-payload";
import { resolveActiveShift } from "@/lib/mobile/attendance-queries";

export const dynamic = "force-dynamic";

/**
 * Mobile BFF: one composed payload for the staff Home screen — today's
 * attendance status, leave balances (derived by aggregation), the next few
 * holidays, and pending-request counts. No client waterfalls.
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

  const supabase = createAdminSupabase();
  const today = istToday();
  const currentYear = new Date().getFullYear();
  const employeeId = user.employeeId;

  // ── Today status (rollup record + active shift) ───────────────────────────
  const [{ data: todayRecord }, shift] = await Promise.all([
    employeeId
      ? supabase
          .from("attendance_records")
          .select("clock_in_at, clock_out_at, total_minutes")
          .eq("org_id", user.orgId)
          .eq("employee_id", employeeId)
          .eq("date", today)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    employeeId
      ? resolveActiveShift(supabase, user.orgId, employeeId, today)
      : Promise.resolve(null),
  ]);

  // ── Leave balances by aggregation (leave_balances table is stale) ─────────
  const [{ data: policies }, { data: approved }] = await Promise.all([
    supabase
      .from("leave_policies")
      .select("id, name, type, days_per_year")
      .eq("org_id", user.orgId)
      .order("name"),
    employeeId
      ? supabase
          .from("leave_requests")
          .select("policy_id, days")
          .eq("org_id", user.orgId)
          .eq("employee_id", employeeId)
          .eq("status", "approved")
          .gte("start_date", `${currentYear}-01-01`)
          .lte("end_date", `${currentYear}-12-31`)
      : Promise.resolve({ data: [] as { policy_id: string; days: number }[] }),
  ]);

  const usedByPolicy: Record<string, number> = {};
  for (const req of (approved as { policy_id: string; days: number }[] | null) ?? []) {
    usedByPolicy[req.policy_id] = (usedByPolicy[req.policy_id] ?? 0) + Number(req.days);
  }
  const policyUsage: LeavePolicyUsage[] = ((policies as any[]) ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    days_per_year: Number(p.days_per_year),
    used: usedByPolicy[p.id] ?? 0,
  }));

  // ── Next holidays (≤3, today or later) ────────────────────────────────────
  const { data: holidaysData } = await supabase
    .from("holidays")
    .select("date, name, is_optional")
    .eq("org_id", user.orgId)
    .gte("date", today)
    .order("date", { ascending: true })
    .limit(3);
  const holidays: MobileHolidayLite[] = ((holidaysData as any[]) ?? []).map((h) => ({
    date: h.date,
    name: h.name,
    is_optional: !!h.is_optional,
  }));

  // ── Pending counts (own leave requests + own pending regularization punches)
  let pendingLeaveRequests = 0;
  let pendingRegularizations = 0;
  if (employeeId) {
    const [{ count: leaveCount }, { count: regCount }] = await Promise.all([
      supabase
        .from("leave_requests")
        .select("id", { count: "exact", head: true })
        .eq("org_id", user.orgId)
        .eq("employee_id", employeeId)
        .eq("status", "pending"),
      supabase
        .from("attendance_punch_events")
        .select("id", { count: "exact", head: true })
        .eq("org_id", user.orgId)
        .eq("employee_id", employeeId)
        .eq("status", "pending"),
    ]);
    pendingLeaveRequests = leaveCount ?? 0;
    pendingRegularizations = regCount ?? 0;
  }

  // ── "To approve" — leave requests pending the caller's decision. Manager
  // scope mirrors /api/mobile/leave/approvals (dept-head ∪ direct reports,
  // own requests excluded); admin = org-wide minus own. Employees never
  // query this — resolvePendingApprovals returns null and hides the cell.
  let pendingApprovalsRaw = 0;
  if (isManagerOrAbove(user.role)) {
    if (isAdmin(user.role)) {
      let q = supabase
        .from("leave_requests")
        .select("id", { count: "exact", head: true })
        .eq("org_id", user.orgId)
        .eq("status", "pending");
      if (employeeId) q = q.neq("employee_id", employeeId);
      const { count } = await q;
      pendingApprovalsRaw = count ?? 0;
    } else if (employeeId) {
      const scopeIds = (await getManagerScopedEmployeeIds(user.orgId, employeeId)).filter(
        (id) => id !== employeeId,
      );
      if (scopeIds.length > 0) {
        const { count } = await supabase
          .from("leave_requests")
          .select("id", { count: "exact", head: true })
          .eq("org_id", user.orgId)
          .eq("status", "pending")
          .in("employee_id", scopeIds);
        pendingApprovalsRaw = count ?? 0;
      }
    }
  }

  // ── Trainings overdue — cheap single-column-indexed count, no join. Always
  // returned (0 for orgs/employees with none) rather than omitted, per the
  // Task 6b "cheap or omit, never fake" rule — this genuinely is cheap.
  const { count: trainingsOverdueCount } = employeeId
    ? await supabase
        .from("training_enrollments")
        .select("id", { count: "exact", head: true })
        .eq("org_id", user.orgId)
        .eq("employee_id", employeeId)
        .eq("status", "overdue")
    : { count: 0 };

  // ── Announcements — latest ≤3, pinned first then newest (mirrors the
  // dashboard's "Latest announcements" query in src/actions/dashboard.ts).
  const { data: announcementRows } = await supabase
    .from("announcements")
    .select("id, title, body, category, created_at")
    .eq("org_id", user.orgId)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(3);

  // ── Unread notifications (bell badge) — best-effort, never breaks Home. ───
  let unreadNotifications = 0;
  if (employeeId) {
    try {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("org_id", user.orgId)
        .eq("employee_id", employeeId)
        .is("read_at", null);
      unreadNotifications = count ?? 0;
    } catch {
      // Home payload must never fail because of the notifications count.
      unreadNotifications = 0;
    }
  }

  const payload = buildHomePayload({
    record: (todayRecord as TodayRecordLite) ?? null,
    shift,
    policies: policyUsage,
    holidays,
    pendingLeaveRequests,
    pendingRegularizations,
    pendingApprovals: resolvePendingApprovals(isManagerOrAbove(user.role), pendingApprovalsRaw),
    trainingsOverdue: trainingsOverdueCount ?? 0,
    announcements: ((announcementRows as any[] | null) ?? []) as AnnouncementRow[],
    unreadNotifications,
  });

  return NextResponse.json(payload);
}
