import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import { validateRange } from "@/lib/reports/fetch-report-data";
import { fetchAllRows } from "@/lib/mobile/report-fetch";
import { buildLeaveReport, type ReportLeaveRow } from "@/lib/mobile/reports-payload";

export const dynamic = "force-dynamic";

/**
 * Mobile BFF: lightweight Owner/Admin leave summary over a date range
 * (Mobile PRD-02, Phase D4, Task 7) — total approved leave days + a
 * per-type breakdown. Admin-only. Range validation (YYYY-MM-DD, from<=to,
 * ≤92 days) is reused verbatim from `src/lib/reports/fetch-report-data.ts`
 * so this endpoint agrees with both the web Reports tab and the sibling
 * attendance-summary endpoint on the cap.
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

  // Approved leave overlapping the range (same overlap filter as the web
  // Reports fetch: start_date <= to AND end_date >= from). Paginated in case
  // a large org has a heavy request history within the window.
  const approvedLeaves = await fetchAllRows<ReportLeaveRow>((a, b) =>
    supabase
      .from("leave_requests")
      .select("leave_type, days")
      .eq("org_id", user.orgId)
      .eq("status", "approved")
      .lte("start_date", to)
      .gte("end_date", from)
      .order("id")
      .range(a, b),
  );

  const payload = buildLeaveReport({ from, to, approvedLeaves });
  return NextResponse.json(payload);
}
