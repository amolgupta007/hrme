import { describe, it, expect } from "vitest";
import {
  planWfhRequest,
  canDecideWfh,
  normalizeWfhPolicy,
  normalizeWorkArrangement,
  reflagOverQuota,
} from "@jambahr/shared/attendance/wfh";

const base = {
  today: "2026-10-01",
  arrangement: "office" as const,
  allowance: 2,
  activeDates: new Set<string>(),
  leaveDates: new Set<string>(),
};

describe("planWfhRequest", () => {
  it("first two days in a month are within quota, the third is over", () => {
    const r = planWfhRequest({ ...base, dates: ["2026-10-05", "2026-10-06", "2026-10-07"] });
    expect(r).toEqual({
      ok: true,
      rows: [
        { date: "2026-10-05", overQuota: false },
        { date: "2026-10-06", overQuota: false },
        { date: "2026-10-07", overQuota: true },
      ],
    });
  });

  it("existing pending/approved days count toward the month", () => {
    const r = planWfhRequest({ ...base, activeDates: new Set(["2026-10-02", "2026-10-03"]), dates: ["2026-10-09"] });
    expect(r.ok && r.rows[0].overQuota).toBe(true);
  });

  it("quota resets each month", () => {
    const r = planWfhRequest({ ...base, activeDates: new Set(["2026-10-02", "2026-10-03"]), dates: ["2026-11-02"] });
    expect(r.ok && r.rows[0].overQuota).toBe(false);
  });

  it("same day is allowed, past days are not", () => {
    expect(planWfhRequest({ ...base, dates: ["2026-10-01"] }).ok).toBe(true);
    expect(planWfhRequest({ ...base, dates: ["2026-09-30"] }).ok).toBe(false);
  });

  it("rejects duplicates and leave overlaps", () => {
    expect(planWfhRequest({ ...base, activeDates: new Set(["2026-10-05"]), dates: ["2026-10-05"] }).ok).toBe(false);
    expect(planWfhRequest({ ...base, leaveDates: new Set(["2026-10-05"]), dates: ["2026-10-05"] }).ok).toBe(false);
  });

  it("remote employees don't need to ask", () => {
    expect(planWfhRequest({ ...base, arrangement: "remote", dates: ["2026-10-05"] }).ok).toBe(false);
  });

  it("de-duplicates the input", () => {
    const r = planWfhRequest({ ...base, dates: ["2026-10-05", "2026-10-05"] });
    expect(r.ok && r.rows).toHaveLength(1);
  });
});

describe("reflagOverQuota", () => {
  it("a freed slot moves the next pending day back within the allowance", () => {
    const rows = [
      { id: "a", date: "2026-10-01", status: "approved", over_quota: false },
      { id: "b", date: "2026-10-02", status: "rejected", over_quota: false },
      { id: "c", date: "2026-10-05", status: "pending", over_quota: true },
    ];
    expect(reflagOverQuota(rows, 2)).toEqual([{ id: "c", overQuota: false }]);
  });
  it("leaves correct flags alone", () => {
    const rows = [
      { id: "a", date: "2026-10-01", status: "approved", over_quota: false },
      { id: "b", date: "2026-10-02", status: "approved", over_quota: false },
      { id: "c", date: "2026-10-05", status: "pending", over_quota: true },
    ];
    expect(reflagOverQuota(rows, 2)).toEqual([]);
  });
});

describe("canDecideWfh", () => {
  const mgr = { actorRole: "manager", actorEmployeeId: "m1", employeeManagerIds: ["m1"] };
  it("reporting manager approves within quota", () => {
    expect(canDecideWfh({ ...mgr, overQuota: false })).toBe(true);
  });
  it("over quota needs an admin", () => {
    expect(canDecideWfh({ ...mgr, overQuota: true })).toBe(false);
    expect(canDecideWfh({ actorRole: "admin", actorEmployeeId: "a1", employeeManagerIds: ["m1"], overQuota: true })).toBe(true);
  });
  it("a manager who isn't theirs can't decide", () => {
    expect(canDecideWfh({ ...mgr, employeeManagerIds: ["m2"], overQuota: false })).toBe(false);
  });
  it("an employee-role reporting manager can still approve their reports", () => {
    expect(canDecideWfh({ actorRole: "employee", actorEmployeeId: "m1", employeeManagerIds: ["m1"], overQuota: false })).toBe(true);
  });
});

describe("normalizers", () => {
  it("policy defaults off with 2/month", () => {
    expect(normalizeWfhPolicy({})).toEqual({ enabled: false, monthlyAllowance: 2 });
    expect(normalizeWfhPolicy({ attendance: { wfh: { enabled: true, monthly_allowance: 3 } } })).toEqual({
      enabled: true,
      monthlyAllowance: 3,
    });
  });
  it("arrangement defaults to office", () => {
    expect(normalizeWorkArrangement(null)).toBe("office");
    expect(normalizeWorkArrangement("remote")).toBe("remote");
  });
});
