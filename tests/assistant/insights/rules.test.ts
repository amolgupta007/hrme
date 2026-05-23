import { describe, it, expect } from "vitest";
import type { InsightContext } from "@/lib/assistant/insights/types";
import { leavePendingApprovals } from "@/lib/assistant/insights/rules/leave-pending-approvals";
import { leaveConcentration } from "@/lib/assistant/insights/rules/leave-concentration";
import { leaveBalanceExpiry } from "@/lib/assistant/insights/rules/leave-balance-expiry";
import { trainingOverdue } from "@/lib/assistant/insights/rules/training-overdue";
import { docsUnacknowledged } from "@/lib/assistant/insights/rules/docs-unacknowledged";
import { newJoiners } from "@/lib/assistant/insights/rules/new-joiners";
import { probationWindow } from "@/lib/assistant/insights/rules/probation-window";
import { reviewCycleIncomplete } from "@/lib/assistant/insights/rules/review-cycle-incomplete";
import { grievancesUrgent } from "@/lib/assistant/insights/rules/grievances-urgent";
import { hiringStalled } from "@/lib/assistant/insights/rules/hiring-stalled";
import { attendanceAnomalies } from "@/lib/assistant/insights/rules/attendance-anomalies";

const ctx = (today: string): InsightContext => ({
  orgId: "o1", plan: "growth", today: new Date(today),
  flags: { jambaHireEnabled: false, attendanceEnabled: false, grievancesEnabled: false },
});

describe("leave_pending_approvals", () => {
  it("flags requests older than 3 days", () => {
    const out = leavePendingApprovals.evaluate(
      [{ id: "1", created_at: "2026-05-10T00:00:00Z" }, { id: "2", created_at: "2026-05-21T00:00:00Z" }],
      ctx("2026-05-22T00:00:00Z"));
    expect(out?.metricCount).toBe(1);
  });
  it("returns null when none are aging", () => {
    expect(leavePendingApprovals.evaluate([{ id: "2", created_at: "2026-05-21T00:00:00Z" }], ctx("2026-05-22T00:00:00Z"))).toBeNull();
  });
});

describe("leave_concentration", () => {
  it("flags when a department has 3+ overlapping leaves", () => {
    const out = leaveConcentration.evaluate({
      leaves: [
        { employee_id: "a", start_date: "2026-05-23", end_date: "2026-05-25" },
        { employee_id: "b", start_date: "2026-05-24", end_date: "2026-05-26" },
        { employee_id: "c", start_date: "2026-05-23", end_date: "2026-05-24" },
      ],
      deptByEmployee: { a: "eng", b: "eng", c: "eng" },
    }, ctx("2026-05-22T00:00:00Z"));
    expect(out?.metricCount).toBe(3);
  });
  it("returns null below the threshold", () => {
    const out = leaveConcentration.evaluate({
      leaves: [{ employee_id: "a", start_date: "2026-05-23", end_date: "2026-05-25" }],
      deptByEmployee: { a: "eng" },
    }, ctx("2026-05-22T00:00:00Z"));
    expect(out).toBeNull();
  });
  it("skips employees with no department", () => {
    const out = leaveConcentration.evaluate({
      leaves: [
        { employee_id: "a", start_date: "2026-05-23", end_date: "2026-05-25" },
        { employee_id: "b", start_date: "2026-05-23", end_date: "2026-05-25" },
        { employee_id: "c", start_date: "2026-05-23", end_date: "2026-05-25" },
      ],
      deptByEmployee: { a: null, b: null, c: null },
    }, ctx("2026-05-22T00:00:00Z"));
    expect(out).toBeNull();
  });
});

describe("leave_balance_expiry", () => {
  const balances = [
    { employee_id: "a", total_days: 18, used_days: 5, carried_forward_days: 0 }, // 13 remaining
    { employee_id: "b", total_days: 8, used_days: 6, carried_forward_days: 0 },  // 2 remaining
  ];
  it("fires inside the year-end window", () => {
    const out = leaveBalanceExpiry.evaluate(balances, ctx("2026-12-01T00:00:00Z"));
    expect(out?.metricCount).toBe(1);
  });
  it("is silent outside the window", () => {
    expect(leaveBalanceExpiry.evaluate(balances, ctx("2026-05-22T00:00:00Z"))).toBeNull();
  });
  it("fires on the inclusive window-start boundary (Nov 16 for 45-day window)", () => {
    expect(leaveBalanceExpiry.evaluate(balances, ctx("2026-11-16T00:00:00Z"))?.metricCount).toBe(1);
  });
  it("fires on Dec 31 (inclusive year-end)", () => {
    expect(leaveBalanceExpiry.evaluate(balances, ctx("2026-12-31T00:00:00Z"))?.metricCount).toBe(1);
  });
});

describe("training_overdue", () => {
  it("flags when there are overdue enrollments", () => {
    expect(trainingOverdue.evaluate([{ id: "1" }, { id: "2" }], ctx("2026-05-22T00:00:00Z"))?.metricCount).toBe(2);
  });
  it("returns null when none overdue", () => {
    expect(trainingOverdue.evaluate([], ctx("2026-05-22T00:00:00Z"))).toBeNull();
  });
});

