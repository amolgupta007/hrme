import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentUser, isAdmin, isManagerOrAbove } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getManagerScopedEmployeeIds } from "@/lib/attendance/manager-scope";
import { getDirectReportIds } from "@/lib/managers";
import {
  buildApprovalsPayload,
  type PendingApprovalRow,
  type PeerApprovedLeave,
} from "@/lib/mobile/leave-approvals-payload";
import type { MobileLeaveApprovalsResponse } from "@jambahr/shared";

export const dynamic = "force-dynamic";

const EMPTY: MobileLeaveApprovalsResponse = { requests: [], historyCount: 0 };

/**
 * Mobile BFF: the manager Approvals segment on the Leaves tab. Employees get a
 * 200 with an empty list (the app hides the segment; the endpoint stays
 * non-erroring). Scope = `getManagerScopedEmployeeIds` (department-head members
 * ∪ direct reports) for managers, org-wide for admins; the caller's own
 * requests are excluded (you don't approve your own leave).
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

  // Employees see nothing here — but 200 [] (not 403), the app gates the UI.
  if (!isManagerOrAbove(user.role)) {
    return NextResponse.json(EMPTY);
  }

  const supabase = createAdminSupabase();
  const currentYear = new Date().getFullYear();
  const me = user.employeeId;
  const admin = isAdmin(user.role);

  // Resolve the set of employees this caller may act on.
  let scopeIds: string[] | null = null; // null = org-wide (admin)
  let directReportIds: string[] = [];
  if (admin) {
    directReportIds = me ? await getDirectReportIds(user.orgId, me) : [];
  } else {
    if (!me) return NextResponse.json(EMPTY);
    scopeIds = (await getManagerScopedEmployeeIds(user.orgId, me)).filter((id) => id !== me);
    directReportIds = await getDirectReportIds(user.orgId, me);
    if (scopeIds.length === 0) return NextResponse.json(EMPTY);
  }

  // Pending requests in scope (+ policy + employee/department attribution).
  let pendingQ = supabase
    .from("leave_requests")
    .select(
      "id, employee_id, policy_id, start_date, end_date, days, reason, start_half_day, end_half_day, leave_policies(name, type, days_per_year), employees!employee_id(first_name, last_name, departments!department_id(name))",
    )
    .eq("org_id", user.orgId)
    .eq("status", "pending")
    .order("start_date", { ascending: true });
  if (scopeIds) pendingQ = pendingQ.in("employee_id", scopeIds);
  else if (me) pendingQ = pendingQ.neq("employee_id", me);
  const { data: pendingRows, error: pendingErr } = await pendingQ;
  if (pendingErr) {
    // Don't silently return an empty list — a broken embed/query must be loud.
    console.error("[mobile/leave/approvals] pending query failed:", pendingErr.message);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  // Approved leaves in scope: fuels BOTH the this-year balance aggregation and
  // the cross-employee team-overlap advisory (names carried for surfacing).
  let approvedQ = supabase
    .from("leave_requests")
    .select("employee_id, policy_id, days, start_date, end_date, status, employees!employee_id(first_name, last_name)")
    .eq("org_id", user.orgId)
    .eq("status", "approved");
  if (scopeIds) approvedQ = approvedQ.in("employee_id", scopeIds);
  else if (me) approvedQ = approvedQ.neq("employee_id", me);
  const { data: approvedRows } = await approvedQ;

  // Decided-in-scope count → the "history" link.
  let histQ = supabase
    .from("leave_requests")
    .select("id", { count: "exact", head: true })
    .eq("org_id", user.orgId)
    .in("status", ["approved", "rejected"]);
  if (scopeIds) histQ = histQ.in("employee_id", scopeIds);
  else if (me) histQ = histQ.neq("employee_id", me);
  const { count: historyCount } = await histQ;

  const approvedList = (approvedRows as any[]) ?? [];
  const directReportSet = new Set(directReportIds);

  const yearStart = `${currentYear}-01-01`;
  const yearEnd = `${currentYear}-12-31`;

  const pending: PendingApprovalRow[] = ((pendingRows as any[]) ?? []).map((r) => {
    const usedApprovedForPolicy = approvedList
      .filter(
        (a) =>
          a.employee_id === r.employee_id &&
          a.policy_id === r.policy_id &&
          a.start_date >= yearStart &&
          a.end_date <= yearEnd,
      )
      .reduce((s, a) => s + Number(a.days), 0);

    return {
      requestId: r.id,
      employeeId: r.employee_id,
      firstName: r.employees?.first_name ?? "",
      lastName: r.employees?.last_name ?? "",
      department: r.employees?.departments?.name ?? null,
      isDirectReport: directReportSet.has(r.employee_id),
      policyName: r.leave_policies?.name ?? "Leave",
      type: r.leave_policies?.type ?? "custom",
      startDate: r.start_date,
      endDate: r.end_date,
      days: Number(r.days),
      startHalfDay: !!r.start_half_day,
      endHalfDay: !!r.end_half_day,
      reason: r.reason ?? null,
      daysPerYear: Number(r.leave_policies?.days_per_year ?? 0),
      usedApprovedForPolicy,
    };
  });

  const approvedPeers: PeerApprovedLeave[] = approvedList.map((a) => ({
    employee_id: a.employee_id,
    name: `${a.employees?.first_name ?? ""} ${a.employees?.last_name ?? ""}`.trim(),
    start_date: a.start_date,
    end_date: a.end_date,
    status: "approved",
  }));

  return NextResponse.json(
    buildApprovalsPayload({ pending, approvedPeers, historyCount: historyCount ?? 0 }),
  );
}
