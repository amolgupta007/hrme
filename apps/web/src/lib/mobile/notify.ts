// Plain module — NOT "use server" (gotcha #85: secret/PII-touching helpers
// must stay out of "use server" files or they become browser-callable RPCs).
//
// notify() writes the in-app `notifications` row and best-effort fans out a
// push via sendPush(). Both halves swallow errors — this must never be able
// to fail the core action (leave decision, payslip send, doc reminder) that
// calls it.

import { sendPush } from "./push";

export type NotificationType =
  | "leave_decision"
  | "payslip_paid"
  | "doc_ack"
  | "announcement"
  | "approval_pending";

/** Kinds of pending approval that can page an approver (D4 owner/admin). */
export type ApprovalType = "leave" | "regularization" | "ot" | "payroll";

export interface NotifyArgs {
  orgId: string;
  employeeId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export async function notify(supabase: any, args: NotifyArgs): Promise<void> {
  const { orgId, employeeId, type, title, body, data } = args;
  try {
    await supabase.from("notifications").insert({
      org_id: orgId,
      employee_id: employeeId,
      type,
      title,
      body,
      data: data ?? {},
    });
  } catch {
    // Row write failure must not block the push attempt or the caller.
  }

  try {
    // The DB row above stores `type` in its own column; the Expo push
    // payload also needs it inline so a TAPPED notification can deep-link
    // (mobile's `_layout` tap listener reads
    // `response.notification.request.content.data.type`).
    await sendPush(supabase, [employeeId], { title, body, data: { ...(data ?? {}), type } });
  } catch {
    // sendPush already swallows internally; this is defense-in-depth so notify() can never throw.
  }
}

export async function notifyLeaveDecision(
  supabase: any,
  args: { orgId: string; employeeId: string; approved: boolean }
): Promise<void> {
  const { orgId, employeeId, approved } = args;
  await notify(supabase, {
    orgId,
    employeeId,
    type: "leave_decision",
    title: approved ? "Leave approved" : "Leave update",
    body: approved
      ? "Your leave request has been approved."
      : "Your leave request was not approved.",
  });
}

export async function notifyPayslipPaid(
  supabase: any,
  args: { orgId: string; employeeId: string; monthLabel: string }
): Promise<void> {
  const { orgId, employeeId, monthLabel } = args;
  await notify(supabase, {
    orgId,
    employeeId,
    type: "payslip_paid",
    title: "Payslip ready",
    body: `Your payslip for ${monthLabel} is ready to view.`,
  });
}

/**
 * D4 — notify an APPROVER (manager/admin) that a new item is waiting on
 * them: a leave request, a punch regularization, overtime, or a payroll
 * disbursement batch. `data.type` is duplicated alongside the top-level
 * `type` so the mobile tap listener (`_layout.tsx`, which reads
 * `data.type`) can route it — see `routeForNotificationType('approval_pending')`
 * → `/(tabs)/leaves?segment=approvals`.
 */
export async function notifyApprovalPending(
  supabase: any,
  args: {
    orgId: string;
    employeeId: string;
    approvalType: ApprovalType;
    title: string;
    body: string;
  }
): Promise<void> {
  const { orgId, employeeId, approvalType, title, body } = args;
  await notify(supabase, {
    orgId,
    employeeId,
    type: "approval_pending",
    title,
    body,
    data: { type: "approval_pending", approvalType },
  });
}

export async function notifyDocAck(
  supabase: any,
  args: { orgId: string; employeeId: string; docTitle: string }
): Promise<void> {
  const { orgId, employeeId, docTitle } = args;
  await notify(supabase, {
    orgId,
    employeeId,
    type: "doc_ack",
    title: "Action needed",
    body: `${docTitle} needs your acknowledgment.`,
  });
}
