import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { resolveMobileUser } from "@/lib/mobile/auth";
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

  const resolved = await resolveMobileUser(request);
  if (!resolved.ok) return resolved.response;
  const user = resolved.user;

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
