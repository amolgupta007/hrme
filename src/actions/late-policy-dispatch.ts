"use server";

import { render } from "@react-email/render";
import { createAdminSupabase } from "@/lib/supabase/server";
import { resend, FROM_EMAIL } from "@/lib/resend";
import { resolveProvider, type WhatsAppTemplateKey } from "@/lib/whatsapp";
import { loadProviderConfig } from "@/actions/whatsapp-credentials";
import { LatePunchAlert } from "@/components/emails/late-punch-alert";
import { BonusIneligibleAlert } from "@/components/emails/bonus-ineligible-alert";
import type { NotifyKind } from "@/lib/attendance/late-policy-notify";

type DispatchInput = {
  orgId: string;
  orgName: string;
  attendanceRecordId: string;
  employee: { id: string; name: string; email: string | null; phone: string | null; whatsappOptIn: boolean };
  kinds: NotifyKind[];
  channels: { email: boolean; whatsapp: boolean };
  data: { clockInTime: string; lateMinutes: number; lateDaysThisMonth: number; thresholdDays: number; monthLabel: string };
};

const TEMPLATE_KEY: Record<NotifyKind, WhatsAppTemplateKey> = {
  late: "late_punch_alert",
  warn: "late_warning",
  threshold: "bonus_ineligible_alert",
};

/** Best-effort, idempotent. Never throws into the caller. */
export async function dispatchLateNotifications(input: DispatchInput): Promise<void> {
  const sb = createAdminSupabase();
  const cfg = input.channels.whatsapp ? await loadProviderConfig(input.orgId) : null;
  const provider = resolveProvider(cfg);

  for (const kind of input.kinds) {
    if (input.channels.email && input.employee.email) {
      const already = await sb
        .from("late_punch_notifications")
        .select("id")
        .eq("attendance_record_id", input.attendanceRecordId)
        .eq("kind", kind)
        .eq("channel", "email")
        .maybeSingle();
      if (!already.data) {
        let status: "sent" | "failed" = "sent";
        let error: string | null = null;
        try {
          const html =
            kind === "threshold"
              ? await render(
                  BonusIneligibleAlert({
                    employeeName: input.employee.name,
                    orgName: input.orgName,
                    month: input.data.monthLabel,
                    lateDaysThisMonth: input.data.lateDaysThisMonth,
                    thresholdDays: input.data.thresholdDays,
                  }),
                )
              : await render(
                  LatePunchAlert({
                    employeeName: input.employee.name,
                    orgName: input.orgName,
                    clockInTime: input.data.clockInTime,
                    lateMinutes: input.data.lateMinutes,
                    lateDaysThisMonth: input.data.lateDaysThisMonth,
                    thresholdDays: input.data.thresholdDays,
                  }),
                );
          const subject = kind === "threshold" ? `Bonus eligibility update — ${input.data.monthLabel}` : "Late punch-in recorded";
          const r = await resend.emails.send({ from: FROM_EMAIL, to: input.employee.email, subject, html });
          if ((r as any)?.error) { status = "failed"; error = String((r as any).error?.message ?? "send error"); }
        } catch (e) {
          status = "failed";
          error = e instanceof Error ? e.message : "email failed";
        }
        await sb.from("late_punch_notifications").insert({
          org_id: input.orgId, attendance_record_id: input.attendanceRecordId, employee_id: input.employee.id,
          kind, channel: "email", status, error,
        } as any);
      }
    }

    if (input.channels.whatsapp && provider && input.employee.whatsappOptIn && input.employee.phone) {
      const already = await sb
        .from("late_punch_notifications")
        .select("id")
        .eq("attendance_record_id", input.attendanceRecordId)
        .eq("kind", kind)
        .eq("channel", "whatsapp")
        .maybeSingle();
      if (!already.data) {
        const res = await provider.sendTemplate({
          to: input.employee.phone,
          templateKey: TEMPLATE_KEY[kind],
          variables: {
            name: input.employee.name,
            time: input.data.clockInTime,
            count: String(input.data.lateDaysThisMonth),
            threshold: String(input.data.thresholdDays),
          },
        });
        await sb.from("late_punch_notifications").insert({
          org_id: input.orgId, attendance_record_id: input.attendanceRecordId, employee_id: input.employee.id,
          kind, channel: "whatsapp", status: res.ok ? "sent" : "failed",
          provider: provider.name, provider_message_id: res.providerMessageId ?? null, error: res.ok ? null : res.error ?? null,
        } as any);
      }
    }
  }
}
