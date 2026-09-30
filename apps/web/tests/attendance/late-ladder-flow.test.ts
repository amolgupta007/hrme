import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeDb } from "../helpers/fake-supabase";

// ---- Mocks: DB → in-memory fake; email/push/payroll-recompute captured ----
let db: FakeDb;
vi.mock("@/lib/supabase/server", () => ({ createAdminSupabase: () => createFakeSupabase(db) }));

const sent: any[] = [];
vi.mock("@/lib/resend", () => ({
  resend: { emails: { send: vi.fn(async (m: any) => (sent.push(m), { data: { id: "x" } })) } },
  NOREPLY_EMAIL: "noreply@jambahr.com",
  FROM_EMAIL: "support@jambahr.com",
}));
vi.mock("@react-email/render", () => ({ render: vi.fn(async () => "<html/>") }));
vi.mock("@/lib/mobile/push", () => ({ sendPush: vi.fn(async () => {}) }));
vi.mock("@/lib/payroll/recompute-entry", () => ({ recomputeEntryFromLineItems: vi.fn(async () => {}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let currentUser: any;
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: vi.fn(async () => currentUser),
  isAdmin: (r: string) => r === "owner" || r === "admin",
  isManagerOrAbove: (r: string) => ["owner", "admin", "manager"].includes(r),
}));

import { evaluateDayLateness, evaluateLateMonth, loadEnabledLatePolicy } from "@/lib/attendance/late-evaluation";
import { listLatePenalties, waiveLatePenalty, excuseLateDay } from "../../src/actions/late-policy";

process.env.RESEND_API_KEY = "test";

const A = "org-a";
const B = "org-b";
const E1 = "e1"; // covered employee, has a manager
const M1 = "m1"; // E1's manager
const E2 = "e2"; // phone-only, no manager
const ADMIN_A = "adm-a";
const ADMIN_B = "adm-b";

function seed(opts: { clDays?: number; consequence?: string } = {}) {
  sent.length = 0;
  db = {
    organizations: [
      { id: A, name: "Acme" },
      { id: B, name: "Beta" },
    ],
    employees: [
      { id: E1, org_id: A, first_name: "Priya", last_name: "S", email: "priya@x.test", status: "active", department_id: null, reporting_manager_id: M1, reporting_manager_2_id: null, role: "employee" },
      { id: M1, org_id: A, first_name: "Mona", last_name: "M", email: "mona@x.test", status: "active", department_id: null, reporting_manager_id: null, reporting_manager_2_id: null, role: "manager" },
      { id: E2, org_id: A, first_name: "Raju", last_name: "P", email: null, phone: "+919800000000", status: "active", department_id: null, reporting_manager_id: null, reporting_manager_2_id: null, role: "employee" },
      { id: ADMIN_A, org_id: A, first_name: "Ann", last_name: "A", email: "ann@x.test", status: "active", department_id: null, reporting_manager_id: null, reporting_manager_2_id: null, role: "admin" },
      { id: ADMIN_B, org_id: B, first_name: "Ben", last_name: "B", email: "ben@x.test", status: "active", department_id: null, reporting_manager_id: null, reporting_manager_2_id: null, role: "admin" },
    ],
    late_policies: [
      {
        id: "pol-a", org_id: A, enabled: true, threshold_days: 3, warn_at: null, fallback_cutoff_time: "09:30",
        notify_on_late: false, notify_on_threshold: false, channel_email: true, channel_whatsapp: false,
        consequence: opts.consequence ?? "leave_deduction", evaluate_from: "2026-09-01",
        ladder_warning_at: 3, ladder_deduct_at: 5, ladder_leave_type: "casual", ladder_deduct_days: 1,
        ladder_repeat: true, ladder_lop_fallback: true, ladder_cc_managers: true, ladder_cc_admins: false, ladder_dispute_days: 2,
      },
      {
        id: "pol-b", org_id: B, enabled: true, threshold_days: 1, warn_at: null, fallback_cutoff_time: "08:00",
        notify_on_late: false, notify_on_threshold: false, channel_email: true, channel_whatsapp: false,
        consequence: "leave_deduction", evaluate_from: "2026-01-01",
        ladder_warning_at: 1, ladder_deduct_at: 2, ladder_leave_type: "casual", ladder_deduct_days: 1,
        ladder_repeat: true, ladder_lop_fallback: true, ladder_cc_managers: true, ladder_cc_admins: false, ladder_dispute_days: 2,
      },
    ],
    late_policy_targets: [
      { policy_id: "pol-a", target_type: "employee", target_id: E1 },
      { policy_id: "pol-a", target_type: "employee", target_id: E2 },
    ],
    leave_policies: [{ id: "cl-a", org_id: A, type: "casual", name: "Casual Leave", days_per_year: opts.clDays ?? 8, created_at: "2026-01-01" }],
    leave_requests: [],
    leave_adjustments: [],
    late_penalty_events: [],
    attendance_records: [],
    holidays: [],
    week_off_policy: [{ org_id: A, week_type: 6, off_days: [0], alt_saturday_rule: "none", effective_from: "2026-01-01" }],
    employee_week_off_override: [],
    department_week_off_override: [],
    payroll_runs: [],
    payroll_entries: [],
    notifications: [],
    shift_assignments: [],
    late_policy_flags: [],
  };
}

// Mondays–Saturdays in Sept 2026 (6th, 13th, 20th, 27th are Sundays).
const WORKDAYS = ["01", "02", "03", "04", "05", "07", "08", "09", "10", "11", "12", "14"].map((d) => `2026-09-${d}`);

function addLates(employeeId: string, n: number, org = A) {
  for (const date of WORKDAYS.slice(0, n)) {
    db.attendance_records.push({
      id: `${employeeId}-${date}`, org_id: org, employee_id: employeeId, date,
      clock_in_at: `${date}T04:15:00Z`, is_late: true, late_minutes: 15, late_excused: false,
    });
  }
}

const policyA = async () => (await loadEnabledLatePolicy(createFakeSupabase(db), A))!;
const run = async (employeeId = E1) =>
  evaluateLateMonth(createFakeSupabase(db), await policyA(), employeeId, "2026-09");
const events = (kind?: string) => db.late_penalty_events.filter((e) => !kind || e.kind === kind);
const subjects = () => sent.map((m) => m.subject);

beforeEach(() => seed());

describe("warning at the 3rd late", () => {
  it("sends one formal warning to the employee with the manager in CC", async () => {
    addLates(E1, 3);
    await run();
    expect(events("warning")).toHaveLength(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "priya@x.test", cc: ["mona@x.test"], from: "JambaHR <noreply@jambahr.com>" });
    expect(sent[0].subject).toBe("Attendance Notice – Formal Warning | Priya S");
  });

  it("a rerun sends nothing new", async () => {
    addLates(E1, 3);
    await run();
    await run();
    await run();
    expect(events("warning")).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });
});

