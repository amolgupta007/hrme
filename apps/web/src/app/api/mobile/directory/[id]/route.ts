import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentUser, isManagerOrAbove } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import { istToday } from "@jambahr/shared";
import {
  buildPersonProfile,
  type PersonProfileAttendanceRow,
  type PersonProfileEmployeeRow,
  type PersonProfileLeavePolicyRow,
  type PersonProfileLeaveRequestRow,
} from "@/lib/mobile/person-profile-payload";

export const dynamic = "force-dynamic";

/**
 * Mobile BFF: admin/manager People quick-lookup mini-profile for ONE
 * employee — contact info + today's attendance + leave balance (derived by
 * aggregation) + recent leave requests. View-only, no editing.
 *
 * NEVER returns salary/PAN/Aadhaar/bank/CTC — select lists are deliberately
 * narrow.
 *
 * IDOR guard: the target employee must belong to the caller's org, else 404
 * — enforced in app code (service-role bypasses RLS, gotcha #5). Mirrors the
 * payslip detail route's cross-org 404.
 */
export async function GET(request: NextRequest, ctx: { params: { id: string } }) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const user = await getCurrentUser({ orgIdHint: request.headers.get("x-org-id") });
  if (!user) {
    return NextResponse.json({ error: "no_membership" }, { status: 403 });
  }
  if (!isManagerOrAbove(user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const targetId = ctx.params.id;
  const supabase = createAdminSupabase();

  const { data: employee } = await supabase
    .from("employees")
    .select(
      "id, org_id, first_name, last_name, role, phone, personal_email, whatsapp_opt_in, departments!department_id(name)",
    )
    .eq("id", targetId)
    .maybeSingle();

  const emp = employee as (PersonProfileEmployeeRow & { org_id: string }) | null;
  if (!emp || emp.org_id !== user.orgId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const today = istToday();
  const currentYear = new Date().getFullYear();

  const [{ data: todayRecord }, { data: policies }, { data: leaveRequests }] = await Promise.all([
    supabase
      .from("attendance_records")
      .select("clock_in_at, clock_out_at")
      .eq("org_id", user.orgId)
      .eq("employee_id", targetId)
      .eq("date", today)
      .maybeSingle(),
    supabase
      .from("leave_policies")
      .select("id, type, days_per_year")
      .eq("org_id", user.orgId)
      .order("name"),
    supabase
      .from("leave_requests")
      .select("policy_id, leave_type, status, start_date, days")
      .eq("org_id", user.orgId)
      .eq("employee_id", targetId)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const payload = buildPersonProfile({
    employee: emp,
    todayRecord: (todayRecord as PersonProfileAttendanceRow) ?? null,
    policies: ((policies as PersonProfileLeavePolicyRow[]) ?? []),
    leaveRequests: ((leaveRequests as PersonProfileLeaveRequestRow[]) ?? []),
    currentYear,
  });

  return NextResponse.json(payload);
}
