// Emailing a run's pay slips (payroll engine step 6): a short summary with the
// pay slip attached as a PDF in the org's format. Used by the "Send payslips"
// action, by Mark Paid, and when a RazorpayX payout completes. Plain module —
// NOT "use server" (gotcha #85): raw org ids; callers authorise.
import type { SupabaseClient } from "@supabase/supabase-js";
import { render } from "@react-email/render";
import { resend, FROM_EMAIL } from "@/lib/resend";
import { PayslipReadyEmail } from "@/components/emails/payslip-ready";
import { loadPayslip } from "./payslip-data";
import { renderPayslipDocumentPdf } from "./payslip-pdf";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function monthLabel(month: string) {
  const [y, m] = month.split("-");
  return `${MONTHS[Number(m) - 1] ?? m} ${y}`;
}

async function recordDelivery(sb: SupabaseClient, orgId: string, entryId: string, status: "sent" | "failed", extra: { error?: string; resendId?: string | null }) {
  await sb.from("payslip_deliveries").upsert(
    {
      org_id: orgId,
      payroll_entry_id: entryId,
      channel: "email",
      status,
      error: extra.error ?? null,
      resend_message_id: extra.resendId ?? null,
      sent_at: status === "sent" ? new Date().toISOString() : null,
    },
    { onConflict: "payroll_entry_id,channel" },
  );
}

/**
 * Emails every entry of a processed / paid run. With `onlyUnsent`, entries
 * already delivered by email are skipped (so a payout completing after a
 * manual send doesn't email twice). Each delivery is recorded in
 * payslip_deliveries.
 */
export async function sendRunPayslips(
  sb: SupabaseClient,
  orgId: string,
  runId: string,
  opts: { onlyUnsent?: boolean } = {},
): Promise<{ sent: number; failed: number; skipped: number }> {
  const { data: run } = await sb.from("payroll_runs").select("id, org_id, month, status").eq("id", runId).eq("org_id", orgId).maybeSingle();
  if (!run || (run as { status: string }).status === "draft") return { sent: 0, failed: 0, skipped: 0 };
  const { data: org } = await sb.from("organizations").select("name").eq("id", orgId).single();
  const orgName = (org as { name?: string } | null)?.name?.trim() || "Your employer";
  const month = (run as { month: string }).month;

  const { data: entries } = await sb
    .from("payroll_entries")
    .select("id, employees!employee_id(first_name, last_name, email)")
    .eq("payroll_run_id", runId)
    .eq("org_id", orgId);
  let already = new Set<string>();
  if (opts.onlyUnsent) {
    const ids = ((entries ?? []) as { id: string }[]).map((e) => e.id);
    if (ids.length) {
      const { data: done } = await sb.from("payslip_deliveries").select("payroll_entry_id").in("payroll_entry_id", ids).eq("channel", "email").eq("status", "sent");
      already = new Set(((done ?? []) as { payroll_entry_id: string }[]).map((d) => d.payroll_entry_id));
    }
  }

  let sent = 0, failed = 0, skipped = 0;
  for (const ent of (entries ?? []) as unknown as { id: string; employees: { first_name: string; last_name: string; email: string | null } | null }[]) {
    if (already.has(ent.id)) { skipped++; continue; }
    const email = ent.employees?.email;
    if (!email) {
      await recordDelivery(sb, orgId, ent.id, "failed", { error: "no email on file for employee" });
      failed++;
      continue;
    }
    try {
      const slip = await loadPayslip(sb, orgId, ent.id);
      if (!slip) throw new Error("pay slip not found");
      const pdf = await renderPayslipDocumentPdf(slip.doc, slip.logo);
      const employeeName = `${ent.employees!.first_name} ${ent.employees!.last_name}`.trim();
      const html = await render(PayslipReadyEmail({
        orgName,
        employeeName,
        monthLabel: monthLabel(month),
        grossEarnings: slip.doc.totalEarnings,
        totalDeductions: slip.doc.totalDeductions,
        netPay: slip.doc.netPay,
        viewInAppUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://jambahr.com"}/dashboard/payroll`,
      }));
      const result = await resend.emails.send({
        from: FROM_EMAIL,
        to: email,
        subject: `Your pay slip for ${monthLabel(month)}`,
        html,
        attachments: [{ filename: `payslip-${month}.pdf`, content: pdf }],
      });
      if (result.error) throw new Error(result.error.message);
      await recordDelivery(sb, orgId, ent.id, "sent", { resendId: result.data?.id ?? null });
      sent++;
    } catch (err) {
      await recordDelivery(sb, orgId, ent.id, "failed", { error: err instanceof Error ? err.message : String(err) });
      failed++;
    }
  }
  return { sent, failed, skipped };
}