describe("deduction at the 5th late", () => {
  it("CL available → 1 CL deducted via the ledger, Leave Deduction email", async () => {
    addLates(E1, 5);
    await run();
    const [d] = events("deduction");
    expect(d).toMatchObject({ cl_days: 1, lop_days: 0, status: "applied", cl_balance_before: 8, trigger_date: "2026-09-05" });
    expect(db.leave_adjustments).toEqual([
      expect.objectContaining({ org_id: A, employee_id: E1, policy_id: "cl-a", days: -1, year: 2026, source: "late_penalty", source_ref: d.id }),
    ]);
    expect(subjects()).toEqual([
      "Attendance Notice – Formal Warning | Priya S",
      "Attendance Notice – Leave Deduction | Priya S",
    ]);
  });

  it("no CL → 1 day LOP, Loss of Pay email, no ledger row", async () => {
    seed({ clDays: 0 });
    addLates(E1, 5);
    await run();
    expect(events("deduction")[0]).toMatchObject({ cl_days: 0, lop_days: 1 });
    expect(db.leave_adjustments).toHaveLength(0);
    expect(subjects().at(-1)).toBe("Attendance Notice – Loss of Pay | Priya S");
  });

  it("0.5 CL left → 0.5 CL + 0.5 LOP, partial email", async () => {
    seed({ clDays: 0.5 });
    addLates(E1, 5);
    await run();
    expect(events("deduction")[0]).toMatchObject({ cl_days: 0.5, lop_days: 0.5 });
    expect(subjects().at(-1)).toBe("Attendance Notice – Leave Deduction and Loss of Pay | Priya S");
  });

  it("10 lates → a second deduction; balance carried across steps", async () => {
    seed({ clDays: 1 });
    addLates(E1, 10);
    await run();
    const deds = events("deduction").sort((a, b) => a.occurrence_no - b.occurrence_no);
    expect(deds.map((d) => [d.occurrence_no, d.cl_days, d.lop_days])).toEqual([
      [1, 1, 0],
      [2, 0, 1],
    ]);
  });
});

