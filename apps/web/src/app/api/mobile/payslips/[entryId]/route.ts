import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentUser } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import {
  buildPayslipDetail,
  type PayslipEntryDetailRow,
  type PayslipLineItemRow,
} from "@/lib/mobile/payslips-payload";

export const dynamic = "force-dynamic";

/**
 * Mobile BFF: full detail for ONE payslip entry, incl. line items.
 *
 * IDOR guard: the entry must belong to BOTH the caller's org AND the caller's
 * employee id, else 404 — enforced in app code (service-role bypasses RLS,
 * gotcha #5). Another employee's or another org's entryId is indistinguishable
 * from a missing one. A draft run's entry also 404s (mirrors the list
 * endpoint's draft exclusion — an admin still editing must not be viewable).
 */
export async function GET(request: NextRequest, ctx: { params: { entryId: string } }) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const user = await getCurrentUser({ orgIdHint: request.headers.get("x-org-id") });
  if (!user) {
    return NextResponse.json({ error: "no_membership" }, { status: 403 });
  }

  const entryId = ctx.params.entryId;
  const supabase = createAdminSupabase();

  const { data: entry } = await supabase
    .from("payroll_entries")
    .select(
      "id, org_id, employee_id, basic_monthly, hra_monthly, special_allowance_monthly, gross_salary, employee_pf, professional_tax, tds, lop_days, lop_deduction, bonus, total_deductions, net_pay, run:payroll_runs!payroll_run_id(id, month, status, paid_at)",
    )
    .eq("id", entryId)
    .maybeSingle();

  const e = entry as any;
  if (
    !e ||
    e.org_id !== user.orgId ||
    !user.employeeId ||
    e.employee_id !== user.employeeId ||
    e.run?.status === "draft"
  ) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: lineItemRows } = await supabase
    .from("payroll_line_items")
    .select("category, note, amount, taxable")
    .eq("org_id", user.orgId)
    .eq("payroll_entry_id", entryId)
    .order("created_at", { ascending: true });

  const lineItems: PayslipLineItemRow[] = ((lineItemRows as any[]) ?? []).map((li) => ({
    category: li.category,
    note: li.note ?? null,
    amount: li.amount,
    taxable: !!li.taxable,
  }));

  return NextResponse.json(buildPayslipDetail(e as PayslipEntryDetailRow, lineItems));
}
