import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentUser } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import { buildPayslipList, type PayslipEntryRow } from "@/lib/mobile/payslips-payload";

export const dynamic = "force-dynamic";

/**
 * Mobile BFF: the staff Payslips list. Org + employee scoped, month-descending,
 * draft runs excluded. Built directly in the BFF (NOT via the cookie-bound
 * getMyPayslips) so multi-org mobile users resolve the header-named org.
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

  if (!user.employeeId) {
    return NextResponse.json([]);
  }

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("payroll_entries")
    .select("id, net_pay, run:payroll_runs!payroll_run_id(id, month, status, paid_at)")
    .eq("org_id", user.orgId)
    .eq("employee_id", user.employeeId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows: PayslipEntryRow[] = ((data as any[]) ?? []).map((r) => ({
    id: r.id,
    net_pay: r.net_pay,
    run: r.run ?? null,
  }));

  return NextResponse.json(buildPayslipList(rows));
}
