import { describe, it, expect } from "vitest";
import { canCancelLeave, monthsSpanned, type CancelContext } from "../../src/lib/leaves/cancel-rules";

const base: CancelContext = {
  status: "approved",
  startDate: "2026-10-20",
  todayIst: "2026-10-12",
  isOwn: true,
  isManagerOfRecord: false,
  isAdmin: false,
  payrollLocked: false,
};

describe("canCancelLeave", () => {
  it("pending: employee, manager-of-record or admin; nobody else", () => {
    expect(canCancelLeave({ ...base, status: "pending" }).ok).toBe(true);
    expect(canCancelLeave({ ...base, status: "pending", isOwn: false, isManagerOfRecord: true }).ok).toBe(true);
    expect(canCancelLeave({ ...base, status: "pending", isOwn: false, isAdmin: true }).ok).toBe(true);
    expect(canCancelLeave({ ...base, status: "pending", isOwn: false })).toEqual({ ok: false, error: "Unauthorized" });
  });

  it("approved and not started: the same people", () => {
    expect(canCancelLeave(base).ok).toBe(true);
    expect(canCancelLeave({ ...base, isOwn: false, isManagerOfRecord: true }).ok).toBe(true);
    expect(canCancelLeave({ ...base, isOwn: false }).ok).toBe(false);
  });

  it("approved and started (today counts): admins only", () => {
    const started = { ...base, startDate: "2026-10-12" };
    expect(canCancelLeave(started)).toMatchObject({ ok: false, error: expect.stringMatching(/already started/) });
    expect(canCancelLeave({ ...started, isOwn: false, isManagerOfRecord: true }).ok).toBe(false);
    expect(canCancelLeave({ ...started, isAdmin: true }).ok).toBe(true);
    expect(canCancelLeave({ ...base, startDate: "2026-09-01", isOwn: false, isAdmin: true }).ok).toBe(true);
  });

  it("payroll-locked unpaid leave can't be cancelled, even by an admin", () => {
    expect(canCancelLeave({ ...base, isAdmin: true, payrollLocked: true })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Payroll/),
    });
  });

  it("rejected / cancelled requests can't be cancelled", () => {
    expect(canCancelLeave({ ...base, status: "rejected", isAdmin: true }).ok).toBe(false);
    expect(canCancelLeave({ ...base, status: "cancelled", isAdmin: true }).ok).toBe(false);
  });
});

describe("monthsSpanned", () => {
  it("single month", () => {
    expect(monthsSpanned("2026-10-03", "2026-10-09")).toEqual(["2026-10"]);
  });
  it("across a year end", () => {
    expect(monthsSpanned("2026-12-30", "2027-02-02")).toEqual(["2026-12", "2027-01", "2027-02"]);
  });
});