describe("what counts", () => {
  it("a late on a Sunday (week-off) is not counted", async () => {
    addLates(E1, 4);
    db.attendance_records.push({ id: "sun", org_id: A, employee_id: E1, date: "2026-09-06", clock_in_at: "2026-09-06T04:15:00Z", is_late: true, late_minutes: 15, late_excused: false });
    const { count } = await run();
    expect(count).toBe(4);
    expect(events("deduction")).toHaveLength(0);
  });

  it("holidays and approved leave days are not counted", async () => {
    addLates(E1, 5);
    db.holidays.push({ org_id: A, date: "2026-09-02", is_optional: false });
    db.leave_requests.push({ org_id: A, employee_id: E1, status: "approved", start_date: "2026-09-03", end_date: "2026-09-03", policy_id: "cl-a", days: 0.5 });
    const { count } = await run();
    expect(count).toBe(3);
  });

  it("days before the policy's go-live date never count", async () => {
    db.late_policies[0].evaluate_from = "2026-09-05";
    addLates(E1, 5);
    const { count } = await run();
    expect(count).toBe(1);
  });
});

describe("reversals", () => {
  it("excusing a late after the deduction reverses it and credits the CL back", async () => {
    currentUser = { orgId: A, employeeId: ADMIN_A, role: "admin" };
    addLates(E1, 5);
    await run();
    const res = await excuseLateDay({ recordId: `${E1}-2026-09-01`, excused: true, reason: "Traffic jam, approved" });
    expect(res).toEqual({ success: true, data: { lateCount: 4 } });
    expect(events("deduction")[0].status).toBe("reversed");
    expect(db.leave_adjustments.map((a) => a.days)).toEqual([-1, 1]);
    expect(subjects().at(-1)).toBe("Attendance Notice – Correction | Priya S");
  });

  it("…the lates coming back re-applies the same step (no duplicate row)", async () => {
    currentUser = { orgId: A, employeeId: ADMIN_A, role: "admin" };
    addLates(E1, 5);
    await run();
    await excuseLateDay({ recordId: `${E1}-2026-09-01`, excused: true, reason: "x" });
    await excuseLateDay({ recordId: `${E1}-2026-09-01`, excused: false });
    expect(events("deduction")).toHaveLength(1);
    expect(events("deduction")[0].status).toBe("applied");
    expect(db.leave_adjustments.map((a) => a.days)).toEqual([-1, 1, -1]);
  });

  it("an LOP step in a month whose payroll is paid is flagged for review, not reversed", async () => {
    seed({ clDays: 0 });
    addLates(E1, 5);
    await run();
    db.payroll_runs.push({ id: "run", org_id: A, month: "2026-09", status: "paid" });
    db.attendance_records.find((r) => r.id === `${E1}-2026-09-01`)!.late_excused = true;
    await run();
    expect(events("deduction")[0].status).toBe("needs_review");
  });

  it("admin waive credits the CL back and records who and why", async () => {
    currentUser = { orgId: A, employeeId: ADMIN_A, role: "admin" };
    addLates(E1, 5);
    await run();
    const id = events("deduction")[0].id;
    expect(await waiveLatePenalty({ eventId: id, reason: "First offence" })).toEqual({ success: true, data: undefined });
    expect(events("deduction")[0]).toMatchObject({ status: "waived", status_reason: "First offence", status_by: ADMIN_A });
    expect(db.leave_adjustments.map((a) => a.days)).toEqual([-1, 1]);
    // A waived step is never re-applied on the next run.
    await run();
    expect(events("deduction")[0].status).toBe("waived");
  });
});

