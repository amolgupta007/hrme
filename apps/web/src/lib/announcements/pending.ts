// Plain module — NOT "use server" (gotcha #85). It takes a raw org id, so
// exporting it from a server-action file would let any browser read any
// tenant's pending acknowledgements.

import { createAdminSupabase } from "@/lib/supabase/server";
import { istTodayDate } from "@/lib/attendance/manual-punch-validation";
import { isOverdue } from "@/lib/announcements/ack-status";

export type PendingAck = {
  id: string;
  title: string;
  ack_due_date: string | null;
  overdue: boolean;
};

/**
 * Outstanding acknowledgements for one employee. Takes a raw org + employee
 * id, so it must only ever be called with ids the caller resolved via
 * getCurrentUser — never from a "use server" export.
 */
export async function loadPendingAcksFor(orgId: string, employeeId: string): Promise<PendingAck[]> {
  const supabase = createAdminSupabase();
  const { data: mine } = await supabase
    .from("announcement_recipients")
    .select("announcement_id")
    .eq("org_id", orgId)
    .eq("employee_id", employeeId);
  const ids = ((mine ?? []) as Array<{ announcement_id: string }>).map((r) => r.announcement_id);
  if (!ids.length) return [];

  const [{ data: anns }, { data: acks }] = await Promise.all([
    supabase
      .from("announcements")
      .select("id, title, ack_due_date, ack_version, created_at")
      .eq("org_id", orgId)
      .eq("ack_required", true)
      .is("archived_at", null)
      .in("id", ids),
    supabase
      .from("announcement_acknowledgements")
      .select("announcement_id, version")
      .eq("org_id", orgId)
      .eq("employee_id", employeeId)
      .in("announcement_id", ids),
  ]);

  const todayIst = istTodayDate();
  const ackRows = (acks ?? []) as Array<{ announcement_id: string; version: number }>;
  return ((anns ?? []) as any[])
    .filter((a) => !ackRows.some((k) => k.announcement_id === a.id && k.version >= a.ack_version))
    .sort((a, b) => {
      // Soonest due first; undated after dated; then newest.
      if (a.ack_due_date && b.ack_due_date) return a.ack_due_date.localeCompare(b.ack_due_date);
      if (a.ack_due_date) return -1;
      if (b.ack_due_date) return 1;
      return b.created_at.localeCompare(a.created_at);
    })
    .map((a) => ({
      id: a.id,
      title: a.title,
      ack_due_date: a.ack_due_date,
      overdue: isOverdue(a.ack_due_date, todayIst),
    }));
}
