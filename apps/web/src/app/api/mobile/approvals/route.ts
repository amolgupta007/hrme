import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import {
  fetchLeaveApprovals,
  fetchRegularizationApprovals,
  fetchOtApprovals,
  fetchPayrollApprovals,
} from "@/lib/mobile/approvals-sources";
import { buildApprovalsPayload } from "@jambahr/shared";

export const dynamic = "force-dynamic";

/**
 * Mobile BFF: the unified Approvals inbox (Mobile D4 Owner/Admin, Task 3).
 * Merges pending Leave / Regularization / OT / Payroll items into one
 * newest-first feed. Each source is best-effort (never throws — see
 * `approvals-sources.ts`), so one broken source can't blank the inbox.
 * Employees (non-manager) always get an empty inbox — every source
 * short-circuits to `[]` for that role. Payroll is fetched only for admins
 * (and further gated inside the fetcher on RazorpayX being configured).
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

  const [leave, regularization, ot, payroll] = await Promise.all([
    fetchLeaveApprovals(supabase, user),
    fetchRegularizationApprovals(supabase, user),
    fetchOtApprovals(supabase, user),
    isAdmin(user.role) ? fetchPayrollApprovals(supabase, user) : Promise.resolve([]),
  ]);

  return NextResponse.json(buildApprovalsPayload({ leave, regularization, ot, payroll }));
}
