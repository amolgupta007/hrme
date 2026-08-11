import {
  findOverlap,
  computeRemainingDays,
  type LeaveInterval,
} from "@/lib/leaves/validation";
import type {
  MobileLeaveApprovalsResponse,
  MobileLeaveApprovalItem,
} from "@jambahr/shared";

/** Two-letter uppercase initials from a name, defensively handling blanks. */
export function initialsOf(first: string, last: string): string {
  const a = (first ?? "").trim();
  const b = (last ?? "").trim();
  // First+last initials when both exist; otherwise two letters of whichever
  // name is present; "?" when both are blank.
  const combined = b ? (a[0] ?? "") + b[0] : a.slice(0, 2) || b.slice(0, 2);
  return (combined || "?").toUpperCase();
}

/** A pending request in the manager's scope, with the fetched aggregates the
 * builder needs to compute balance-after (route supplies the this-year approved
 * usage for the requester+policy). */
export type PendingApprovalRow = {
  requestId: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  department: string | null;
  isDirectReport: boolean;
  policyName: string;
  type: string;
  startDate: string;
  endDate: string;
  days: number;
  startHalfDay: boolean;
  endHalfDay: boolean;
  reason: string | null;
  daysPerYear: number;
  usedApprovedForPolicy: number;
};

/** An already-approved leave of a scoped employee, used for the team-overlap
 * advisory. Carries the peer's name for surfacing. */
export type PeerApprovedLeave = LeaveInterval & {
  employee_id: string;
  name: string;
};

/**
 * Shapes the manager Approvals segment (hi-fi 2c). Pure — fed the fetched rows
 * so the two derived fields are unit-testable without a DB:
 *
 * - `balanceAfter` = remaining-for-policy (`daysPerYear − usedApproved`, clamped
 *   ≥0 by `computeRemainingDays`) − this request's days. May go negative to
 *   surface an overdraw.
 * - `teamOverlap` = the first approved leave of ANY OTHER scoped employee whose
 *   date range collides with this request (via the shared `findOverlap`), else
 *   null. The requester's own approved leaves are excluded.
 */
export function buildApprovalsPayload(input: {
  pending: PendingApprovalRow[];
  approvedPeers: PeerApprovedLeave[];
  historyCount: number;
}): MobileLeaveApprovalsResponse {
  const requests: MobileLeaveApprovalItem[] = input.pending.map((p) => {
    const remaining = computeRemainingDays({
      daysPerYear: p.daysPerYear,
      usedApproved: p.usedApprovedForPolicy,
    });
    const balanceAfter = remaining - p.days;

    const otherPeers = input.approvedPeers.filter((x) => x.employee_id !== p.employeeId);
    const hit = findOverlap(otherPeers, p.startDate, p.endDate) as PeerApprovedLeave | null;

    return {
      requestId: p.requestId,
      requesterName: `${p.firstName} ${p.lastName}`.trim(),
      requesterInitials: initialsOf(p.firstName, p.lastName),
      department: p.department,
      isDirectReport: p.isDirectReport,
      policyName: p.policyName,
      type: p.type,
      startDate: p.startDate,
      endDate: p.endDate,
      days: p.days,
      startHalfDay: p.startHalfDay,
      endHalfDay: p.endHalfDay,
      balanceAfter,
      policyTotalDays: p.daysPerYear,
      reason: p.reason,
      teamOverlap: hit ? { name: hit.name } : null,
    };
  });
  return { requests, historyCount: input.historyCount };
}
