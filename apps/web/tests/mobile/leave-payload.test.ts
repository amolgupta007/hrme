import { describe, it, expect } from "vitest";
import { buildLeavePayload, type RawLeaveRequestRow } from "@/lib/mobile/leave-payload";
import {
  buildApprovalsPayload,
  initialsOf,
  type PendingApprovalRow,
  type PeerApprovedLeave,
} from "@/lib/mobile/leave-approvals-payload";
import type { LeavePolicyUsage } from "@/lib/mobile/home-payload";

// ── buildLeavePayload ─────────────────────────────────────────────────────────

describe("buildLeavePayload", () => {
  const policies: LeavePolicyUsage[] = [
    { id: "p1", name: "Annual Leave", type: "paid", days_per_year: 21, used: 2.5 },
    { id: "p2", name: "Sick Leave", type: "sick", days_per_year: 10, used: 0 },
  ];

  it("derives balances (total/used/remaining) from policy usage", () => {
    const out = buildLeavePayload({ policies, requests: [] });
    expect(out.balances).toEqual([
      { policyId: "p1", name: "Annual Leave", type: "paid", total: 21, used: 2.5, remaining: 18.5 },
      { policyId: "p2", name: "Sick Leave", type: "sick", total: 10, used: 0, remaining: 10 },
    ]);
    expect(out.myRequests).toEqual([]);
  });

  it("maps request rows incl. half-day flags and approver attribution", () => {
    const requests: RawLeaveRequestRow[] = [
      {
        id: "lr-1",
        start_date: "2026-08-20",
        end_date: "2026-08-21",
        days: "1.5",
        status: "approved",
        reason: "trip",
        start_half_day: false,
        end_half_day: true,
        reviewed_at: "2026-08-15T10:00:00Z",
        policyName: "Annual Leave",
        type: "paid",
        approverName: "Meera Rao",
      },
    ];
    const out = buildLeavePayload({ policies, requests });
    expect(out.myRequests[0]).toEqual({
      id: "lr-1",
      policyName: "Annual Leave",
      type: "paid",
      startDate: "2026-08-20",
      endDate: "2026-08-21",
      days: 1.5,
      startHalfDay: false,
      endHalfDay: true,
      status: "approved",
      reason: "trip",
      approverName: "Meera Rao",
      decidedAt: "2026-08-15T10:00:00Z",
    });
  });

  it("gracefully nulls approverName/decidedAt for an undecided (pending) request", () => {
    const requests: RawLeaveRequestRow[] = [
      {
        id: "lr-2",
        start_date: "2026-09-01",
        end_date: "2026-09-01",
        days: 1,
        status: "pending",
        reason: null,
        start_half_day: null,
        end_half_day: null,
        reviewed_at: null,
        policyName: "Sick Leave",
        type: "sick",
        approverName: null,
      },
    ];
    const out = buildLeavePayload({ policies, requests });
    expect(out.myRequests[0].approverName).toBeNull();
    expect(out.myRequests[0].decidedAt).toBeNull();
    expect(out.myRequests[0].startHalfDay).toBe(false);
  });
});

// ── buildApprovalsPayload ─────────────────────────────────────────────────────

function pending(overrides: Partial<PendingApprovalRow> = {}): PendingApprovalRow {
  return {
    requestId: "req-1",
    employeeId: "emp-2",
    firstName: "Ravi",
    lastName: "Kumar",
    department: "Sales",
    isDirectReport: true,
    policyName: "Annual Leave",
    type: "paid",
    startDate: "2026-08-20",
    endDate: "2026-08-22",
    days: 3,
    startHalfDay: false,
    endHalfDay: false,
    reason: "family",
    daysPerYear: 21,
    usedApprovedForPolicy: 5,
    ...overrides,
  };
}

describe("initialsOf", () => {
  it("builds two-letter uppercase initials", () => {
    expect(initialsOf("Ravi", "Kumar")).toBe("RK");
  });
  it("falls back to the first name when last is blank", () => {
    expect(initialsOf("Ravi", "")).toBe("RA");
  });
  it("returns '?' when the name is empty", () => {
    expect(initialsOf("", "")).toBe("?");
  });
});

describe("buildApprovalsPayload — balanceAfter", () => {
  it("computes remaining (daysPerYear − usedApproved) minus this request's days", () => {
    const out = buildApprovalsPayload({
      pending: [pending()],
      approvedPeers: [],
      historyCount: 0,
    });
    // remaining = 21 − 5 = 16; balanceAfter = 16 − 3 = 13
    expect(out.requests[0].balanceAfter).toBe(13);
    expect(out.requests[0].requesterInitials).toBe("RK");
    expect(out.requests[0].department).toBe("Sales");
    expect(out.historyCount).toBe(0);
  });

  it("goes negative to surface an overdraw", () => {
    const out = buildApprovalsPayload({
      pending: [pending({ usedApprovedForPolicy: 20, days: 3 })],
      approvedPeers: [],
      historyCount: 0,
    });
    // remaining = max(0, 21 − 20) = 1; balanceAfter = 1 − 3 = −2
    expect(out.requests[0].balanceAfter).toBe(-2);
  });
});

describe("buildApprovalsPayload — teamOverlap", () => {
  it("flags an overlapping approved leave of ANOTHER scoped employee", () => {
    const peers: PeerApprovedLeave[] = [
      { employee_id: "emp-3", name: "Sara Iyer", start_date: "2026-08-21", end_date: "2026-08-25", status: "approved" },
    ];
    const out = buildApprovalsPayload({ pending: [pending()], approvedPeers: peers, historyCount: 2 });
    expect(out.requests[0].teamOverlap).toEqual({ name: "Sara Iyer" });
    expect(out.historyCount).toBe(2);
  });

  it("ignores the requester's OWN approved leaves (no self-overlap)", () => {
    const peers: PeerApprovedLeave[] = [
      { employee_id: "emp-2", name: "Ravi Kumar", start_date: "2026-08-20", end_date: "2026-08-22", status: "approved" },
    ];
    const out = buildApprovalsPayload({ pending: [pending()], approvedPeers: peers, historyCount: 0 });
    expect(out.requests[0].teamOverlap).toBeNull();
  });

  it("returns null when no peer leave overlaps the date range", () => {
    const peers: PeerApprovedLeave[] = [
      { employee_id: "emp-3", name: "Sara Iyer", start_date: "2026-09-10", end_date: "2026-09-12", status: "approved" },
    ];
    const out = buildApprovalsPayload({ pending: [pending()], approvedPeers: peers, historyCount: 0 });
    expect(out.requests[0].teamOverlap).toBeNull();
  });
});
