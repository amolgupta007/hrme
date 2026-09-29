// Plain module — NOT "use server" (gotcha #85). Pure announcement-audience and
// acknowledgement-status logic, shared by the server actions and the UI.

import { resolveCoveredEmployeeIds } from "@/lib/attendance/late-policy-targets";

export type AudienceType = "all" | "targeted";
export type AudienceTarget = { target_type: "department" | "employee"; target_id: string };
export type AudienceEmployee = { id: string; department_id: string | null; status: string };

/** Statuses that take someone out of an announcement's audience. */
const LEFT_STATUSES = new Set(["terminated", "inactive"]);

export function hasLeft(status: string): boolean {
  return LEFT_STATUSES.has(status);
}

/** Who an announcement is addressed to right now. */
export function resolveAudienceIds(params: {
  audienceType: AudienceType;
  targets: AudienceTarget[];
  employees: AudienceEmployee[];
}): Set<string> {
  const current = params.employees.filter((e) => !hasLeft(e.status));
  if (params.audienceType === "all") return new Set(current.map((e) => e.id));
  return resolveCoveredEmployeeIds({ targets: params.targets, employees: current });
}

/** Strictly after the due date, by IST calendar day. */
export function isOverdue(dueDate: string | null, todayIst: string): boolean {
  return !!dueDate && todayIst > dueDate;
}

export type AckState = "acknowledged" | "pending" | "overdue" | "left";

export type AckStatusRow = {
  employeeId: string;
  state: AckState;
  /** When they acknowledged a version that satisfies ack_version, if they have. */
  acknowledgedAt: string | null;
};

export type AckTotals = {
  /** Recipients still with the org — the denominator. */
  total: number;
  acknowledged: number;
  /** Includes overdue. */
  pending: number;
  overdue: number;
  left: number;
};

export function computeAckStatus(params: {
  recipients: Array<{ employee_id: string }>;
  acks: Array<{ employee_id: string; version: number; acknowledged_at: string }>;
  employees: AudienceEmployee[];
  ackVersion: number;
  dueDate: string | null;
  todayIst: string;
}): { rows: AckStatusRow[]; totals: AckTotals } {
  const statusById = new Map(params.employees.map((e) => [e.id, e.status]));
  const ackedAt = new Map<string, string>();
  for (const a of params.acks) {
    // An ack records the content version the employee read. Any version at or
    // after ack_version satisfies it — a "minor edit" bumps content_version
    // without moving ack_version, so earlier acks keep counting.
    if (a.version < params.ackVersion) continue;
    const prev = ackedAt.get(a.employee_id);
    if (!prev || a.acknowledged_at > prev) ackedAt.set(a.employee_id, a.acknowledged_at);
  }
  const overdue = isOverdue(params.dueDate, params.todayIst);

  const totals: AckTotals = { total: 0, acknowledged: 0, pending: 0, overdue: 0, left: 0 };
  const rows = params.recipients.map(({ employee_id }) => {
    const acknowledgedAt = ackedAt.get(employee_id) ?? null;
    const status = statusById.get(employee_id);
    let state: AckState;
    if (!status || hasLeft(status)) {
      state = "left";
      totals.left++;
    } else {
      totals.total++;
      if (acknowledgedAt) {
        state = "acknowledged";
        totals.acknowledged++;
      } else {
        totals.pending++;
        state = overdue ? "overdue" : "pending";
        if (overdue) totals.overdue++;
      }
    }
    return { employeeId: employee_id, state, acknowledgedAt };
  });
  return { rows, totals };
}

/** Current audience members missing from the publish-time snapshot. */
export function findLateJoiners(audience: Set<string>, recipientIds: string[]): string[] {
  const snapshot = new Set(recipientIds);
  return [...audience].filter((id) => !snapshot.has(id));
}

export const REMIND_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function canRemind(lastRemindedAt: string | null, now: Date = new Date()): boolean {
  if (!lastRemindedAt) return true;
  return now.getTime() - new Date(lastRemindedAt).getTime() >= REMIND_COOLDOWN_MS;
}

export function splitRemindable(
  recipients: Array<{ employee_id: string; last_reminded_at: string | null }>,
  now: Date = new Date()
): { remind: string[]; cooldown: string[] } {
  const remind: string[] = [];
  const cooldown: string[] = [];
  for (const r of recipients) (canRemind(r.last_reminded_at, now) ? remind : cooldown).push(r.employee_id);
  return { remind, cooldown };
}

export function isContentChanged(
  prev: { title: string; body: string },
  next: { title: string; body: string }
): boolean {
  return prev.title.trim() !== next.title.trim() || prev.body.trim() !== next.body.trim();
}

/**
 * Can this viewer see this announcement? Admins see everything. Everyone else
 * sees "all" announcements, targeted ones they currently fall inside, and any
 * they are a snapshot recipient of (so a department move never hides an
 * announcement someone still has to acknowledge).
 */
export function isVisibleTo(params: {
  isAdmin: boolean;
  audienceType: AudienceType;
  targets: AudienceTarget[];
  viewer: { id: string | null; department_id: string | null };
  isRecipient: boolean;
}): boolean {
  if (params.isAdmin || params.audienceType === "all" || params.isRecipient) return true;
  const { id, department_id } = params.viewer;
  if (!id) return false;
  return params.targets.some(
    (t) =>
      (t.target_type === "employee" && t.target_id === id) ||
      (t.target_type === "department" && !!department_id && t.target_id === department_id)
  );
}
