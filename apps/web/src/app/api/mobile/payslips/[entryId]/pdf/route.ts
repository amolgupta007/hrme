import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { resolveMobileUser } from "@/lib/mobile/auth";
import { createAdminSupabase } from "@/lib/supabase/server";
import { loadPayslip } from "@/lib/payroll/payslip-data";
import { renderPayslipDocumentPdf } from "@/lib/payroll/payslip-pdf";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Mobile BFF: a server-rendered PDF of ONE payslip entry (Phase D Slice 3,
 * Stage A). Same auth + IDOR + draft guards as the detail route
 * (`../route.ts`) — the entry must belong to BOTH the caller's org AND employee
 * id (service-role bypasses RLS, gotcha #5), else 404; a draft run also 404s.
 * Renders the org's pay slip format (payroll engine step 6 — the same
 * PayslipDocument + renderer as the web download) and streams
 * `application/pdf` as an attachment.
 */
export async function GET(request: NextRequest, ctx: { params: { entryId: string } }) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const resolved = await resolveMobileUser(request);
  if (!resolved.ok) return resolved.response;
  const user = resolved.user;

  const entryId = ctx.params.entryId;
  const supabase = createAdminSupabase();

  try {
    // Same model + renderer as the web download (org pay slip format, logo).
    const slip = await loadPayslip(supabase as any, user.orgId, entryId, { employeeId: user.employeeId });
    // Mobile is self-service only: the entry must be the caller's own, never a draft.
    if (!slip || !user.employeeId || slip.employeeId !== user.employeeId || slip.runStatus === "draft") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const pdf = await renderPayslipDocumentPdf(slip.doc, slip.logo);
    const monthSlug = slip.month.replace(/[^0-9a-zA-Z-]/g, "") || "payslip";
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
