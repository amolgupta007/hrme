import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentUser } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import {
  buildPayslipDetail,
  type PayslipEntryDetailRow,
  type PayslipLineItemRow,
} from "@/lib/mobile/payslips-payload";
import { renderPayslipPdf, type PayslipPdfData } from "@/lib/mobile/payslip-pdf";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Mobile BFF: a server-rendered PDF of ONE payslip entry (Phase D Slice 3,
 * Stage A). Same auth + IDOR + draft guards as the detail route
 * (`../route.ts`) — the entry must belong to BOTH the caller's org AND employee
 * id (service-role bypasses RLS, gotcha #5), else 404; a draft run also 404s.
 * Renders via @react-pdf/renderer (Helvetica-only, WinAnsi-safe glyphs) and
 * streams `application/pdf` as an attachment.
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

  try {
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

    const [{ data: org }, { data: emp }] = await Promise.all([
      supabase.from("organizations").select("name").eq("id", user.orgId).maybeSingle(),
      supabase
        .from("employees")
        .select("first_name, last_name, designation")
        .eq("id", user.employeeId)
        .maybeSingle(),
    ]);

    const empRow = emp as any;
    const employeeName =
      [empRow?.first_name, empRow?.last_name].filter(Boolean).join(" ").trim() || "Employee";

    const data: PayslipPdfData = {
      orgName: (org as any)?.name ?? "Organization",
      employeeName,
      designation: empRow?.designation ?? null,
      detail: buildPayslipDetail(e as PayslipEntryDetailRow, lineItems),
    };

    const pdf = await renderPayslipPdf(data);
    const monthSlug = data.detail.month.replace(/[^0-9a-zA-Z-]/g, "") || "payslip";
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="payslip-${monthSlug}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error(
      "[mobile/payslips/pdf] render failed:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "render_failed" }, { status: 500 });
  }
}
