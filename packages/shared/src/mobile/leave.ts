/**
 * Mobile BFF DTOs for the Staff MVP Leave screens (Mobile PRD-02, Phase D
 * Slice 2, Task 3). The mobile app and the `/api/mobile/leave*` route handlers
 * both import from here — these types are the wire contract.
 *
 * Types only. No runtime logic (Zod body validation + payload shaping live
 * web-side in apps/web/src/lib/mobile/leave-*.ts). See
 * docs/superpowers/plans/2026-08-10-mobile-phase-d-slice2.md.
 */
import type { MobileLeaveBalance } from "./types";

/**
 * One row in the staff member's own leave history (hi-fi 2b).
 *
 * `approverName` comes from `leave_requests.reviewed_by` joined to employees;
 * the decide paths now populate `reviewed_by`, so it is nullable only because
 * pending requests have no decider yet. `decidedAt` (from `reviewed_at`) is the
 * reliable "when decided" signal; render the approver name only when present.
 */
export type MobileLeaveRequestItem = {
  id: string;
  policyName: string;
  type: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  days: number;
  startHalfDay: boolean;
  endHalfDay: boolean;
  status: string; // pending | approved | rejected | cancelled
  reason: string | null;
  approverName: string | null;
  decidedAt: string | null; // ISO 8601, from reviewed_at
};

/**
 * GET /api/mobile/leave — the staff Leaves-tab payload: balances (derived by
 * aggregation, viewer-scoped) + the caller's own requests (reverse-chron, ≤50).
 */
export type MobileLeaveResponse = {
  balances: MobileLeaveBalance[];
  myRequests: MobileLeaveRequestItem[];
};

/** POST /api/mobile/leave/apply success response. */
export type MobileApplyLeaveResponse = { id: string };

/** POST /api/mobile/leave/cancel + /decide success response. */
export type MobileLeaveOkResponse = { ok: true };

/**
 * One pending request awaiting the manager's decision (hi-fi 2c). Enriched for
 * the approver's screen: department + reports-to attribution, the requester's
 * balance AFTER this request is granted, and a team-overlap advisory (does the
 * date range collide with an already-approved leave of another scoped peer).
 */
export type MobileLeaveApprovalItem = {
  requestId: string;
  requesterName: string;
  requesterInitials: string;
  department: string | null;
  isDirectReport: boolean;
  policyName: string;
  type: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  days: number;
  startHalfDay: boolean;
  endHalfDay: boolean;
  /** Requester's remaining for this policy MINUS this request's days (may be negative → overdraw). */
  balanceAfter: number;
  reason: string | null;
  /** First already-approved-leave collision among the manager's OTHER scoped employees, else null. */
  teamOverlap: { name: string } | null;
};

/**
 * GET /api/mobile/leave/approvals — pending decisions in the manager's scope +
 * the count of already-decided requests in scope (drives the "history" link).
 */
export type MobileLeaveApprovalsResponse = {
  requests: MobileLeaveApprovalItem[];
  historyCount: number;
};