describe("recipients", () => {
  it("employee with no manager → sent without CC", async () => {
    db.employees.find((e) => e.id === E1)!.reporting_manager_id = null;
    addLates(E1, 3);
    await run();
    expect(sent[0].cc).toBeUndefined();
  });

  it("phone-only employee → no email, in-app notification, logged as skipped", async () => {
    addLates(E2, 3);
    await run(E2);
    expect(sent).toHaveLength(0);
    expect(events("warning")[0].email_status).toBe("skipped_no_email");
    expect(db.notifications).toEqual([expect.objectContaining({ employee_id: E2, type: "late_penalty" })]);
  });
});

describe("day evaluation", () => {
  const record = (extra: object = {}) => {
    db.attendance_records.push({ id: "r", org_id: A, employee_id: E1, date: "2026-09-15", clock_in_at: "2026-09-15T04:15:00Z", is_late: false, late_minutes: null, late_excused: false, ...extra });
    return db.attendance_records.at(-1)!;
  };

  it("marks late against the fallback cutoff (09:45 IST vs 09:30)", async () => {
    const r = record();
    await evaluateDayLateness(createFakeSupabase(db), A, E1, "2026-09-15");
    expect(r).toMatchObject({ is_late: true, late_minutes: 15, late_policy_id: "pol-a" });
  });

  it("uses the assigned shift + grace when there is one", async () => {
    const r = record();
    db.shift_assignments.push({ org_id: A, employee_id: E1, date_from: "2026-09-01", date_to: null, shifts: { start_time: "09:00", grace_minutes: 10, is_overnight: false } });
    await evaluateDayLateness(createFakeSupabase(db), A, E1, "2026-09-15");
    expect(r).toMatchObject({ is_late: true, late_minutes: 35 });
  });

  it("an employee the policy doesn't cover is never late", async () => {
    db.late_policy_targets = db.late_policy_targets.filter((t) => t.target_id !== E1);
    const r = record({ is_late: true, late_minutes: 15 });
    await evaluateDayLateness(createFakeSupabase(db), A, E1, "2026-09-15");
    expect(r.is_late).toBe(false);
  });

  it("before go-live the day is left untouched", async () => {
    db.late_policies[0].evaluate_from = "2026-09-20";
    const r = record();
    await evaluateDayLateness(createFakeSupabase(db), A, E1, "2026-09-15");
    expect(r.is_late).toBe(false);
  });

  it("rule disabled → nothing happens", async () => {
    db.late_policies[0].enabled = false;
    const r = record();
    await evaluateDayLateness(createFakeSupabase(db), A, E1, "2026-09-15");
    expect(r.is_late).toBe(false);
    expect(events()).toHaveLength(0);
  });
});

describe("multi-tenancy", () => {
  it("org B's policy never evaluates or penalises org A's employee", async () => {
    addLates(E1, 5);
    const polB = (await loadEnabledLatePolicy(createFakeSupabase(db), B))!;
    const { count } = await evaluateLateMonth(createFakeSupabase(db), polB, E1, "2026-09");
    expect(count).toBe(0);
    expect(events()).toHaveLength(0);
  });

  it("org B's admin can't see, waive or excuse org A's penalties", async () => {
    addLates(E1, 5);
    await run();
    currentUser = { orgId: B, employeeId: ADMIN_B, role: "admin" };
    const list = await listLatePenalties("2026-09");
    expect(list).toMatchObject({ success: true, data: { rows: [] } });
    expect(await waiveLatePenalty({ eventId: events("deduction")[0].id, reason: "x" })).toMatchObject({ success: false });
    expect(await excuseLateDay({ recordId: `${E1}-2026-09-01`, excused: true, reason: "x" })).toMatchObject({ success: false });
    expect(events("deduction")[0].status).toBe("applied");
  });

  it("employees can't use the admin actions", async () => {
    addLates(E1, 5);
    await run();
    currentUser = { orgId: A, employeeId: E1, role: "employee" };
    expect(await listLatePenalties("2026-09")).toMatchObject({ success: false, error: "Unauthorized" });
    expect(await waiveLatePenalty({ eventId: events("deduction")[0].id, reason: "x" })).toMatchObject({ success: false });
  });
});
