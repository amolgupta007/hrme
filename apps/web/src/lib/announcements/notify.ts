// Plain module — NOT "use server" (gotcha #85): it reads employee emails and
// sends mail/push, so it must never be a browser-callable RPC.
//
// Everything here is best-effort: a failed push or email never fails the
// publish / remind action that called it.

import { sendPush } from "@/lib/mobile/push";
import { resend, FROM_EMAIL } from "@/lib/resend";
import { AnnouncementAckReminderEmail } from "@/components/emails/announcement-ack-reminder";

const APP_URL = "https://jambahr.com";

export function announcementUrl(id: string): string {
  return `${APP_URL}/dashboard/announcements#announcement-${id}`;
}

/** In-app feed rows + one push fan-out for a set of employees. */
export async function notifyAckRequested(
  supabase: any,
  args: { orgId: string; employeeIds: string[]; announcementId: string; title: string; reminder: boolean }
): Promise<void> {
  const { orgId, employeeIds, announcementId, title, reminder } = args;
  if (employeeIds.length === 0) return;
  const heading = reminder ? "Reminder: acknowledgement needed" : "Action needed";
  const body = `Please read and acknowledge “${title}”.`;
  const data = { announcementId };

  try {
    await supabase.from("notifications").insert(
      employeeIds.map((employee_id) => ({
        org_id: orgId,
        employee_id,
        type: "announcement",
        title: heading,
        body,
        data,
      }))
    );
  } catch {
    // Feed write failure must not block the push or the caller.
  }
  try {
    await sendPush(supabase, employeeIds, { title: heading, body, data: { ...data, type: "announcement" } });
  } catch {
    // sendPush swallows internally; defense in depth.
  }
}

export type ReminderRecipient = { id: string; first_name: string | null; email: string | null };

/**
 * Reminder emails via Resend's batch endpoint (≤100 per call) so a whole-org
 * reminder doesn't trip Resend's per-second rate limit. Phone-only employees
 * (no email) simply get the push. Returns how many emails were handed to Resend.
 */
export async function emailAckReminders(args: {
  recipients: ReminderRecipient[];
  orgName: string;
  announcementId: string;
  title: string;
  dueDateLabel: string | null;
  overdue: boolean;
}): Promise<number> {
  if (!process.env.RESEND_API_KEY) return 0;
  const withEmail = args.recipients.filter((r) => !!r.email);
  let sent = 0;
  for (let i = 0; i < withEmail.length; i += 100) {
    const chunk = withEmail.slice(i, i + 100);
    try {
      await resend.batch.send(
        chunk.map((r) => ({
          from: FROM_EMAIL,
          to: r.email!,
          subject: `Action needed: acknowledge “${args.title}”`,
          react: AnnouncementAckReminderEmail({
            employeeName: r.first_name ?? "there",
            orgName: args.orgName,
            announcementTitle: args.title,
            dueDateLabel: args.dueDateLabel,
            overdue: args.overdue,
            announcementUrl: announcementUrl(args.announcementId),
          }),
        }))
      );
      sent += chunk.length;
    } catch (err) {
      console.warn("[announcements] reminder email batch failed", err);
    }
  }
  return sent;
}
