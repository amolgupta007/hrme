"use server";

// One pay slip for on-screen viewing — the same PayslipDocument the PDF and
// the email render (payroll engine step 6). Admins can view any slip in their
// org; employees only their own, never from a draft run.

import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import { canViewPayslip, loadPayslip } from "@/lib/payroll/payslip-data";
import type { PayslipDocument } from "@jambahr/shared/payroll/payslip";
import type { ActionResult } from "@/types";

export interface PayslipView {
  doc: PayslipDocument;
  /** data: URL of the org logo, or null. */
  logo: string | null;
  month: string;
  runStatus: string;
}

export async function getPayslipView(entryId: string): Promise<ActionResult<PayslipView>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (typeof entryId !== "string" || !/^[0-9a-f-]{36}$/i.test(entryId)) return { success: false, error: "Pay slip not found" };
  try {
    const slip = await loadPayslip(createAdminSupabase() as any, user.orgId, entryId);
    if (!slip || !canViewPayslip({ isAdmin: isAdmin(user.role), employeeId: user.employeeId }, slip)) {
      return { success: false, error: "Pay slip not found" };
    }
    const logo = slip.logo
      ? `data:image/${slip.logo.format === "jpg" ? "jpeg" : "png"};base64,${slip.logo.data.toString("base64")}`
      : null;
    return { success: true, data: { doc: slip.doc, logo, month: slip.month, runStatus: slip.runStatus } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Could not load the pay slip" };
  }
}
