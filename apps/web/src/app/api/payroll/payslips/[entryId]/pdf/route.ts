import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import { canViewPayslip, loadPayslip } from "@/lib/payroll/payslip-data";
import { renderPayslipDocumentPdf } from "@/lib/payroll/payslip-pdf";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Web: one pay slip as a PDF, in the org's pay slip format (October layout,
 * org logo). Admins can download any slip in their org; employees only their
 * own, and never from a draft run. Unknown or not-yours → 404.
 */
export async function GET(_req: Request, ctx: { params: { entryId: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const sb = createAdminSupabase();
  try {
    const slip = await loadPayslip(sb as any, user.orgId, ctx.params.entryId, { employeeId: user.employeeId });
    if (!slip || !canViewPayslip({ isAdmin: isAdmin(user.role), employeeId: user.employeeId }, slip)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const pdf = await renderPayslipDocumentPdf(slip.doc, slip.logo);
    const who = (slip.doc.employeeLeft[0]?.value ?? "employee").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="payslip-${slip.month}-${who}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[payroll/payslips/pdf] render failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "render_failed" }, { status: 500 });
  }
}