describe("docs_unacknowledged", () => {
  it("counts missing (doc, employee) pairs", () => {
    const out = docsUnacknowledged.evaluate({
      requiredDocIds: ["d1"],
      acksByDoc: { d1: new Set(["e1"]) },
      activeEmployeeIds: ["e1", "e2", "e3"],
    }, ctx("2026-05-22T00:00:00Z"));
    expect(out?.metricCount).toBe(2);
  });
  it("returns null when fully acknowledged", () => {
    const out = docsUnacknowledged.evaluate({
      requiredDocIds: ["d1"], acksByDoc: { d1: new Set(["e1"]) }, activeEmployeeIds: ["e1"],
    }, ctx("2026-05-22T00:00:00Z"));
    expect(out).toBeNull();
  });
  it("returns null when there are no required docs", () => {
    expect(docsUnacknowledged.evaluate({ requiredDocIds: [], acksByDoc: {}, activeEmployeeIds: ["e1"] })).toBeNull();
  });
});

describe("new_joiners", () => {
  it("counts joiners in the window", () => {
    expect(newJoiners.evaluate([{ id: "a", date_of_joining: "2026-05-20" }], ctx("2026-05-22T00:00:00Z"))?.metricCount).toBe(1);
  });
  it("returns null with no joiners", () => expect(newJoiners.evaluate([], ctx("2026-05-22T00:00:00Z"))).toBeNull());
});

describe("probation_window", () => {
  it("flags an employee hitting 90 days within a week", () => {
    // joined 2026-02-24 → +90d ≈ 2026-05-25, within a week of 2026-05-22
    const out = probationWindow.evaluate([{ id: "a", date_of_joining: "2026-02-24" }], ctx("2026-05-22T00:00:00Z"));
    expect(out?.metricCount).toBe(1);
  });
  it("ignores employees far from probation end", () => {
    expect(probationWindow.evaluate([{ id: "a", date_of_joining: "2026-05-01" }], ctx("2026-05-22T00:00:00Z"))).toBeNull();
  });
  it("fires when probation ends exactly today", () => {
    // joined 2026-02-21 → +90d = 2026-05-22
    expect(probationWindow.evaluate([{ id: "a", date_of_joining: "2026-02-21" }], ctx("2026-05-22T00:00:00Z"))?.metricCount).toBe(1);
  });
});

describe("review_cycle_incomplete", () => {
  it("flags an incomplete cycle ending this week", () => {
    const out = reviewCycleIncomplete.evaluate(
      { cycles: [{ id: "c1", end_date: "2026-05-26" }], incompleteByCycle: { c1: 4 } },
      ctx("2026-05-22T00:00:00Z"));
    expect(out?.metricCount).toBe(4);
  });
  it("returns null when the cycle ends far away", () => {
    const out = reviewCycleIncomplete.evaluate(
      { cycles: [{ id: "c1", end_date: "2026-08-01" }], incompleteByCycle: { c1: 4 } },
      ctx("2026-05-22T00:00:00Z"));
    expect(out).toBeNull();
  });
  it("skips cycles with a null end_date", () => {
    const out = reviewCycleIncomplete.evaluate(
      { cycles: [{ id: "c1", end_date: null }], incompleteByCycle: { c1: 4 } },
      ctx("2026-05-22T00:00:00Z"));
    expect(out).toBeNull();
  });
});

describe("grievances_urgent", () => {
  it("flags urgent open grievances", () => {
    expect(grievancesUrgent.evaluate([{ id: "1" }], ctx("2026-05-22T00:00:00Z"))?.priority).toBe(110);
  });
  it("returns null when none", () => expect(grievancesUrgent.evaluate([], ctx("2026-05-22T00:00:00Z"))).toBeNull());
});

describe("hiring_stalled", () => {
  it("flags applications not moved in 7 days", () => {
    const out = hiringStalled.evaluate(
      [{ id: "1", updated_at: "2026-05-10T00:00:00Z" }, { id: "2", updated_at: "2026-05-21T00:00:00Z" }],
      ctx("2026-05-22T00:00:00Z"));
    expect(out?.metricCount).toBe(1);
  });
  it("returns null when all are fresh", () => {
    expect(hiringStalled.evaluate([{ id: "2", updated_at: "2026-05-21T00:00:00Z" }], ctx("2026-05-22T00:00:00Z"))).toBeNull();
  });
});

describe("attendance_anomalies", () => {
  it("counts auto-closed shifts", () => {
    expect(attendanceAnomalies.evaluate([{ auto_closed: true }, { auto_closed: false }], ctx("2026-05-22T00:00:00Z"))?.metricCount).toBe(1);
  });
  it("returns null when none auto-closed", () => {
    expect(attendanceAnomalies.evaluate([{ auto_closed: false }], ctx("2026-05-22T00:00:00Z"))).toBeNull();
  });
});
