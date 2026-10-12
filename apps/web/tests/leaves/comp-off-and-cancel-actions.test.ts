import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createFakeSupabase, type FakeDb } from "../helpers/fake-supabase";

// requestLeave (comp-off path) and cancelLeave against the in-memory fake,
// which REALLY applies filters — a missing org/status filter shows up here.

vi.mock("@clerk/nextjs/server", () => ({ auth: () => ({ userId: "clerk_1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@react-email/render", () => ({ render: vi.fn(async () => "<html/>") }));
const sent: any[] = [];
vi.mock("@/lib/resend", () => ({
  FROM_EMAIL: "support@jambahr.com",
  resend: { emails: { send: vi.fn(async (m: any) => { sent.push(m); return { data: { id: "e" }, error: null }; }) } },
}));
vi.mock("@/lib/mobile/notify", () => ({
  notifyLeaveDecision: vi.fn(async () => {}),
  notifyApprovalPending: vi.fn(async () => {}),
}));

let db: FakeDb;
vi.mock("@/lib/supabase/server", () => ({ createAdminSupabase: () => createFakeSupabase(db) }));

const ORG = "org-a";
const OTHER_ORG = "org-b";
const EMP = "10000000-0000-4000-8000-000000000001";
const MGR = "10000000-0000-4000-8000-000000000002";
const ADMIN = "10000000-0000-4000-8000-000000000003";
const OUTSIDER = "10000000-0000-4000-8000-000000000004";
const COMP = "20000000-0000-4000-8000-000000000001";
const CASUAL = "20000000-0000-4000-8000-000000000002";
const UNPAID = "20000000-0000-4000-8000-000000000003";

let currentUser: any;
const as = (employeeId: string, role: string) => {
  currentUser = { orgId: ORG, orgName: "Acme", clerkUserId: `clerk-${employeeId}`, employeeId, role };
};
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: vi.fn(async () => currentUser),
  isAdmin: (role: string) => role === "owner" || role === "admin",
  isManagerOrAbove: (role: string) => ["owner", "admin", "manager"].includes(role),
}));

import { requestLeave, cancelLeave } from "../../src/actions/leaves";

const person = (id: string, role: string, extra: object = {}) => ({
  id,
  org_id: ORG,
  first_name: id.slice(-1),
  last_name: "X",
  email: `${id.slice(-1)}@acme.test`,
  role,
  status: "active",
  department_id: null,
  reporting_manager_id: null,
  reporting_manager_2_id: null,
  ...extra,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-12T06:00:00Z")); // Mon 12 Oct 2026, IST
  sent.length = 0;
  db = {
    employees: [
      person(EMP, "employee", { reporting_manager_id: MGR }),
      person(MGR, "manager"),
      person(ADMIN, "admin"),
      person(OUTSIDER, "manager"),
    ],
    leave_policies: [
      { id: COMP, org_id: ORG, name: "Comp-off", type: "comp_off", days_per_year: 0 },
      { id: CASUAL, org_id: ORG, name: "Casual Leave", type: "casual", days_per_year: 7 },
      { id: UNPAID, org_id: ORG, name: "Unpaid Leave", type: "unpaid", days_per_year: 0 },
    ],
    // Sat + Sun off.
    week_off_policy: [{ org_id: ORG, week_type: 5, off_days: [0, 6], alt_saturday_rule: "none", effective_from: "2026-01-01" }],
    holidays: [{ org_id: ORG, date: "2026-10-02", is_optional: false }],
    leave_requests: [],
    payroll_runs: [],
  };
  as(EMP, "employee");
});

afterEach(() => vi.useRealTimers());

const compOff = (extra: object = {}) =>
  requestLeave({
    employeeId: EMP,
    policyId: COMP,
    startDate: "2026-10-14",
    endDate: "2026-10-14",
    days: 1,
    reason: "Launch support",
    exceedsBalance: false,
    startHalfDay: false,
    endHalfDay: false,
    compOffWorkedDate: "2026-10-11",
    ...extra,
  });

describe("requestLeave — comp-off", () => {
  it("files a comp-off for a worked Sunday with no balance check", async () => {
    const res = await compOff();
    expect(res.success).toBe(true);
    expect(db.leave_requests).toHaveLength(1);
    expect(db.leave_requests[0]).toMatchObject({
      status: "pending",
      comp_off_worked_date: "2026-10-11",
      exceeds_balance: false,
      ticket_number: null,
      days: 1,
    });
    // Approvers are told which day was worked.
    expect(sent).toHaveLength(1);
  });

  it("accepts a worked public holiday", async () => {
    expect((await compOff({ compOffWorkedDate: "2026-10-02" })).success).toBe(true);
  });

  it("rejects a working weekday, naming it", async () => {
    const res = await compOff({ compOffWorkedDate: "2026-10-08" });
    expect(res).toEqual({
      success: false,
      error: "Thu 8 Oct 2026 was a working day for you — comp-off is for working a week-off or holiday",
    });
    expect(db.leave_requests).toHaveLength(0);
  });

  it("an employee override wins over the org week-off", async () => {
    db.employee_week_off_override = [{ org_id: ORG, employee_id: EMP, week_type: 6, off_days: [3], alt_saturday_rule: "none" }];
    expect((await compOff({ compOffWorkedDate: "2026-10-11" })).success).toBe(false); // Sunday is now a workday
    expect((await compOff({ compOffWorkedDate: "2026-10-07" })).success).toBe(true); // Wednesday off
  });

  it("allows any day when no week-off policy exists at any level", async () => {
    db.week_off_policy = [];
    expect((await compOff({ compOffWorkedDate: "2026-10-08" })).success).toBe(true);
  });

  it("one worked day backs one live request; freed again once cancelled", async () => {
    expect((await compOff()).success).toBe(true);
    const dup = await compOff({ startDate: "2026-10-15", endDate: "2026-10-15" });
    expect(dup).toEqual({ success: false, error: "You've already claimed a comp-off for Sun 11 Oct 2026" });

    expect((await cancelLeave(db.leave_requests[0].id)).success).toBe(true);
    expect((await compOff({ startDate: "2026-10-15", endDate: "2026-10-15" })).success).toBe(true);
  });

  it("requires a reason and a single day", async () => {
    expect((await compOff({ reason: "" })).success).toBe(false);
    expect((await compOff({ endDate: "2026-10-15", days: 2 })).success).toBe(false);
  });

  it("other leave types ignore a stray worked date and keep the balance check", async () => {
    const res = await requestLeave({
      employeeId: EMP,
      policyId: CASUAL,
      startDate: "2026-10-14",
      endDate: "2026-10-23",
      days: 10,
      reason: "",
      exceedsBalance: false,
      startHalfDay: false,
      endHalfDay: false,
      compOffWorkedDate: "2026-10-11",
    });
    expect(res).toMatchObject({ success: false, error: expect.stringMatching(/Insufficient balance/) });
  });
});

const seedLeave = (extra: object = {}) => {
  const row = {
    id: `30000000-0000-4000-8000-00000000000${db.leave_requests.length + 1}`,
    org_id: ORG,
    employee_id: EMP,
    policy_id: CASUAL,
    status: "approved",
    start_date: "2026-10-20",
    end_date: "2026-10-21",
    days: 2,
    ...extra,
  };
  db.leave_requests.push(row);
  return row.id;
};

describe("cancelLeave", () => {
  it("the employee cancels their own future approved leave; approvers are emailed", async () => {
    const id = seedLeave();
    expect(await cancelLeave(id)).toEqual({ success: true, data: undefined });
    expect(db.leave_requests[0]).toMatchObject({ status: "cancelled", cancelled_by: EMP });
    expect(db.leave_requests[0].cancelled_at).toBeTruthy();
    expect(sent).toHaveLength(1); // to the manager + admin; not to the employee who did it
    expect(sent[0].to.sort()).toEqual(["2@acme.test", "3@acme.test"]);
  });

  it("a manager-of-record cancels it; the employee is emailed too", async () => {
    const id = seedLeave();
    as(MGR, "manager");
    expect((await cancelLeave(id)).success).toBe(true);
    expect(sent.map((m) => m.to)).toEqual([["3@acme.test"], "1@acme.test"]);
  });

  it("a manager who isn't theirs can't", async () => {
    const id = seedLeave();
    as(OUTSIDER, "manager");
    expect(await cancelLeave(id)).toEqual({ success: false, error: "Unauthorized" });
    expect(db.leave_requests[0].status).toBe("approved");
  });

  it("once the leave has started only an admin can cancel it", async () => {
    const id = seedLeave({ start_date: "2026-10-12", end_date: "2026-10-13" });
    expect((await cancelLeave(id)).success).toBe(false);
    as(ADMIN, "admin");
    expect((await cancelLeave(id)).success).toBe(true);
  });

  it("unpaid leave in a processed payroll month is locked, even for an admin", async () => {
    const id = seedLeave({ policy_id: UNPAID, start_date: "2026-09-28", end_date: "2026-10-01" });
    db.payroll_runs.push({ org_id: ORG, month: "2026-09", status: "processed" });
    as(ADMIN, "admin");
    expect(await cancelLeave(id)).toMatchObject({ success: false, error: expect.stringMatching(/Payroll/) });
  });

  it("a draft payroll run (or another org's run) doesn't lock it", async () => {
    const id = seedLeave({ policy_id: UNPAID, start_date: "2026-09-28", end_date: "2026-10-01" });
    db.payroll_runs.push({ org_id: ORG, month: "2026-09", status: "draft" });
    db.payroll_runs.push({ org_id: OTHER_ORG, month: "2026-10", status: "paid" });
    as(ADMIN, "admin");
    expect((await cancelLeave(id)).success).toBe(true);
  });

  it("pending requests cancel silently (no email), as before", async () => {
    const id = seedLeave({ status: "pending" });
    expect((await cancelLeave(id)).success).toBe(true);
    expect(sent).toHaveLength(0);
  });

  it("rejected requests can't be cancelled", async () => {
    const id = seedLeave({ status: "rejected" });
    as(ADMIN, "admin");
    expect((await cancelLeave(id)).success).toBe(false);
  });

  it("another org's request is not found", async () => {
    const id = seedLeave({ org_id: OTHER_ORG });
    as(ADMIN, "admin");
    expect(await cancelLeave(id)).toEqual({ success: false, error: "Leave request not found" });
  });
});
