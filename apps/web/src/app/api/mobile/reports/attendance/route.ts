import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import { enumerateDates } from "@/lib/reports/attendance-report";
import { validateRange } from "@/lib/reports/fetch-report-data";
import { fetchAllRows } from "@/lib/mobile/report-fetch";
import { buildAttendanceReport, type ReportAttendanceRow } from "@/lib/mobile/reports-payload";

export const dynamic = "force-dynamic";

/**
 * Mobile BFF: lightweight Owner/Admin attendance summary over a date range
 * (Mobile PRD-02, Phase D4, Task 7) — present % + late count + a per-day
 * breakdown. Admin-only. Deep analysis (per-employee punch detail, PDF/CSV,
 * week-off/holiday/leave-aware day states) stays web-only at
 * /dashboard/attendance → Reports. Range validation (YYYY-MM-DD, from<=to,
 * ≤92 days) is reused verbatim from that surface's `validateRange` so both
 * agree on the cap; the aggregation itself is a fresh, small org-scoped pass
 * (see task-7-report.md) — the PDF matrix's week-off/holiday resolution is
 * more than this summary needs.
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
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const invalid = validateRange(from, to);
  if (invalid) {
    return NextResponse.json({ error: invalid }, { status: 400 });
  }

  const supabase = createAdminSupabase();
  const dates = enumerateDates(from, to);

  const [{ count: activeCount }, records] = await Promise.all([
    supabase
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("org_id", user.orgId)
      .neq("status", "terminated"),
    fetchAllRows<ReportAttendanceRow>((a, b) =>
      supabase
        .from("attendance_records")
        .select("date, employee_id, is_late")
        .eq("org_id", user.orgId)
        .gte("date", from)
        .lte("date", to)
        .order("date")
        .order("employee_id")
        .range(a, b),
    ),
  ]);

  const payload = buildAttendanceReport({
    from,
    to,
    dates,
    activeEmployeeCount: activeCount ?? 0,
    records,
  });

  return NextResponse.json(payload);
}
